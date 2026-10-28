import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints';
import type { AsignacionesQuery, AuditoriaQuery, PreciosGestionQuery, UpdatePrecioInput, CreateAsignacionInput, CreateRelevamientoInput, CreateUserInput, UpdateUserInput, UserEstado, UsersQuery } from '@/shared/api/types';

/** Everything of the management screens lives under ['gestion', ...]: never persisted, never offline. */
export const gkeys = {
  all: ['gestion'] as const,
  relevamientos: ['gestion', 'relevamientos'] as const,
  asignaciones: ['gestion', 'asignaciones'] as const,
  asignacionesQuery: (q: AsignacionesQuery) => ['gestion', 'asignaciones', q] as const,
  comercios: ['gestion', 'comercios'] as const,
  /** Every encuestador, any estado (up to the API maximum of 200), to show names. */
  encuestadores: ['gestion', 'encuestadores'] as const,
  users: ['gestion', 'users'] as const,
  usersQuery: (q: UsersQuery) => ['gestion', 'users', q] as const,
  /** Price review list (any filter set) and the audit trail: both are refreshed by a correction. */
  precios: ['gestion', 'precios'] as const,
  preciosQuery: (q: PreciosGestionQuery) => ['gestion', 'precios', q] as const,
  auditoria: ['gestion', 'auditoria'] as const,
  auditoriaQuery: (q: AuditoriaQuery) => ['gestion', 'auditoria', q] as const,
};

// The lists are read through the `*Page` endpoints so the total of `X-Total-Count` is cached with the
// rows. Callers that only need rows use the hook with `select`; the same cache entry serves both.
const rows = <T,>(page: { items: T[] }) => page.items;

/** Rows plus the server total (null when the backend does not send it). */
export const useGestionRelevamientosPage = () =>
  useQuery({ queryKey: gkeys.relevamientos, queryFn: () => api.listRelevamientosPage() });

export const useGestionRelevamientos = () =>
  useQuery({ queryKey: gkeys.relevamientos, queryFn: () => api.listRelevamientosPage(), select: rows });

export const useGestionAsignacionesPage = (q: AsignacionesQuery = {}, enabled = true) =>
  useQuery({ queryKey: gkeys.asignacionesQuery(q), queryFn: () => api.listAsignacionesPage(q), enabled });

export const useGestionAsignaciones = (q: AsignacionesQuery = {}, enabled = true) =>
  useQuery({ queryKey: gkeys.asignacionesQuery(q), queryFn: () => api.listAsignacionesPage(q), enabled, select: rows });

export const useGestionComercios = () => useQuery({ queryKey: gkeys.comercios, queryFn: () => api.listComercios() });

export const useEncuestadores = () =>
  useQuery({ queryKey: gkeys.encuestadores, queryFn: () => api.listUsersPage({ role: 'ENCUESTADOR', limit: 200 }), select: rows });

export const useUsers = (q: UsersQuery) =>
  useQuery({ queryKey: gkeys.usersQuery(q), queryFn: () => api.listUsersPage(q), placeholderData: (prev) => prev });

export function useCreateRelevamiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreateRelevamientoInput) => api.createRelevamiento(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: gkeys.relevamientos }),
  });
}

export function useCloseRelevamiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.closeRelevamiento(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: gkeys.relevamientos }),
  });
}

export function useCreateAsignacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreateAsignacionInput) => api.createAsignacion(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: gkeys.asignaciones }),
  });
}

export function useCancelAsignacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelAsignacion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: gkeys.asignaciones }),
  });
}

export function useReassignAsignacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; encuestador: string }) => api.reassignAsignacion(v.id, v.encuestador),
    onSuccess: () => qc.invalidateQueries({ queryKey: gkeys.asignaciones }),
  });
}

function useUsersInvalidation() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: gkeys.users }),
      qc.invalidateQueries({ queryKey: gkeys.encuestadores }),
    ]);
}

export function useCreateUser() {
  const invalidate = useUsersInvalidation();
  return useMutation({ mutationFn: (v: CreateUserInput) => api.createUser(v), onSuccess: invalidate });
}

export function useUpdateUser() {
  const invalidate = useUsersInvalidation();
  return useMutation({
    mutationFn: (v: { id: string; changes: UpdateUserInput }) => api.updateUser(v.id, v.changes),
    onSuccess: invalidate,
  });
}

export function useSetUserEstado() {
  const invalidate = useUsersInvalidation();
  return useMutation({
    mutationFn: (v: { id: string; estado: UserEstado }) => api.setUserEstado(v.id, v.estado),
    onSuccess: invalidate,
  });
}

/** Nothing about the new password is kept in the cache or returned: the API answers 204. */
export function useResetUserPassword() {
  return useMutation({ mutationFn: (v: { id: string; password: string }) => api.resetUserPassword(v.id, v.password) });
}

/** Review list with the server total when the backend sends one (it does not today). */
export const usePreciosGestionPage = (q: PreciosGestionQuery) =>
  useQuery({ queryKey: gkeys.preciosQuery(q), queryFn: () => api.listPreciosPage(q), placeholderData: (prev) => prev });

export const useAuditoriaPage = (q: AuditoriaQuery) =>
  useQuery({ queryKey: gkeys.auditoriaQuery(q), queryFn: () => api.listAuditoriaPrecios(q), placeholderData: (prev) => prev });

/**
 * Corrects a price. Never optimistic: the screen shows what the server answered. Whatever the
 * outcome, the price list, the audit trail and the relevamientos (a 409 may mean it was just closed)
 * are refreshed, so a conflict leaves the screen showing the current state.
 */
export function useCorregirPrecio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; changes: UpdatePrecioInput }) => api.updatePrecio(v.id, v.changes),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: gkeys.precios }),
        qc.invalidateQueries({ queryKey: gkeys.auditoria }),
        qc.invalidateQueries({ queryKey: gkeys.relevamientos }),
      ]),
  });
}
