import { Router } from 'express';
import { handle, loginLimiter, requireAuth, validate } from '../middlewares/index.js';
import * as S from '../validators/schemas.js';
import { authController } from '../controllers/auth.controller.js';
import {
  bankController, closuresController, metricsController, sessionsController, settingsController,
  stateController, statsController, tasksController, templatesController, typesController,
} from '../controllers/app.controller.js';

export function buildRouter() {
  const r = Router();
  const id = validate({ params: S.params.id });

  r.get('/health', (_req, res) => res.json({ ok: true, servicio: 'superhumanos-deep-work-api' }));

  // Auth (públicas)
  r.post('/auth/register', loginLimiter({ max: 20 }), validate({ body: S.auth.register }), handle(authController.register));
  r.post('/auth/login', loginLimiter(), validate({ body: S.auth.login }), handle(authController.login));
  r.post('/auth/logout', handle(authController.logout));

  // Todo lo que sigue requiere sesión
  r.use(requireAuth);
  r.get('/auth/me', handle(authController.me));
  r.get('/settings', handle(authController.me));
  r.patch('/settings', validate({ body: S.settings }), handle(settingsController.update));

  r.get('/types', handle(typesController.list));
  r.post('/types', validate({ body: S.types.create }), handle(typesController.create));
  r.patch('/types/:id', id, validate({ body: S.types.update }), handle(typesController.update));
  r.delete('/types/:id', id, handle(typesController.remove));

  r.get('/tasks', validate({ query: S.tasks.query }), handle(tasksController.list));
  r.post('/tasks', validate({ body: S.tasks.create }), handle(tasksController.create));
  r.patch('/tasks/:id', id, validate({ body: S.tasks.update }), handle(tasksController.update));
  r.delete('/tasks/:id', id, handle(tasksController.remove));

  r.get('/templates', handle(templatesController.list));
  r.post('/templates', validate({ body: S.templates.create }), handle(templatesController.create));
  r.patch('/templates/:id', id, validate({ body: S.templates.update }), handle(templatesController.update));
  r.delete('/templates/:id', id, handle(templatesController.remove));

  r.get('/metrics', handle(metricsController.list));
  r.post('/metrics', validate({ body: S.metrics.create }), handle(metricsController.create));
  r.patch('/metrics/:id', id, validate({ body: S.metrics.update }), handle(metricsController.update));

  r.get('/bank', handle(bankController.list));
  r.patch('/bank/:id', validate({ params: S.params.idQuestion, body: S.bank.update }), handle(bankController.update));

  // Planificador
  r.get('/active', handle(sessionsController.active));
  r.get('/week', validate({ query: S.sessions.week }), handle(sessionsController.week));
  r.post('/sessions', validate({ body: S.sessions.create }), handle(sessionsController.create));
  r.patch('/sessions/:id', id, validate({ body: S.sessions.update }), handle(sessionsController.update));
  r.delete('/sessions/:id', id, handle(sessionsController.remove));
  r.put('/sessions/:id/task', id, validate({ body: S.sessions.assign }), handle(sessionsController.assign));
  r.delete('/sessions/:id/task', id, handle(sessionsController.unassign));

  // Ejecución
  r.get('/sessions/:id', id, handle(sessionsController.detail));
  r.put('/sessions/:id/postit', id, validate({ body: S.sessions.postit }), handle(sessionsController.postit));
  r.put('/sessions/:id/checklist/:itemId', validate({ params: S.params.idItem, body: S.sessions.checklist }), handle(sessionsController.checklist));
  r.post('/sessions/:id/objectives', id, validate({ body: S.sessions.objective }), handle(sessionsController.addObjective));
  r.patch('/sessions/:id/objectives/:objectiveId', validate({ params: S.params.idObjective, body: S.sessions.objectiveUpdate }), handle(sessionsController.updateObjective));
  r.delete('/sessions/:id/objectives/:objectiveId', validate({ params: S.params.idObjective }), handle(sessionsController.removeObjective));
  const actions = { start: 'start', pause: 'pause', resume: 'resume', 'end-work': 'endWork', 'start-break': 'startBreak', 'end-break': 'endBreak', skip: 'skip' };
  for (const [path, fn] of Object.entries(actions)) {
    r.post(`/sessions/:id/${path}`, id, handle(sessionsController.action(fn)));
  }
  r.post('/sessions/:id/distractions', id, validate({ body: S.sessions.distraction }), handle(sessionsController.addDistraction));
  r.patch('/distractions/:id', id, validate({ body: S.sessions.distractionUpdate }), handle(sessionsController.updateDistraction));
  r.post('/sessions/:id/close', id, validate({ body: S.closures.simple }), handle(sessionsController.closeSimple));

  // Cierre periodizado
  r.post('/closures', validate({ body: S.closures.open }), handle(closuresController.open));
  r.get('/closures/:id', id, handle(closuresController.get));
  r.put('/closures/:id/items/:itemId', validate({ params: S.params.idItem, body: S.closures.answer }), handle(closuresController.answer));
  r.post('/closures/:id/confirm', id, validate({ body: S.closures.confirm }), handle(closuresController.confirm));

  // Datos
  r.get('/stats/heatmap', handle(statsController.heatmap));
  r.get('/stats/streaks', handle(statsController.streaks));
  r.get('/stats/week', validate({ query: S.weekQuery }), handle(statsController.week));
  r.get('/stats/calibration', handle(statsController.calibration));
  r.get('/stats/periodized', validate({ query: S.weekQuery }), handle(statsController.periodized));

  r.get('/state/export', handle(stateController.export));
  r.post('/state/import', handle(stateController.import));

  return r;
}
