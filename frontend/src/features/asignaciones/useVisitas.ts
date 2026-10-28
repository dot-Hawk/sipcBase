import { useMemo } from 'react';
import { useAllPrecios, useAsignaciones, useComercios, useProductos, useRelevamientos } from '@/shared/api/queries';
import type { Asignacion, Comercio, Precio, Relevamiento } from '@/shared/api/types';

export interface Visita {
  asignacion: Asignacion;
  relevamiento: Relevamiento | null;
  comercio: Comercio | null;
  priced: number;
  total: number;
}

/** Counts distinct productos priced per (relevamiento, comercio). */
export function countPriced(precios: readonly Precio[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const p of precios) {
    const k = `${p.relevamiento}|${p.comercio}`;
    let set = seen.get(k);
    if (!set) {
      set = new Set();
      seen.set(k, set);
    }
    set.add(p.producto);
  }
  return new Map([...seen].map(([k, v]) => [k, v.size]));
}

export function useVisitas() {
  const asignaciones = useAsignaciones();
  const relevamientos = useRelevamientos();
  const comercios = useComercios();
  const productos = useProductos();
  const precios = useAllPrecios();

  const visitas = useMemo<Visita[]>(() => {
    const relById = new Map((relevamientos.data ?? []).map((r) => [r.id, r]));
    const comById = new Map((comercios.data ?? []).map((c) => [c.id, c]));
    const counts = countPriced(precios.data ?? []);
    const total = productos.data?.length ?? 0;
    return (asignaciones.data ?? []).map((a) => ({
      asignacion: a,
      relevamiento: relById.get(a.relevamiento) ?? null,
      comercio: comById.get(a.comercio) ?? null,
      priced: counts.get(`${a.relevamiento}|${a.comercio}`) ?? 0,
      total,
    }));
  }, [asignaciones.data, relevamientos.data, comercios.data, productos.data, precios.data]);

  const loading =
    asignaciones.isPending || relevamientos.isPending || comercios.isPending || productos.isPending;
  // A failed refresh is not an error while there is cached data to work from.
  const failed = [asignaciones, relevamientos, comercios, productos].find((x) => x.error && x.data === undefined);
  const error = failed?.error ?? null;
  const refetchAll = () =>
    Promise.all([
      asignaciones.refetch(),
      relevamientos.refetch(),
      comercios.refetch(),
      productos.refetch(),
      precios.refetch(),
    ]);

  return { visitas, loading, error, refetchAll, preciosLoading: precios.isPending };
}
