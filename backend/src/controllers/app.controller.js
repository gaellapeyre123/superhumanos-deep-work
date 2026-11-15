// Controladores: traducen HTTP ⇄ servicios. Sin lógica de negocio acá.
import * as catalog from '../services/catalog.service.js';
import * as sessions from '../services/sessions.service.js';
import * as periodized from '../services/periodized/periodized.service.js';
import * as stats from '../services/stats.service.js';
import * as state from '../services/state.service.js';

const ctx = (req) => [req.app.locals.db, req.userId];

export const settingsController = {
  update: async (req, res) => res.json({ user: await catalog.updateSettings(...ctx(req), req.body) }),
};

export const typesController = {
  list: async (req, res) => res.json({ types: await catalog.listTypes(...ctx(req)) }),
  create: async (req, res) => res.status(201).json({ type: await catalog.createType(...ctx(req), req.body) }),
  update: async (req, res) => res.json({ type: await catalog.updateType(...ctx(req), req.params.id, req.body) }),
  remove: async (req, res) => res.json(await catalog.deleteType(...ctx(req), req.params.id)),
};

export const tasksController = {
  list: async (req, res) => res.json({ tasks: await catalog.listTasks(...ctx(req), req.query) }),
  create: async (req, res) => res.status(201).json({ task: await catalog.createTask(...ctx(req), req.body) }),
  update: async (req, res) => res.json({ task: await catalog.updateTask(...ctx(req), req.params.id, req.body) }),
  remove: async (req, res) => { await catalog.deleteTask(...ctx(req), req.params.id); res.status(204).end(); },
};

export const templatesController = {
  list: async (req, res) => res.json({ templates: await catalog.listTemplates(...ctx(req)) }),
  create: async (req, res) => res.status(201).json({ template: await catalog.createTemplate(...ctx(req), req.body) }),
  update: async (req, res) => res.json({ template: await catalog.updateTemplate(...ctx(req), req.params.id, req.body) }),
  remove: async (req, res) => res.json(await catalog.deleteTemplate(...ctx(req), req.params.id)),
};

export const metricsController = {
  list: async (req, res) => res.json({ metrics: await catalog.listMetrics(...ctx(req)) }),
  create: async (req, res) => res.status(201).json({ metric: await catalog.createMetric(...ctx(req), req.body) }),
  update: async (req, res) => res.json({ metric: await catalog.updateMetric(...ctx(req), req.params.id, req.body) }),
};

export const bankController = {
  list: async (req, res) => res.json({ questions: await catalog.listBank(...ctx(req)) }),
  update: async (req, res) => res.json({ question: await catalog.setQuestionActive(...ctx(req), req.params.id, req.body.activa) }),
};

export const sessionsController = {
  week: async (req, res) => res.json(await sessions.getWeek(...ctx(req), req.query.start)),
  active: async (req, res) => res.json(await sessions.getActive(...ctx(req))),
  create: async (req, res) => res.status(201).json({ sessions: await sessions.createSessions(...ctx(req), req.body) }),
  update: async (req, res) => res.json({ session: await sessions.updatePlannedSession(...ctx(req), req.params.id, req.body) }),
  remove: async (req, res) => { await sessions.deleteSession(...ctx(req), req.params.id); res.status(204).end(); },
  assign: async (req, res) => res.json({ session: await sessions.assignTask(...ctx(req), req.params.id, req.body) }),
  unassign: async (req, res) => res.json({ session: await sessions.unassignTask(...ctx(req), req.params.id) }),
  detail: async (req, res) => res.json(await sessions.getSessionDetail(...ctx(req), req.params.id)),
  postit: async (req, res) => res.json({ session: await sessions.savePostit(...ctx(req), req.params.id, req.body) }),
  checklist: async (req, res) => res.json({ checklist: await sessions.toggleChecklist(...ctx(req), req.params.id, req.params.itemId, req.body.hecho) }),
  addObjective: async (req, res) => res.status(201).json({ objectives: await sessions.addObjective(...ctx(req), req.params.id, req.body.texto) }),
  updateObjective: async (req, res) => res.json({ objectives: await sessions.updateObjective(...ctx(req), req.params.id, req.params.objectiveId, req.body) }),
  removeObjective: async (req, res) => res.json({ objectives: await sessions.removeObjective(...ctx(req), req.params.id, req.params.objectiveId) }),
  action: (name) => async (req, res) => res.json(await sessions[name](...ctx(req), req.params.id)),
  addDistraction: async (req, res) => res.status(201).json({ distractions: await sessions.addDistraction(...ctx(req), req.params.id, req.body) }),
  updateDistraction: async (req, res) => res.json({ distractions: await sessions.updateDistraction(...ctx(req), req.params.id, req.body) }),
  closeSimple: async (req, res) => res.json(await sessions.closeSimple(...ctx(req), req.params.id, req.body)),
};

export const closuresController = {
  open: async (req, res) => res.status(201).json(await periodized.openClosure(...ctx(req), req.body.session_id)),
  get: async (req, res) => res.json(await periodized.getClosure(...ctx(req), req.params.id)),
  answer: async (req, res) => res.json(await periodized.answerItem(...ctx(req), req.params.id, req.params.itemId, req.body)),
  confirm: async (req, res) => res.json(await periodized.confirmClosure(...ctx(req), req.params.id, req.body)),
};

export const statsController = {
  heatmap: async (req, res) => res.json(await stats.heatmap(...ctx(req))),
  streaks: async (req, res) => res.json(await stats.streaks(...ctx(req))),
  week: async (req, res) => res.json(await stats.weekSummary(...ctx(req), req.query.start)),
  calibration: async (req, res) => res.json(await stats.calibration(...ctx(req))),
  periodized: async (req, res) => res.json(await periodized.weeklyPeriodized(...ctx(req), req.query.start)),
};

export const stateController = {
  export: async (req, res) => res.json(await state.exportState(...ctx(req))),
  import: async (req, res) => res.json(await state.importState(...ctx(req), req.body)),
};
