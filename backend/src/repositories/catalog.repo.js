// Tipos de tarea, tareas, plantillas y métricas. Todas las consultas filtran por user_id.
import { bool, insertId, num } from '../lib/db-utils.js';

const toType = (r) => r && { id: r.id, nombre: r.nombre, color: r.color, archivado: bool(r.archivado) };
const toTask = (r) => r && {
  id: r.id, type_id: r.type_id, titulo: r.titulo, notas: r.notas, estimado_min: r.estimado_min,
  estado: r.estado, veces_movida: r.veces_movida, completada_at: num(r.completada_at), created_at: num(r.created_at),
};
const toMetric = (r) => r && {
  id: r.id, nombre: r.nombre, tipo: r.tipo, clave: r.clave, activa: bool(r.activa), posicion: r.posicion,
};

export const typesRepo = {
  list: async (db, userId) => (await db('task_types').where({ user_id: userId }).orderBy('id')).map(toType),
  get: async (db, userId, id) => toType(await db('task_types').where({ user_id: userId, id }).first()),
  findByName: (db, userId, nombre) => db('task_types').where({ user_id: userId, nombre }).first(),
  create: (db, userId, row) => insertId(db, 'task_types', { ...row, user_id: userId }),
  update: (db, userId, id, patch) => db('task_types').where({ user_id: userId, id }).update(patch),
  remove: (db, userId, id) => db('task_types').where({ user_id: userId, id }).delete(),
  usage: async (db, userId, id) => {
    const a = await db('tasks').where({ user_id: userId, type_id: id }).count({ n: '*' }).first();
    const b = await db('templates').where({ user_id: userId, type_id: id }).count({ n: '*' }).first();
    return Number(a.n) + Number(b.n);
  },
};

export const tasksRepo = {
  list: async (db, userId, { estado } = {}) => {
    const q = db('tasks').where({ user_id: userId });
    if (estado) q.andWhere({ estado });
    return (await q.orderBy('id', 'desc')).map(toTask);
  },
  get: async (db, userId, id) => toTask(await db('tasks').where({ user_id: userId, id }).first()),
  create: (db, userId, row) => insertId(db, 'tasks', { ...row, user_id: userId, created_at: Date.now() }),
  update: (db, userId, id, patch) => db('tasks').where({ user_id: userId, id }).update(patch),
  remove: (db, userId, id) => db('tasks').where({ user_id: userId, id }).delete(),
  incrementMoved: (db, userId, id) => db('tasks').where({ user_id: userId, id }).increment('veces_movida', 1),
};

export const templatesRepo = {
  list: async (db, userId, { includeArchived = false } = {}) => {
    const q = db('templates').where({ user_id: userId });
    if (!includeArchived) q.andWhere({ archivada: false });
    const rows = await q.orderBy('id');
    const items = rows.length
      ? await db('template_items').whereIn('template_id', rows.map((r) => r.id)).orderBy(['template_id', 'posicion'])
      : [];
    return rows.map((r) => ({
      id: r.id, nombre: r.nombre, work_min: r.work_min, break_min: r.break_min, type_id: r.type_id,
      archivada: bool(r.archivada),
      items: items.filter((i) => i.template_id === r.id).map((i) => ({ id: i.id, texto: i.texto, posicion: i.posicion })),
    }));
  },
  get: async (db, userId, id) => {
    const r = await db('templates').where({ user_id: userId, id }).first();
    if (!r) return null;
    const items = await db('template_items').where({ template_id: id }).orderBy('posicion');
    return {
      id: r.id, nombre: r.nombre, work_min: r.work_min, break_min: r.break_min, type_id: r.type_id,
      archivada: bool(r.archivada), items: items.map((i) => ({ id: i.id, texto: i.texto, posicion: i.posicion })),
    };
  },
  create: async (db, userId, { items = [], ...row }) => {
    const id = await insertId(db, 'templates', { ...row, user_id: userId });
    await templatesRepo.replaceItems(db, id, items);
    return id;
  },
  update: (db, userId, id, patch) => db('templates').where({ user_id: userId, id }).update(patch),
  replaceItems: async (db, templateId, items) => {
    await db('template_items').where({ template_id: templateId }).delete();
    if (items.length) {
      await db('template_items').insert(items.map((texto, i) => ({ template_id: templateId, texto, posicion: i })));
    }
  },
  usage: async (db, userId, id) => Number((await db('dw_sessions').where({ user_id: userId, template_id: id }).count({ n: '*' }).first()).n),
  remove: (db, userId, id) => db('templates').where({ user_id: userId, id }).delete(),
};

export const metricsRepo = {
  list: async (db, userId) => (await db('metrics').where({ user_id: userId }).orderBy(['posicion', 'id'])).map(toMetric),
  get: async (db, userId, id) => toMetric(await db('metrics').where({ user_id: userId, id }).first()),
  create: (db, userId, row) => insertId(db, 'metrics', { ...row, user_id: userId }),
  update: (db, userId, id, patch) => db('metrics').where({ user_id: userId, id }).update(patch),
  nextPosition: async (db, userId) => {
    const r = await db('metrics').where({ user_id: userId }).max({ m: 'posicion' }).first();
    return (Number(r.m) || 0) + 1;
  },
};
