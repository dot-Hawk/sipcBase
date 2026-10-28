import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints';
import { request } from '@/shared/api/client';
import { ApiError, SESSION_ENDED_COPY } from '@/shared/api/errors';
import type { MeResponse } from '@/shared/api/types';

const meMock = vi.fn();
vi.mock('@/shared/api/endpoints', () => ({
  api: { me: () => meMock(), login: vi.fn() },
}));

import { AuthProvider, useAuth } from './AuthProvider';

function jwt(exp: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ exp })}.sig`;
}

const stored = {
  token: jwt(Math.floor(Date.now() / 1000) + 3600),
  user: { id: 'u1', nombre: 'Vieja', apellido: 'Paz', role: 'ENCUESTADOR' },
};
const me = (over: Partial<MeResponse> = {}): MeResponse => ({
  id: 'u1', nombre: 'Nueva', apellido: 'Paz', dni: '1', legajo: 'L-9', email: 'a@b.c',
  role: 'ENCUESTADOR', estado: 'ACTIVO', ultimoAcceso: null, ...over,
});

function Probe() {
  const { session, notice } = useAuth();
  return (
    <div>
      <span data-testid="who">{session ? `${session.user.nombre}|${session.user.legajo ?? ''}` : 'anon'}</span>
      <span data-testid="notice">{notice ?? ''}</span>
    </div>
  );
}

function mount() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  meMock.mockReset();
  localStorage.setItem('sipc.session', JSON.stringify(stored));
});
afterEach(() => vi.restoreAllMocks());

describe('AuthProvider session validation', () => {
  it('renders from the stored session while /auth/me is in flight, then refreshes the user', async () => {
    let resolve!: (v: MeResponse) => void;
    meMock.mockReturnValue(new Promise<MeResponse>((r) => (resolve = r)));
    mount();
    expect(screen.getByTestId('who')).toHaveTextContent('Vieja|');
    await act(async () => resolve(me()));
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Nueva|L-9'));
    expect(JSON.parse(localStorage.getItem('sipc.session') as string).user.legajo).toBe('L-9');
  });

  it('clears the session with account copy when estado is not ACTIVO', async () => {
    meMock.mockResolvedValue(me({ estado: 'INACTIVO' }));
    mount();
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anon'));
    expect(screen.getByTestId('notice')).toHaveTextContent('Su cuenta ya no está habilitada para esta aplicación');
    expect(localStorage.getItem('sipc.session')).toBeNull();
  });

  it('clears the session with role copy when the role is not one the app knows', async () => {
    meMock.mockResolvedValue(me({ role: 'ADMIN' as never }));
    mount();
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anon'));
    expect(screen.getByTestId('notice')).toHaveTextContent(/rol no está habilitado/i);
  });

  it('clears the session and shows the session-ended notice when /auth/me answers 401', async () => {
    meMock.mockRejectedValue(new ApiError({ status: 401, message: 'Unauthorized' }));
    mount();
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anon'));
    expect(screen.getByTestId('notice')).toHaveTextContent(SESSION_ENDED_COPY);
    expect(localStorage.getItem('sipc.session')).toBeNull();
  });

  it('shows the same notice when any other request gets a 401', async () => {
    meMock.mockResolvedValue(me());
    mount();
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Nueva|L-9'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    );
    await act(async () => {
      await request('/precios').catch(() => undefined);
    });
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anon'));
    expect(screen.getByTestId('notice')).toHaveTextContent(SESSION_ENDED_COPY);
  });

  it('keeps the session on network failure', async () => {
    meMock.mockRejectedValue(new ApiError({ status: 0, message: 'Network error' }));
    mount();
    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.getByTestId('notice')).toHaveTextContent('');
    expect(screen.getByTestId('who')).toHaveTextContent('Vieja|');
    expect(localStorage.getItem('sipc.session')).not.toBeNull();
  });

  it('throttles revalidation on online/focus events', async () => {
    meMock.mockResolvedValue(me());
    mount();
    await waitFor(() => expect(meMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(meMock).toHaveBeenCalledTimes(1);

    const real = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(real + 120_000);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(meMock).toHaveBeenCalledTimes(2));
  });

  it('treats a real fetch network failure as offline, not as a 401', async () => {
    meMock.mockResolvedValue(me());
    mount();
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Nueva|L-9'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    let caught: unknown;
    await act(async () => {
      caught = await request('/precios').catch((e: unknown) => e);
    });
    expect(caught).toMatchObject({ status: 0 });
    expect(screen.getByTestId('notice')).toHaveTextContent('');
    expect(screen.getByTestId('who')).toHaveTextContent('Nueva|L-9');
  });

  it('persists the read cache for the signed-in user and wipes it on a 401', async () => {
    meMock.mockResolvedValue(me());
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Nueva|L-9'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => {
      qc.setQueryData(['asignaciones'], [{ id: 'a1' }]);
      vi.advanceTimersByTime(1500);
    });
    vi.useRealTimers();
    expect(JSON.parse(localStorage.getItem('sipc.queryCache') as string).userId).toBe('u1');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    );
    await act(async () => {
      await request('/precios').catch(() => undefined);
    });
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anon'));
    expect(localStorage.getItem('sipc.queryCache')).toBeNull();
  });
});

describe('AuthProvider roles', () => {
  const loginMock = api.login as unknown as ReturnType<typeof vi.fn>;
  const userOf = (role: string) => ({ id: 'u9', nombre: 'Ana', apellido: 'Paz', role });

  function LoginProbe({ onDone }: { onDone: (r: string) => void }) {
    const { session, login } = useAuth();
    return (
      <div>
        <span data-testid="role">{session?.user.role ?? 'anon'}</span>
        <button
          type="button"
          onClick={() =>
            void login({ email: 'a@b.c', password: 'x' }).then(
              () => onDone('ok'),
              (e: Error) => onDone(e.name),
            )
          }
        >
          go
        </button>
      </div>
    );
  }

  async function signIn(role: string) {
    localStorage.clear();
    meMock.mockResolvedValue(me({ role: role as never }));
    loginMock.mockResolvedValue({ token: jwt(Math.floor(Date.now() / 1000) + 3600), user: userOf(role) });
    const done = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <LoginProbe onDone={done} />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await act(async () => screen.getByText('go').click());
    return done;
  }

  it.each(['ENCUESTADOR', 'COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'])('login accepts %s', async (role) => {
    const done = await signIn(role);
    await waitFor(() => expect(done).toHaveBeenCalledWith('ok'));
    expect(screen.getByTestId('role')).toHaveTextContent(role);
  });

  it('login rejects an unknown role and keeps no session', async () => {
    const done = await signIn('ADMIN');
    await waitFor(() => expect(done).toHaveBeenCalledWith('RoleRejectedError'));
    expect(screen.getByTestId('role')).toHaveTextContent('anon');
    expect(localStorage.getItem('sipc.session')).toBeNull();
  });

  it('keeps the offline snapshot for the surveyor only', async () => {
    for (const [role, expected] of [
      ['ENCUESTADOR', true],
      ['COORDINADOR', false],
      ['DIRECCION', false],
    ] as const) {
      const qc = new QueryClient();
      localStorage.clear();
      localStorage.setItem(
        'sipc.session',
        JSON.stringify({ token: stored.token, user: { id: 'u1', nombre: 'A', apellido: 'B', role } }),
      );
      meMock.mockResolvedValue(me({ role }));
      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <Probe />
          </AuthProvider>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(meMock).toHaveBeenCalled());
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      act(() => {
        qc.setQueryData(['asignaciones'], [{ id: 'a1' }]);
        vi.advanceTimersByTime(1500);
      });
      vi.useRealTimers();
      expect(localStorage.getItem('sipc.queryCache') !== null).toBe(expected);
      unmount();
      meMock.mockReset();
    }
  });
});
