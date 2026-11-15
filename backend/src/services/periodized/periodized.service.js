// Cierre periodizado (spec §7): borrador con sorteo, respuestas, confirmación idempotente,
// resumen semanal y candidatas a graduación.
import { randomInt } from 'node:crypto';
import { clock } from '../../lib/clock.js';
import { addDays, isValidDate, localDate, mondayOf } from '../../lib/dates.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { usersRepo } from '../../repositories/users.repo.js';
import { bankRepo, closuresRepo } from '../../repositories/bank.repo.js';
import { sessionsRepo } from '../../repositories/sessions.repo.js';
import { tasksRepo, metricsRepo } from '../../repositories/catalog.repo.js';
import { applyCommonClose, assertClosable, sessionRatio } from '../sessions.service.js';
import { THEMES, THEME_NAMES, applyPick, drawForTheme, isProblem } from './draw.js';

const secureRng = () => randomInt(0, 1_000_000) / 1_000_000;
const RATIO_MIN = 0.8;
const RATIO_MAX = 1.25;

async function activeByTheme(db, userId) {
  const bank = await bankRepo.list(db, userId);
  const map = Object.fromEntries(THEMES.map((t) => [t, []]));
  for (const q of bank) if (q.activa) map[q.tema].push(q);
  for (const t of THEMES) map[t].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return { map, byId: Object.fromEntries(bank.map((q) => [q.id, q])) };
}

/** Crea el borrador del cierre de una sesión o devuelve el existente (R20: no re-sortea). */
export async function openClosure(db, userId, sessionId, { rng = secureRng } = {}) {
  const s = await sessionsRepo.get(db, userId, sessionId);
  if (!s) throw notFound('Sesión');
  const existing = await closuresRepo.findBySession(db, userId, sessionId);
  if (existing) return getClosure(db, userId, existing.id);
  if (assertClosable(s) === 'ya_cerrada') throw conflict('Esta sesión ya se cerró en modo simple.', 'ALREADY_CLOSED');

  const user = await usersRepo.findById(db, userId);
  const id = await db.transaction(async (trx) => {
    // Un solo borrador por usuario: uno viejo de otra sesión nunca contó, se descarta.
    const draft = await closuresRepo.findDraft(trx, userId);
    if (draft) await closuresRepo.remove(trx, userId, draft.id);

    const fecha = localDate(clock.now(), user.timezone);
    const sesionDelDia = (await closuresRepo.confirmedOnDate(trx, userId, fecha)) + 1;
    const { map } = await activeByTheme(trx, userId);
    const states = await bankRepo.themeStates(trx, userId);
    const avisos = [];
    const items = [];
    THEMES.forEach((tema, i) => {
      const st = states[tema] || { usados: [], ultimo_modo: null };
      const res = drawForTheme({ active: map[tema], used: st.usados, lastMode: st.ultimo_modo, rng });
      if (res.warning) avisos.push(`${THEME_NAMES[tema]}: ${res.warning}`);
      const q = res.question;
      const autoNa = Boolean(q && q.na_auto === 'primera_del_dia' && sesionDelDia === 1);
      items.push({ tema, question_id: q?.id ?? null, posicion: i + 1, respuesta: autoNa ? 'na' : null, na_automatico: autoNa });
    });
    const closureId = await closuresRepo.create(trx, {
      user_id: userId,
      session_id: sessionId,
      fecha_local: fecha,
      sesion_del_dia: sesionDelDia,
      estado: 'borrador',
      avisos: JSON.stringify(avisos),
      created_at: clock.now(),
    });
    await closuresRepo.addItems(trx, items.map((it) => ({ ...it, closure_id: closureId })));
    return closureId;
  });
  return getClosure(db, userId, id);
}

export async function getClosure(db, userId, id) {
  const c = await closuresRepo.get(db, userId, id);
  if (!c) throw notFound('Cierre');
  const [items, { byId }, session] = await Promise.all([
    closuresRepo.items(db, id),
    activeByTheme(db, userId),
    c.session_id ? sessionsRepo.get(db, userId, c.session_id) : null,
  ]);
  const task = session?.task_id ? await tasksRepo.get(db, userId, session.task_id) : null;
  const user = await usersRepo.findById(db, userId);
  const numero = c.numero ?? user.cierres_base + (await closuresRepo.confirmedCount(db, userId)) + 1;
  const preguntas = items.map((it) => {
    const q = it.question_id ? byId[it.question_id] : null;
    return {
      item_id: it.id,
      numero: it.posicion,
      tema: it.tema,
      // Al usuario solo se le muestra el texto: ni subvariable, ni modo, ni reglas (spec §7.3).
      texto: q ? q.texto : 'Sin preguntas activas en este tema.',
      requiere: q?.dato || null,
      respuesta: it.respuesta,
      dato: it.dato,
      na_automatico: it.na_automatico,
      sin_pregunta: !q,
    };
  });
  const result = c.estado === 'confirmado' ? buildResult(c, items, byId, session, task) : null;
  return {
    closure: { ...c, numero },
    titulo: `Cierre ${numero}`,
    preguntas,
    session: session && { id: session.id, real_min: session.real_min, postit_estimado_min: session.postit_estimado_min, estado: session.estado },
    result,
  };
}

function buildResult(c, items, byId, session, task) {
  const lineas = items.map((it) => ({
    tema: it.tema,
    nombre: THEME_NAMES[it.tema],
    marca: it.respuesta === 'na' || it.problema == null ? 'N/A' : it.problema ? '✗' : '✓',
    question_id: it.question_id,
  }));
  const ratio = session ? sessionRatio(session, task) : null;
  return {
    lineas,
    hechos_problematicos: lineas.some((l) => l.marca === '✗') ? c.por_que || null : null,
    ratio,
    ratio_fuera_de_rango: ratio != null && (ratio < RATIO_MIN || ratio > RATIO_MAX),
    ajuste: c.ajuste || null,
  };
}

/** Guarda una respuesta parcial (para no perderla si se recarga). */
export async function answerItem(db, userId, closureId, itemId, { respuesta, dato }) {
  const c = await closuresRepo.get(db, userId, closureId);
  if (!c) throw notFound('Cierre');
  if (c.estado !== 'borrador') throw conflict('El cierre ya está confirmado.', 'ALREADY_CONFIRMED');
  const items = await closuresRepo.items(db, closureId);
  const it = items.find((x) => x.id === itemId);
  if (!it) throw notFound('Pregunta del cierre');
  if (it.na_automatico) throw conflict('Esta pregunta quedó en N/A automáticamente (primera sesión del día).');
  await closuresRepo.updateItem(db, closureId, itemId, { respuesta, dato_json: dato ? JSON.stringify(dato) : null });
  return getClosure(db, userId, closureId);
}

export async function confirmClosure(db, userId, closureId, body) {
  const c = await closuresRepo.get(db, userId, closureId);
  if (!c) throw notFound('Cierre');
  if (c.estado === 'confirmado') return getClosure(db, userId, closureId); // R24: una sola vez

  const session = await sessionsRepo.get(db, userId, c.session_id);
  if (!session) throw notFound('Sesión');
  if (assertClosable(session) === 'ya_cerrada') throw conflict('La sesión ya está cerrada.', 'ALREADY_CLOSED');

  const metrics = await metricsRepo.list(db, userId);
  const allowedMetrics = new Set(metrics.map((m) => m.id));
  for (const m of body.metricas || []) if (!allowedMetrics.has(m.metric_id)) throw badRequest('Métrica inválida.');

  const items = await closuresRepo.items(db, closureId);
  const { map, byId } = await activeByTheme(db, userId);
  const answers = Object.fromEntries((body.respuestas || []).map((r) => [r.item_id, r]));

  // Validación: todas las preguntas con pregunta asignada deben tener respuesta.
  const resolved = items.map((it) => {
    const q = it.question_id ? byId[it.question_id] : null;
    if (!q) return { it, q, respuesta: null, dato: null };
    if (it.na_automatico) return { it, q, respuesta: 'na', dato: null };
    const a = answers[it.id] || { respuesta: it.respuesta, dato: it.dato };
    if (q.problema_si === 'dato' && a.respuesta !== 'na') {
      const est = Number(a.dato?.estimado_min);
      if (!Number.isFinite(est) || est <= 0) throw badRequest(`Falta la estimación de minutos en la pregunta ${it.posicion}.`);
      return { it, q, respuesta: 'dato', dato: { estimado_min: est, real_min: session.real_min } };
    }
    if (!['si', 'no', 'na'].includes(a.respuesta)) throw badRequest(`Elegí Sí, No o N/A en la pregunta ${it.posicion}.`);
    return { it, q, respuesta: a.respuesta, dato: null };
  });

  const user = await usersRepo.findById(db, userId);
  const task = session.task_id ? await tasksRepo.get(db, userId, session.task_id) : null;

  await db.transaction(async (trx) => {
    const updated = await trx('closures').where({ id: closureId, user_id: userId, estado: 'borrador' }).update({
      estado: 'confirmado',
      confirmed_at: clock.now(),
      numero: user.cierres_base + (await closuresRepo.confirmedCount(trx, userId)) + 1,
      por_que: body.por_que?.trim() || null,
      ajuste: body.ajuste?.trim() || null,
    });
    if (!updated) return; // otra pestaña confirmó primero: no se duplica nada

    const states = await bankRepo.themeStates(trx, userId);
    for (const r of resolved) {
      if (!r.q) continue;
      const problema = isProblem(r.q, r.respuesta, r.dato);
      await closuresRepo.updateItem(trx, closureId, r.it.id, {
        respuesta: r.respuesta,
        dato_json: r.dato ? JSON.stringify(r.dato) : null,
        problema,
      });
      const st = states[r.q.tema] || { usados: [], ultimo_modo: null };
      const usados = applyPick({ active: map[r.q.tema], used: st.usados, questionId: r.q.id });
      await bankRepo.saveThemeState(trx, userId, r.q.tema, usados, r.q.modo);
      const na = r.respuesta === 'na' || problema == null;
      await bankRepo.bumpStats(trx, userId, r.q.id, { aplicable: !na, problema: problema === true, na });
    }
    const ratio = sessionRatio({ ...session }, task);
    await closuresRepo.update(trx, userId, closureId, { ratio });
    await applyCommonClose(trx, userId, session, { ...body, ajuste: body.ajuste });
  });
  return getClosure(db, userId, closureId);
}

/** Resumen periodizado de una semana local lunes–domingo (spec §7.6). */
export async function weeklyPeriodized(db, userId, start) {
  const user = await usersRepo.findById(db, userId);
  const monday = mondayOf(start && isValidDate(start) ? start : localDate(clock.now(), user.timezone));
  const sunday = addDays(monday, 6);
  const rows = await closuresRepo.confirmedItemsInRange(db, userId, monday, sunday);
  const temas = THEMES.map((tema) => {
    const mine = rows.filter((r) => r.tema === tema && r.question_id);
    const aplicables = mine.filter((r) => r.respuesta !== 'na' && r.problema != null);
    const problemas = aplicables.filter((r) => r.problema === true || r.problema === 1).length;
    return {
      tema,
      nombre: THEME_NAMES[tema],
      problemas,
      aplicables: aplicables.length,
      na: mine.length - aplicables.length,
      porcentaje: aplicables.length ? Math.round((problemas / aplicables.length) * 100) : null,
    };
  });
  const bank = await bankRepo.list(db, userId);
  const stats = await bankRepo.stats(db, userId);
  const texts = Object.fromEntries(bank.map((q) => [q.id, q]));
  const graduacion = stats
    .filter((s) => s.aplicables >= 8 && s.problemas === 0 && texts[s.question_id])
    .map((s) => ({ id: s.question_id, texto: texts[s.question_id].texto, tema: texts[s.question_id].tema, aplicables: s.aplicables, activa: texts[s.question_id].activa }));
  const last = await closuresRepo.lastConfirmed(db, userId);
  return {
    monday,
    sunday,
    temas,
    graduacion,
    cierres_totales: user.cierres_base + (await closuresRepo.confirmedCount(db, userId)),
    ultimo_cierre: last?.fecha_local || user.ultimo_cierre_base || null,
  };
}
