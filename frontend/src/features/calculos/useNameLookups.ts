import { useMemo } from 'react';
import { useVariedades } from '@/features/catalogo/variedades';
import { useGestionComercios } from '@/features/gestion/queries';

/**
 * Names for the codes of a run. Both lists are readable by every role and shared with other screens;
 * they are a nicety, so a failed or pending lookup just leaves the code (never blocks a table).
 */
export function useNameLookups() {
  const variedades = useVariedades();
  const comercios = useGestionComercios();
  const comercioById = useMemo(() => new Map((comercios.data ?? []).map((c) => [c.id, c.nombre])), [comercios.data]);
  return {
    variedadNombre: (codigo: string): string | null => variedades.byCodigo.get(codigo)?.nombre ?? null,
    comercioNombre: (id: string): string => comercioById.get(id) ?? `Comercio #${id.slice(0, 8)}`,
  };
}

export type NameLookups = ReturnType<typeof useNameLookups>;
