import { ApiError } from '@/shared/api/errors';
import type { CreateRelevamientoInput, Frecuencia } from '@/shared/api/types';

export interface RelevamientoFormValues {
  frecuencia: Frecuencia;
  periodo: string;
  /** `YYYY-MM-DD` from the date inputs. */
  fechaInicio: string;
  fechaLimite: string;
}
export type RelevamientoField = keyof RelevamientoFormValues;
export type RelevamientoFormErrors = Partial<Record<RelevamientoField, string>>;

/** Same formats the backend enforces. Hints only: the server is the authority. */
const PERIODO_FORMAT: Record<Frecuencia, RegExp> = {
  MENSUAL: /^\d{4}-(0[1-9]|1[0-2])$/,
  QUINCENAL: /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/,
};

export function periodoHint(frecuencia: Frecuencia): string {
  return frecuencia === 'MENSUAL'
    ? 'Formato AAAA-MM, por ejemplo 2026-11.'
    : 'Formato AAAA-MM-Q1 o AAAA-MM-Q2, por ejemplo 2026-11-Q1.';
}

export function validateRelevamientoForm(v: RelevamientoFormValues): RelevamientoFormErrors {
  const errors: RelevamientoFormErrors = {};
  if (!PERIODO_FORMAT[v.frecuencia].test(v.periodo.trim())) {
    errors.periodo = `El período no tiene el formato de la frecuencia elegida. ${periodoHint(v.frecuencia)}`;
  }
  // UX hints only: the backend requires both dates, rejects impossible days and needs the limit
  // strictly after the start (it answers 400 `errors[]`, mapped by `mapRelevamientoServerErrors`).
  if (!v.fechaInicio) errors.fechaInicio = 'Indique la fecha de inicio.';
  else if (!isRealDay(v.fechaInicio)) errors.fechaInicio = DATE_INVALID.fechaInicio;
  if (!v.fechaLimite) errors.fechaLimite = 'Indique la fecha límite.';
  else if (!isRealDay(v.fechaLimite)) errors.fechaLimite = DATE_INVALID.fechaLimite;
  if (!errors.fechaInicio && !errors.fechaLimite && v.fechaInicio && v.fechaLimite && v.fechaLimite <= v.fechaInicio) {
    errors.fechaLimite = DATE_ORDER;
  }
  return errors;
}

const DATE_INVALID = {
  fechaInicio: 'La fecha de inicio no es una fecha válida.',
  fechaLimite: 'La fecha límite no es una fecha válida.',
};
const DATE_ORDER = 'La fecha límite debe ser posterior a la de inicio.';

/** `YYYY-MM-DD` that exists in the calendar (2026-02-31 does not). */
function isRealDay(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const SERVER_FIELD_COPY: Record<string, string> = {
  frecuencia: 'Elija una frecuencia válida.',
  periodo: 'El período no tiene el formato de la frecuencia elegida.',
};

/** 400 `errors[]` of POST /relevamientos -> Spanish copy on the exact field; the server text is never shown. */
export function mapRelevamientoServerErrors(error: unknown): {
  fields: Partial<Record<RelevamientoField, string>>;
  form: string | null;
} {
  const out: { fields: Partial<Record<RelevamientoField, string>>; form: string | null } = { fields: {}, form: null };
  if (!(error instanceof ApiError) || error.status !== 400) return out;
  for (const e of error.errors) {
    if (e.field === 'fechaInicio') out.fields.fechaInicio = DATE_INVALID.fechaInicio;
    else if (e.field === 'fechaLimite') {
      out.fields.fechaLimite = /after/i.test(e.message) ? DATE_ORDER : DATE_INVALID.fechaLimite;
    } else if (e.field === 'frecuencia' || e.field === 'periodo') out.fields[e.field] = SERVER_FIELD_COPY[e.field];
    else out.form = 'Hay datos no válidos. Revise los campos e intente de nuevo.';
  }
  if (error.errors.length === 0) out.form = 'Hay datos no válidos. Revise los campos e intente de nuevo.';
  return out;
}

export function toRelevamientoPayload(v: RelevamientoFormValues): CreateRelevamientoInput {
  return {
    periodo: v.periodo.trim(),
    frecuencia: v.frecuencia,
    fechaInicio: `${v.fechaInicio}T00:00:00.000Z`,
    fechaLimite: `${v.fechaLimite}T00:00:00.000Z`,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Default window of a valid periodo: the month, or its first/second half. */
export function suggestDates(
  frecuencia: Frecuencia,
  periodo: string,
): { fechaInicio: string; fechaLimite: string } | null {
  if (!PERIODO_FORMAT[frecuencia].test(periodo)) return null;
  const year = Number(periodo.slice(0, 4));
  const month = Number(periodo.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ym = `${periodo.slice(0, 4)}-${pad(month)}`;
  if (frecuencia === 'MENSUAL') return { fechaInicio: `${ym}-01`, fechaLimite: `${ym}-${pad(last)}` };
  return periodo.endsWith('Q1')
    ? { fechaInicio: `${ym}-01`, fechaLimite: `${ym}-15` }
    : { fechaInicio: `${ym}-16`, fechaLimite: `${ym}-${pad(last)}` };
}
