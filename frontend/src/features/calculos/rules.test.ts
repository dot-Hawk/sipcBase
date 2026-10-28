import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import {
  DEFAULT_FORM,
  describeCalculoConflict,
  formatRelativo,
  mapCalculoServerErrors,
  monthsBetween,
  monthsInRange,
  toCalculoPayload,
  resultadosFilename,
  exportacionFilename,
  validateCalculoForm,
  type CalculoFormValues,
} from './rules';

const form = (over: Partial<CalculoFormValues> = {}): CalculoFormValues => ({ ...DEFAULT_FORM, mesBase: '2026-01', mesObjetivo: '2026-06', ...over });
const conflict = (message: string) => new ApiError({ status: 409, message });

describe('months', () => {
  it('counts the distance between two months', () => {
    expect(monthsBetween('2026-01', '2026-01')).toBe(0);
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
    expect(monthsBetween('2026-05', '2026-01')).toBe(-4);
  });
  it('lists every month of a range, in order', () => {
    expect(monthsInRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsInRange('2026-03', '2026-01')).toEqual([]);
  });
});

describe('validateCalculoForm', () => {
  it('accepts a valid range with the default parameters', () => {
    expect(validateCalculoForm(form())).toEqual({});
  });
  it('requires both months in AAAA-MM', () => {
    expect(validateCalculoForm(form({ mesBase: '' })).mesBase).toMatch(/mes base/i);
    expect(validateCalculoForm(form({ mesBase: '2026-13' })).mesBase).toMatch(/AAAA-MM/);
    expect(validateCalculoForm(form({ mesObjetivo: '26-01' })).mesObjetivo).toMatch(/AAAA-MM/);
  });
  it('requires the target to be the same month or later', () => {
    expect(validateCalculoForm(form({ mesBase: '2026-05', mesObjetivo: '2026-05' }))).toEqual({});
    expect(validateCalculoForm(form({ mesBase: '2026-05', mesObjetivo: '2026-04' })).mesObjetivo).toMatch(/igual o posterior/i);
  });
  it('limits the range to 36 months', () => {
    expect(validateCalculoForm(form({ mesBase: '2023-01', mesObjetivo: '2026-01' }))).toEqual({});
    expect(validateCalculoForm(form({ mesBase: '2023-01', mesObjetivo: '2026-02' })).mesObjetivo).toMatch(/36 meses/);
  });
  it('checks the advanced parameters', () => {
    expect(validateCalculoForm(form({ esperarMeses: '13' })).esperarMeses).toMatch(/0 y 12/);
    expect(validateCalculoForm(form({ esperarMeses: '-1' })).esperarMeses).toBeDefined();
    expect(validateCalculoForm(form({ esperarMeses: '1.5' })).esperarMeses).toBeDefined();
    expect(validateCalculoForm(form({ esperarMeses: '' })).esperarMeses).toBeDefined();
    expect(validateCalculoForm(form({ pesoSuper: '-0,1' })).pesoSuper).toMatch(/0 o mayor/);
    expect(validateCalculoForm(form({ pesoTrad: 'abc' })).pesoTrad).toBeDefined();
    expect(validateCalculoForm(form({ pesoSuper: '0,5', pesoTrad: '0' }))).toEqual({});
  });
});

describe('toCalculoPayload', () => {
  it('sends only the range and the offers flag when the parameters are the defaults', () => {
    expect(toCalculoPayload(form({ excluirOfertas: true }))).toEqual({ mesBase: '2026-01', mesObjetivo: '2026-06', excluirOfertas: true });
  });
  it('sends the full parameters when any differs, reading decimal commas', () => {
    expect(toCalculoPayload(form({ esperarMeses: '3', pesoSuper: '0,3', omitirGruposCompletos: false }))).toEqual({
      mesBase: '2026-01',
      mesObjetivo: '2026-06',
      excluirOfertas: false,
      parametros: { esperarMeses: 3, pesoSuper: 0.3, pesoTrad: 0.75, omitirGruposCompletos: false },
    });
  });
});

describe('mapCalculoServerErrors', () => {
  it('maps fields to Spanish copy, also when nested under parametros', () => {
    const err = new ApiError({
      status: 400,
      message: 'x',
      errors: [
        { field: 'mesObjetivo', message: 'bad' },
        { field: 'parametros.esperarMeses', message: 'bad' },
      ],
    });
    const out = mapCalculoServerErrors(err);
    expect(out.fields.mesObjetivo).toMatch(/36 meses/);
    expect(out.fields.esperarMeses).toMatch(/0 y 12/);
    expect(out.form).toBeNull();
  });
  it('sends unknown fields to a form message and ignores other statuses', () => {
    const out = mapCalculoServerErrors(new ApiError({ status: 400, message: 'x', errors: [{ field: 'zzz', message: 'q' }] }));
    expect(out.form).toMatch(/revise/i);
    expect(mapCalculoServerErrors(conflict('x'))).toEqual({ fields: {}, form: null });
  });
});

describe('describeCalculoConflict (409 by message, the backend sends no code)', () => {
  it('explains each known conflict', () => {
    expect(describeCalculoConflict(conflict('No hay relevamientos para el mes 2026-03'))).toMatch(/2026-03/);
    expect(describeCalculoConflict(conflict('Hay relevamientos abiertos: 2026-02, 2026-03'))).toMatch(/abiertos.*2026-02, 2026-03/i);
    expect(describeCalculoConflict(conflict('No hay precios cargados en el rango indicado'))).toMatch(/no hay precios/i);
    expect(describeCalculoConflict(conflict('Ya hay un cálculo en ejecución: espere a que termine'))).toMatch(/en ejecución/i);
  });
  it('falls back to a generic text for an unknown 409', () => {
    expect(describeCalculoConflict(conflict('something new'))).toMatch(/no se puede/i);
  });
});

describe('formatRelativo', () => {
  it('formats with four decimals (es-AR) and returns null for no data', () => {
    expect(formatRelativo(1.05)).toBe('1,0500');
    expect(formatRelativo(null)).toBeNull();
  });
});

describe('file names', () => {
  it('names the results and the input files after the range', () => {
    expect(resultadosFilename({ mesBase: '2026-01', mesObjetivo: '2026-06' }, 'xlsx')).toBe('calculo_2026-01_2026-06.xlsx');
    expect(exportacionFilename({ mesBase: '2026-01', mesObjetivo: '2026-06', formato: 'csv' })).toBe('entrada_2026-01_2026-06.csv');
    expect(exportacionFilename({ mesBase: '2026-01', mesObjetivo: '2026-06' })).toBe('entrada_2026-01_2026-06.xlsx');
  });
});
