// Lógica pura del sorteo del cierre periodizado (spec §7.2). Sin base de datos ni HTTP:
// recibe el estado de un tema y devuelve la pregunta elegida y el estado siguiente.

export const THEMES = ['C', 'A', 'E', 'S', 'SI', 'O'];
export const THEME_NAMES = {
  C: 'Concentración', A: 'Apalancamiento', E: 'Energía', S: 'Estrés', SI: 'Sistemas', O: 'Output',
};

export const threshold = (activeCount) => Math.ceil((2 * activeCount) / 3);

/**
 * ¿Se pueden elegir `k` preguntas más, de a una, sin repetir modo entre dos seguidas,
 * arrancando después de `prevMode`? `counts` = cantidad de preguntas disponibles por modo.
 */
export function canSequence(counts, k, prevMode, memo = new Map()) {
  if (k <= 0) return true;
  const key = `${k}|${prevMode}|${Object.entries(counts).filter(([, c]) => c > 0).sort().map(([m, c]) => `${m}:${c}`).join(',')}`;
  if (memo.has(key)) return memo.get(key);
  let ok = false;
  for (const [mode, c] of Object.entries(counts)) {
    if (c <= 0 || mode === prevMode) continue;
    counts[mode] -= 1;
    ok = canSequence(counts, k - 1, mode, memo);
    counts[mode] += 1;
    if (ok) break;
  }
  memo.set(key, ok);
  return ok;
}

function modeCounts(questions) {
  const counts = {};
  for (const q of questions) counts[q.modo] = (counts[q.modo] || 0) + 1;
  return counts;
}

/**
 * Sortea una pregunta de un tema.
 * @param {object} p
 * @param {Array<{id:string, modo:string}>} p.active  preguntas activas del tema
 * @param {string[]} p.used   IDs usados en el ciclo actual
 * @param {string|null} p.lastMode  modo del cierre anterior de este tema
 * @param {() => number} p.rng  generador en [0, 1)
 * @returns {{ question: object|null, warning: string|null, nextUsed: string[], nextLastMode: string|null, cycleReset: boolean }}
 */
export function drawForTheme({ active, used = [], lastMode = null, rng = Math.random }) {
  if (active.length === 0) {
    return { question: null, warning: 'No hay preguntas activas en este tema.', nextUsed: used, nextLastMode: lastMode, cycleReset: false };
  }
  const activeIds = new Set(active.map((q) => q.id));
  const usedActive = new Set(used.filter((id) => activeIds.has(id)));
  const limit = threshold(active.length);
  // Si el ciclo quedó completo (por ejemplo, porque se desactivaron preguntas), se reinicia.
  if (usedActive.size >= limit) usedActive.clear();

  const unused = active.filter((q) => !usedActive.has(q.id));
  const candidates = unused.filter((q) => q.modo !== lastMode);

  const feasible = candidates.filter((q) => {
    const after = usedActive.size + 1;
    if (after >= limit) return true;
    const rest = unused.filter((x) => x.id !== q.id);
    return canSequence(modeCounts(rest), limit - after, q.modo);
  });

  let pool = feasible;
  let warning = null;
  if (pool.length === 0) {
    warning = 'El banco de este tema no permite cumplir a la vez «no repetir preguntas del ciclo» y «no repetir el modo anterior». Se relajó la regla del modo en este cierre.';
    pool = unused.length > 0 ? unused : active;
  }

  const question = pool[Math.floor(rng() * pool.length)];
  const nextUsedSet = new Set(usedActive);
  nextUsedSet.add(question.id);
  const cycleReset = nextUsedSet.size >= limit;
  return {
    question,
    warning,
    nextUsed: cycleReset ? [] : [...nextUsedSet],
    nextLastMode: question.modo,
    cycleReset,
  };
}

/** ¿La respuesta marca problema? null cuando es N/A. */
export function isProblem(question, respuesta, dato) {
  if (respuesta === 'na') return null;
  if (question.problema_si === 'dato') {
    if (question.dato === 'duracion_percibida') {
      const est = Number(dato?.estimado_min);
      const real = Number(dato?.real_min);
      if (!Number.isFinite(est) || !Number.isFinite(real) || real <= 0) return null;
      return est >= real;
    }
    return null;
  }
  return respuesta === question.problema_si;
}

/** Estado del tema después de confirmar una pregunta (mismas reglas que el sorteo). */
export function applyPick({ active, used = [], questionId }) {
  const activeIds = new Set(active.map((q) => q.id));
  const usedActive = new Set(used.filter((id) => activeIds.has(id)));
  const limit = threshold(active.length);
  if (usedActive.size >= limit) usedActive.clear();
  usedActive.add(questionId);
  return usedActive.size >= limit ? [] : [...usedActive];
}
