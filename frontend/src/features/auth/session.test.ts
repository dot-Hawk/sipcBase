import { describe, expect, it } from 'vitest';
import { checkSession, decodeJwtExp, isEncuestador, isExpired, isKnownUser } from './session';

function jwt(payload: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('decodeJwtExp', () => {
  it('reads exp in seconds', () => {
    expect(decodeJwtExp(jwt({ exp: 1000 }))).toBe(1000);
  });
  it('returns null for malformed tokens', () => {
    expect(decodeJwtExp('abc')).toBeNull();
    expect(decodeJwtExp('a.b.c')).toBeNull();
    expect(decodeJwtExp(jwt({ no: 1 }))).toBeNull();
  });
});

describe('isExpired', () => {
  it('compares against now with ms input', () => {
    const t = jwt({ exp: 1000 });
    expect(isExpired(t, 999_000)).toBe(false);
    expect(isExpired(t, 1_000_000)).toBe(true);
  });
  it('treats unreadable tokens as expired', () => {
    expect(isExpired('garbage', 0)).toBe(true);
  });
});

describe('role gate', () => {
  it('accepts only ENCUESTADOR', () => {
    expect(isEncuestador({ id: '1', nombre: 'a', apellido: 'b', role: 'ENCUESTADOR' })).toBe(true);
    expect(isEncuestador({ id: '1', nombre: 'a', apellido: 'b', role: 'SUPERVISOR' })).toBe(false);
  });
});

describe('isKnownUser', () => {
  it('accepts the six roles and rejects anything else', () => {
    const u = { id: '1', nombre: 'a', apellido: 'b' };
    for (const role of ['ENCUESTADOR', 'COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'] as const) {
      expect(isKnownUser({ ...u, role })).toBe(true);
    }
    expect(isKnownUser({ ...u, role: 'ROOT' as never })).toBe(false);
  });
});

describe('checkSession', () => {
  const user = { id: '1', nombre: 'a', apellido: 'b', role: 'ENCUESTADOR' as const };
  it('is valid with a live token and the right role', () => {
    expect(checkSession({ token: jwt({ exp: 2000 }), user }, 1_000_000)).toBe('valid');
  });
  it('is expired past exp', () => {
    expect(checkSession({ token: jwt({ exp: 10 }), user }, 1_000_000)).toBe('expired');
  });
  it.each(['COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'] as const)('is valid for %s', (role) => {
    expect(checkSession({ token: jwt({ exp: 2000 }), user: { ...user, role } }, 1_000_000)).toBe('valid');
  });
  it('is forbidden for a role the app does not know', () => {
    const odd = { ...user, role: 'ADMIN' as never };
    expect(checkSession({ token: jwt({ exp: 2000 }), user: odd }, 1_000_000)).toBe('forbidden');
  });
  it('is missing without a session', () => {
    expect(checkSession(null, 0)).toBe('missing');
  });
});
