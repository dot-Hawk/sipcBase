import { ApiError } from '@/shared/api/errors';
import type { MeResponse, User } from '@/shared/api/types';
import { isKnownUser } from './session';

export const ROLE_REJECTED_COPY =
  'Su rol no está habilitado para esta aplicación. Consulte con la Dirección de Estadística.';
export const ESTADO_REJECTED_COPY =
  'Su cuenta ya no está habilitada para esta aplicación. Consulte con su coordinador.';

export type RejectionReason = 'role' | 'estado';

export type SessionVerdict =
  | { kind: 'valid'; user: User }
  | { kind: 'rejected'; reason: RejectionReason };

export type ValidationOutcome =
  | SessionVerdict
  | { kind: 'unauthorized' }
  | { kind: 'unreachable' };

export const REVALIDATE_GAP_MS = 60_000;

export function evaluateMe(me: MeResponse): SessionVerdict {
  if (!isKnownUser(me)) return { kind: 'rejected', reason: 'role' };
  if (me.estado !== 'ACTIVO') return { kind: 'rejected', reason: 'estado' };
  return { kind: 'valid', user: me };
}

/**
 * Checks the stored session against the server.
 * Only a definite answer (verdict, 401, 404) may end the session; anything else keeps it.
 */
export async function validateSession(fetchMe: () => Promise<MeResponse>): Promise<ValidationOutcome> {
  try {
    return evaluateMe(await fetchMe());
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) return { kind: 'unauthorized' };
      if (error.status === 404) return { kind: 'rejected', reason: 'estado' };
    }
    return { kind: 'unreachable' };
  }
}

export function shouldRevalidate(lastMs: number | null, nowMs: number, gapMs = REVALIDATE_GAP_MS): boolean {
  return lastMs === null || nowMs - lastMs >= gapMs;
}
