import type { Alerta, Precio } from '@/shared/api/types';
import type { ItemError, ItemStatus, OutboxItem, PriceItem } from './types';

export interface ProductPending {
  /** State of the queued price; null when only photos are queued. */
  price: ItemStatus | null;
  priceItemId: string | null;
  alerta: Alerta | null;
  error: ItemError | null;
  /** Queued price that updates an existing precio (false = it will be created). */
  updatesExisting: boolean;
  photos: number;
}

export function pendingByProducto(items: readonly OutboxItem[], asignacionId: string): Map<string, ProductPending> {
  const out = new Map<string, ProductPending>();
  const entry = (producto: string): ProductPending => {
    let e = out.get(producto);
    if (!e) {
      e = { price: null, priceItemId: null, alerta: null, error: null, updatesExisting: false, photos: 0 };
      out.set(producto, e);
    }
    return e;
  };
  for (const it of items) {
    if (it.asignacionId !== asignacionId) continue;
    const e = entry(it.producto);
    if (it.kind === 'photo') {
      e.photos += 1;
    } else {
      e.price = it.status;
      e.priceItemId = it.id;
      e.alerta = it.alerta;
      e.error = it.error;
      e.updatesExisting = it.precioId !== null;
    }
  }
  return out;
}

function toPrecio(it: PriceItem, server: Precio | undefined): Precio {
  return {
    id: it.precioId ?? `pending:${it.id}`,
    relevamiento: it.relevamiento,
    producto: it.producto,
    comercio: it.comercio,
    encuestador: server?.encuestador ?? it.userId,
    valor: it.valor,
    oferta: it.oferta,
    fechaRelevamiento: server?.fechaRelevamiento ?? it.capturedAt,
    observacion: it.observacion.trim() === '' ? null : it.observacion,
    alerta: it.status === 'needs-confirmation' ? it.alerta : null,
    createdAt: server?.createdAt ?? '',
    // The editor re-baselines when this changes, so it follows the edit, not the server.
    updatedAt: `${it.capturedAt}#${it.rev}`,
  };
}

/** What the surveyor should see: queued values over the server copy, queued-only products included. */
export function withOptimisticPrices(
  saved: ReadonlyMap<string, Precio>,
  items: readonly OutboxItem[],
  asignacionId: string,
): ReadonlyMap<string, Precio> {
  const queued = items.filter((i): i is PriceItem => i.kind === 'price' && i.asignacionId === asignacionId);
  if (queued.length === 0) return saved;
  const merged = new Map(saved);
  for (const it of queued) merged.set(it.producto, toPrecio(it, saved.get(it.producto)));
  return merged;
}
