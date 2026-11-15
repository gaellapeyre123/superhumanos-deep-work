import { bool, insertId, num } from '../lib/db-utils.js';

const PUBLIC_FIELDS = [
  'id', 'nombre', 'email', 'timezone', 'work_min', 'break_min', 'valor_hora', 'moneda',
  'min_por_distraccion', 'objetivo_semanal', 'modo_cierre', 'ajuste_pendiente', 'ajuste_entregado', 'cierres_base', 'ultimo_cierre_base', 'created_at',
];

export function toUser(row) {
  if (!row) return null;
  return {
    ...Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, row[f]])),
    valor_hora: Number(row.valor_hora),
    ajuste_entregado: bool(row.ajuste_entregado),
    created_at: num(row.created_at),
  };
}

export const usersRepo = {
  findByEmail: (db, email) => db('users').where({ email }).first(),
  findById: async (db, id) => toUser(await db('users').where({ id }).first()),
  create: (db, row) => insertId(db, 'users', row),
  update: (db, id, patch) => db('users').where({ id }).update(patch),
};
