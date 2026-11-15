// Configuración, tipos, tareas, plantillas, métricas y banco (CRUD con reglas de negocio).
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { usersRepo } from '../repositories/users.repo.js';
import { metricsRepo, tasksRepo, templatesRepo, typesRepo } from '../repositories/catalog.repo.js';
import { bankRepo } from '../repositories/bank.repo.js';

// ── Configuración ────────────────────────────────────────────
export async function updateSettings(db, userId, patch) {
  await usersRepo.update(db, userId, patch);
  return usersRepo.findById(db, userId);
}

// ── Tipos ────────────────────────────────────────────────────
export const listTypes = (db, userId) => typesRepo.list(db, userId);

export async function createType(db, userId, { nombre, color }) {
  if (await typesRepo.findByName(db, userId, nombre.trim())) throw conflict('Ya tenés un tipo con ese nombre.');
  const id = await typesRepo.create(db, userId, { nombre: nombre.trim(), color: color || '#111111' });
  return typesRepo.get(db, userId, id);
}

export async function updateType(db, userId, id, patch) {
  const current = await typesRepo.get(db, userId, id);
  if (!current) throw notFound('Tipo');
  if (patch.nombre) {
    const other = await typesRepo.findByName(db, userId, patch.nombre.trim());
    if (other && other.id !== id) throw conflict('Ya tenés un tipo con ese nombre.');
    patch.nombre = patch.nombre.trim();
  }
  await typesRepo.update(db, userId, id, patch);
  return typesRepo.get(db, userId, id);
}

/** Regla CB9: un tipo en uso no se borra, se archiva. */
export async function deleteType(db, userId, id) {
  const current = await typesRepo.get(db, userId, id);
  if (!current) throw notFound('Tipo');
  if ((await typesRepo.usage(db, userId, id)) > 0) {
    await typesRepo.update(db, userId, id, { archivado: true });
    return { archivado: true };
  }
  await typesRepo.remove(db, userId, id);
  return { borrado: true };
}

async function assertType(db, userId, typeId) {
  if (typeId == null) return;
  const t = await typesRepo.get(db, userId, typeId);
  if (!t) throw badRequest('El tipo indicado no existe.');
}

// ── Tareas ───────────────────────────────────────────────────
export const listTasks = (db, userId, filters) => tasksRepo.list(db, userId, filters);

export async function createTask(db, userId, data) {
  await assertType(db, userId, data.type_id);
  const id = await tasksRepo.create(db, userId, { ...data, estado: 'pendiente' });
  return tasksRepo.get(db, userId, id);
}

export async function updateTask(db, userId, id, patch) {
  const task = await tasksRepo.get(db, userId, id);
  if (!task) throw notFound('Tarea');
  if ('type_id' in patch) await assertType(db, userId, patch.type_id);
  const next = { ...patch };
  if (patch.estado === 'completada' && task.estado !== 'completada') next.completada_at = Date.now();
  if (patch.estado && patch.estado !== 'completada') next.completada_at = null;
  await tasksRepo.update(db, userId, id, next);
  return tasksRepo.get(db, userId, id);
}

export async function deleteTask(db, userId, id) {
  if (!(await tasksRepo.get(db, userId, id))) throw notFound('Tarea');
  await tasksRepo.remove(db, userId, id);
}

// ── Plantillas ───────────────────────────────────────────────
export const listTemplates = (db, userId) => templatesRepo.list(db, userId);

export async function createTemplate(db, userId, data) {
  await assertType(db, userId, data.type_id);
  const id = await templatesRepo.create(db, userId, data);
  return templatesRepo.get(db, userId, id);
}

export async function updateTemplate(db, userId, id, { items, ...patch }) {
  if (!(await templatesRepo.get(db, userId, id))) throw notFound('Plantilla');
  if ('type_id' in patch) await assertType(db, userId, patch.type_id);
  await db.transaction(async (trx) => {
    if (Object.keys(patch).length) await templatesRepo.update(trx, userId, id, patch);
    if (items) await templatesRepo.replaceItems(trx, id, items);
  });
  return templatesRepo.get(db, userId, id);
}

export async function deleteTemplate(db, userId, id) {
  if (!(await templatesRepo.get(db, userId, id))) throw notFound('Plantilla');
  if ((await templatesRepo.usage(db, userId, id)) > 0) {
    await templatesRepo.update(db, userId, id, { archivada: true });
    return { archivada: true };
  }
  await templatesRepo.remove(db, userId, id);
  return { borrada: true };
}

// ── Métricas ─────────────────────────────────────────────────
export const listMetrics = (db, userId) => metricsRepo.list(db, userId);

export async function createMetric(db, userId, { nombre, tipo }) {
  const id = await metricsRepo.create(db, userId, {
    nombre: nombre.trim(), tipo, activa: true, posicion: await metricsRepo.nextPosition(db, userId),
  });
  return metricsRepo.get(db, userId, id);
}

export async function updateMetric(db, userId, id, patch) {
  const m = await metricsRepo.get(db, userId, id);
  if (!m) throw notFound('Métrica');
  if (m.clave && patch.tipo && patch.tipo !== m.tipo) throw conflict('El tipo de una métrica por defecto no se puede cambiar.');
  await metricsRepo.update(db, userId, id, patch);
  return metricsRepo.get(db, userId, id);
}

// ── Banco de preguntas ───────────────────────────────────────
export async function listBank(db, userId) {
  const [questions, stats] = await Promise.all([bankRepo.list(db, userId), bankRepo.stats(db, userId)]);
  const byId = Object.fromEntries(stats.map((s) => [s.question_id, s]));
  const order = { C: 0, A: 1, E: 2, S: 3, SI: 4, O: 5 };
  return questions
    .map((q) => {
      const s = byId[q.id] || {};
      const aplicables = s.aplicables || 0;
      const problemas = s.problemas || 0;
      return {
        ...q,
        stats: { apariciones: s.apariciones || 0, aplicables, problemas, na: s.na || 0 },
        candidata_graduacion: aplicables >= 8 && problemas === 0,
      };
    })
    .sort((a, b) => order[a.tema] - order[b.tema] || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export async function setQuestionActive(db, userId, id, activa) {
  if (!(await bankRepo.get(db, userId, id))) throw notFound('Pregunta');
  await bankRepo.update(db, userId, id, { activa });
  return bankRepo.get(db, userId, id);
}
