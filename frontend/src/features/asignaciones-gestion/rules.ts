import { describeGestionError } from '@/features/gestion/errors';
import { ApiError } from '@/shared/api/errors';
import type { Asignacion, Relevamiento } from '@/shared/api/types';

/** Only a PENDIENTE asignacion can change hands; the API answers 409 otherwise. */
export function canReassign(a: Asignacion): boolean {
  return a.estado === 'PENDIENTE';
}

/**
 * Only a PENDIENTE or EN_CURSO visit of an ABIERTO relevamiento can be cancelled (COMPLETADA and
 * CANCELADA are terminal). An unknown relevamiento cannot be verified, so it is not cancellable.
 */
export function canCancel(a: Asignacion, relevamiento: Pick<Relevamiento, 'estado'> | null | undefined): boolean {
  return (a.estado === 'PENDIENTE' || a.estado === 'EN_CURSO') && relevamiento?.estado === 'ABIERTO';
}

export const CANCEL_CLOSED_COPY = 'No se puede cancelar: el relevamiento ya está cerrado.';

/** Why a cancellable-by-estado visit cannot be cancelled right now; null when it can (or is terminal). */
export function cancelBlockReason(a: Asignacion, relevamiento: Pick<Relevamiento, 'estado'> | null | undefined): string | null {
  if (a.estado !== 'PENDIENTE' && a.estado !== 'EN_CURSO') return null;
  return relevamiento?.estado === 'ABIERTO' ? null : CANCEL_CLOSED_COPY;
}

/** Comercios that hold an asignacion in the relevamiento; a CANCELADA one frees its comercio. */
export function assignedComercios(list: readonly Asignacion[], relevamiento: string): Set<string> {
  return new Set(
    list.filter((a) => a.relevamiento === relevamiento && a.estado !== 'CANCELADA').map((a) => a.comercio),
  );
}

/** Unfinished visits of an encuestador, to warn before deactivating them. */
export function pendingFor(list: readonly Asignacion[], encuestador: string): { pendiente: number; enCurso: number } {
  const mine = list.filter((a) => a.encuestador === encuestador);
  return {
    pendiente: mine.filter((a) => a.estado === 'PENDIENTE').length,
    enCurso: mine.filter((a) => a.estado === 'EN_CURSO').length,
  };
}

export type AsignacionField = 'relevamiento' | 'encuestador' | 'comercio';
export interface AsignacionErrors {
  fields: Partial<Record<AsignacionField, string>>;
  form: string | null;
}

const CODE_COPY: Record<string, AsignacionErrors> = {
  RELEVAMIENTO_NOT_ABIERTO: { fields: { relevamiento: 'Este relevamiento ya no está abierto.' }, form: null },
  COMERCIO_ALREADY_ASSIGNED: { fields: { comercio: 'Este comercio ya está asignado en este relevamiento.' }, form: null },
  ASIGNACION_NOT_PENDIENTE: {
    fields: {},
    form: 'Esta visita ya no está pendiente, por eso no se puede reasignar. Actualice la pantalla.',
  },
  INVALID_ESTADO_TRANSITION: {
    fields: {},
    form: 'La visita no puede pasar a ese estado desde el actual. Actualice la pantalla y verifique el estado.',
  },
  ASIGNACION_CONCURRENT_MODIFICATION: {
    fields: {},
    form: 'Otra persona modificó esta visita mientras tanto. Actualice la pantalla e intente de nuevo.',
  },
};

/**
 * A 409 is read from its stable `code`. A 409 WITHOUT `code` (a backend that predates the codes) is
 * read from the English `message` as a fallback only; a code this client does not know degrades to
 * the generic conflict message instead of guessing from text.
 */
export function mapAsignacionError(error: unknown): AsignacionErrors {
  if (!(error instanceof ApiError)) return { fields: {}, form: describeGestionError(error) };
  const msg = error.message.toLowerCase();
  const { status } = error;

  if (status === 409 && error.code !== null) {
    const known = CODE_COPY[error.code];
    if (known) return { fields: { ...known.fields }, form: known.form };
    return { fields: {}, form: describeGestionError(error) };
  }

  if (status === 400 && error.errors.length > 0) {
    const fields: AsignacionErrors['fields'] = {};
    for (const e of error.errors) {
      if (e.field === 'relevamiento' || e.field === 'encuestador' || e.field === 'comercio') {
        fields[e.field] = 'Elija una opción válida.';
      }
    }
    if (Object.keys(fields).length > 0) return { fields, form: null };
  }
  if (status === 409) {
    // Fallback for responses without `code`.
    if (msg.includes('abierto')) return { fields: { relevamiento: 'Este relevamiento ya no está abierto.' }, form: null };
    if (msg.includes('already assigned')) {
      return { fields: { comercio: 'Este comercio ya está asignado en este relevamiento.' }, form: null };
    }
    if (msg.includes('pendiente')) {
      return { fields: {}, form: 'Esta visita ya no está pendiente, por eso no se puede reasignar. Actualice la pantalla.' };
    }
  }
  if (status === 404) {
    if (msg.startsWith('relevamiento')) return { fields: { relevamiento: 'Este relevamiento ya no existe.' }, form: null };
    if (msg.startsWith('encuestador')) return { fields: { encuestador: 'Este encuestador ya no existe.' }, form: null };
    if (msg.startsWith('comercio')) return { fields: { comercio: 'Este comercio ya no existe.' }, form: null };
  }
  if (status === 400) {
    if (msg.includes('encuestador')) return { fields: { encuestador: 'Debe ser un encuestador activo.' }, form: null };
    if (msg.includes('comercio')) return { fields: { comercio: 'El comercio debe estar activo.' }, form: null };
  }
  return { fields: {}, form: describeGestionError(error) };
}

const CANCEL_COPY = {
  NOT_CANCELABLE: 'Esta visita ya fue completada o cancelada, por eso no se puede cancelar. Actualice la pantalla.',
  NOT_ABIERTO: 'El relevamiento ya no está abierto, por eso no se pueden cancelar sus visitas. Actualice la pantalla.',
  CONCURRENT: 'Otra persona modificó esta visita mientras tanto. Actualice la pantalla e intente de nuevo.',
  GONE: 'Esta visita ya no existe. Actualice la pantalla.',
  INVALID: 'El identificador de la visita no es válido. Actualice la pantalla e intente de nuevo.',
} as const;

const CANCEL_BY_CODE: Record<string, string> = {
  ASIGNACION_NOT_CANCELABLE: CANCEL_COPY.NOT_CANCELABLE,
  RELEVAMIENTO_NOT_ABIERTO: CANCEL_COPY.NOT_ABIERTO,
  ASIGNACION_CONCURRENT_MODIFICATION: CANCEL_COPY.CONCURRENT,
};

/**
 * Spanish message for a failed cancellation. A 409 is read from its `code`; only a 409 WITHOUT
 * `code` (older backend) falls back to the English message. An unknown code is a generic conflict.
 */
export function mapCancelError(error: unknown): string {
  if (!(error instanceof ApiError)) return describeGestionError(error);
  if (error.status === 409) {
    if (error.code !== null) return CANCEL_BY_CODE[error.code] ?? describeGestionError(error);
    const msg = error.message.toLowerCase();
    if (msg.includes('cannot be cancelled')) return CANCEL_COPY.NOT_CANCELABLE;
    if (msg.includes('abierto')) return CANCEL_COPY.NOT_ABIERTO;
    if (msg.includes('concurrently')) return CANCEL_COPY.CONCURRENT;
  }
  if (error.status === 404) return CANCEL_COPY.GONE;
  if (error.status === 400) return CANCEL_COPY.INVALID;
  return describeGestionError(error);
}
