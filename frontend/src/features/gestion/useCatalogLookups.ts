import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { canListUsers } from '@/features/precios-gestion/rules';
import { useProductosList } from '@/features/catalogo/queries';
import { api } from '@/shared/api/endpoints';
import type { Comercio, ManagedUser, Producto, Relevamiento, Role } from '@/shared/api/types';
import { gkeys, useGestionComercios, useGestionRelevamientos } from './queries';

const fullName = (u: Pick<ManagedUser, 'nombre' | 'apellido'>) => `${u.nombre} ${u.apellido}`;

/**
 * Names for the ids of the price and audit screens. Relevamientos, comercios and productos (every
 * estado, an old price may point at an inactive one) are readable by every role. Users are
 * COORDINADOR-only: for any other role the user query is not even sent and `canResolveUsers` is false,
 * so the screens degrade to the role of the actor and do not offer an encuestador/usuario filter.
 */
export function useCatalogLookups(role: Role) {
  const relevamientos = useGestionRelevamientos();
  const comercios = useGestionComercios();
  const productos = useProductosList({});
  const canResolveUsers = canListUsers(role);
  const users = useQuery({
    queryKey: gkeys.usersQuery({ limit: 200 }),
    queryFn: () => api.listUsersPage({ limit: 200 }),
    select: (page: { items: ManagedUser[] }) => page.items,
    enabled: canResolveUsers,
  });

  const byId = useMemo(
    () => ({
      relevamiento: new Map<string, Relevamiento>((relevamientos.data ?? []).map((r) => [r.id, r])),
      comercio: new Map<string, Comercio>((comercios.data ?? []).map((c) => [c.id, c])),
      producto: new Map<string, Producto>((productos.data ?? []).map((p) => [p.id, p])),
    }),
    [relevamientos.data, comercios.data, productos.data],
  );
  const userNames = useMemo(
    () => new Map<string, string>((users.data ?? []).map((u) => [u.id, fullName(u)])),
    [users.data],
  );

  // The catalogue lookups are required to render a row; users are a nicety and never block.
  const required = [relevamientos, comercios, productos];
  return {
    byId,
    userNames,
    users: users.data ?? [],
    canResolveUsers,
    relevamientos: relevamientos.data ?? [],
    comercios: comercios.data ?? [],
    productos: productos.data ?? [],
    isPending: required.some((q) => q.isPending),
    error: required.find((q) => q.isError)?.error ?? null,
    refetch: () => Promise.all([...required.map((q) => q.refetch()), ...(canResolveUsers ? [users.refetch()] : [])]),
  };
}
