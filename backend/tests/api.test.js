import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clock } from '../src/lib/clock.js';
import { addDays, localDate } from '../src/lib/dates.js';
import { computeStreaks } from '../src/services/stats.service.js';
import { setup, user } from './helpers.js';

let ctx;
const today = () => localDate(clock.now());

beforeEach(async () => {
  clock.set(Date.parse('2026-11-12T12:00:00-03:00')); // jueves
  ctx = await setup();
});
afterEach(async () => {
  clock.reset();
  await ctx.db.destroy();
});

async function plannedSession(u, fecha = today()) {
  const tpls = (await u.get('/api/templates')).body.templates;
  const res = await u.post('/api/sessions', { fecha, template_id: tpls[0].id });
  return res.body.sessions[0];
}

describe('Auth y aislamiento', () => {
  it('registra, devuelve defaults y no expone el hash', async () => {
    const u = await user(ctx.api);
    const me = await u.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.work_min).toBe(90);
    expect(me.body.user.break_min).toBe(20);
    expect(me.body.user.password_hash).toBeUndefined();
    const types = (await u.get('/api/types')).body.types.map((t) => t.nombre);
    expect(types).toEqual(['Deep Work', 'Shallow Work', 'Creative Work']);
    const metrics = (await u.get('/api/metrics')).body.metrics.map((m) => m.clave);
    expect(metrics).toEqual(['distracciones', 'energia']);
  });

  it('rechaza emails duplicados y contraseñas cortas', async () => {
    await ctx.api.post('/api/auth/register').send({ nombre: 'A', email: 'dup@test.com', password: 'password123' }).expect(201);
    await ctx.api.post('/api/auth/register').send({ nombre: 'A', email: 'dup@test.com', password: 'password123' }).expect(409);
    await ctx.api.post('/api/auth/register').send({ nombre: 'A', email: 'x@test.com', password: 'corta' }).expect(400);
  });

  it('login incorrecto da 401 y sin sesión no se accede', async () => {
    await ctx.api.post('/api/auth/login').send({ email: 'nadie@test.com', password: 'password123' }).expect(401);
    await ctx.api.get('/api/tasks').expect(401);
  });

  it('un usuario no puede ver ni tocar datos de otro (404)', async () => {
    const a = await user(ctx.api);
    const b = await user(ctx.api);
    const task = (await a.post('/api/tasks', { titulo: 'Privada' })).body.task;
    await b.patch(`/api/tasks/${task.id}`, { titulo: 'hack' }).expect(404);
    const s = await plannedSession(a);
    await b.get(`/api/sessions/${s.id}`).expect(404);
  });
});

describe('Tipos, tareas y plantillas', () => {
  it('un tipo en uso se archiva en vez de borrarse (CB9)', async () => {
    const u = await user(ctx.api);
    const t = (await u.post('/api/types', { nombre: 'Ventas', color: '#123456' })).body.type;
    await u.post('/api/tasks', { titulo: 'Llamar', type_id: t.id });
    const res = await u.del(`/api/types/${t.id}`);
    expect(res.body).toEqual({ archivado: true });
    const libre = (await u.post('/api/types', { nombre: 'Libre' })).body.type;
    expect((await u.del(`/api/types/${libre.id}`)).body).toEqual({ borrado: true });
  });

  it('no permite dos tipos con el mismo nombre', async () => {
    const u = await user(ctx.api);
    await u.post('/api/types', { nombre: 'Deep Work' }).expect(409);
  });

  it('valida los datos de entrada (400)', async () => {
    const u = await user(ctx.api);
    await u.post('/api/tasks', { titulo: '' }).expect(400);
    await u.post('/api/templates', { nombre: 'X', work_min: 0, break_min: 5 }).expect(400);
  });
});

describe('Planificador (R1–R5)', () => {
  it('distingue sesiones con y sin tarea y cuenta los movimientos', async () => {
    const u = await user(ctx.api);
    const s1 = await plannedSession(u);
    const s2 = await plannedSession(u, addDays(today(), 1));
    const task = (await u.post('/api/tasks', { titulo: 'Escribir guion' })).body.task;
    await u.put(`/api/sessions/${s1.id}/task`, { task_id: task.id }).expect(200);
    let week = (await u.get(`/api/week?start=${today()}`)).body;
    expect(week.counts).toMatchObject({ agendadas: 2, con_tarea: 1, sin_tarea: 1 });

    await u.put(`/api/sessions/${s2.id}/task`, { task_id: task.id, from_session_id: s1.id }).expect(200);
    week = (await u.get(`/api/week?start=${today()}`)).body;
    const all = week.days.flatMap((d) => d.sessions);
    expect(all.find((s) => s.id === s1.id).task_id).toBeNull();
    expect(all.find((s) => s.id === s2.id).task.titulo).toBe('Escribir guion');
    const t = (await u.get('/api/tasks')).body.tasks[0];
    expect(t.veces_movida).toBe(1);
  });

  it('no asigna tareas completadas ni a sesiones cerradas', async () => {
    const u = await user(ctx.api);
    const s = await plannedSession(u);
    const done = (await u.post('/api/tasks', { titulo: 'Hecha' })).body.task;
    await u.patch(`/api/tasks/${done.id}`, { estado: 'completada' });
    expect((await u.put(`/api/sessions/${s.id}/task`, { task_id: done.id })).status).toBe(409);

    await u.post(`/api/sessions/${s.id}/skip`).expect(200);
    const t = (await u.post('/api/tasks', { titulo: 'Nueva' })).body.task;
    const res = await u.put(`/api/sessions/${s.id}/task`, { task_id: t.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_LOCKED');
  });

  it('limita a 12 sesiones por día', async () => {
    const u = await user(ctx.api);
    await u.post('/api/sessions', { fecha: today(), cantidad: 12 }).expect(201);
    await u.post('/api/sessions', { fecha: today(), cantidad: 1 }).expect(409);
  });
});

describe('Timer (R6–R10)', () => {
  it('no pasa solo al descanso, cuenta tiempo extra y descuenta pausas', async () => {
    const u = await user(ctx.api);
    const s = await plannedSession(u);
    await u.post(`/api/sessions/${s.id}/start`).expect(200);
    clock.advance(30 * 60000);
    await u.post(`/api/sessions/${s.id}/pause`).expect(200);
    clock.advance(10 * 60000);
    await u.post(`/api/sessions/${s.id}/resume`).expect(200);
    clock.advance(70 * 60000); // 100 min de trabajo: 10 de tiempo extra
    const mid = (await u.get(`/api/sessions/${s.id}`)).body;
    expect(mid.session.estado).toBe('trabajando'); // R8: no cambia de fase solo
    expect(mid.worked_min).toBe(100);
    const end = (await u.post(`/api/sessions/${s.id}/end-work`)).body;
    expect(end.session.real_min).toBe(100);
    expect(end.session.estado).toBe('trabajo_terminado');
    await u.post(`/api/sessions/${s.id}/start-break`).expect(200);
    clock.advance(25 * 60000);
    const brk = (await u.get(`/api/sessions/${s.id}`)).body;
    expect(brk.session.estado).toBe('descansando');
  });

  it('una sola sesión activa por usuario (CB2)', async () => {
    const u = await user(ctx.api);
    const a = await plannedSession(u);
    const b = await plannedSession(u);
    await u.post(`/api/sessions/${a.id}/start`).expect(200);
    const res = await u.post(`/api/sessions/${b.id}/start`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_SESSION');
  });

  it('rechaza transiciones inválidas y sesiones futuras', async () => {
    const u = await user(ctx.api);
    const s = await plannedSession(u);
    await u.post(`/api/sessions/${s.id}/pause`).expect(409);
    await u.post(`/api/sessions/${s.id}/start-break`).expect(409);
    const future = await plannedSession(u, addDays(today(), 2));
    expect((await u.post(`/api/sessions/${future.id}/start`)).body.error.code).toBe('FUTURE_SESSION');
  });

  it('registra distracciones con su minuto y su duración', async () => {
    const u = await user(ctx.api);
    const s = await plannedSession(u);
    await u.post(`/api/sessions/${s.id}/start`);
    clock.advance(12 * 60000);
    const list = (await u.post(`/api/sessions/${s.id}/distractions`, { nota: 'celular' })).body.distractions;
    expect(list[0].minuto).toBe(12);
    clock.advance(3 * 60000);
    const upd = (await u.patch(`/api/distractions/${list[0].id}`, { volvio: true })).body.distractions;
    expect(upd[0].duracion_s).toBe(180);
  });
});

describe('Post-it y ajuste pendiente', () => {
  it('muestra el ajuste una vez y lo marca como entregado', async () => {
    const u = await user(ctx.api);
    const s1 = await plannedSession(u);
    await u.post(`/api/sessions/${s1.id}/start`);
    clock.advance(60 * 60000);
    await u.post(`/api/sessions/${s1.id}/end-work`);
    await u.post(`/api/sessions/${s1.id}/close`, { sesion_completada: true, ajuste: 'Celular en otra habitación' }).expect(200);

    const s2 = await plannedSession(u);
    const d = (await u.get(`/api/sessions/${s2.id}`)).body;
    expect(d.ajuste_pendiente).toBe('Celular en otra habitación');
    await u.put(`/api/sessions/${s2.id}/postit`, { objetivo: 'Terminar el guion', estimado_min: 80 }).expect(200);
    const after = (await u.get(`/api/sessions/${s2.id}`)).body;
    expect(after.ajuste_pendiente).toBeNull();
    expect(after.session.ajuste_mostrado).toBe('Celular en otra habitación');
  });
});

describe('Cierre simple (R11)', () => {
  it('cierra una sola vez, guarda métricas y completa la tarea', async () => {
    const u = await user(ctx.api);
    const s = await plannedSession(u);
    const task = (await u.post('/api/tasks', { titulo: 'Oferta', estimado_min: 90 })).body.task;
    await u.put(`/api/sessions/${s.id}/task`, { task_id: task.id });
    await u.post(`/api/sessions/${s.id}/close`, { sesion_completada: true }).expect(409); // sin terminar el trabajo
    await u.post(`/api/sessions/${s.id}/start`);
    clock.advance(45 * 60000);
    await u.post(`/api/sessions/${s.id}/end-work`);
    const metrics = (await u.get('/api/metrics')).body.metrics;
    const body = {
      sesion_completada: true,
      tarea_completada: 'si',
      resumen: 'Salió',
      metricas: [{ metric_id: metrics[1].id, valor: '8' }],
    };
    const r1 = await u.post(`/api/sessions/${s.id}/close`, body);
    const r2 = await u.post(`/api/sessions/${s.id}/close`, body); // CB5
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.session.estado).toBe('cerrada');
    const values = await ctx.db('metric_values').where({ session_id: s.id });
    expect(values).toHaveLength(1);
    const t = (await u.get('/api/tasks')).body.tasks[0];
    expect(t.estado).toBe('completada');
  });
});

describe('Cierre periodizado (§7)', () => {
  async function workedSession(u, minutes = 90, estimate = 90) {
    const s = await plannedSession(u);
    await u.put(`/api/sessions/${s.id}/postit`, { objetivo: 'X', estimado_min: estimate });
    await u.post(`/api/sessions/${s.id}/start`);
    clock.advance(minutes * 60000);
    await u.post(`/api/sessions/${s.id}/end-work`);
    return s;
  }

  function answersFor(draft, respuesta = 'no') {
    return draft.preguntas.filter((p) => !p.na_automatico && !p.sin_pregunta).map((p) => (
      p.requiere ? { item_id: p.item_id, dato: { estimado_min: 60 } } : { item_id: p.item_id, respuesta }
    ));
  }

  it('sortea 6 preguntas en orden C, A, E, S, SI, O y no re-sortea al recargar (CB6)', async () => {
    const u = await user(ctx.api);
    await u.patch('/api/settings', { modo_cierre: 'periodizado' });
    const s = await workedSession(u);
    const d1 = (await u.post('/api/closures', { session_id: s.id })).body;
    const d2 = (await u.post('/api/closures', { session_id: s.id })).body;
    expect(d1.preguntas.map((p) => p.tema)).toEqual(['C', 'A', 'E', 'S', 'SI', 'O']);
    expect(d2.closure.id).toBe(d1.closure.id);
    expect(d2.preguntas.map((p) => p.texto)).toEqual(d1.preguntas.map((p) => p.texto));
    expect(d1.titulo).toBe('Cierre 1');
    // Al usuario no se le muestran subvariable, modo ni regla.
    expect(Object.keys(d1.preguntas[0])).not.toContain('modo');
    expect(Object.keys(d1.preguntas[0])).not.toContain('problema_si');
    const n = await ctx.db('closure_items').where({ closure_id: d1.closure.id }).count({ n: '*' }).first();
    expect(Number(n.n)).toBe(6);
  });

  it('confirma una sola vez, muestra ✓/✗/N/A, ratio y ajuste', async () => {
    const u = await user(ctx.api);
    await u.patch('/api/settings', { modo_cierre: 'periodizado' });
    const s = await workedSession(u, 120, 80); // ratio 1,5: fuera de rango
    const draft = (await u.post('/api/closures', { session_id: s.id })).body;
    const body = { sesion_completada: true, tarea_completada: 'no', respuestas: answersFor(draft, 'no'), por_que: 'Me trabé', ajuste: 'Partir la tarea' };
    const c1 = (await u.post(`/api/closures/${draft.closure.id}/confirm`, body)).body;
    const c2 = (await u.post(`/api/closures/${draft.closure.id}/confirm`, body)).body;
    expect(c1.result.lineas).toHaveLength(6);
    expect(c1.result.lineas.every((l) => ['✓', '✗', 'N/A'].includes(l.marca))).toBe(true);
    expect(c1.result.ratio).toBe(1.5);
    expect(c1.result.ratio_fuera_de_rango).toBe(true);
    expect(c1.result.ajuste).toBe('Partir la tarea');
    expect(c2.closure.confirmed_at).toBe(c1.closure.confirmed_at);
    const stats = await ctx.db('question_stats').where({ user_id: u.id });
    expect(stats.reduce((a, r) => a + r.apariciones, 0)).toBe(6); // no se duplicó
  });

  it('primera sesión del día: preguntas de descanso previo en N/A automático (CB7)', async () => {
    const u = await user(ctx.api);
    await u.patch('/api/settings', { modo_cierre: 'periodizado' });
    // Forzamos que Sistemas solo tenga preguntas de descanso previo activas.
    const bank = (await u.get('/api/bank')).body.questions;
    for (const q of bank.filter((x) => x.tema === 'SI' && !x.id.match(/SI1[5-8]/) && x.activa)) {
      await u.patch(`/api/bank/${q.id}`, { activa: false });
    }
    const s = await workedSession(u);
    const draft = (await u.post('/api/closures', { session_id: s.id })).body;
    const si = draft.preguntas.find((p) => p.tema === 'SI');
    expect(si.na_automatico).toBe(true);
    expect(si.respuesta).toBe('na');
  });

  it('exige respuesta Sí/No/N/A en cada pregunta', async () => {
    const u = await user(ctx.api);
    const s = await workedSession(u);
    const draft = (await u.post('/api/closures', { session_id: s.id })).body;
    const res = await u.post(`/api/closures/${draft.closure.id}/confirm`, { sesion_completada: true, respuestas: [] });
    expect(res.status).toBe(400);
  });

  it('resumen semanal: problemas / aplicables y candidatas a graduación (R25, R26)', async () => {
    const u = await user(ctx.api);
    await u.patch('/api/settings', { modo_cierre: 'periodizado' });
    for (let i = 0; i < 3; i += 1) {
      const s = await workedSession(u, 60, 60);
      const draft = (await u.post('/api/closures', { session_id: s.id })).body;
      await u.post(`/api/closures/${draft.closure.id}/confirm`, { sesion_completada: true, respuestas: answersFor(draft, 'na') }).expect(200);
      clock.advance(60 * 60000);
    }
    const sum = (await u.get('/api/stats/periodized')).body;
    expect(sum.cierres_totales).toBe(3);
    // Todo N/A: denominador 0 → «sin datos» (porcentaje null) salvo la pregunta de dato.
    for (const t of sum.temas.filter((x) => x.tema !== 'C')) expect(t.aplicables).toBe(0);
    for (const t of sum.temas.filter((x) => x.tema !== 'C')) expect(t.porcentaje).toBeNull();
  });

  it('exporta e importa el estado; rechaza un estado mal formado (CB13)', async () => {
    const u = await user(ctx.api);
    const s = await workedSession(u);
    const draft = (await u.post('/api/closures', { session_id: s.id })).body;
    await u.post(`/api/closures/${draft.closure.id}/confirm`, { sesion_completada: true, respuestas: answersFor(draft, 'si'), ajuste: 'Ajuste X' });
    const exported = (await u.get('/api/state/export')).body;
    expect(exported.cierres_totales).toBe(1);
    expect(exported.ajuste_pendiente).toBe('Ajuste X');

    const other = await user(ctx.api);
    await other.post('/api/state/import', { foo: 1 }).expect(400);
    const imported = (await other.post('/api/state/import', exported)).body;
    expect(imported.cierres_totales).toBe(1);
    expect(imported.temas).toEqual(exported.temas);
    expect(imported.conteos).toHaveLength(6);
  });
});

describe('Datos', () => {
  it('rachas: un día sin sesiones agendadas no corta (R15)', () => {
    const s = (fecha, estado = 'cerrada') => ({ fecha, estado });
    const res = computeStreaks([
      s('2026-11-09'), s('2026-11-10'), /* 11: descanso planificado */ s('2026-11-12'),
    ], '2026-11-12', 3);
    expect(res.diaria.actual).toBe(3);
    const broken = computeStreaks([s('2026-11-09'), s('2026-11-10', 'omitida'), s('2026-11-11')], '2026-11-12', 3);
    expect(broken.diaria.actual).toBe(1);
    expect(broken.diaria.mejor).toBe(1);
  });

  it('racha semanal según el objetivo (R16)', () => {
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10', '2026-11-11'];
    const res = computeStreaks(days.map((fecha) => ({ fecha, estado: 'cerrada' })), '2026-11-12', 3);
    expect(res.semanal.actual).toBe(2);
  });

  it('resumen semanal con valor de la hora y costo de distracciones (R14)', async () => {
    const u = await user(ctx.api);
    await u.patch('/api/settings', { valor_hora: 60, min_por_distraccion: 5 });
    const s = await plannedSession(u);
    await u.post(`/api/sessions/${s.id}/start`);
    clock.advance(30 * 60000);
    const list = (await u.post(`/api/sessions/${s.id}/distractions`, {})).body.distractions;
    clock.advance(2 * 60000);
    await u.patch(`/api/distractions/${list[0].id}`, { volvio: true });
    await u.post(`/api/sessions/${s.id}/distractions`, {});
    clock.advance(28 * 60000);
    await u.post(`/api/sessions/${s.id}/end-work`);
    await u.post(`/api/sessions/${s.id}/close`, { sesion_completada: true });
    const w = (await u.get('/api/stats/week')).body;
    expect(w.minutos.reales).toBe(60);
    expect(w.distracciones.total).toBe(2);
    expect(w.distracciones.minutos_perdidos).toBe(7); // 2 medidos + 1 sin medir × 5
    expect(w.dinero.valor_invertido).toBe(60);
    expect(w.dinero.costo_distracciones).toBe(7);
  });

  it('mapa de constancia de 365 días y calibrador con mínimo de 3 datos', async () => {
    const u = await user(ctx.api);
    const hm = (await u.get('/api/stats/heatmap')).body;
    expect(hm.dias).toHaveLength(365);
    const cal = (await u.get('/api/stats/calibration')).body;
    expect(cal.general).toEqual({ n: 0, ratio: null });
  });
});
