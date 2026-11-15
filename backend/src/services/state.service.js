// Exportar / importar el estado del cierre periodizado (spec RF10, CB13).
import { z } from 'zod';
import { clock } from '../lib/clock.js';
import { badRequest } from '../lib/errors.js';
import { usersRepo } from '../repositories/users.repo.js';
import { bankRepo, closuresRepo } from '../repositories/bank.repo.js';
import { THEMES } from './periodized/draw.js';

export const STATE_VERSION = 1;

export async function exportState(db, userId) {
  const user = await usersRepo.findById(db, userId);
  const [bank, themes, stats, total, last] = await Promise.all([
    bankRepo.list(db, userId),
    bankRepo.themeStates(db, userId),
    bankRepo.stats(db, userId),
    closuresRepo.confirmedCount(db, userId),
    closuresRepo.lastConfirmed(db, userId),
  ]);
  return {
    app: 'superhumanos-deep-work',
    version: STATE_VERSION,
    exportado: new Date(clock.now()).toISOString(),
    cierres_totales: user.cierres_base + total,
    ultimo_cierre: last?.fecha_local || user.ultimo_cierre_base || null,
    ajuste_pendiente: user.ajuste_entregado ? null : user.ajuste_pendiente,
    ajustes: {
      work_min: user.work_min, break_min: user.break_min, valor_hora: user.valor_hora, moneda: user.moneda,
      min_por_distraccion: user.min_por_distraccion, objetivo_semanal: user.objetivo_semanal, modo_cierre: user.modo_cierre,
    },
    banco_activas: bank.filter((q) => q.activa).map((q) => q.id).sort(),
    temas: Object.fromEntries(THEMES.map((t) => [t, { usados: themes[t]?.usados || [], ultimo_modo: themes[t]?.ultimo_modo || null }])),
    conteos: stats.map((s) => ({ id: s.question_id, apariciones: s.apariciones, aplicables: s.aplicables, problemas: s.problemas, na: s.na })),
  };
}

const idRe = /^(C|A|E|S|SI|O)\d{2}$/;
const stateSchema = z.object({
  app: z.literal('superhumanos-deep-work'),
  version: z.literal(STATE_VERSION),
  cierres_totales: z.number().int().min(0),
  ultimo_cierre: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ajuste_pendiente: z.string().max(2000).nullable(),
  ajustes: z.object({
    work_min: z.number().int().min(5).max(300),
    break_min: z.number().int().min(0).max(120),
    valor_hora: z.number().min(0),
    moneda: z.string().min(1).max(8),
    min_por_distraccion: z.number().int().min(0).max(60),
    objetivo_semanal: z.number().int().min(1).max(84),
    modo_cierre: z.enum(['simple', 'periodizado']),
  }),
  banco_activas: z.array(z.string().regex(idRe)),
  temas: z.record(z.enum(['C', 'A', 'E', 'S', 'SI', 'O']), z.object({
    usados: z.array(z.string().regex(idRe)),
    ultimo_modo: z.string().max(4).nullable(),
  })),
  conteos: z.array(z.object({
    id: z.string().regex(idRe),
    apariciones: z.number().int().min(0),
    aplicables: z.number().int().min(0),
    problemas: z.number().int().min(0),
    na: z.number().int().min(0),
  })),
}).passthrough();

export async function importState(db, userId, payload) {
  const parsed = stateSchema.safeParse(payload);
  if (!parsed.success) throw badRequest('El estado no tiene el formato esperado.', parsed.error.flatten());
  const s = parsed.data;
  const bank = await bankRepo.list(db, userId);
  const known = new Set(bank.map((q) => q.id));
  const unknown = [...s.banco_activas, ...s.conteos.map((c) => c.id)].filter((id) => !known.has(id));
  if (unknown.length) throw badRequest(`El estado menciona preguntas que no existen en tu banco: ${[...new Set(unknown)].join(', ')}.`);

  const confirmed = await closuresRepo.confirmedCount(db, userId);
  await db.transaction(async (trx) => {
    await usersRepo.update(trx, userId, {
      ...s.ajustes,
      ajuste_pendiente: s.ajuste_pendiente,
      ajuste_entregado: s.ajuste_pendiente == null,
      cierres_base: Math.max(0, s.cierres_totales - confirmed),
      ultimo_cierre_base: s.ultimo_cierre,
    });
    const activas = new Set(s.banco_activas);
    for (const q of bank) {
      const activa = activas.has(q.id);
      if (activa !== q.activa) await bankRepo.update(trx, userId, q.id, { activa });
    }
    for (const t of THEMES) {
      const st = s.temas[t] || { usados: [], ultimo_modo: null };
      await bankRepo.saveThemeState(trx, userId, t, st.usados, st.ultimo_modo);
    }
    await trx('question_stats').where({ user_id: userId }).delete();
    if (s.conteos.length) {
      await trx('question_stats').insert(s.conteos.map((c) => ({
        user_id: userId, question_id: c.id, apariciones: c.apariciones, aplicables: c.aplicables, problemas: c.problemas, na: c.na,
      })));
    }
  });
  return exportState(db, userId);
}
