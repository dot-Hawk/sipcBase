import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gkeys } from '@/features/gestion/queries';
import { canListUsers } from '@/features/precios-gestion/rules';
import { api } from '@/shared/api/endpoints';
import type { ManagedUser, Role } from '@/shared/api/types';

/**
 * Who started a run. `GET /users` is COORDINADOR-only, so any other role gets a short id (and the
 * request is not even sent). The query shares its cache entry with the other management screens.
 */
export function useCreatorLabel(role: Role, selfId: string | null): (id: string) => string {
  const users = useQuery({
    queryKey: gkeys.usersQuery({ limit: 200 }),
    queryFn: () => api.listUsersPage({ limit: 200 }),
    select: (page: { items: ManagedUser[] }) => new Map(page.items.map((u) => [u.id, `${u.nombre} ${u.apellido}`])),
    enabled: canListUsers(role),
  });
  const names = users.data;
  return useCallback(
    (id: string) => (id === selfId ? 'Usted' : (names?.get(id) ?? `Usuario #${id.slice(0, 8)}`)),
    [names, selfId],
  );
}
