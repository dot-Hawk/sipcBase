import { describeApiError, ApiError } from '@/shared/api/errors';
import type { ItemError, ItemStatus } from './types';

/** Short state shown on a product row and in the editor. */
export const STATE_LABEL: Record<ItemStatus, string> = {
  pending: 'Pendiente de envío',
  sending: 'Enviando',
  'needs-confirmation': 'Requiere confirmación',
  rejected: 'Rechazado',
  failed: 'No se pudo enviar',
};

/** Spanish reason for a failed or rejected item, from the status only (server text is English). */
export function describeItemError(error: ItemError | null, context: 'precio' | 'adjunto' = 'precio'): string {
  if (!error) return '';
  if (error.status === 400 && context === 'precio') {
    return 'El servidor no aceptó este dato. Corríjalo y guárdelo de nuevo.';
  }
  return describeApiError(new ApiError({ status: error.status, message: error.message }), context);
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
