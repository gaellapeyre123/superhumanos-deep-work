// Normaliza diferencias entre SQLite y MySQL (booleanos 0/1, JSON como texto, ids insertados).

export const bool = (v) => v === true || v === 1 || v === '1';

export function parseJson(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** Inserta y devuelve el id autoincremental, igual en SQLite y MySQL. */
export async function insertId(q, table, row) {
  const res = await q(table).insert(row);
  const first = Array.isArray(res) ? res[0] : res;
  return typeof first === 'object' && first !== null ? Number(first.id) : Number(first);
}

export const num = (v) => (v == null ? null : Number(v));
