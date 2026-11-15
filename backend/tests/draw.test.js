import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, applyPick, canSequence, drawForTheme, isProblem, threshold } from '../src/services/periodized/draw.js';

const bank = JSON.parse(readFileSync(new URL('../src/db/seeds/bank.json', import.meta.url), 'utf8')).preguntas;
const byTheme = (t) => bank.filter((q) => q.tema === t);

function seq(seed = 1) {
  let a = seed;
  return () => { a = (a * 16807) % 2147483647; return (a - 1) / 2147483646; };
}

describe('Banco', () => {
  it('tiene 22, 23, 23, 15, 18 y 15 preguntas por tema (116 en total)', () => {
    expect(THEMES.map((t) => byTheme(t).length)).toEqual([22, 23, 23, 15, 18, 15]);
    expect(bank).toHaveLength(116);
  });

  it('tiene IDs estables, únicos y correlativos dentro de cada tema', () => {
    for (const t of THEMES) {
      byTheme(t).forEach((q, i) => expect(q.id).toBe(`${t}${String(i + 1).padStart(2, '0')}`));
    }
    expect(new Set(bank.map((q) => q.id)).size).toBe(116);
  });

  it('no deja ningún [sesión patrón] sin reemplazar', () => {
    expect(bank.filter((q) => q.texto.includes('[sesión patrón]'))).toEqual([]);
  });

  it('toda regla es si, no o dato', () => {
    for (const q of bank) expect(['si', 'no', 'dato']).toContain(q.problema_si);
  });
});

describe('Sorteo (R17–R19)', () => {
  it('umbral = ceil(2n/3)', () => {
    expect(threshold(22)).toBe(15);
    expect(threshold(15)).toBe(10);
    expect(threshold(3)).toBe(2);
  });

  it('nunca repite un ID dentro del ciclo ni el modo del cierre anterior', () => {
    for (const t of THEMES) {
      const active = byTheme(t).filter((q) => !q.ritual);
      const rng = seq(7);
      let used = [];
      let lastMode = null;
      const limit = threshold(active.length);
      for (let n = 0; n < 60; n += 1) {
        const r = drawForTheme({ active, used, lastMode, rng });
        expect(r.warning).toBeNull();
        expect(used).not.toContain(r.question.id);
        if (lastMode) expect(r.question.modo).not.toBe(lastMode);
        used = r.nextUsed;
        lastMode = r.nextLastMode;
        expect(used.length).toBeLessThan(limit);
      }
    }
  });

  it('reinicia el ciclo al alcanzar el umbral y conserva el último modo', () => {
    const active = byTheme('S');
    const limit = threshold(active.length);
    let used = [];
    let lastMode = null;
    const rng = seq(3);
    let resets = 0;
    for (let n = 0; n < limit * 3; n += 1) {
      const r = drawForTheme({ active, used, lastMode, rng });
      if (r.cycleReset) {
        resets += 1;
        expect(r.nextUsed).toEqual([]);
        expect(r.nextLastMode).toBe(r.question.modo);
      }
      used = r.nextUsed;
      lastMode = r.nextLastMode;
    }
    expect(resets).toBe(3);
  });

  it('solo elige opciones que dejan una secuencia posible hasta el umbral', () => {
    // 3 preguntas de modo X y 1 de modo Y: umbral 3. Si se elige X primero, queda X,X,Y:
    // la secuencia X→Y→X es posible. Si se elige Y, quedan X,X: imposible sin repetir modo.
    const active = [
      { id: 'T01', modo: 'X' }, { id: 'T02', modo: 'X' }, { id: 'T03', modo: 'X' }, { id: 'T04', modo: 'Y' },
    ];
    for (let i = 0; i < 20; i += 1) {
      const r = drawForTheme({ active, used: [], lastMode: null, rng: seq(i + 1) });
      expect(r.question.modo).toBe('X');
    }
  });

  it('avisa explícitamente cuando el banco no permite cumplir ambas reglas', () => {
    const active = [{ id: 'T01', modo: 'X' }, { id: 'T02', modo: 'X' }];
    const r = drawForTheme({ active, used: [], lastMode: 'X', rng: seq(1) });
    expect(r.warning).toMatch(/Se relajó la regla del modo/);
    expect(r.question).not.toBeNull();
  });

  it('un tema sin preguntas activas no rompe el sorteo', () => {
    const r = drawForTheme({ active: [], used: [], lastMode: null });
    expect(r.question).toBeNull();
    expect(r.warning).toBeTruthy();
  });

  it('canSequence detecta secuencias imposibles', () => {
    expect(canSequence({ X: 2 }, 2, null)).toBe(false);
    expect(canSequence({ X: 2, Y: 1 }, 3, null)).toBe(true);
    expect(canSequence({ X: 2, Y: 1 }, 3, 'X')).toBe(false);
  });

  it('applyPick reproduce el estado del sorteo', () => {
    const active = byTheme('O');
    const r = drawForTheme({ active, used: ['O01'], lastMode: 'DI', rng: seq(9) });
    expect(applyPick({ active, used: ['O01'], questionId: r.question.id })).toEqual(r.nextUsed);
  });
});

describe('Puntuación', () => {
  const q = (problema_si, extra = {}) => ({ problema_si, ...extra });
  it('marca problema cuando la respuesta coincide con la regla', () => {
    expect(isProblem(q('si'), 'si')).toBe(true);
    expect(isProblem(q('si'), 'no')).toBe(false);
    expect(isProblem(q('no'), 'no')).toBe(true);
    expect(isProblem(q('no'), 'na')).toBeNull();
  });
  it('duración percibida: problema si la estimación es igual o mayor que la real', () => {
    const dur = q('dato', { dato: 'duracion_percibida' });
    expect(isProblem(dur, 'dato', { estimado_min: 90, real_min: 90 })).toBe(true);
    expect(isProblem(dur, 'dato', { estimado_min: 60, real_min: 90 })).toBe(false);
    expect(isProblem(dur, 'dato', { estimado_min: 60, real_min: null })).toBeNull();
  });
});
