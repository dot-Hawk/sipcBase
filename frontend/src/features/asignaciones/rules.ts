import type { Asignacion, Relevamiento } from '@/shared/api/types';

type A = Pick<Asignacion, 'estado'>;
type R = Pick<Relevamiento, 'estado'>;

export type EditBlockReason = 'not-started' | 'completed' | 'closed' | 'cancelled';

export function canStart(a: A, r: R): boolean {
  return r.estado === 'ABIERTO' && a.estado === 'PENDIENTE';
}

export function canFinish(a: A, r: R): boolean {
  return r.estado === 'ABIERTO' && a.estado === 'EN_CURSO';
}

/** Prices and photos can change only while ABIERTO and EN_CURSO. */
export function canEditPrices(a: A, r: R): boolean {
  return r.estado === 'ABIERTO' && a.estado === 'EN_CURSO';
}

export function editBlockReason(a: A, r: R): EditBlockReason | null {
  if (a.estado === 'CANCELADA') return 'cancelled';
  if (r.estado === 'CERRADO') return 'closed';
  if (a.estado === 'COMPLETADA') return 'completed';
  if (a.estado === 'PENDIENTE') return 'not-started';
  return null;
}

/**
 * The API never sends a CANCELADA visit to an ENCUESTADOR (list or by id); if one ever arrives it
 * is dropped here so it can be neither listed, counted nor worked on.
 */
export function withoutCancelled<T extends A>(list: readonly T[]): T[] {
  return list.filter((a) => a.estado !== 'CANCELADA');
}
