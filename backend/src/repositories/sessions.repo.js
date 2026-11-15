import { bool, insertId, num } from '../lib/db-utils.js';

export const ACTIVE_STATES = ['trabajando', 'pausada', 'descansando'];

export function toSession(r) {
  if (!r) return null;
  return {
    id: r.id,
    fecha: r.fecha,
    posicion: r.posicion,
    template_id: r.template_id,
    task_id: r.task_id,
    work_min_plan: r.work_min_plan,
    break_min_plan: r.break_min_plan,
    estado: r.estado,
    postit_objetivo: r.postit_objetivo,
    postit_estimado_min: r.postit_estimado_min,
    ajuste_mostrado: r.ajuste_mostrado,
    started_at: num(r.started_at),
    pause_started_at: num(r.pause_started_at),
    paused_ms: num(r.paused_ms) || 0,
    work_ended_at: num(r.work_ended_at),
    break_started_at: num(r.break_started_at),
    break_ended_at: num(r.break_ended_at),
    sesion_completada: r.sesion_completada == null ? null : bool(r.sesion_completada),
    tarea_completada: r.tarea_completada,
    resumen: r.resumen,
    real_min: r.real_min == null ? null : Number(r.real_min),
    closed_at: num(r.closed_at),
  };
}

export const sessionsRepo = {
  get: async (db, userId, id) => toSession(await db('dw_sessions').where({ user_id: userId, id }).first()),
  listRange: async (db, userId, from, to) =>
    (await db('dw_sessions').where({ user_id: userId }).whereBetween('fecha', [from, to]).orderBy(['fecha', 'posicion', 'id'])).map(toSession),
  listAll: async (db, userId) => (await db('dw_sessions').where({ user_id: userId }).orderBy(['fecha', 'posicion'])).map(toSession),
  countOnDate: async (db, userId, fecha) => Number((await db('dw_sessions').where({ user_id: userId, fecha }).count({ n: '*' }).first()).n),
  maxPosition: async (db, userId, fecha) => Number((await db('dw_sessions').where({ user_id: userId, fecha }).max({ m: 'posicion' }).first()).m) || 0,
  findActive: async (db, userId) => toSession(await db('dw_sessions').where({ user_id: userId }).whereIn('estado', ACTIVE_STATES).first()),
  create: (db, userId, row) => insertId(db, 'dw_sessions', { ...row, user_id: userId }),
  update: (db, userId, id, patch) => db('dw_sessions').where({ user_id: userId, id }).update(patch),
  remove: (db, userId, id) => db('dw_sessions').where({ user_id: userId, id }).delete(),
  /** Actualiza solo si el estado actual coincide: evita carreras entre dos pestañas. */
  transition: (db, userId, id, fromStates, patch) =>
    db('dw_sessions').where({ user_id: userId, id }).whereIn('estado', fromStates).update(patch),

  checklist: async (db, sessionId) =>
    (await db('session_checklist').where({ session_id: sessionId }).orderBy('posicion')).map((i) => ({ id: i.id, texto: i.texto, hecho: bool(i.hecho) })),
  addChecklist: (db, sessionId, textos) =>
    textos.length ? db('session_checklist').insert(textos.map((texto, i) => ({ session_id: sessionId, texto, posicion: i, hecho: false }))) : null,
  setChecklist: (db, sessionId, itemId, hecho) => db('session_checklist').where({ session_id: sessionId, id: itemId }).update({ hecho }),

  objectives: async (db, sessionId) =>
    (await db('session_objectives').where({ session_id: sessionId }).orderBy('id')).map((o) => ({ id: o.id, texto: o.texto, logrado: bool(o.logrado) })),
  addObjective: (db, sessionId, texto) => insertId(db, 'session_objectives', { session_id: sessionId, texto, logrado: false }),
  updateObjective: (db, sessionId, id, patch) => db('session_objectives').where({ session_id: sessionId, id }).update(patch),
  removeObjective: (db, sessionId, id) => db('session_objectives').where({ session_id: sessionId, id }).delete(),

  distractions: async (db, sessionId) =>
    (await db('distractions').where({ session_id: sessionId }).orderBy('at')).map((d) => ({
      id: d.id, at: num(d.at), minuto: Number(d.minuto), nota: d.nota, duracion_s: d.duracion_s,
    })),
  addDistraction: (db, row) => insertId(db, 'distractions', row),
  getDistraction: (db, id) => db('distractions').where({ id }).first(),
  updateDistraction: (db, id, patch) => db('distractions').where({ id }).update(patch),

  metricValues: async (db, sessionId) => db('metric_values').where({ session_id: sessionId }).select('metric_id', 'valor'),
  setMetricValue: async (db, sessionId, metricId, valor) => {
    await db('metric_values').where({ session_id: sessionId, metric_id: metricId }).delete();
    await db('metric_values').insert({ session_id: sessionId, metric_id: metricId, valor: valor == null ? null : String(valor) });
  },
};
