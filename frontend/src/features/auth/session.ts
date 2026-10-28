import { isKnownRole } from '@/app/roles';
import type { User } from '@/shared/api/types';

export interface Session {
  token: string;
  user: User;
}

export type SessionCheck = 'valid' | 'missing' | 'expired' | 'forbidden';

const KEY = 'sipc.session';

export function decodeJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload === 'object' && payload !== null && 'exp' in payload) {
      const exp = (payload as { exp: unknown }).exp;
      return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** `nowMs` in milliseconds. Unreadable tokens count as expired. */
export function isExpired(token: string, nowMs: number): boolean {
  const exp = decodeJwtExp(token);
  if (exp === null) return true;
  return nowMs >= exp * 1000;
}

export function isEncuestador(user: User): boolean {
  return user.role === 'ENCUESTADOR';
}

/** The app serves six roles; anything else (a future or unexpected role string) is refused. */
export function isKnownUser(user: User): boolean {
  return isKnownRole(user.role);
}

export function checkSession(session: Session | null, nowMs: number): SessionCheck {
  if (!session) return 'missing';
  if (!isKnownUser(session.user)) return 'forbidden';
  if (isExpired(session.token, nowMs)) return 'expired';
  return 'valid';
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as Session).token === 'string' &&
      typeof (parsed as Session).user === 'object'
    ) {
      return parsed as Session;
    }
    return null;
  } catch {
    return null;
  }
}

export function persistSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
