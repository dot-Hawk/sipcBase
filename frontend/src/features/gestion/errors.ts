import { ApiError } from '@/shared/api/errors';

export interface MappedFieldErrors {
  /** Spanish message by form field. */
  fields: Record<string, string>;
  /** Message for errors that belong to no field of the form. */
  form: string | null;
}

/**
 * 400 `{errors:[{field,message}]}` -> inline form errors. The server text is English and never
 * shown: the Spanish copy comes from `messages`, keyed by the field name of the API.
 */
export function mapFieldErrors(error: unknown, messages: Record<string, string>): MappedFieldErrors {
  const out: MappedFieldErrors = { fields: {}, form: null };
  if (!(error instanceof ApiError) || error.status !== 400) return out;
  for (const e of error.errors) {
    const copy = messages[e.field];
    if (copy) out.fields[e.field] = copy;
    else out.form = 'Hay datos no válidos. Revise los campos e intente de nuevo.';
  }
  if (error.errors.length === 0) out.form = 'Hay datos no válidos. Revise los campos e intente de nuevo.';
  return out;
}

/**
 * Spanish copy by status. `conflict` is the context-specific text for a 409 (the server message
 * is English and the contract has no error codes, so the caller decides what a 409 means).
 */
export function describeGestionError(error: unknown, conflict?: string): string {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado. Intente de nuevo.';
  const { status } = error;
  if (status === 0) return 'No hay conexión con el servidor. Revise su conexión a internet e intente de nuevo.';
  if (status === 429) return 'Demasiados intentos. Espere un momento e intente de nuevo.';
  if (status >= 500) return 'El servidor no pudo procesar la solicitud. Intente de nuevo en unos minutos.';
  if (status === 400) return 'Hay datos no válidos. Revise los campos e intente de nuevo.';
  if (status === 401) return 'Su sesión venció o su cuenta fue desactivada. Ingrese de nuevo.';
  if (status === 403) return 'No tiene permiso para realizar esta acción.';
  if (status === 404) return 'El registro ya no existe. Actualice la pantalla e intente de nuevo.';
  if (status === 409) {
    return conflict ?? 'La acción entra en conflicto con el estado actual. Actualice la pantalla e intente de nuevo.';
  }
  return 'No se pudo completar la acción. Intente de nuevo.';
}
