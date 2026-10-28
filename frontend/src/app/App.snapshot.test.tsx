import { beforeEach, describe, expect, it, vi } from 'vitest';

const restoreQueryCache = vi.fn(() => true);
const startQueryCachePersistence = vi.fn(() => () => undefined);
vi.mock('@/shared/api/persist', () => ({
  restoreQueryCache: (...a: unknown[]) => (restoreQueryCache as (...x: unknown[]) => boolean)(...a),
  startQueryCachePersistence: (...a: unknown[]) => (startQueryCachePersistence as (...x: unknown[]) => () => void)(...a),
  clearPersistedQueryCache: vi.fn(),
}));

function jwt(exp: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ exp })}.sig`;
}

async function coldStart(role: string) {
  vi.resetModules();
  restoreQueryCache.mockClear();
  localStorage.setItem(
    'sipc.session',
    JSON.stringify({
      token: jwt(Math.floor(Date.now() / 1000) + 3600),
      user: { id: 'u1', nombre: 'A', apellido: 'B', role },
    }),
  );
  await import('./App');
}

beforeEach(() => localStorage.clear());

describe('cold-start offline snapshot', () => {
  it('is restored for the surveyor', async () => {
    await coldStart('ENCUESTADOR');
    expect(restoreQueryCache).toHaveBeenCalledTimes(1);
  });

  it.each(['COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'])('is never touched for %s', async (role) => {
    await coldStart(role);
    expect(restoreQueryCache).not.toHaveBeenCalled();
  });
});
