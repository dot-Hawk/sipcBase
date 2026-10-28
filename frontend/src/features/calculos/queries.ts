import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints';
import type {
  Calculo,
  CalculoExportacionQuery,
  CalculoRelativosQuery,
  CalculosQuery,
  CreateCalculoInput,
  FormatoArchivo,
} from '@/shared/api/types';
import { saveBlob } from '@/shared/lib/download';

/** Everything lives under ['gestion', ...]: never persisted, never offline. */
export const calcKeys = {
  all: ['gestion', 'calculos'] as const,
  list: (q: CalculosQuery) => ['gestion', 'calculos', 'list', q] as const,
  detail: (id: string) => ['gestion', 'calculos', 'detail', id] as const,
  relativos: (id: string, q: CalculoRelativosQuery) => ['gestion', 'calculos', 'relativos', id, q] as const,
  imputaciones: (id: string, q: CalculosQuery) => ['gestion', 'calculos', 'imputaciones', id, q] as const,
};

/** Polling period while a run executes. An object so tests can shorten it. */
export const POLL = { ms: 2000 };
export const CALCULOS_PAGE_SIZE = 20;
export const IMPUTACIONES_PAGE_SIZE = 50;

/** Polls while the run is in progress and stops by itself once it is COMPLETADO or FALLIDO. */
export const calculoRefetchInterval = (c: Calculo | undefined): number | false => (c?.estado === 'EJECUTANDO' ? POLL.ms : false);

/** The list keeps refreshing while any run on the page is still executing. */
export const useCalculosList = (q: CalculosQuery) =>
  useQuery({
    queryKey: calcKeys.list(q),
    queryFn: () => api.listCalculos(q),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some((c) => c.estado === 'EJECUTANDO') ? POLL.ms : false),
  });

export const useCalculo = (id: string) =>
  useQuery({
    queryKey: calcKeys.detail(id),
    queryFn: () => api.getCalculo(id),
    refetchInterval: (query) => calculoRefetchInterval(query.state.data),
  });

export const useCalculoRelativos = (id: string, q: CalculoRelativosQuery, enabled = true) =>
  useQuery({ queryKey: calcKeys.relativos(id, q), queryFn: () => api.listCalculoRelativos(id, q), enabled, placeholderData: keepPreviousData });

export const useCalculoImputaciones = (id: string, q: CalculosQuery, enabled = true) =>
  useQuery({ queryKey: calcKeys.imputaciones(id, q), queryFn: () => api.listCalculoImputaciones(id, q), enabled, placeholderData: keepPreviousData });

export function useCreateCalculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreateCalculoInput) => api.createCalculo(v),
    // A 409 (for example "already running") also means the list may have changed.
    onSettled: () => qc.invalidateQueries({ queryKey: calcKeys.all }),
  });
}

export type CalculoDownload =
  | { kind: 'resultados'; id: string; formato: FormatoArchivo; filename: string }
  | { kind: 'exportacion'; query: CalculoExportacionQuery; filename: string };

/** Downloads a results or input file and hands it to the browser. Nothing is kept in the cache. */
export function useCalculoDownload() {
  return useMutation({
    mutationFn: async (v: CalculoDownload) => {
      const blob = v.kind === 'resultados' ? await api.downloadCalculoResultados(v.id, v.formato) : await api.downloadCalculoExportacion(v.query);
      saveBlob(blob, v.filename);
    },
  });
}
