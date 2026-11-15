// Fechas locales como strings 'YYYY-MM-DD'. Toda la aritmética de calendario vive acá,
// nunca en SQL, para que SQLite y MySQL se comporten igual.

export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

/** Fecha local (YYYY-MM-DD) de un instante, en la zona horaria dada. */
export function localDate(instantMs = Date.now(), tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo */
export function weekdayMon0(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

export function mondayOf(dateStr) {
  return addDays(dateStr, -weekdayMon0(dateStr));
}

export function weekDays(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i));
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}
