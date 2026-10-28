import { ApiError } from '@/shared/api/errors';
import type { Alerta, CreatePrecioInput, Precio, UpdatePrecioInput } from '@/shared/api/types';

export interface SavePriceDeps {
  createPrecio: (input: CreatePrecioInput) => Promise<Precio>;
  updatePrecio: (id: string, input: UpdatePrecioInput) => Promise<Precio>;
  /** Looks up the precio for (relevamiento, producto, comercio); used to recover from duplicates. */
  findExisting: (ctx: { relevamiento: string; comercio: string; producto: string }) => Promise<Precio | null>;
}

export interface SavePriceInput {
  relevamiento: string;
  comercio: string;
  producto: string;
  existingId: string | null;
  /** Server copy of the existing precio; when given, PATCH sends only the fields that changed. */
  previous?: Precio | null;
  valor: number;
  oferta: boolean;
  observacion?: string;
  confirmarDesvio?: boolean;
  /** ISO capture time, sent on create only (the backend does not accept it on PATCH). */
  fechaRelevamiento?: string;
}

export type SavePriceResult =
  | { kind: 'saved'; precio: Precio }
  | { kind: 'unchanged'; precio: Precio }
  | { kind: 'duplicate-recovered'; precio: Precio }
  | { kind: 'needs-confirmation'; alerta: Alerta };

/**
 * One save action: POST when no precio exists for the triple, PATCH otherwise.
 * Atypical 409 becomes `needs-confirmation`; the caller resends with
 * `confirmarDesvio: true`. A duplicate 409 on create means "already saved".
 */
export async function savePrice(deps: SavePriceDeps, input: SavePriceInput): Promise<SavePriceResult> {
  const observacion = input.observacion?.trim() ? input.observacion.trim() : undefined;
  const confirm = input.confirmarDesvio ? { confirmarDesvio: true } : {};

  try {
    if (input.existingId) {
      const prev = input.previous ?? null;
      const typedObs = input.observacion !== undefined ? input.observacion.trim() : undefined;
      let body: UpdatePrecioInput;
      if (prev) {
        // Sending valor/oferta makes the backend re-judge the price, so only send what changed.
        body = {
          ...(input.valor !== prev.valor ? { valor: input.valor } : {}),
          ...(input.oferta !== prev.oferta ? { oferta: input.oferta } : {}),
          ...(typedObs !== undefined && typedObs !== (prev.observacion ?? '').trim() ? { observacion: typedObs } : {}),
        };
        // The backend rejects a PATCH without valor/observacion/oferta, so confirmarDesvio alone is never sent.
        if (Object.keys(body).length === 0) {
          return { kind: 'unchanged', precio: prev };
        }
        Object.assign(body, confirm);
      } else {
        body = {
          valor: input.valor,
          oferta: input.oferta,
          // PATCH sends the observation as typed so it can be cleared.
          ...(typedObs !== undefined ? { observacion: typedObs } : {}),
          ...confirm,
        };
      }
      return { kind: 'saved', precio: await deps.updatePrecio(input.existingId, body) };
    }
    const body: CreatePrecioInput = {
      relevamiento: input.relevamiento,
      comercio: input.comercio,
      producto: input.producto,
      valor: input.valor,
      oferta: input.oferta,
      ...(observacion ? { observacion } : {}),
      ...(input.fechaRelevamiento ? { fechaRelevamiento: input.fechaRelevamiento } : {}),
      ...confirm,
    };
    return { kind: 'saved', precio: await deps.createPrecio(body) };
  } catch (error) {
    if (error instanceof ApiError && error.isAtypical() && error.alerta) {
      return { kind: 'needs-confirmation', alerta: error.alerta };
    }
    if (error instanceof ApiError && error.status === 409 && !input.existingId) {
      const existing = await deps.findExisting({
        relevamiento: input.relevamiento,
        comercio: input.comercio,
        producto: input.producto,
      });
      if (existing) return { kind: 'duplicate-recovered', precio: existing };
    }
    throw error;
  }
}
