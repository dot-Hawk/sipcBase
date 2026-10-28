import { describe, expect, it } from 'vitest';
import type { AsignacionEstado, Relevamiento } from '@/shared/api/types';
import { aggregateProgress, countByEstado, groupVisitas, pickPrimaryRelevamiento, sortVisitas } from './summary';

interface V {
  id: string;
  estado: AsignacionEstado;
  priced: number;
  total: number;
  rel: Pick<Relevamiento, 'id' | 'estado' | 'fechaInicio'> | null;
}
const open = { id: 'r2', estado: 'ABIERTO', fechaInicio: '2026-10-01' } as const;
const closed = { id: 'r1', estado: 'CERRADO', fechaInicio: '2026-09-01' } as const;
const v = (id: string, estado: AsignacionEstado, priced: number, total: number, rel: V['rel'] = open): V => ({
  id, estado, priced, total, rel,
});

describe('aggregateProgress', () => {
  it('sums priced and expected counts', () => {
    expect(aggregateProgress([v('a', 'EN_CURSO', 3, 10), v('b', 'PENDIENTE', 0, 10)])).toEqual({
      priced: 3, total: 20, pct: 15,
    });
  });
  it('caps each visit at its total', () => {
    expect(aggregateProgress([v('a', 'EN_CURSO', 14, 10)])).toEqual({ priced: 10, total: 10, pct: 100 });
  });
  it('is zero for no visits', () => {
    expect(aggregateProgress([])).toEqual({ priced: 0, total: 0, pct: 0 });
  });
});

describe('countByEstado', () => {
  it('counts each estado', () => {
    expect(countByEstado([v('a', 'EN_CURSO', 0, 1), v('b', 'EN_CURSO', 0, 1), v('c', 'COMPLETADA', 1, 1)])).toEqual({
      PENDIENTE: 0, EN_CURSO: 2, COMPLETADA: 1, CANCELADA: 0,
    });
  });
});

describe('sortVisitas', () => {
  it('puts EN_CURSO first, then PENDIENTE, then COMPLETADA, keeping input order within a bucket', () => {
    const sorted = sortVisitas([
      v('c1', 'COMPLETADA', 1, 1), v('p1', 'PENDIENTE', 0, 1), v('e1', 'EN_CURSO', 0, 1), v('p2', 'PENDIENTE', 0, 1),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['e1', 'p1', 'p2', 'c1']);
  });
});

describe('pickPrimaryRelevamiento', () => {
  it('prefers the newest open relevamiento', () => {
    const a = { id: 'r3', estado: 'ABIERTO', fechaInicio: '2026-10-15' } as const;
    expect(pickPrimaryRelevamiento([closed, open, a])?.id).toBe('r3');
  });
  it('falls back to the newest closed one', () => {
    expect(pickPrimaryRelevamiento([closed])?.id).toBe('r1');
  });
  it('is null without relevamientos', () => {
    expect(pickPrimaryRelevamiento([])).toBeNull();
  });
});

describe('groupVisitas', () => {
  it('groups by relevamiento with open groups first', () => {
    const groups = groupVisitas([v('a', 'PENDIENTE', 0, 1, closed), v('b', 'PENDIENTE', 0, 1, open)]);
    expect(groups.map((g) => g.id)).toEqual(['r2', 'r1']);
  });
});

describe('CANCELADA in the summary helpers', () => {
  it('countByEstado has a zero-initialised CANCELADA bucket', () => {
    expect(countByEstado([v('a', 'PENDIENTE', 0, 1), v('b', 'CANCELADA', 0, 1)])).toEqual({
      PENDIENTE: 1, EN_CURSO: 0, COMPLETADA: 0, CANCELADA: 1,
    });
  });
  it('sortVisitas puts CANCELADA after everything else', () => {
    const sorted = sortVisitas([v('c', 'CANCELADA', 0, 1), v('p', 'PENDIENTE', 0, 1), v('d', 'COMPLETADA', 0, 1)]);
    expect(sorted.map((x) => x.id)).toEqual(['p', 'd', 'c']);
  });
});
