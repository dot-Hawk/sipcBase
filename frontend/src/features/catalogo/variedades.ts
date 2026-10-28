import { useMemo } from 'react';
import type { CanastaNodo } from '@/shared/api/types';
import { useCanastaList } from './queries';

/**
 * Every variedad (nivel 6, any estado) by codigo, to show names next to codes. When no filter is
 * set on the canasta list this is the same cache entry, so it costs no extra request.
 */
export function useVariedades() {
  const query = useCanastaList({ nivel: 6 });
  const byCodigo = useMemo(() => new Map((query.data ?? []).map((n) => [n.codigo, n])), [query.data]);
  return { query, byCodigo, all: query.data ?? ([] as CanastaNodo[]) };
}

/** Same for the producto nodes (nivel 5), used as the parent of a variedad. */
export function useProductoNodos() {
  const query = useCanastaList({ nivel: 5 });
  const byCodigo = useMemo(() => new Map((query.data ?? []).map((n) => [n.codigo, n])), [query.data]);
  return { query, byCodigo, all: query.data ?? ([] as CanastaNodo[]) };
}
