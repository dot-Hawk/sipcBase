import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Q = { data?: unknown; error?: Error | null; isPending: boolean; refetch: () => Promise<unknown> };
const q = (over: Partial<Q> = {}): Q => ({ data: undefined, error: null, isPending: false, refetch: async () => undefined, ...over });

const state: Record<string, Q> = {};
vi.mock('@/shared/api/queries', () => ({
  useAsignaciones: () => state.asignaciones,
  useRelevamientos: () => state.relevamientos,
  useComercios: () => state.comercios,
  useProductos: () => state.productos,
  useAllPrecios: () => state.precios,
}));

import { useVisitas } from './useVisitas';

beforeEach(() => {
  state.asignaciones = q({ data: [{ id: 'a1', relevamiento: 'r1', comercio: 'c1', estado: 'EN_CURSO' }] });
  state.relevamientos = q({ data: [{ id: 'r1' }] });
  state.comercios = q({ data: [{ id: 'c1' }] });
  state.productos = q({ data: [{ id: 'p1' }] });
  state.precios = q({ data: [] });
});

describe('useVisitas error handling', () => {
  it('keeps showing cached visitas when a refresh fails (offline or server down)', () => {
    state.asignaciones = q({ data: [{ id: 'a1', relevamiento: 'r1', comercio: 'c1', estado: 'EN_CURSO' }], error: new Error('net') });
    const { result } = renderHook(() => useVisitas());
    expect(result.current.visitas).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('reports the error when there is nothing cached to show', () => {
    state.asignaciones = q({ error: new Error('net') });
    const { result } = renderHook(() => useVisitas());
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
