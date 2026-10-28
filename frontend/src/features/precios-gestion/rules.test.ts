import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import type { Alerta, Precio, Relevamiento } from '@/shared/api/types';
import {
  MAX_OBSERVACION,
  canCorrectPrecios,
  canListUsers,
  correctionBlockedReason,
  formFromPrecio,
  mapCorrectionError,
  validateCorrection,
} from './rules';

const precio: Precio = {
  id: 'p1',
  relevamiento: 'r1',
  producto: 'pr1',
  comercio: 'c1',
  encuestador: 'e1',
  valor: 1500,
  oferta: false,
  fechaRelevamiento: '2026-10-08T12:00:00.000Z',
  observacion: 'Sin stock de la marca habitual',
  alerta: null,
  createdAt: '2026-10-08T12:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
};
const rel = (estado: Relevamiento['estado']): Relevamiento => ({
  id: 'r1', periodo: '2026-10', frecuencia: 'MENSUAL', fechaInicio: '', fechaLimite: '', estado, createdAt: '', updatedAt: '',
});
const alerta: Alerta = { media: 1000, desvio: 20, n: 4, limiteInferior: 900, limiteSuperior: 1100 };

describe('who may correct', () => {
  it('only SUPERVISOR and ANALISTA (the PATCH guard of the backend)', () => {
    expect(canCorrectPrecios('SUPERVISOR')).toBe(true);
    expect(canCorrectPrecios('ANALISTA')).toBe(true);
    for (const r of ['COORDINADOR', 'DIRECCION', 'ENCUESTADOR'] as const) expect(canCorrectPrecios(r)).toBe(false);
  });
  it('only the COORDINADOR can list users (the whole /users router is his)', () => {
    expect(canListUsers('COORDINADOR')).toBe(true);
    for (const r of ['SUPERVISOR', 'ANALISTA', 'DIRECCION'] as const) expect(canListUsers(r)).toBe(false);
  });
});

describe('correctionBlockedReason', () => {
  it('explains a closed relevamiento', () => {
    expect(correctionBlockedReason(rel('CERRADO'))).toMatch(/cerrado/i);
  });
  it('lets an open or unknown relevamiento through (the server decides)', () => {
    expect(correctionBlockedReason(rel('ABIERTO'))).toBeNull();
    expect(correctionBlockedReason(undefined)).toBeNull();
  });
});

describe('validateCorrection', () => {
  it('starts from the current values and asks for a change', () => {
    const form = formFromPrecio(precio);
    expect(form).toEqual({ valor: '1500', oferta: false, observacion: 'Sin stock de la marca habitual' });
    const r = validateCorrection(form, precio);
    expect(r.changes).toBeNull();
    expect(r.errors.form).toMatch(/cambie al menos un dato/i);
  });
  it('sends only what changed', () => {
    const r = validateCorrection({ valor: '1.650,50', oferta: false, observacion: precio.observacion ?? '' }, precio);
    expect(r.errors).toEqual({});
    expect(r.changes).toEqual({ valor: 1650.5 });
  });
  it('sends oferta and a trimmed observacion when they change', () => {
    const r = validateCorrection({ valor: '1500', oferta: true, observacion: '  Oferta de cartel  ' }, precio);
    expect(r.changes).toEqual({ oferta: true, observacion: 'Oferta de cartel' });
  });
  it('clears the observacion with null when it is emptied', () => {
    const r = validateCorrection({ valor: '1500', oferta: false, observacion: '   ' }, precio);
    expect(r.changes).toEqual({ observacion: null });
  });
  it('does not send a cleared observacion when there was none', () => {
    const r = validateCorrection({ valor: '1600', oferta: false, observacion: '' }, { ...precio, observacion: null });
    expect(r.changes).toEqual({ valor: 1600 });
  });
  it('rejects an empty, zero or unparseable valor', () => {
    for (const valor of ['', '0', 'abc', '-5']) {
      const r = validateCorrection({ valor, oferta: false, observacion: '' }, precio);
      expect(r.errors.valor).toMatch(/mayor a 0/i);
      expect(r.changes).toBeNull();
    }
  });
  it('rejects an observacion over the backend limit', () => {
    const r = validateCorrection({ valor: '1500', oferta: false, observacion: 'x'.repeat(MAX_OBSERVACION + 1) }, precio);
    expect(r.errors.observacion).toMatch(/500/);
  });
});

/** The non-atypical outcomes always carry `fields` and `form`. */
function failureOf(error: unknown) {
  const m = mapCorrectionError(error);
  if (m.kind === 'atypical') throw new Error('unexpected atypical outcome');
  return m;
}

describe('mapCorrectionError', () => {
  it('reads the soft-stop 409 as a typical-price confirmation, not an error', () => {
    const e = new ApiError({ status: 409, message: 'x', requiereConfirmacion: true, alerta });
    expect(mapCorrectionError(e)).toEqual({ kind: 'atypical', alerta });
  });
  it('maps the stable code of a closed relevamiento', () => {
    const e = new ApiError({ status: 409, message: 'whatever', code: 'RELEVAMIENTO_NOT_ABIERTO' });
    expect(mapCorrectionError(e)).toMatchObject({ kind: 'closed' });
  });
  it('falls back to the English message when the 409 has no code (today the backend sends none)', () => {
    const e = new ApiError({ status: 409, message: 'Relevamiento is not ABIERTO' });
    expect(mapCorrectionError(e)).toMatchObject({ kind: 'closed' });
  });
  it('degrades an unknown code or unknown 409 text to a generic conflict', () => {
    expect(mapCorrectionError(new ApiError({ status: 409, message: 'x', code: 'FUTURE' }))).toMatchObject({ kind: 'conflict' });
    expect(mapCorrectionError(new ApiError({ status: 409, message: 'The asignacion is no longer EN_CURSO' }))).toMatchObject({ kind: 'conflict' });
  });
  it('maps 404 to a vanished precio and 403 to missing permission', () => {
    expect(mapCorrectionError(new ApiError({ status: 404, message: 'Precio not found' }))).toMatchObject({ kind: 'gone' });
    expect(mapCorrectionError(new ApiError({ status: 403, message: 'x' }))).toMatchObject({ kind: 'forbidden' });
  });
  it('maps 400 errors[] to the form fields', () => {
    const e = new ApiError({
      status: 400,
      message: 'x',
      errors: [{ field: 'valor', message: 'valor must be a number greater than 0' }, { field: 'observacion', message: 'too long' }],
    });
    const m = failureOf(e);
    expect(m.kind).toBe('invalid');
    expect(m.fields.valor).toMatch(/mayor a 0/i);
    expect(m.fields.observacion).toMatch(/500/);
  });
  it('sends an unrecognised body field error to the form message', () => {
    const e = new ApiError({ status: 400, message: 'x', errors: [{ field: 'body', message: 'at least one' }] });
    const m = failureOf(e);
    expect(m.fields).toEqual({});
    expect(m.form).toMatch(/no válidos|cambie/i);
  });
  it('uses the shared copy for network and server failures', () => {
    expect(failureOf(new ApiError({ status: 0, message: 'Network error' })).form).toMatch(/conexión/i);
    expect(failureOf(new ApiError({ status: 500, message: 'x' })).form).toMatch(/servidor/i);
  });
});
