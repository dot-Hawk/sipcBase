import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './endpoints';
import { useAsignaciones } from './queries';
import type { Asignacion } from './types';

const a = (id: string, estado: Asignacion['estado']): Asignacion => ({
  id, estado, relevamiento: 'r', comercio: 'c', encuestador: 'e', createdAt: '', updatedAt: '',
});

afterEach(() => vi.restoreAllMocks());

describe('useAsignaciones', () => {
  it('never hands a CANCELADA visit to the surveyor screens', async () => {
    vi.spyOn(api, 'listAsignaciones').mockResolvedValue([a('1', 'PENDIENTE'), a('2', 'CANCELADA'), a('3', 'EN_CURSO')]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAsignaciones(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((x) => x.id)).toEqual(['1', '3']);
  });
});
