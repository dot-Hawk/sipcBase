import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api, fetchAllPrecios } from './endpoints';
import { withoutCancelled } from '@/features/asignaciones/rules';
import type { Precio, PrecioAnteriorQuery } from './types';

export const keys = {
  asignaciones: ['asignaciones'] as const,
  relevamientos: ['relevamientos'] as const,
  comercios: ['comercios'] as const,
  productos: ['productos'] as const,
  precios: ['precios'] as const,
  preciosAll: (comercio?: string) => ['precios', 'all', comercio ?? 'todos'] as const,
  preciosList: (filter: string) => ['precios', 'list', filter] as const,
  // Not under ['precios'] on purpose: saving a price invalidates that prefix and this answer is about earlier relevamientos.
  precioAnterior: (q: PrecioAnteriorQuery) => ['precio-anterior', q.relevamiento, q.comercio, q.producto] as const,
  adjuntos: (precioId: string) => ['adjuntos', precioId] as const,
};

/** Surveyor view of the visits: a CANCELADA one (never sent by the API) is dropped defensively. */
export const useAsignaciones = () =>
  useQuery({ queryKey: keys.asignaciones, queryFn: () => api.listAsignaciones(), select: withoutCancelled });
export const useRelevamientos = () => useQuery({ queryKey: keys.relevamientos, queryFn: api.listRelevamientos });
export const useComercios = () => useQuery({ queryKey: keys.comercios, queryFn: () => api.listComercios() });
export const useProductos = () => useQuery({ queryKey: keys.productos, queryFn: api.listProductos });

/** Every own precio, optionally for one comercio. Used for progress and "Anterior". */
export const useAllPrecios = (comercio?: string) =>
  useQuery({
    queryKey: keys.preciosAll(comercio),
    queryFn: () => fetchAllPrecios(comercio ? { comercio } : {}),
  });

/**
 * Previous price (from anyone) of ONE producto. Pass `null` until a producto is selected so
 * nothing is fetched per list row. A 204 resolves to `null`; failures are left to the caller
 * to degrade from.
 */
export const usePrecioAnterior = (ctx: Omit<PrecioAnteriorQuery, 'producto'>, producto: string | null) =>
  useQuery({
    queryKey: keys.precioAnterior({ ...ctx, producto: producto ?? '' }),
    queryFn: () => api.getPrecioAnterior({ ...ctx, producto: producto ?? '' }),
    enabled: producto !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });

/** Puts a saved precio in the list caches and refreshes the derived queries. */
export function upsertPrecioInCache(queryClient: QueryClient, precio: Precio): void {
  queryClient.setQueryData<Precio[]>(keys.preciosAll(precio.comercio), (old) => {
    const list = old ?? [];
    return list.some((p) => p.id === precio.id) ? list.map((p) => (p.id === precio.id ? precio : p)) : [precio, ...list];
  });
  void queryClient.invalidateQueries({ queryKey: keys.precios });
}
