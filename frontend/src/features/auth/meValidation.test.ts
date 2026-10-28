import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import type { MeResponse } from '@/shared/api/types';
import { ROLE_REJECTED_COPY, evaluateMe, shouldRevalidate, validateSession } from './meValidation';

const me = (over: Partial<MeResponse> = {}): MeResponse => ({
  id: 'u1', nombre: 'Ana', apellido: 'Paz', dni: '1', legajo: 'L-1', email: 'a@b.c',
  role: 'ENCUESTADOR', estado: 'ACTIVO', ultimoAcceso: '2026-10-01T12:00:00.000Z', ...over,
});

describe('evaluateMe', () => {
  it('accepts an active surveyor and returns the refreshed user', () => {
    const v = evaluateMe(me());
    expect(v).toEqual({ kind: 'valid', user: me() });
  });
  it.each(['COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'] as const)('accepts an active %s', (role) => {
    expect(evaluateMe(me({ role }))).toEqual({ kind: 'valid', user: me({ role }) });
  });
  it('rejects unknown roles first', () => {
    const odd = me({ role: 'ADMIN' as never, estado: 'INACTIVO' });
    expect(evaluateMe(odd)).toEqual({ kind: 'rejected', reason: 'role' });
  });
  it('does not claim the app is surveyor-only', () => {
    expect(ROLE_REJECTED_COPY).not.toMatch(/solo para encuestadores/i);
  });
  it('rejects non-active accounts', () => {
    expect(evaluateMe(me({ estado: 'INACTIVO' }))).toEqual({ kind: 'rejected', reason: 'estado' });
    expect(evaluateMe(me({ estado: 'LICENCIA' }))).toEqual({ kind: 'rejected', reason: 'estado' });
  });
});

describe('validateSession', () => {
  it('returns the verdict on success', async () => {
    expect(await validateSession(async () => me())).toMatchObject({ kind: 'valid' });
  });
  it('maps 401 to unauthorized', async () => {
    const f = vi.fn().mockRejectedValue(new ApiError({ status: 401, message: 'x' }));
    expect(await validateSession(f)).toEqual({ kind: 'unauthorized' });
  });
  it('treats 404 (user gone) as rejected estado', async () => {
    const f = vi.fn().mockRejectedValue(new ApiError({ status: 404, message: 'x' }));
    expect(await validateSession(f)).toEqual({ kind: 'rejected', reason: 'estado' });
  });
  it.each([0, 429, 500, 503])('keeps the session on status %i', async (status) => {
    const f = vi.fn().mockRejectedValue(new ApiError({ status, message: 'x' }));
    expect(await validateSession(f)).toEqual({ kind: 'unreachable' });
  });
  it('keeps the session on unknown errors', async () => {
    expect(await validateSession(async () => { throw new TypeError('boom'); })).toEqual({ kind: 'unreachable' });
  });
});

describe('shouldRevalidate', () => {
  it('runs when never checked', () => expect(shouldRevalidate(null, 1000)).toBe(true));
  it('throttles within the gap', () => expect(shouldRevalidate(1000, 30_000, 60_000)).toBe(false));
  it('runs after the gap', () => expect(shouldRevalidate(1000, 61_000, 60_000)).toBe(true));
});
