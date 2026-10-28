import { mapFieldErrors } from '@/features/gestion/errors';
import { ApiError } from '@/shared/api/errors';
import type { CreateCalculoInput, EstadoCalculo, FormatoArchivo, ParametrosCalculo } from '@/shared/api/types';

export const MONTH_FORMAT = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const MAX_RANGE_MONTHS = 36;
export const DEFAULT_PARAMS: ParametrosCalculo = { esperarMeses: 2, pesoSuper: 0.25, pesoTrad: 0.75, omitirGruposCompletos: true };

export const ESTADO_LABEL: Record<EstadoCalculo, string> = {
  EJECUTANDO: 'En ejecución',
  COMPLETADO: 'Completado',
  FALLIDO: 'Fallido',
};

/** Form state: everything the user types stays text until it is validated. */
export interface CalculoFormValues {
  mesBase: string;
  mesObjetivo: string;
  excluirOfertas: boolean;
  esperarMeses: string;
  pesoSuper: string;
  pesoTrad: string;
  omitirGruposCompletos: boolean;
}
export type CalculoField = 'mesBase' | 'mesObjetivo' | 'esperarMeses' | 'pesoSuper' | 'pesoTrad';
export type CalculoFormErrors = Partial<Record<CalculoField, string>>;

export const DEFAULT_FORM: CalculoFormValues = {
  mesBase: '',
  mesObjetivo: '',
  excluirOfertas: false,
  esperarMeses: String(DEFAULT_PARAMS.esperarMeses),
  pesoSuper: String(DEFAULT_PARAMS.pesoSuper).replace('.', ','),
  pesoTrad: String(DEFAULT_PARAMS.pesoTrad).replace('.', ','),
  omitirGruposCompletos: DEFAULT_PARAMS.omitirGruposCompletos,
};

const monthIndex = (m: string): number => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

/** Signed number of months from `base` to `objetivo` (both valid `AAAA-MM`). */
export function monthsBetween(base: string, objetivo: string): number {
  return monthIndex(objetivo) - monthIndex(base);
}

/** Every month from base to objetivo inclusive; empty when the range is invalid or reversed. */
export function monthsInRange(base: string, objetivo: string): string[] {
  if (!MONTH_FORMAT.test(base) || !MONTH_FORMAT.test(objetivo) || monthsBetween(base, objetivo) < 0) return [];
  const out: string[] = [];
  let [y, m] = [Number(base.slice(0, 4)), Number(base.slice(5, 7))];
  for (let i = monthsBetween(base, objetivo); i >= 0; i -= 1) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

const RANGE_COPY = `El mes objetivo debe ser igual o posterior al mes base y el rango no puede superar ${MAX_RANGE_MONTHS} meses.`;
const MESES_COPY = 'Indique un número entero entre 0 y 12.';
const PESO_COPY = 'Indique un número 0 o mayor.';

/** Accepts "0,3" and "0.3". Null for empty or non-numeric text. */
function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function parseParams(v: CalculoFormValues): { [K in 'esperarMeses' | 'pesoSuper' | 'pesoTrad']: number | null } {
  const meses = /^-?\d+$/.test(v.esperarMeses.trim()) ? Number(v.esperarMeses.trim()) : null;
  return { esperarMeses: meses, pesoSuper: parseDecimal(v.pesoSuper), pesoTrad: parseDecimal(v.pesoTrad) };
}

/** Mirrors the backend rules as hints; the server stays the authority (it answers 400 `errors[]`). */
export function validateCalculoForm(v: CalculoFormValues): CalculoFormErrors {
  const errors: CalculoFormErrors = {};
  const base = v.mesBase.trim();
  const objetivo = v.mesObjetivo.trim();
  if (!base) errors.mesBase = 'Indique el mes base.';
  else if (!MONTH_FORMAT.test(base)) errors.mesBase = 'El mes base debe tener el formato AAAA-MM, por ejemplo 2026-01.';
  if (!objetivo) errors.mesObjetivo = 'Indique el mes objetivo.';
  else if (!MONTH_FORMAT.test(objetivo)) errors.mesObjetivo = 'El mes objetivo debe tener el formato AAAA-MM, por ejemplo 2026-06.';
  else if (!errors.mesBase) {
    const span = monthsBetween(base, objetivo);
    if (span < 0 || span > MAX_RANGE_MONTHS) errors.mesObjetivo = RANGE_COPY;
  }
  const p = parseParams(v);
  if (p.esperarMeses === null || p.esperarMeses < 0 || p.esperarMeses > 12) errors.esperarMeses = MESES_COPY;
  if (p.pesoSuper === null || p.pesoSuper < 0) errors.pesoSuper = PESO_COPY;
  if (p.pesoTrad === null || p.pesoTrad < 0) errors.pesoTrad = PESO_COPY;
  return errors;
}

/** Valid form -> request body. The advanced parameters travel only when one differs from the default. */
export function toCalculoPayload(v: CalculoFormValues): CreateCalculoInput {
  const p = parseParams(v);
  const parametros: ParametrosCalculo = {
    esperarMeses: p.esperarMeses ?? DEFAULT_PARAMS.esperarMeses,
    pesoSuper: p.pesoSuper ?? DEFAULT_PARAMS.pesoSuper,
    pesoTrad: p.pesoTrad ?? DEFAULT_PARAMS.pesoTrad,
    omitirGruposCompletos: v.omitirGruposCompletos,
  };
  const isDefault = (Object.keys(DEFAULT_PARAMS) as (keyof ParametrosCalculo)[]).every((k) => parametros[k] === DEFAULT_PARAMS[k]);
  return {
    mesBase: v.mesBase.trim(),
    mesObjetivo: v.mesObjetivo.trim(),
    excluirOfertas: v.excluirOfertas,
    ...(isDefault ? {} : { parametros }),
  };
}

const SERVER_FIELD_COPY: Record<string, string> = {
  mesBase: 'El mes base debe tener el formato AAAA-MM.',
  mesObjetivo: RANGE_COPY,
  esperarMeses: MESES_COPY,
  pesoSuper: PESO_COPY,
  pesoTrad: PESO_COPY,
};

/** 400 `errors[]` -> Spanish copy on the field. Nested names (`parametros.esperarMeses`) are flattened. */
export function mapCalculoServerErrors(error: unknown): { fields: CalculoFormErrors; form: string | null } {
  if (!(error instanceof ApiError) || error.status !== 400) return { fields: {}, form: null };
  const flat = new ApiError({
    status: 400,
    message: error.message,
    errors: error.errors.map((e) => ({ field: e.field.split('.').pop() ?? e.field, message: e.message })),
  });
  return mapFieldErrors(flat, SERVER_FIELD_COPY) as { fields: CalculoFormErrors; form: string | null };
}

/**
 * The 409s of POST /calculos and /calculos/exportacion carry only `{message}` (no `code`), so they are
 * recognised by their text. An unknown message gets a generic explanation.
 */
export function describeCalculoConflict(error: ApiError): string {
  const m = error.message;
  const sinRelevamientos = /No hay relevamientos para el mes\s+(\S+)/i.exec(m);
  if (sinRelevamientos) return `No hay relevamientos para el mes ${sinRelevamientos[1]}. Revise el rango elegido.`;
  const abiertos = /Hay relevamientos abiertos:\s*(.+)$/i.exec(m);
  if (abiertos) return `Hay relevamientos abiertos (${abiertos[1]!.trim()}). Ciérrelos antes de calcular.`;
  if (/No hay precios cargados/i.test(m)) return 'No hay precios cargados en el rango indicado. Elija otros meses.';
  if (/Ya hay un cálculo en ejecución/i.test(m)) return 'Ya hay un cálculo en ejecución. Espere a que termine para iniciar otro.';
  return 'No se puede calcular con el estado actual de los datos. Actualice la pantalla e intente de nuevo.';
}

const relativoFmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Relative price with four decimals; null (no data) stays null so the table can explain the gap. */
export function formatRelativo(valor: number | null): string | null {
  return valor === null ? null : relativoFmt.format(valor);
}

export function resultadosFilename(c: { mesBase: string; mesObjetivo: string }, formato: FormatoArchivo): string {
  return `calculo_${c.mesBase}_${c.mesObjetivo}.${formato}`;
}

export function exportacionFilename(q: { mesBase: string; mesObjetivo: string; formato?: FormatoArchivo }): string {
  return `entrada_${q.mesBase}_${q.mesObjetivo}.${q.formato ?? 'xlsx'}`;
}
