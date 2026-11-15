// Planificador semanal y ejecución de sesiones (spec RF6, RF7, reglas R1–R10).
import { clock } from '../lib/clock.js';
import { addDays, isValidDate, localDate, mondayOf, weekDays } from '../lib/dates.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { usersRepo } from '../repositories/users.repo.js';
import { metricsRepo, tasksRepo, templatesRepo } from '../repositories/catalog.repo.js';
import { ACTIVE_STATES, sessionsRepo } from '../repositories/sessions.repo.js';
import { closuresRepo } from '../repositories/bank.repo.js';
import { calibrationFor } from './stats.service.js';

export const MAX_SESSIONS_PER_DAY = 12;
const LOCKED = ['cerrada', 'omitida'];
const CLOSABLE = ['trabajo_terminado', 'descansando', 'descanso_terminado'];

/** Minutos de trabajo efectivos hasta `at` (o hasta el fin del trabajo). */
export function workedMinutes(s, at = clock.now()) {
  if (!s.started_at) return 0;
  const end = s.work_ended_at ?? (s.estado === 'pausada' ? s.pause_started_at : at);
  return Math.max(0, (end - s.started_at - (s.paused_ms || 0)) / 60000);
}

const round1 = (n) => Math.round(n * 10) / 10;

async function getOwned(db, userId, id) {
  const s = await sessionsRepo.get(db, userId, id);
  if (!s) throw notFound('Sesión');
  return s;
}

// ── Planificador ─────────────────────────────────────────────
export async function getWeek(db, userId, start) {
  const user = await usersRepo.findById(db, userId);
  const today = localDate(clock.now(), user.timezone);
  const monday = mondayOf(start && isValidDate(start) ? start : today);
  const days = weekDays(monday);
  const [sessions, tasks] = await Promise.all([
    sessionsRepo.listRange(db, userId, days[0], days[6]),
    tasksRepo.list(db, userId),
  ]);
  const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const enriched = sessions.map((s) => ({ ...s, task: s.task_id ? taskById[s.task_id] ?? null : null }));
  const counts = {
    agendadas: enriched.filter((s) => s.estado !== 'omitida').length,
    con_tarea: enriched.filter((s) => s.task_id && s.estado !== 'omitida').length,
    sin_tarea: enriched.filter((s) => !s.task_id && !LOCKED.includes(s.estado)).length,
    cerradas: enriched.filter((s) => s.estado === 'cerrada').length,
  };
  return {
    monday,
    today,
    days: days.map((fecha) => ({ fecha, sessions: enriched.filter((s) => s.fecha === fecha) })),
    counts,
  };
}

export async function createSessions(db, userId, { fecha, template_id, cantidad = 1 }) {
  if (!isValidDate(fecha)) throw badRequest('Fecha inválida.');
  const user = await usersRepo.findById(db, userId);
  let workMin = user.work_min;
  let breakMin = user.break_min;
  let items = [];
  if (template_id) {
    const tpl = await templatesRepo.get(db, userId, template_id);
    if (!tpl) throw badRequest('La plantilla indicada no existe.');
    workMin = tpl.work_min;
    breakMin = tpl.break_min;
    items = tpl.items.map((i) => i.texto);
  }
  const existing = await sessionsRepo.countOnDate(db, userId, fecha);
  if (existing + cantidad > MAX_SESSIONS_PER_DAY) {
    throw conflict(`Máximo ${MAX_SESSIONS_PER_DAY} sesiones por día.`, 'MAX_PER_DAY');
  }
  const ids = await db.transaction(async (trx) => {
    let pos = await sessionsRepo.maxPosition(trx, userId, fecha);
    const created = [];
    for (let i = 0; i < cantidad; i += 1) {
      pos += 1;
      const id = await sessionsRepo.create(trx, userId, {
        fecha, posicion: pos, template_id: template_id || null, work_min_plan: workMin, break_min_plan: breakMin, estado: 'planificada',
      });
      await sessionsRepo.addChecklist(trx, id, items);
      created.push(id);
    }
    return created;
  });
  return Promise.all(ids.map((id) => sessionsRepo.get(db, userId, id)));
}

export async function updatePlannedSession(db, userId, id, patch) {
  const s = await getOwned(db, userId, id);
  if (s.estado !== 'planificada') throw conflict('Solo se puede editar una sesión que todavía no empezó.');
  if (patch.fecha && !isValidDate(patch.fecha)) throw badRequest('Fecha inválida.');
  if (patch.fecha && patch.fecha !== s.fecha) {
    if ((await sessionsRepo.countOnDate(db, userId, patch.fecha)) >= MAX_SESSIONS_PER_DAY) {
      throw conflict(`Máximo ${MAX_SESSIONS_PER_DAY} sesiones por día.`, 'MAX_PER_DAY');
    }
    patch.posicion = (await sessionsRepo.maxPosition(db, userId, patch.fecha)) + 1;
  }
  await sessionsRepo.update(db, userId, id, patch);
  return sessionsRepo.get(db, userId, id);
}

export async function deleteSession(db, userId, id) {
  const s = await getOwned(db, userId, id);
  if (s.estado !== 'planificada' && s.estado !== 'omitida') {
    throw conflict('No se puede quitar una sesión que ya empezó o está cerrada.');
  }
  await sessionsRepo.remove(db, userId, id);
}

/** R1–R3: asignar o mover una tarea a una sesión. */
export async function assignTask(db, userId, sessionId, { task_id, from_session_id }) {
  const s = await getOwned(db, userId, sessionId);
  if (LOCKED.includes(s.estado)) throw conflict('No se puede asignar una tarea a una sesión cerrada u omitida.', 'SESSION_LOCKED');
  const task = await tasksRepo.get(db, userId, task_id);
  if (!task) throw notFound('Tarea');
  if (task.estado !== 'pendiente') throw conflict('Solo se pueden asignar tareas pendientes.', 'TASK_NOT_PENDING');
  await db.transaction(async (trx) => {
    if (from_session_id && from_session_id !== sessionId) {
      const from = await sessionsRepo.get(trx, userId, from_session_id);
      if (!from) throw notFound('Sesión de origen');
      if (LOCKED.includes(from.estado)) throw conflict('La sesión de origen ya está cerrada.', 'SESSION_LOCKED');
      if (from.task_id === task_id) {
        await sessionsRepo.update(trx, userId, from_session_id, { task_id: null });
        await tasksRepo.incrementMoved(trx, userId, task_id);
      }
    }
    await sessionsRepo.update(trx, userId, sessionId, { task_id });
  });
  return sessionsRepo.get(db, userId, sessionId);
}

export async function unassignTask(db, userId, sessionId) {
  const s = await getOwned(db, userId, sessionId);
  if (LOCKED.includes(s.estado)) throw conflict('La sesión ya está cerrada.', 'SESSION_LOCKED');
  await sessionsRepo.update(db, userId, sessionId, { task_id: null });
  return sessionsRepo.get(db, userId, sessionId);
}

/** Sesión en curso del usuario (para el aviso global del frontend). */
export async function getActive(db, userId) {
  const s = await sessionsRepo.findActive(db, userId);
  if (!s) return { session: null };
  const task = s.task_id ? await tasksRepo.get(db, userId, s.task_id) : null;
  return { session: { ...s, task } };
}

// ── Detalle de ejecución ─────────────────────────────────────
export async function getSessionDetail(db, userId, id) {
  const s = await getOwned(db, userId, id);
  const user = await usersRepo.findById(db, userId);
  const [checklist, objectives, distractions, metricValues, metrics, task, template, closure] = await Promise.all([
    sessionsRepo.checklist(db, id),
    sessionsRepo.objectives(db, id),
    sessionsRepo.distractions(db, id),
    sessionsRepo.metricValues(db, id),
    metricsRepo.list(db, userId),
    s.task_id ? tasksRepo.get(db, userId, s.task_id) : null,
    s.template_id ? templatesRepo.get(db, userId, s.template_id) : null,
    closuresRepo.findBySession(db, userId, id),
  ]);
  const typeId = task?.type_id ?? template?.type_id ?? null;
  return {
    session: s,
    task,
    template: template && { id: template.id, nombre: template.nombre, type_id: template.type_id },
    checklist,
    objectives,
    distractions,
    metric_values: Object.fromEntries(metricValues.map((m) => [m.metric_id, m.valor])),
    metrics: metrics.filter((m) => m.activa),
    worked_min: round1(workedMinutes(s)),
    server_now: clock.now(),
    ajuste_pendiente: !user.ajuste_entregado && user.ajuste_pendiente ? user.ajuste_pendiente : null,
    calibracion: await calibrationFor(db, userId, typeId),
    modo_cierre: user.modo_cierre,
    closure: closure ? { id: closure.id, estado: closure.estado } : null,
  };
}

export async function savePostit(db, userId, id, { objetivo, estimado_min }) {
  const s = await getOwned(db, userId, id);
  if (LOCKED.includes(s.estado)) throw conflict('La sesión ya está cerrada.', 'SESSION_LOCKED');
  const user = await usersRepo.findById(db, userId);
  const patch = { postit_objetivo: objetivo ?? null, postit_estimado_min: estimado_min ?? null };
  await db.transaction(async (trx) => {
    // Spec §Post-it: el ajuste pendiente se muestra una vez y queda marcado como entregado.
    if (!user.ajuste_entregado && user.ajuste_pendiente) {
      patch.ajuste_mostrado = user.ajuste_pendiente;
      await usersRepo.update(trx, userId, { ajuste_entregado: true });
    }
    await sessionsRepo.update(trx, userId, id, patch);
  });
  return sessionsRepo.get(db, userId, id);
}

export async function toggleChecklist(db, userId, id, itemId, hecho) {
  await getOwned(db, userId, id);
  const n = await sessionsRepo.setChecklist(db, id, itemId, hecho);
  if (!n) throw notFound('Ítem');
  return sessionsRepo.checklist(db, id);
}

export async function addObjective(db, userId, id, texto) {
  const s = await getOwned(db, userId, id);
  if (LOCKED.includes(s.estado)) throw conflict('La sesión ya está cerrada.', 'SESSION_LOCKED');
  await sessionsRepo.addObjective(db, id, texto.trim());
  return sessionsRepo.objectives(db, id);
}

export async function updateObjective(db, userId, id, objectiveId, patch) {
  await getOwned(db, userId, id);
  const n = await sessionsRepo.updateObjective(db, id, objectiveId, patch);
  if (!n) throw notFound('Objetivo');
  return sessionsRepo.objectives(db, id);
}

export async function removeObjective(db, userId, id, objectiveId) {
  await getOwned(db, userId, id);
  await sessionsRepo.removeObjective(db, id, objectiveId);
  return sessionsRepo.objectives(db, id);
}

// ── Timer (máquina de estados) ───────────────────────────────
async function transition(db, userId, id, from, patchFn, errorMsg) {
  const s = await getOwned(db, userId, id);
  if (!from.includes(s.estado)) throw conflict(errorMsg, 'INVALID_TRANSITION');
  const patch = patchFn(s);
  const n = await sessionsRepo.transition(db, userId, id, from, patch);
  if (!n) throw conflict('La sesión cambió de estado mientras tanto. Recargá.', 'INVALID_TRANSITION');
  return getSessionDetail(db, userId, id);
}

export async function start(db, userId, id) {
  const s = await getOwned(db, userId, id);
  const user = await usersRepo.findById(db, userId);
  if (s.fecha > localDate(clock.now(), user.timezone)) throw conflict('No se puede iniciar una sesión de un día futuro.', 'FUTURE_SESSION');
  const active = await sessionsRepo.findActive(db, userId);
  if (active && active.id !== id) throw conflict('Ya tenés una sesión en curso. Terminala antes de empezar otra.', 'ACTIVE_SESSION');
  return transition(db, userId, id, ['planificada'], () => ({ estado: 'trabajando', started_at: clock.now(), paused_ms: 0 }),
    'Esta sesión ya fue iniciada.');
}

export const pause = (db, userId, id) =>
  transition(db, userId, id, ['trabajando'], () => ({ estado: 'pausada', pause_started_at: clock.now() }), 'Solo se puede pausar una sesión en curso.');

export const resume = (db, userId, id) =>
  transition(db, userId, id, ['pausada'], (s) => ({
    estado: 'trabajando', paused_ms: (s.paused_ms || 0) + (clock.now() - s.pause_started_at), pause_started_at: null,
  }), 'Solo se puede reanudar una sesión pausada.');

export const endWork = (db, userId, id) =>
  transition(db, userId, id, ['trabajando', 'pausada'], (s) => {
    const now = clock.now();
    const paused = (s.paused_ms || 0) + (s.estado === 'pausada' ? now - s.pause_started_at : 0);
    const real = Math.max(0, (now - s.started_at - paused) / 60000);
    return { estado: 'trabajo_terminado', work_ended_at: now, paused_ms: paused, pause_started_at: null, real_min: round1(real) };
  }, 'Solo se puede terminar el trabajo de una sesión en curso.');

export async function startBreak(db, userId, id) {
  const active = await sessionsRepo.findActive(db, userId);
  if (active && active.id !== id) throw conflict('Ya tenés otra sesión en curso.', 'ACTIVE_SESSION');
  return transition(db, userId, id, ['trabajo_terminado'], () => ({ estado: 'descansando', break_started_at: clock.now() }),
    'El descanso empieza solo después de terminar el trabajo.');
}

export const endBreak = (db, userId, id) =>
  transition(db, userId, id, ['descansando'], () => ({ estado: 'descanso_terminado', break_ended_at: clock.now() }),
    'No hay un descanso en curso.');

export async function skip(db, userId, id) {
  return transition(db, userId, id, ['planificada'], () => ({ estado: 'omitida' }), 'Solo se puede omitir una sesión que no empezó.');
}

// ── Distracciones ────────────────────────────────────────────
export async function addDistraction(db, userId, id, { nota }) {
  const s = await getOwned(db, userId, id);
  if (!['trabajando', 'pausada'].includes(s.estado)) throw conflict('Las distracciones se registran durante el trabajo.', 'INVALID_TRANSITION');
  const now = clock.now();
  await sessionsRepo.addDistraction(db, { session_id: id, at: now, minuto: round1(workedMinutes(s, now)), nota: nota || null });
  return sessionsRepo.distractions(db, id);
}

export async function updateDistraction(db, userId, distractionId, { nota, volvio }) {
  const d = await sessionsRepo.getDistraction(db, distractionId);
  if (!d) throw notFound('Distracción');
  await getOwned(db, userId, d.session_id); // verifica que la sesión sea del usuario
  const patch = {};
  if (nota !== undefined) patch.nota = nota;
  if (volvio && d.duracion_s == null) patch.duracion_s = Math.max(1, Math.round((clock.now() - Number(d.at)) / 1000));
  if (Object.keys(patch).length) await sessionsRepo.updateDistraction(db, distractionId, patch);
  return sessionsRepo.distractions(db, d.session_id);
}

// ── Cierre común (simple y periodizado) ──────────────────────
export function assertClosable(s) {
  if (s.estado === 'cerrada') return 'ya_cerrada';
  if (!CLOSABLE.includes(s.estado)) throw conflict('Para cerrar la sesión primero terminá el trabajo.', 'INVALID_TRANSITION');
  return 'ok';
}

/** Aplica los campos comunes del cierre dentro de una transacción. */
export async function applyCommonClose(trx, userId, s, data) {
  const now = clock.now();
  const patch = {
    estado: 'cerrada',
    closed_at: now,
    sesion_completada: data.sesion_completada,
    tarea_completada: data.tarea_completada ?? null,
    resumen: data.resumen ?? null,
  };
  if (s.estado === 'descansando') patch.break_ended_at = now;
  await sessionsRepo.update(trx, userId, s.id, patch);
  for (const o of data.objetivos || []) await sessionsRepo.updateObjective(trx, s.id, o.id, { logrado: o.logrado });
  for (const m of data.metricas || []) await sessionsRepo.setMetricValue(trx, s.id, m.metric_id, m.valor);
  if (data.tarea_completada === 'si' && s.task_id) {
    await tasksRepo.update(trx, userId, s.task_id, { estado: 'completada', completada_at: now });
  }
  if (data.ajuste && data.ajuste.trim()) {
    await usersRepo.update(trx, userId, { ajuste_pendiente: data.ajuste.trim(), ajuste_entregado: false });
  }
}

export async function closeSimple(db, userId, id, data) {
  const s = await getOwned(db, userId, id);
  if (assertClosable(s) === 'ya_cerrada') return getSessionDetail(db, userId, id); // R11: idempotente
  const metrics = await metricsRepo.list(db, userId);
  const allowed = new Set(metrics.map((m) => m.id));
  for (const m of data.metricas || []) if (!allowed.has(m.metric_id)) throw badRequest('Métrica inválida.');
  await db.transaction((trx) => applyCommonClose(trx, userId, s, data));
  return getSessionDetail(db, userId, id);
}

export function sessionRatio(s, task) {
  const est = s.postit_estimado_min || task?.estimado_min;
  if (!est || s.real_min == null) return null;
  return Math.round((s.real_min / est) * 100) / 100;
}

export { ACTIVE_STATES, addDays };
