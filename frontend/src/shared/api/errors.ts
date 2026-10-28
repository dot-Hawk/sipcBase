import type { Alerta } from './types';

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorInit {
  status: number;
  message: string;
  /** Stable machine code of a 409 (additive backend contract); absent on older backends. */
  code?: string | null;
  errors?: FieldError[];
  requiereConfirmacion?: boolean;
  alerta?: Alerta | null;
  retryAfter?: number | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly errors: FieldError[];
  readonly requiereConfirmacion: boolean;
  readonly alerta: Alerta | null;
  readonly retryAfter: number | null;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code ?? null;
    this.errors = init.errors ?? [];
    this.requiereConfirmacion = init.requiereConfirmacion ?? false;
    this.alerta = init.alerta ?? null;
    this.retryAfter = init.retryAfter ?? null;
  }

  /** The soft-stop 409 of POST/PATCH precios. */
  isAtypical(): boolean {
    return this.status === 409 && this.requiereConfirmacion && this.alerta !== null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isNumbers = (v: Record<string, unknown>, keys: string[]) => keys.every((k) => typeof v[k] === 'number');

// Either the current percentile alert or the legacy one (no `metodo`).
function isAlerta(v: unknown): v is Alerta {
  if (!isRecord(v)) return false;
  if (v.metodo === 'PERCENTIL_VARIACION') {
    const rango = v.rangoPrecio;
    return (
      typeof v.variedad === 'string' &&
      isNumbers(v, ['precioAnterior', 'variacion', 'percentilInferior', 'percentilSuperior', 'limiteInferior', 'limiteSuperior', 'n']) &&
      isRecord(rango) &&
      isNumbers(rango, ['min', 'max'])
    );
  }
  return isNumbers(v, ['media', 'desvio', 'n', 'limiteInferior', 'limiteSuperior']);
}

export function normalizeApiError(status: number, body: unknown, retryAfterHeader: string | null): ApiError {
  const b = isRecord(body) ? body : {};
  const errors: FieldError[] = Array.isArray(b.errors)
    ? b.errors
        .filter(isRecord)
        .map((e) => ({ field: String(e.field ?? ''), message: String(e.message ?? '') }))
    : [];
  const parsed = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
  return new ApiError({
    status,
    message: typeof b.message === 'string' ? b.message : `HTTP ${status}`,
    code: typeof b.code === 'string' && b.code !== '' ? b.code : null,
    errors,
    requiereConfirmacion: b.requiereConfirmacion === true,
    alerta: isAlerta(b.alerta) ? b.alerta : null,
    retryAfter: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
  });
}

/** Shown when the server ends the session (invalid token or deactivated account). */
export const SESSION_ENDED_COPY =
  'Su sesión venció o su cuenta fue desactivada. Ingrese de nuevo o consulte con su coordinador.';

export type ErrorContext = 'login' | 'precio' | 'asignacion' | 'adjunto' | 'lectura' | 'password';

/** Spanish copy by status/shape. Server messages are English and never shown. */
export function describeApiError(error: unknown, context: ErrorContext = 'lectura'): string {
  if (!(error instanceof ApiError)) {
    return 'Ocurrió un error inesperado. Intente de nuevo.';
  }
  const { status } = error;
  if (status === 0) {
    return 'No hay conexión con el servidor. Revise su conexión a internet e intente de nuevo.';
  }
  if (status === 429) {
    return error.retryAfter !== null
      ? `Demasiados intentos. Espere ${error.retryAfter} segundos e intente de nuevo.`
      : 'Demasiados intentos. Espere un momento e intente de nuevo.';
  }
  if (status >= 500) {
    return 'El servidor no pudo procesar la solicitud. Intente de nuevo en unos minutos.';
  }
  if (status === 400) {
    if (context === 'login') return 'Ingrese su correo y su contraseña.';
    if (context === 'password') return 'Revise los campos e intente de nuevo.';
    if (context === 'adjunto') return 'No se pudo adjuntar el archivo. Use una foto en formato JPG, PNG o WebP de hasta 5 MB.';
    return 'Hay datos no válidos. Revise los campos e intente de nuevo.';
  }
  if (status === 401) {
    return context === 'login'
      ? 'Correo o contraseña incorrectos, o la cuenta está inactiva.'
      : SESSION_ENDED_COPY;
  }
  if (status === 403) {
    return 'La visita no está en curso. Inicie la visita para cargar precios en este comercio.';
  }
  if (status === 404) {
    return 'No se encontró el dato solicitado. Actualice la pantalla e intente de nuevo.';
  }
  if (status === 409) {
    if (context === 'asignacion') {
      return 'No se pudo cambiar el estado de la visita. Actualice la pantalla y verifique el estado actual.';
    }
    if (context === 'adjunto') {
      return 'No se pudo modificar la foto: la visita ya no admite cambios o se alcanzó el máximo de 5 fotos.';
    }
    return 'Este precio ya no se puede modificar: el relevamiento está cerrado o la visita ya no está en curso.';
  }
  if (status === 413) return 'La foto supera los 5 MB. Tome otra o reduzca su tamaño.';
  if (status === 415 || status === 422) return 'El formato de la foto no es válido. Use JPG, PNG o WebP.';
  return 'No se pudo completar la acción. Intente de nuevo.';
}
