import { useMemo } from 'react';
import { useEncuestadores, useGestionComercios, useGestionRelevamientos } from '@/features/gestion/queries';
import type { Comercio, ManagedUser, Relevamiento } from '@/shared/api/types';

export const fullName = (u: Pick<ManagedUser, 'nombre' | 'apellido'>) => `${u.nombre} ${u.apellido}`;

/** Relevamientos, comercios and encuestadores, to show names instead of ids. */
export function useLookups() {
  const relevamientos = useGestionRelevamientos();
  const comercios = useGestionComercios();
  const encuestadores = useEncuestadores();
  const byId = useMemo(
    () => ({
      relevamiento: new Map<string, Relevamiento>((relevamientos.data ?? []).map((r) => [r.id, r])),
      comercio: new Map<string, Comercio>((comercios.data ?? []).map((c) => [c.id, c])),
      encuestador: new Map<string, ManagedUser>((encuestadores.data ?? []).map((u) => [u.id, u])),
    }),
    [relevamientos.data, comercios.data, encuestadores.data],
  );
  const queries = [relevamientos, comercios, encuestadores];
  return {
    byId,
    relevamientos: relevamientos.data ?? [],
    comercios: comercios.data ?? [],
    encuestadores: encuestadores.data ?? [],
    isPending: queries.some((q) => q.isPending),
    error: queries.find((q) => q.isError)?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}
