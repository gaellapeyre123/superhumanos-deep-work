import { bool, insertId, num, parseJson } from '../lib/db-utils.js';

const toQuestion = (r) => r && {
  id: r.id, tema: r.tema, subvariable: r.subvariable, modo: r.modo, texto: r.texto,
  problema_si: r.problema_si, por_que: r.por_que, na_auto: r.na_auto, dato: r.dato,
  ritual: bool(r.ritual), activa: bool(r.activa), origen: r.origen,
};

export const bankRepo = {
  list: async (db, userId) => (await db('bank_questions').where({ user_id: userId })).map(toQuestion),
  get: async (db, userId, id) => toQuestion(await db('bank_questions').where({ user_id: userId, id }).first()),
  insertMany: async (db, rows) => {
    for (let i = 0; i < rows.length; i += 50) await db('bank_questions').insert(rows.slice(i, i + 50));
  },
  update: (db, userId, id, patch) => db('bank_questions').where({ user_id: userId, id }).update(patch),

  themeStates: async (db, userId) => {
    const rows = await db('bank_theme_state').where({ user_id: userId });
    return Object.fromEntries(rows.map((r) => [r.tema, { usados: parseJson(r.usados_ciclo, []), ultimo_modo: r.ultimo_modo }]));
  },
  saveThemeState: async (db, userId, tema, usados, ultimoModo) => {
    await db('bank_theme_state').where({ user_id: userId, tema }).delete();
    await db('bank_theme_state').insert({ user_id: userId, tema, usados_ciclo: JSON.stringify(usados), ultimo_modo: ultimoModo });
  },

  stats: async (db, userId) => db('question_stats').where({ user_id: userId }),
  bumpStats: async (db, userId, questionId, { aplicable, problema, na }) => {
    const row = await db('question_stats').where({ user_id: userId, question_id: questionId }).first();
    const next = {
      apariciones: (row?.apariciones || 0) + 1,
      aplicables: (row?.aplicables || 0) + (aplicable ? 1 : 0),
      problemas: (row?.problemas || 0) + (problema ? 1 : 0),
      na: (row?.na || 0) + (na ? 1 : 0),
    };
    if (row) await db('question_stats').where({ user_id: userId, question_id: questionId }).update(next);
    else await db('question_stats').insert({ user_id: userId, question_id: questionId, ...next });
  },
};

export const toClosure = (r) => r && {
  id: r.id, session_id: r.session_id, numero: r.numero, fecha_local: r.fecha_local, sesion_del_dia: r.sesion_del_dia,
  estado: r.estado, avisos: parseJson(r.avisos, []), por_que: r.por_que, ajuste: r.ajuste,
  ratio: r.ratio == null ? null : Number(r.ratio), created_at: num(r.created_at), confirmed_at: num(r.confirmed_at),
};

export const closuresRepo = {
  get: async (db, userId, id) => toClosure(await db('closures').where({ user_id: userId, id }).first()),
  findDraft: async (db, userId) => toClosure(await db('closures').where({ user_id: userId, estado: 'borrador' }).first()),
  findBySession: async (db, userId, sessionId) => toClosure(await db('closures').where({ user_id: userId, session_id: sessionId }).orderBy('id', 'desc').first()),
  create: (db, row) => insertId(db, 'closures', row),
  update: (db, userId, id, patch) => db('closures').where({ user_id: userId, id }).update(patch),
  remove: (db, userId, id) => db('closures').where({ user_id: userId, id }).delete(),
  confirmedCount: async (db, userId) => Number((await db('closures').where({ user_id: userId, estado: 'confirmado' }).count({ n: '*' }).first()).n),
  confirmedOnDate: async (db, userId, fecha) => Number((await db('closures').where({ user_id: userId, estado: 'confirmado', fecha_local: fecha }).count({ n: '*' }).first()).n),
  lastConfirmed: async (db, userId) => toClosure(await db('closures').where({ user_id: userId, estado: 'confirmado' }).orderBy('id', 'desc').first()),

  items: async (db, closureId) =>
    (await db('closure_items').where({ closure_id: closureId }).orderBy('posicion')).map((i) => ({
      id: i.id, tema: i.tema, question_id: i.question_id, posicion: i.posicion, respuesta: i.respuesta,
      dato: parseJson(i.dato_json, null), problema: i.problema == null ? null : bool(i.problema), na_automatico: bool(i.na_automatico),
    })),
  addItems: (db, rows) => db('closure_items').insert(rows),
  updateItem: (db, closureId, id, patch) => db('closure_items').where({ closure_id: closureId, id }).update(patch),
  /** Ítems confirmados en un rango de fechas locales, para el resumen semanal. */
  confirmedItemsInRange: (db, userId, from, to) =>
    db('closure_items as i')
      .join('closures as c', 'c.id', 'i.closure_id')
      .where('c.user_id', userId).andWhere('c.estado', 'confirmado')
      .whereBetween('c.fecha_local', [from, to])
      .select('i.tema', 'i.question_id', 'i.respuesta', 'i.problema'),
  insertId,
};
