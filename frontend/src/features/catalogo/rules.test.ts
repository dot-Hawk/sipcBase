import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import type { Comercio, Producto } from '@/shared/api/types';
import {
  comercioChanges,
  formatCantidad,
  matchesSearch,
  normalizeText,
  paginate,
  parseCantidad,
  productoChanges,
  mapProductoError,
  mapVariedadError,
  validateComercioForm,
  validateProductoForm,
  validateVariedadForm,
} from './rules';

const comercio: Comercio = {
  id: 'c1', nombre: 'Almacén Don Julio', direccion: 'Belgrano 1220', zona: 'Centro', tipo: 'ALMACEN',
  estado: 'ACTIVO', createdAt: '', updatedAt: '',
};
const producto: Producto = {
  id: 'p1', nombre: 'Arroz largo fino', categoria: 'Almacén', unidad: 'KG', cantidadReferencia: 1, marca: 'Gallo',
  codigoVariedad: '1112101', estado: 'ACTIVO', createdAt: '', updatedAt: '',
};

describe('text search', () => {
  it('ignores case and accents', () => {
    expect(normalizeText('  Almacén ')).toBe('almacen');
    expect(matchesSearch(['Almacén Don Julio', null], 'ALMACEN')).toBe(true);
    expect(matchesSearch(['Belgrano 1220'], 'don')).toBe(false);
    expect(matchesSearch(['x'], '   ')).toBe(true);
  });
});

describe('paginate', () => {
  it('slices a client-side page and reports the range', () => {
    const rows = Array.from({ length: 53 }, (_, i) => i);
    expect(paginate(rows, 1, 25).items).toHaveLength(25);
    expect(paginate(rows, 3, 25).items).toEqual([50, 51, 52]);
    expect(paginate(rows, 9, 25).page).toBe(3);
  });
});

describe('comercio form', () => {
  it('requires every text field and a tipo', () => {
    const e = validateComercioForm({ nombre: ' ', direccion: '', zona: '  ', tipo: '' });
    expect(Object.keys(e).sort()).toEqual(['direccion', 'nombre', 'tipo', 'zona']);
    expect(validateComercioForm({ nombre: 'A', direccion: 'B', zona: 'C', tipo: 'OTRO' })).toEqual({});
  });
  it('sends only what changed, trimmed (the API needs at least one field)', () => {
    const values = { nombre: ' Almacén Don Julio ', direccion: 'Belgrano 1300', zona: 'Centro', tipo: 'ALMACEN' as const };
    expect(comercioChanges(comercio, values)).toEqual({ direccion: 'Belgrano 1300' });
    expect(comercioChanges(comercio, { ...values, direccion: comercio.direccion })).toEqual({});
  });
});

describe('cantidad', () => {
  it('reads dot and comma decimals and rejects zero and text', () => {
    expect(parseCantidad('1,5')).toBe(1.5);
    expect(parseCantidad('500')).toBe(500);
    expect(parseCantidad('0.25')).toBe(0.25);
    expect(parseCantidad('0')).toBeNull();
    expect(parseCantidad('-1')).toBeNull();
    expect(parseCantidad('1,2,3')).toBeNull();
    expect(parseCantidad('abc')).toBeNull();
    expect(parseCantidad('')).toBeNull();
  });
  it('formats with its unit', () => {
    expect(formatCantidad(1.5, 'LT')).toBe('1,5 L');
    expect(formatCantidad(500, 'G')).toBe('500 g');
    expect(formatCantidad(1, 'UNIDAD')).toBe('1 unidad');
    expect(formatCantidad(12, 'UNIDAD')).toBe('12 unidades');
  });
});

describe('producto form', () => {
  const ok = { nombre: 'A', categoria: 'B', unidad: 'KG' as const, cantidadReferencia: '1', marca: '', codigoVariedad: '1112101' };
  it('validates the required fields, the 7 digit variedad and a positive quantity', () => {
    expect(validateProductoForm(ok, 'create')).toEqual({});
    const e = validateProductoForm({ ...ok, nombre: '', categoria: ' ', unidad: '', cantidadReferencia: '0', codigoVariedad: '12' }, 'create');
    expect(Object.keys(e).sort()).toEqual(['cantidadReferencia', 'categoria', 'codigoVariedad', 'nombre', 'unidad']);
  });
  it('cannot clear an existing marca: the API rejects null and empty text', () => {
    expect(validateProductoForm({ ...ok, marca: '' }, 'edit', producto).marca).toMatch(/no se puede quitar/i);
    expect(validateProductoForm({ ...ok, marca: '' }, 'edit', { ...producto, marca: null }).marca).toBeUndefined();
  });
  it('sends only the changed fields', () => {
    const values = { nombre: 'Arroz largo fino', categoria: 'Almacén', unidad: 'KG' as const, cantidadReferencia: '1,0', marca: 'Gallo ', codigoVariedad: '1112101' };
    expect(productoChanges(producto, values)).toEqual({});
    expect(productoChanges(producto, { ...values, cantidadReferencia: '2', marca: 'Otra' })).toEqual({
      cantidadReferencia: 2,
      marca: 'Otra',
    });
  });
});

describe('variedad form', () => {
  const ok = { codigo: '1111103', nombre: 'Pan', padre: '11111', categoria: 'NUCLEO' as const, ponderador: '' };
  it('validates codigo (7 digits), padre (5 digits), nombre, categoria and an optional ponderador >= 0', () => {
    expect(validateVariedadForm(ok)).toEqual({});
    expect(validateVariedadForm({ ...ok, ponderador: '0,05' })).toEqual({});
    const e = validateVariedadForm({ codigo: '111', nombre: '', padre: '1', categoria: '', ponderador: '-1' });
    expect(Object.keys(e).sort()).toEqual(['categoria', 'codigo', 'nombre', 'padre', 'ponderador']);
  });
});

describe('409 and 400 mapping', () => {
  const err = (status: number, over: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
    new ApiError({ status, message: 'm', ...over });

  it('a producto 409 is the duplicate identity, with or without a code', () => {
    expect(mapProductoError(err(409)).form).toMatch(/mismo nombre, marca, unidad y cantidad/i);
    expect(mapProductoError(err(409, { code: 'PRODUCTO_DUPLICATE' })).form).toMatch(/mismo nombre/i);
  });
  it('an unknown 409 code degrades to the generic conflict message', () => {
    const m = mapProductoError(err(409, { code: 'SOMETHING_NEW' }));
    expect(m.form).toMatch(/conflicto/i);
  });
  it('a producto 400 with only a message about codigoVariedad lands on that field', () => {
    const m = mapProductoError(err(400, { message: 'codigoVariedad must be an existing active variedad of the canasta' }));
    expect(m.fields.codigoVariedad).toMatch(/variedad activa/i);
  });
  it('a producto 400 with errors[] maps each field', () => {
    const m = mapProductoError(err(400, { errors: [{ field: 'cantidadReferencia', message: 'x' }] }));
    expect(m.fields.cantidadReferencia).toBeTruthy();
  });
  it('a variedad 409 is the codigo field', () => {
    expect(mapVariedadError(err(409)).fields.codigo).toMatch(/ya existe/i);
  });
  it('a variedad 400 about padre lands on padre', () => {
    expect(mapVariedadError(err(400, { message: 'padre must be an existing active producto' })).fields.padre).toMatch(/producto activo/i);
  });
});
