// Reloj inyectable: los tests lo fijan para probar el timer sin esperar minutos reales.
let override = null;

export const clock = {
  now: () => (override == null ? Date.now() : override),
  set: (ms) => { override = ms; },
  advance: (ms) => { override = (override ?? Date.now()) + ms; },
  reset: () => { override = null; },
};
