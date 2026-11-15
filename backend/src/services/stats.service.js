// Datos: mapa de constancia, rachas, resumen semanal y calibrador (spec RF9, R12–R16).
import { clock } from '../lib/clock.js';
import { addDays, daysBetween, isValidDate, localDate, mondayOf } from '../lib/dates.js';
import { usersRepo } from '../repositories/users.repo.js';
import { sessionsRepo } from '../repositories/sessions.repo.js';
import { metricsRepo, tasksRepo, templatesRepo, typesRepo } from '../repositories/catalog.repo.js';

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
export const RATIO_RANGE = [0.8, 1.25];

async function loadContext(db, userId) {
  const [sessions, tasks, templates, types] = await Promise.all([
    sessionsRepo.listAll(db, userId),
    tasksRepo.list(db, userId),
    templatesRepo.list(db, userId, { includeArchived: true }),
    typesRepo.list(db, userId),
  ]);
  const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const tplById = Object.fromEntries(templates.map((t) => [t.id, t]));
  const typeById = Object.fromEntries(types.map((t) => [t.id, t]));
  const typeOf = (s) => taskById[s.task_id]?.type_id ?? tplById[s.template_id]?.type_id ?? null;
  return { sessions, tasks, taskById, typeById, typeOf };
}

function estimateOf(s, taskById) {
  return s.postit_estimado_min || taskById[s.task_id]?.estimado_min || null;
}

// ── Calibrador ───────────────────────────────────────────────
export async function calibration(db, userId) {
  const { sessions, taskById, typeById, typeOf } = await loadContext(db, userId);
  const groups = new Map();
  for (const s of sessions) {
    if (s.estado !== 'cerrada' || s.real_min == null) continue;
    const est = estimateOf(s, taskById);
    if (!est) continue;
    const typeId = typeOf(s);
    if (!groups.has(typeId)) groups.set(typeId, []);
    groups.get(typeId).push(s.real_min / est);
  }
  const all = [...groups.values()].flat();
  const summarize = (arr) => ({
    n: arr.length,
    ratio: arr.length >= 3 ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null,
  });
  return {
    general: summarize(all),
    por_tipo: [...groups.entries()].map(([typeId, arr]) => ({
      type_id: typeId,
      nombre: typeId ? typeById[typeId]?.nombre ?? 'Sin tipo' : 'Sin tipo',
      ...summarize(arr),
    })),
    rango: RATIO_RANGE,
  };
}

/** Ratio histórico para un tipo (lo que se muestra junto al post-it). */
export async function calibrationFor(db, userId, typeId) {
  const c = await calibration(db, userId);
  const t = c.por_tipo.find((x) => x.type_id === typeId);
  return { tipo: t ?? null, general: c.general, rango: RATIO_RANGE };
}

// ── Mapa de constancia ───────────────────────────────────────
export async function heatmap(db, userId) {
  const user = await usersRepo.findById(db, userId);
  const today = localDate(clock.now(), user.timezone);
  const from = addDays(today, -364);
  const sessions = await sessionsRepo.listRange(db, userId, from, today);
  const byDay = new Map();
  for (const s of sessions) {
    const d = byDay.get(s.fecha) || { minutos: 0, cerradas: 0, agendadas: 0 };
    d.agendadas += 1;
    if (s.estado === 'cerrada') {
      d.cerradas += 1;
      d.minutos += s.real_min || 0;
    }
    byDay.set(s.fecha, d);
  }
  const days = [];
  for (let i = 0; i <= 364; i += 1) {
    const fecha = addDays(from, i);
    const d = byDay.get(fecha) || { minutos: 0, cerradas: 0, agendadas: 0 };
    days.push({ fecha, minutos: round1(d.minutos), cerradas: d.cerradas, agendadas: d.agendadas });
  }
  const months = new Map();
  for (const d of days) {
    const key = d.fecha.slice(0, 7);
    const m = months.get(key) || { mes: key, cerradas: 0, agendadas: 0, minutos: 0 };
    m.cerradas += d.cerradas;
    m.agendadas += d.agendadas;
    m.minutos += d.minutos;
    months.set(key, m);
  }
  return {
    desde: from,
    hasta: today,
    dias: days,
    meses: [...months.values()].map((m) => ({
      ...m,
      minutos: round1(m.minutos),
      constancia: m.agendadas ? Math.round((m.cerradas / m.agendadas) * 100) : null,
    })),
  };
}

// ── Rachas (R15, R16) ────────────────────────────────────────
export function computeStreaks(sessions, today, objetivoSemanal) {
  const byDay = new Map();
  for (const s of sessions) {
    const d = byDay.get(s.fecha) || { agendadas: 0, cerradas: 0 };
    d.agendadas += 1;
    if (s.estado === 'cerrada') d.cerradas += 1;
    byDay.set(s.fecha, d);
  }
  if (byDay.size === 0) return { diaria: { actual: 0, mejor: 0 }, semanal: { actual: 0, mejor: 0 } };
  const first = [...byDay.keys()].sort()[0];
  const last = today > first ? today : first;

  // Diaria: recorrido hacia adelante para la mejor; la actual es la que llega a hoy.
  let run = 0;
  let best = 0;
  const total = daysBetween(first, last);
  for (let i = 0; i <= total; i += 1) {
    const fecha = addDays(first, i);
    const d = byDay.get(fecha);
    if (!d) continue; // descanso planificado: no suma ni corta
    if (d.cerradas > 0) {
      run += 1;
      best = Math.max(best, run);
    } else if (fecha !== today && fecha < today) {
      run = 0;
    }
  }
  const diaria = { actual: run, mejor: best };

  // Semanal
  const byWeek = new Map();
  for (const [fecha, d] of byDay) {
    const w = mondayOf(fecha);
    const acc = byWeek.get(w) || { agendadas: 0, cerradas: 0 };
    acc.agendadas += d.agendadas;
    acc.cerradas += d.cerradas;
    byWeek.set(w, acc);
  }
  const currentWeek = mondayOf(today);
  let wRun = 0;
  let wBest = 0;
  for (let w = mondayOf(first); w <= mondayOf(last); w = addDays(w, 7)) {
    const acc = byWeek.get(w);
    if (!acc) continue; // semana sin nada agendado: neutra
    if (acc.cerradas >= objetivoSemanal) {
      wRun += 1;
      wBest = Math.max(wBest, wRun);
    } else if (w !== currentWeek) {
      wRun = 0;
    }
  }
  return { diaria, semanal: { actual: wRun, mejor: wBest, objetivo: objetivoSemanal } };
}

export async function streaks(db, userId) {
  const user = await usersRepo.findById(db, userId);
  const sessions = await sessionsRepo.listAll(db, userId);
  return computeStreaks(sessions, localDate(clock.now(), user.timezone), user.objetivo_semanal);
}

// ── Resumen semanal ──────────────────────────────────────────
export async function weekSummary(db, userId, start) {
  const user = await usersRepo.findById(db, userId);
  const monday = mondayOf(start && isValidDate(start) ? start : localDate(clock.now(), user.timezone));
  const sunday = addDays(monday, 6);
  const { taskById, typeById, typeOf, tasks } = await loadContext(db, userId);
  const sessions = (await sessionsRepo.listRange(db, userId, monday, sunday)).filter((s) => s.estado !== 'omitida');
  const worked = sessions.filter((s) => s.real_min != null);
  const cerradas = sessions.filter((s) => s.estado === 'cerrada');

  const realMin = worked.reduce((a, s) => a + s.real_min, 0);
  const planMin = sessions.reduce((a, s) => a + s.work_min_plan, 0);

  const ids = sessions.map((s) => s.id);
  const distractions = ids.length ? await db('distractions').whereIn('session_id', ids) : [];
  const medidas = distractions.filter((d) => d.duracion_s != null);
  const minMedidos = medidas.reduce((a, d) => a + d.duracion_s, 0) / 60;
  const sinMedir = distractions.length - medidas.length;
  const minPerdidos = minMedidos + sinMedir * user.min_por_distraccion;

  const metrics = await metricsRepo.list(db, userId);
  const values = ids.length ? await db('metric_values').whereIn('session_id', ids) : [];
  const metricas = metrics.filter((m) => m.activa).map((m) => {
    const vals = values.filter((v) => v.metric_id === m.id && v.valor != null && v.valor !== '').map((v) => v.valor);
    if (m.tipo === 'escala' || m.tipo === 'numero') {
      const nums = vals.map(Number).filter(Number.isFinite);
      return { id: m.id, nombre: m.nombre, tipo: m.tipo, n: nums.length, promedio: nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : null };
    }
    if (m.tipo === 'sino') {
      const si = vals.filter((v) => v === 'si' || v === 'true' || v === '1').length;
      return { id: m.id, nombre: m.nombre, tipo: m.tipo, n: vals.length, si };
    }
    return { id: m.id, nombre: m.nombre, tipo: m.tipo, n: vals.length };
  });

  const ratios = cerradas
    .map((s) => { const e = estimateOf(s, taskById); return e && s.real_min != null ? s.real_min / e : null; })
    .filter((r) => r != null);

  const porTipo = new Map();
  for (const s of worked) {
    const typeId = typeOf(s);
    const name = typeId ? typeById[typeId]?.nombre ?? 'Sin tipo' : 'Sin tipo';
    porTipo.set(name, (porTipo.get(name) || 0) + s.real_min);
  }

  const tareasCompletadas = tasks.filter((t) => t.completada_at && (() => {
    const d = localDate(t.completada_at, user.timezone);
    return d >= monday && d <= sunday;
  })()).length;

  const valorHora = user.valor_hora || 0;
  return {
    monday,
    sunday,
    sesiones: {
      agendadas: sessions.length,
      con_tarea: sessions.filter((s) => s.task_id).length,
      sin_tarea: sessions.filter((s) => !s.task_id).length,
      cerradas: cerradas.length,
      sesion_completada: cerradas.filter((s) => s.sesion_completada).length,
      tarea_completada: cerradas.filter((s) => s.tarea_completada === 'si').length,
    },
    minutos: { planificados: planMin, reales: round1(realMin) },
    tareas_completadas: tareasCompletadas,
    ratio_promedio: ratios.length ? round2(ratios.reduce((a, b) => a + b, 0) / ratios.length) : null,
    ratio_n: ratios.length,
    distracciones: {
      total: distractions.length,
      por_hora: realMin > 0 ? round1(distractions.length / (realMin / 60)) : null,
      minutos_perdidos: round1(minPerdidos),
      minutos_medidos: round1(minMedidos),
      sin_medir: sinMedir,
    },
    metricas,
    por_tipo: [...porTipo.entries()].map(([nombre, minutos]) => ({ nombre, minutos: round1(minutos) })),
    dinero: {
      moneda: user.moneda,
      valor_hora: valorHora,
      valor_invertido: round2((realMin / 60) * valorHora),
      costo_distracciones: round2((minPerdidos / 60) * valorHora),
      min_por_distraccion: user.min_por_distraccion,
    },
  };
}
