import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { role: 'ENCUESTADOR' as string };
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u1', nombre: 'A', apellido: 'B', role: auth.role } } }),
}));

const engine = {
  load: vi.fn(async () => undefined),
  flush: vi.fn(async () => undefined),
  dispose: vi.fn(),
  subscribe: () => () => undefined,
  getSnapshot: () => ({ items: [], flushing: false, paused: null, loaded: true }),
};
const createOutbox = vi.fn((_deps: unknown) => engine);
vi.mock('./engine', () => ({ createOutbox: (deps: unknown) => createOutbox(deps) }));

import { OutboxProvider } from './OutboxProvider';

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OutboxProvider>
        <span />
      </OutboxProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  createOutbox.mockClear();
  engine.flush.mockClear();
});

describe('OutboxProvider', () => {
  it('starts the outbox and flushes for the surveyor', async () => {
    auth.role = 'ENCUESTADOR';
    mount();
    await waitFor(() => expect(engine.flush).toHaveBeenCalled());
    expect(createOutbox).toHaveBeenCalledTimes(1);
  });

  it.each(['COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION'])('never starts it for %s', async (role) => {
    auth.role = role;
    mount();
    await Promise.resolve();
    expect(createOutbox).not.toHaveBeenCalled();
    expect(engine.flush).not.toHaveBeenCalled();
  });
});
