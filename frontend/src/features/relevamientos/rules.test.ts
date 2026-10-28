import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { periodoHint, suggestDates, toRelevamientoPayload, validateRelevamientoForm, mapRelevamientoServerErrors } from './rules';

const ok = { frecuencia: 'MENSUAL', periodo: '2026-11', fechaInicio: '2026-11-01', fechaLimite: '2026-11-30' } as const;

describe('validateRelevamientoForm', () => {
  it('accepts a complete mensual form', () => {
    expect(validateRelevamientoForm(ok)).toEqual({});
  });
  it('requires the periodo format of the frecuencia', () => {
    expect(validateRelevamientoForm({ ...ok, periodo: '2026-13' }).periodo).toBeDefined();
    expect(validateRelevamientoForm({ ...ok, periodo: '2026-11-Q1' }).periodo).toBeDefined();
    expect(validateRelevamientoForm({ ...ok, frecuencia: 'QUINCENAL', periodo: '2026-11-Q2' })).toEqual({});
    expect(validateRelevamientoForm({ ...ok, frecuencia: 'QUINCENAL', periodo: '2026-11' }).periodo).toBeDefined();
  });
  it('requires both dates (the server does not check them) and a sane order', () => {
    expect(validateRelevamientoForm({ ...ok, fechaInicio: '' }).fechaInicio).toBeDefined();
    expect(validateRelevamientoForm({ ...ok, fechaLimite: '' }).fechaLimite).toBeDefined();
    expect(validateRelevamientoForm({ ...ok, fechaLimite: '2026-10-31' }).fechaLimite).toMatch(/posterior|anterior/i);
  });
});

describe('date rules shared with the server', () => {
  it('the limit must be strictly after the start (the server rejects equal dates)', () => {
    expect(validateRelevamientoForm({ ...ok, fechaLimite: '2026-11-01' }).fechaLimite).toMatch(/posterior/i);
  });
  it('rejects an impossible calendar day', () => {
    expect(validateRelevamientoForm({ ...ok, fechaInicio: '2026-02-31' }).fechaInicio).toBeDefined();
    expect(validateRelevamientoForm({ ...ok, fechaLimite: '2026-13-01' }).fechaLimite).toBeDefined();
  });
});

describe('mapRelevamientoServerErrors', () => {
  const bad = (errors: { field: string; message: string }[]) => new ApiError({ status: 400, message: 'x', errors });
  it('maps server date errors to the exact date field in Spanish', () => {
    const out = mapRelevamientoServerErrors(
      bad([
        { field: 'fechaInicio', message: 'fechaInicio is required and must be a valid ISO date' },
        { field: 'fechaLimite', message: 'fechaLimite must be after fechaInicio' },
      ]),
    );
    expect(out.fields.fechaInicio).toMatch(/fecha de inicio/i);
    expect(out.fields.fechaLimite).toMatch(/posterior/i);
    expect(out.form).toBeNull();
  });
  it('distinguishes a missing/invalid limit from an order problem', () => {
    const out = mapRelevamientoServerErrors(bad([{ field: 'fechaLimite', message: 'fechaLimite is required and must be a valid ISO date' }]));
    expect(out.fields.fechaLimite).toMatch(/válida/i);
  });
  it('unknown fields become a form-level message', () => {
    expect(mapRelevamientoServerErrors(bad([{ field: 'zzz', message: 'x' }])).form).toMatch(/no válidos/i);
  });
});

describe('payload and helpers', () => {
  it('sends UTC midnight ISO dates', () => {
    expect(toRelevamientoPayload(ok)).toEqual({
      periodo: '2026-11',
      frecuencia: 'MENSUAL',
      fechaInicio: '2026-11-01T00:00:00.000Z',
      fechaLimite: '2026-11-30T00:00:00.000Z',
    });
  });
  it('suggests the whole month, or a half for quincenal', () => {
    expect(suggestDates('MENSUAL', '2026-02')).toEqual({ fechaInicio: '2026-02-01', fechaLimite: '2026-02-28' });
    expect(suggestDates('QUINCENAL', '2026-11-Q1')).toEqual({ fechaInicio: '2026-11-01', fechaLimite: '2026-11-15' });
    expect(suggestDates('QUINCENAL', '2026-11-Q2')).toEqual({ fechaInicio: '2026-11-16', fechaLimite: '2026-11-30' });
    expect(suggestDates('MENSUAL', 'nada')).toBeNull();
  });
  it('explains the format', () => {
    expect(periodoHint('MENSUAL')).toMatch(/AAAA-MM/);
    expect(periodoHint('QUINCENAL')).toMatch(/Q1/);
  });
});
