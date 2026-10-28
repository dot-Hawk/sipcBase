import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints';
import type { Calculo } from '@/shared/api/types';

const saveBlob = vi.fn();
vi.mock('@/shared/lib/download', () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

import {
  POLL,
  calculoRefetchInterval,
  useCalculoDownload,
  useCalculosList,
  useCreateCalculo,
} from './queries';

const run = (over: Partial<Calculo> = {}): Calculo => ({
  id: 'c1', mesBase: '2026-01', mesObjetivo: '2026-06', excluirOfertas: false,
  parametros: { esperarMeses: 2, pesoSuper: 0.25, pesoTrad: 0.75, omitirGruposCompletos: true },
  motorVersion: '1', entradaHash: 'h', estado: 'COMPLETADO', error: null, creadoPor: 'u1', createdAt: '', updatedAt: '', ...over,
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrap };
}

afterEach(() => {
  vi.restoreAllMocks();
  saveBlob.mockReset();
});

describe('calculoRefetchInterval', () => {
  it('polls only while the run is EJECUTANDO', () => {
    expect(calculoRefetchInterval(run({ estado: 'EJECUTANDO' }))).toBe(POLL.ms);
    expect(calculoRefetchInterval(run({ estado: 'COMPLETADO' }))).toBe(false);
    expect(calculoRefetchInterval(run({ estado: 'FALLIDO', error: 'x' }))).toBe(false);
    expect(calculoRefetchInterval(undefined)).toBe(false);
  });
});

describe('useCalculosList', () => {
  it('reads one page of the list', async () => {
    const spy = vi.spyOn(api, 'listCalculos').mockResolvedValue({ items: [run()], total: null });
    const { Wrap } = wrapper();
    const { result } = renderHook(() => useCalculosList({ page: 2, limit: 20 }), { wrapper: Wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ page: 2, limit: 20 });
    expect(result.current.data?.items).toHaveLength(1);
  });
});

describe('useCreateCalculo', () => {
  it('creates the run and invalidates the list', async () => {
    vi.spyOn(api, 'createCalculo').mockResolvedValue(run({ estado: 'EJECUTANDO' }));
    const { client, Wrap } = wrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateCalculo(), { wrapper: Wrap });
    await act(() => result.current.mutateAsync({ mesBase: '2026-01', mesObjetivo: '2026-06' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gestion', 'calculos'] });
  });
});

describe('useCalculoDownload', () => {
  it('fetches the results file and saves it with the given name', async () => {
    const blob = new Blob(['x']);
    const spy = vi.spyOn(api, 'downloadCalculoResultados').mockResolvedValue(blob);
    const { Wrap } = wrapper();
    const { result } = renderHook(() => useCalculoDownload(), { wrapper: Wrap });
    await act(() => result.current.mutateAsync({ kind: 'resultados', id: 'c1', formato: 'csv', filename: 'r.csv' }));
    expect(spy).toHaveBeenCalledWith('c1', 'csv');
    expect(saveBlob).toHaveBeenCalledWith(blob, 'r.csv');
  });
  it('fetches the engine input and saves it', async () => {
    const blob = new Blob(['y']);
    const spy = vi.spyOn(api, 'downloadCalculoExportacion').mockResolvedValue(blob);
    const { Wrap } = wrapper();
    const { result } = renderHook(() => useCalculoDownload(), { wrapper: Wrap });
    const query = { mesBase: '2026-01', mesObjetivo: '2026-02', formato: 'xlsx' as const };
    await act(() => result.current.mutateAsync({ kind: 'exportacion', query, filename: 'e.xlsx' }));
    expect(spy).toHaveBeenCalledWith(query);
    expect(saveBlob).toHaveBeenCalledWith(blob, 'e.xlsx');
  });
  it('saves nothing when the request fails', async () => {
    vi.spyOn(api, 'downloadCalculoResultados').mockRejectedValue(new Error('x'));
    const { Wrap } = wrapper();
    const { result } = renderHook(() => useCalculoDownload(), { wrapper: Wrap });
    await act(async () => {
      await result.current.mutateAsync({ kind: 'resultados', id: 'c1', formato: 'xlsx', filename: 'r.xlsx' }).catch(() => undefined);
    });
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
