// Usuario demo con 8 semanas de historia, generada usando los mismos servicios que la API
// (con el reloj simulado), así los datos respetan todas las reglas de negocio.
import { pathToFileURL } from 'node:url';
import { clock } from '../lib/clock.js';
import { addDays, localDate, mondayOf } from '../lib/dates.js';
import { usersRepo } from '../repositories/users.repo.js';
import * as auth from '../services/auth.service.js';
import * as catalog from '../services/catalog.service.js';
import * as sessions from '../services/sessions.service.js';
import * as periodized from '../services/periodized/periodized.service.js';

export const DEMO = { email: 'demo@superhumanos.app', password: 'superhumanos', nombre: 'Cameron (demo)' };

// Generador determinístico para que la demo sea siempre igual.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Instante (ms) de una fecha local de Buenos Aires (UTC−3) a una hora dada. */
const at = (fecha, hour, minute = 0) => Date.parse(`${fecha}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);

export async function seedDemo(db, { force = false } = {}) {
  const existing = await usersRepo.findByEmail(db, DEMO.email);
  if (existing && !force) return { creado: false };
  if (existing) await db('users').where({ id: existing.id }).delete();

  const rnd = mulberry32(42);
  const realNow = Date.now();
  const today = localDate(realNow);
  const user = await auth.register(db, { ...DEMO });
  const uid = user.id;
  await catalog.updateSettings(db, uid, { valor_hora: 80, moneda: 'USD' });

  const types = await catalog.listTypes(db, uid);
  const [deep, shallow, creative] = types;
  const templates = await catalog.listTemplates(db, uid);
  const tpl = templates[0];

  const backlog = [
    ['Reescribir la oferta del programa', deep.id, 180],
    ['Guion del video de YouTube: concentración', creative.id, 120],
    ['Diseñar el funnel de captación', deep.id, 240],
    ['Responder mails y DMs de leads', shallow.id, 45],
    ['Preparar la llamada de ventas con el lead B', deep.id, 60],
    ['Bocetar miniaturas de la semana', creative.id, 90],
    ['Revisar métricas de anuncios', shallow.id, 30],
    ['Escribir la secuencia de 5 mails', creative.id, 150],
    ['Armar el modelo financiero del Q1', deep.id, 120],
    ['Ordenar Notion y la bandeja de entrada', shallow.id, 40],
  ];
  const taskIds = [];
  for (const [titulo, type_id, estimado_min] of backlog) {
    taskIds.push((await catalog.createTask(db, uid, { titulo, type_id, estimado_min })).id);
  }

  const startMonday = addDays(mondayOf(today), -7 * 8);
  let pendingTasks = [...taskIds];
  let periodizedMode = false;
  try {
    for (let d = startMonday; d < today; d = addDays(d, 1)) {
      const weekday = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
      if (weekday === 6) continue; // domingo libre
      const n = weekday === 5 ? 1 : 2;
      // Las últimas dos semanas, cierre periodizado.
      if (!periodizedMode && d >= addDays(mondayOf(today), -14)) {
        periodizedMode = true;
        await catalog.updateSettings(db, uid, { modo_cierre: 'periodizado' });
      }
      clock.set(at(d, 8));
      const created = await sessions.createSessions(db, uid, { fecha: d, template_id: tpl.id, cantidad: n });
      for (let i = 0; i < created.length; i += 1) {
        const s = created[i];
        if (rnd() < 0.12) { await sessions.skip(db, uid, s.id); continue; }
        if (pendingTasks.length === 0) {
          const t = await catalog.createTask(db, uid, {
            titulo: `Bloque de producto #${Math.floor(rnd() * 900 + 100)}`, type_id: [deep, creative, shallow][Math.floor(rnd() * 3)].id, estimado_min: 90,
          });
          pendingTasks.push(t.id);
        }
        const taskId = pendingTasks[0];
        await sessions.assignTask(db, uid, s.id, { task_id: taskId });
        clock.set(at(d, 9 + i * 2, 0));
        const est = [60, 75, 90, 90, 90][Math.floor(rnd() * 5)];
        await sessions.savePostit(db, uid, s.id, { objetivo: 'Terminar la primera versión completa', estimado_min: est });
        await sessions.start(db, uid, s.id);
        const real = Math.round(est * (0.75 + rnd() * 0.6));
        const nDistr = Math.floor(rnd() * 4);
        for (let k = 0; k < nDistr; k += 1) {
          clock.advance(Math.floor((real / (nDistr + 1)) * 60000));
          const list = await sessions.addDistraction(db, uid, s.id, { nota: ['Celular', 'Mail', 'Idea suelta', 'Mensaje de un cliente'][k % 4] });
          if (rnd() < 0.5) {
            clock.advance(60000 * (1 + Math.floor(rnd() * 4)));
            await sessions.updateDistraction(db, uid, list[list.length - 1].id, { volvio: true });
          }
        }
        clock.set(at(d, 9 + i * 2, 0) + real * 60000);
        await sessions.endWork(db, uid, s.id);
        const taskDone = rnd() < 0.45;
        const metrics = await catalog.listMetrics(db, uid);
        const energia = metrics.find((m) => m.clave === 'energia');
        const distr = metrics.find((m) => m.clave === 'distracciones');
        const common = {
          sesion_completada: rnd() < 0.85,
          tarea_completada: taskDone ? 'si' : rnd() < 0.5 ? 'parcial' : 'no',
          resumen: taskDone ? 'Cerré la tarea completa.' : 'Avancé, queda una parte para la próxima.',
          metricas: [
            { metric_id: energia.id, valor: String(5 + Math.floor(rnd() * 5)) },
            { metric_id: distr.id, valor: String(nDistr) },
          ],
        };
        if (periodizedMode) {
          const draft = await periodized.openClosure(db, uid, s.id, { rng: rnd });
          const respuestas = draft.preguntas.filter((p) => !p.na_automatico && !p.sin_pregunta).map((p) => (
            p.requiere ? { item_id: p.item_id, dato: { estimado_min: Math.round(real * (0.8 + rnd() * 0.5)) } }
              : { item_id: p.item_id, respuesta: rnd() < 0.7 ? 'si' : rnd() < 0.8 ? 'no' : 'na' }
          ));
          await periodized.confirmClosure(db, uid, draft.closure.id, {
            ...common, respuestas, por_que: 'Me costó arrancar.', ajuste: rnd() < 0.3 ? 'Dejar el celular en otra habitación' : null,
          });
        } else {
          await sessions.closeSimple(db, uid, s.id, common);
        }
        if (taskDone) pendingTasks = pendingTasks.slice(1);
      }
    }

    // Hoy y la semana que viene: sesiones agendadas, unas con tarea y otras sin, para ver la diferencia.
    clock.set(realNow);
    for (const [titulo, type_id, estimado_min] of [
      ['Grabar el video de la semana', creative.id, 120],
      ['Definir el precio del programa', deep.id, 90],
      ['Llamadas de seguimiento a leads', shallow.id, 60],
      ['Escribir el caso de estudio de un cliente', creative.id, 90],
      ['Auditar el calendario de la próxima semana', shallow.id, 30],
    ]) {
      pendingTasks.push((await catalog.createTask(db, uid, { titulo, type_id, estimado_min })).id);
    }
    let k = 0;
    for (let d = today; d <= addDays(mondayOf(today), 13); d = addDays(d, 1)) {
      const weekday = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
      if (weekday === 6) continue;
      const created = await sessions.createSessions(db, uid, { fecha: d, template_id: tpl.id, cantidad: 2 });
      const free = pendingTasks.filter(Boolean);
      if (free.length && k % 3 !== 2) await sessions.assignTask(db, uid, created[0].id, { task_id: free[k % free.length] });
      if (free.length > 1 && k % 2 === 0) await sessions.assignTask(db, uid, created[1].id, { task_id: free[(k + 1) % free.length] });
      k += 1;
    }
  } finally {
    clock.reset();
  }
  return { creado: true, userId: uid };
}

// Ejecutable directo: `npm run seed:demo` (con --force recrea la demo).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { createDb } = await import('./knex.js');
  const db = createDb();
  await db.migrate.latest();
  const res = await seedDemo(db, { force: process.argv.includes('--force') });
  console.log(res.creado ? `Demo creada: ${DEMO.email}` : 'La demo ya existía (usá --force para recrearla).');
  await db.destroy();
}
