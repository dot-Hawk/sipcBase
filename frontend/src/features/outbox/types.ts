import type { FieldError } from '@/shared/api/errors';
import type { Alerta, Precio } from '@/shared/api/types';

/**
 * - pending: waiting to be sent (or to be retried after `nextAttemptAt`).
 * - sending: a request is (or was, if the page died) in flight.
 * - needs-confirmation: the server judged the price atypical; the surveyor must confirm or fix it.
 * - rejected: the server refused the content (400/413/415); it needs an edit or a discard.
 * - failed: the server refused for a reason outside the content (assignment closed, not found...).
 */
export type ItemStatus = 'pending' | 'sending' | 'needs-confirmation' | 'rejected' | 'failed';

export interface ItemError {
  /** HTTP status; 0 = network. */
  status: number;
  /** Raw server message (English). Never matched on; shown only as secondary detail. */
  message: string;
  fields: FieldError[];
}

interface BaseItem {
  id: string;
  userId: string;
  asignacionId: string;
  relevamiento: string;
  comercio: string;
  producto: string;
  /** Global order of first enqueue; items are flushed in this order. */
  seq: number;
  createdAt: number;
  status: ItemStatus;
  attempts: number;
  /** Epoch ms; the item is not tried before this. */
  nextAttemptAt: number;
  error: ItemError | null;
}

/** The last intent for one (asignacion, producto): later offline edits replace it. */
export interface PriceItem extends BaseItem {
  kind: 'price';
  valor: number;
  oferta: boolean;
  observacion: string;
  /** When the surveyor captured it; sent as `fechaRelevamiento` on create. */
  capturedAt: string;
  /** The surveyor already confirmed the atypical warning for this value. */
  confirmed: boolean;
  /** Server precio this item updates; null = the precio does not exist yet (POST). */
  precioId: string | null;
  /** Server copy the edit started from; PATCH only sends what differs from it. */
  precio: Precio | null;
  /** Atypical stats, once the server answered 409. */
  alerta: Alerta | null;
  /** Bumped by every edit, so a result that arrives after a newer edit does not erase it. */
  rev: number;
  /** The server refused our capture date (device clock ahead): send without it. */
  omitFecha: boolean;
}

export interface PhotoItem extends BaseItem {
  kind: 'photo';
  blob: Blob;
  precioId: string | null;
  /** Set before the upload starts: after a crash the upload may have reached the server. */
  maybeSent: boolean;
}

export type OutboxItem = PriceItem | PhotoItem;

export const priceItemId = (asignacionId: string, producto: string) => `price:${asignacionId}:${producto}`;

export interface OutboxCounts {
  total: number;
  prices: number;
  photos: number;
  /** Items the surveyor has to look at: confirm, fix, or retry by hand. */
  attention: number;
  /** Items that will be sent without any action. */
  waiting: number;
}

export function countItems(items: readonly OutboxItem[]): OutboxCounts {
  let prices = 0;
  let photos = 0;
  let attention = 0;
  for (const it of items) {
    if (it.kind === 'price') prices += 1;
    else photos += 1;
    if (it.status === 'needs-confirmation' || it.status === 'rejected' || it.status === 'failed') attention += 1;
  }
  const total = prices + photos;
  return { total, prices, photos, attention, waiting: total - attention };
}
