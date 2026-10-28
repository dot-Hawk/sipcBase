import { describeGestionError, mapFieldErrors } from '@/features/gestion/errors';
import { ApiError } from '@/shared/api/errors';
import type {
  CanastaCategoria,
  CatalogEstado,
  Comercio,
  ComercioTipo,
  CreateVariedadInput,
  Producto,
  UpdateComercioInput,
  UpdateProductoInput,
  Unidad,
} from '@/shared/api/types';

export const TIPOS: readonly ComercioTipo[] = ['SUPERMERCADO', 'ALMACEN', 'VERDULERIA', 'CARNICERIA', 'FARMACIA', 'OTRO'];
export const UNIDADES: readonly Unidad[] = ['KG', 'G', 'LT', 'ML', 'UNIDAD'];
export const CATEGORIAS: readonly CanastaCategoria[] = ['NUCLEO', 'ESTACIONAL', 'REGULADO'];
export const ESTADOS: readonly CatalogEstado[] = ['ACTIVO', 'INACTIVO'];

export const ESTADO_LABEL: Record<CatalogEstado, string> = { ACTIVO: 'Activo', INACTIVO: 'Inactivo' };
export const UNIDAD_LABEL: Record<Unidad, string> = {
  KG: 'Kilogramo (kg)',
  G: 'Gramo (g)',
  LT: 'Litro (L)',
  ML: 'Mililitro (ml)',
  UNIDAD: 'Unidad',
};
export const CATEGORIA_LABEL: Record<CanastaCategoria, string> = {
  NUCLEO: 'Núcleo',
  ESTACIONAL: 'Estacional',
  REGULADO: 'Regulado',
};

/** Page size of the client-side paging (the catalogue endpoints have no page and no total). */
export const CATALOGO_PAGE_SIZE = 25;

// ---------- search and paging (client side: the backend has no text search) ----------

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** True when the term (accent and case insensitive) appears in any of the fields. An empty term matches. */
export function matchesSearch(fields: readonly (string | null | undefined)[], term: string): boolean {
  const needle = normalizeText(term);
  if (needle === '') return true;
  return fields.some((f) => f != null && normalizeText(f).includes(needle));
}

export interface PageSlice<T> {
  items: T[];
  page: number;
  total: number;
  pageCount: number;
}

export function paginate<T>(rows: readonly T[], page: number, size = CATALOGO_PAGE_SIZE): PageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return { items: rows.slice((current - 1) * size, current * size), page: current, total: rows.length, pageCount };
}

// ---------- comercios ----------

export interface ComercioFormValues {
  nombre: string;
  direccion: string;
  zona: string;
  tipo: ComercioTipo | '';
}
export type ComercioField = keyof ComercioFormValues;
export type ComercioFormErrors = Partial<Record<ComercioField, string>>;

const REQUIRED_TEXT: { key: 'nombre' | 'direccion' | 'zona'; label: string }[] = [
  { key: 'nombre', label: 'el nombre' },
  { key: 'direccion', label: 'la dirección' },
  { key: 'zona', label: 'la zona' },
];

export function validateComercioForm(v: ComercioFormValues): ComercioFormErrors {
  const errors: ComercioFormErrors = {};
  for (const f of REQUIRED_TEXT) {
    if (v[f.key].trim() === '') errors[f.key] = `Ingrese ${f.label}.`;
  }
  if (v.tipo === '') errors.tipo = 'Elija el tipo de comercio.';
  return errors;
}

/** PATCH body of an edit: only what changed, trimmed (the API needs at least one field). */
export function comercioChanges(original: Comercio, v: ComercioFormValues): UpdateComercioInput {
  const out: UpdateComercioInput = {};
  for (const key of ['nombre', 'direccion', 'zona'] as const) {
    const next = v[key].trim();
    if (next !== original[key]) out[key] = next;
  }
  if (v.tipo !== '' && v.tipo !== original.tipo) out.tipo = v.tipo;
  return out;
}

export const COMERCIO_SERVER_COPY: Record<string, string> = {
  nombre: 'Ingrese el nombre.',
  direccion: 'Ingrese la dirección.',
  zona: 'Ingrese la zona.',
  tipo: 'Elija un tipo de comercio válido.',
};

// ---------- productos ----------

/** Positive number with dot or comma decimals; null otherwise. */
export function parseCantidad(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const NUMBER_FMT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

/** "1,5 L", "500 g", "12 unidades". */
export function formatCantidad(n: number, unidad: Unidad): string {
  const value = NUMBER_FMT.format(n);
  if (unidad === 'UNIDAD') return `${value} ${n === 1 ? 'unidad' : 'unidades'}`;
  const short: Record<Exclude<Unidad, 'UNIDAD'>, string> = { KG: 'kg', G: 'g', LT: 'L', ML: 'ml' };
  return `${value} ${short[unidad]}`;
}

export interface ProductoFormValues {
  nombre: string;
  categoria: string;
  unidad: Unidad | '';
  cantidadReferencia: string;
  marca: string;
  codigoVariedad: string;
}
export type ProductoField = keyof ProductoFormValues;
export type ProductoFormErrors = Partial<Record<ProductoField, string>>;

export const VARIEDAD_CODIGO = /^\d{7}$/;
export const PRODUCTO_NODO_CODIGO = /^\d{5}$/;

export function validateProductoForm(v: ProductoFormValues, mode: 'create' | 'edit', original?: Producto): ProductoFormErrors {
  const errors: ProductoFormErrors = {};
  if (v.nombre.trim() === '') errors.nombre = 'Ingrese el nombre.';
  if (v.categoria.trim() === '') errors.categoria = 'Ingrese la categoría.';
  if (v.unidad === '') errors.unidad = 'Elija la unidad.';
  if (parseCantidad(v.cantidadReferencia) === null) errors.cantidadReferencia = 'Ingrese una cantidad mayor que cero, por ejemplo 1 o 0,5.';
  if (!VARIEDAD_CODIGO.test(v.codigoVariedad.trim())) errors.codigoVariedad = 'El código de la variedad tiene 7 dígitos.';
  if (mode === 'edit' && original?.marca && v.marca.trim() === '') {
    errors.marca = 'No se puede quitar la marca: el servidor no lo admite. Escriba otra marca o deje la actual.';
  }
  return errors;
}

export function productoChanges(original: Producto, v: ProductoFormValues): UpdateProductoInput {
  const out: UpdateProductoInput = {};
  for (const key of ['nombre', 'categoria'] as const) {
    const next = v[key].trim();
    if (next !== original[key]) out[key] = next;
  }
  if (v.unidad !== '' && v.unidad !== original.unidad) out.unidad = v.unidad;
  const cantidad = parseCantidad(v.cantidadReferencia);
  if (cantidad !== null && cantidad !== Number(original.cantidadReferencia)) out.cantidadReferencia = cantidad;
  const marca = v.marca.trim();
  if (marca !== '' && marca !== (original.marca ?? '')) out.marca = marca;
  const variedad = v.codigoVariedad.trim();
  if (variedad !== original.codigoVariedad) out.codigoVariedad = variedad;
  return out;
}

const PRODUCTO_SERVER_COPY: Record<string, string> = {
  nombre: 'Ingrese el nombre.',
  categoria: 'Ingrese la categoría.',
  unidad: 'Elija una unidad válida.',
  cantidadReferencia: 'Ingrese una cantidad mayor que cero.',
  marca: 'La marca no puede quedar vacía.',
  codigoVariedad: 'El código de la variedad tiene 7 dígitos.',
};

export const PRODUCTO_DUPLICATE_COPY =
  'Ya existe un producto con el mismo nombre, marca, unidad y cantidad de referencia (sin distinguir mayúsculas).';
const INVALID_VARIEDAD_COPY = 'Elija una variedad activa de la canasta.';

/** Codes the backend may send for a producto duplicate. Today the 409 has none: it is read by status. */
const PRODUCTO_DUPLICATE_CODES = new Set(['PRODUCTO_DUPLICATE']);
const VARIEDAD_DUPLICATE_CODES = new Set(['CANASTA_CODIGO_DUPLICATE', 'VARIEDAD_DUPLICATE']);

export interface CatalogError<F extends string> {
  fields: Partial<Record<F, string>>;
  form: string | null;
}

function conflictOrFields<F extends string>(
  error: unknown,
  duplicateCodes: Set<string>,
  onDuplicate: () => CatalogError<F>,
  copy: Record<string, string>,
  badRequestByMessage: (message: string) => CatalogError<F> | null,
): CatalogError<F> {
  if (error instanceof ApiError && error.status === 409) {
    if (error.code === null || duplicateCodes.has(error.code)) return onDuplicate();
    return { fields: {}, form: describeGestionError(error) };
  }
  if (error instanceof ApiError && error.status === 400 && error.errors.length === 0) {
    const byMessage = badRequestByMessage(error.message);
    if (byMessage) return byMessage;
  }
  const mapped = mapFieldErrors(error, copy);
  const hasFields = Object.keys(mapped.fields).length > 0;
  return {
    fields: mapped.fields as Partial<Record<F, string>>,
    form: mapped.form ?? (hasFields ? null : describeGestionError(error)),
  };
}

/** Maps the failure of POST/PATCH /productos to field and form messages (server text is never shown). */
export function mapProductoError(error: unknown): CatalogError<ProductoField> {
  return conflictOrFields<ProductoField>(
    error,
    PRODUCTO_DUPLICATE_CODES,
    () => ({ fields: {}, form: PRODUCTO_DUPLICATE_COPY }),
    PRODUCTO_SERVER_COPY,
    (message) =>
      /codigoVariedad/i.test(message) ? { fields: { codigoVariedad: INVALID_VARIEDAD_COPY }, form: null } : null,
  );
}

// ---------- canasta ----------

export interface VariedadFormValues {
  codigo: string;
  nombre: string;
  padre: string;
  categoria: CanastaCategoria | '';
  ponderador: string;
}
export type VariedadField = keyof VariedadFormValues;
export type VariedadFormErrors = Partial<Record<VariedadField, string>>;

/** Non-negative number with dot or comma decimals; null when it is not one. */
export function parsePonderador(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function validateVariedadForm(v: VariedadFormValues): VariedadFormErrors {
  const errors: VariedadFormErrors = {};
  if (!VARIEDAD_CODIGO.test(v.codigo.trim())) errors.codigo = 'El código tiene 7 dígitos.';
  if (v.nombre.trim() === '') errors.nombre = 'Ingrese el nombre.';
  if (!PRODUCTO_NODO_CODIGO.test(v.padre.trim())) errors.padre = 'El código del producto tiene 5 dígitos.';
  if (v.categoria === '') errors.categoria = 'Elija la categoría.';
  if (v.ponderador.trim() !== '' && parsePonderador(v.ponderador) === null) {
    errors.ponderador = 'Ingrese un número mayor o igual a cero, o déjelo vacío.';
  }
  return errors;
}

export function variedadInput(v: VariedadFormValues): CreateVariedadInput {
  const out: CreateVariedadInput = {
    codigo: v.codigo.trim(),
    nombre: v.nombre.trim(),
    padre: v.padre.trim(),
    categoria: v.categoria as CanastaCategoria,
  };
  const ponderador = v.ponderador.trim() === '' ? null : parsePonderador(v.ponderador);
  if (ponderador !== null) out.ponderador = ponderador;
  return out;
}

const VARIEDAD_SERVER_COPY: Record<string, string> = {
  codigo: 'El código tiene 7 dígitos.',
  nombre: 'Ingrese el nombre.',
  padre: 'El código del producto tiene 5 dígitos.',
  categoria: 'Elija una categoría válida.',
  ponderador: 'Ingrese un número mayor o igual a cero.',
};

export function mapVariedadError(error: unknown): CatalogError<VariedadField> {
  return conflictOrFields<VariedadField>(
    error,
    VARIEDAD_DUPLICATE_CODES,
    () => ({ fields: { codigo: 'Ya existe un nodo de la canasta con este código.' }, form: null }),
    VARIEDAD_SERVER_COPY,
    (message) =>
      /padre/i.test(message)
        ? { fields: { padre: 'Elija un producto activo de la canasta (código de 5 dígitos).' }, form: null }
        : null,
  );
}
