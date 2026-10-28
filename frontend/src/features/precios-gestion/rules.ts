import { ApiError } from '@/shared/api/errors';
import type { Alerta, Precio, Relevamiento, Role, UpdatePrecioInput } from '@/shared/api/types';
import { describeGestionError } from '@/features/gestion/errors';
import { parseMoney, toInputText } from '@/shared/lib/money';

/** Backend `MAX_OBSERVACION_LENGTH`. */
export const MAX_OBSERVACION = 500;

/** `PATCH /precios/:id` is authorized for ENCUESTADOR, SUPERVISOR and ANALISTA; the review screen is for the last two. */
export function canCorrectPrecios(role: Role): boolean {
  return role === 'SUPERVISOR' || role === 'ANALISTA';
}

/** The whole `/users` router is COORDINADOR-only, so no other role can resolve a user id to a name. */
export function canListUsers(role: Role): boolean {
  return role === 'COORDINADOR';
}

export const CLOSED_COPY =
  'El relevamiento está cerrado: al cerrarse los datos quedan congelados y el precio ya no se puede corregir.';

/** Closing freezes the data (even for reviewers), so the action is disabled with the reason up front. */
export function correctionBlockedReason(relevamiento: Pick<Relevamiento, 'estado'> | undefined): string | null {
  return relevamiento?.estado === 'CERRADO' ? CLOSED_COPY : null;
}

export interface CorrectionForm {
  valor: string;
  oferta: boolean;
  observacion: string;
}

export function formFromPrecio(p: Precio): CorrectionForm {
  return { valor: toInputText(p.valor), oferta: p.oferta, observacion: p.observacion ?? '' };
}

export type CorrectionField = 'valor' | 'observacion' | 'form';

export interface CorrectionValidation {
  errors: Partial<Record<CorrectionField, string>>;
  /** Only the fields that differ from the current price; null when invalid or unchanged. */
  changes: UpdatePrecioInput | null;
}

export function validateCorrection(form: CorrectionForm, precio: Precio): CorrectionValidation {
  const errors: CorrectionValidation['errors'] = {};
  const valor = parseMoney(form.valor);
  if (valor === null) errors.valor = 'Ingrese un precio mayor a 0.';
  const observacion = form.observacion.trim();
  if (observacion.length > MAX_OBSERVACION) {
    errors.observacion = `La observación admite hasta ${MAX_OBSERVACION} caracteres.`;
  }
  if (Object.keys(errors).length > 0) return { errors, changes: null };

  const changes: UpdatePrecioInput = {};
  if (valor !== null && valor !== precio.valor) changes.valor = valor;
  if (form.oferta !== precio.oferta) changes.oferta = form.oferta;
  if (observacion !== (precio.observacion ?? '')) changes.observacion = observacion === '' ? null : observacion;

  if (Object.keys(changes).length === 0) {
    return { errors: { form: 'Cambie al menos un dato para corregir el precio.' }, changes: null };
  }
  return { errors: {}, changes };
}

export type CorrectionErrorKind = 'atypical' | 'closed' | 'gone' | 'forbidden' | 'conflict' | 'invalid' | 'other';

export type CorrectionError =
  | { kind: 'atypical'; alerta: Alerta }
  | { kind: Exclude<CorrectionErrorKind, 'atypical'>; fields: Partial<Record<CorrectionField, string>>; form: string };

const FIELD_COPY: Record<string, string> = {
  valor: 'Ingrese un precio mayor a 0.',
  observacion: `La observación admite hasta ${MAX_OBSERVACION} caracteres.`,
};

/**
 * `PATCH /precios/:id` failure -> what the dialog shows. The stable code wins; today the backend sends
 * NO code on this 409 (gap 24), so the English message is the fallback, and an unknown 409 degrades to a
 * generic conflict. The soft-stop 409 (`requiereConfirmacion`) is a question, not an error.
 */
export function mapCorrectionError(error: unknown): CorrectionError {
  if (!(error instanceof ApiError)) return { kind: 'other', fields: {}, form: describeGestionError(error) };
  if (error.isAtypical() && error.alerta) return { kind: 'atypical', alerta: error.alerta };

  if (error.status === 409) {
    const closed =
      error.code === 'RELEVAMIENTO_NOT_ABIERTO' || (error.code === null && /not abierto/i.test(error.message));
    if (closed) return { kind: 'closed', fields: {}, form: CLOSED_COPY };
    return {
      kind: 'conflict',
      fields: {},
      form: 'El precio cambió o ya no admite correcciones. Actualice la pantalla y verifique su estado.',
    };
  }
  if (error.status === 404) {
    return { kind: 'gone', fields: {}, form: 'Este precio ya no existe. Actualice la pantalla para ver la lista vigente.' };
  }
  if (error.status === 403) {
    return { kind: 'forbidden', fields: {}, form: 'Su rol no tiene permiso para corregir precios.' };
  }
  if (error.status === 400) {
    const fields: Partial<Record<CorrectionField, string>> = {};
    let form: string | null = null;
    for (const e of error.errors) {
      const copy = FIELD_COPY[e.field];
      if (copy && (e.field === 'valor' || e.field === 'observacion')) fields[e.field] = copy;
      else form = 'Hay datos no válidos. Revise los campos e intente de nuevo.';
    }
    if (error.errors.length === 0) form = describeGestionError(error);
    return { kind: 'invalid', fields, form: form ?? '' };
  }
  return { kind: 'other', fields: {}, form: describeGestionError(error) };
}
