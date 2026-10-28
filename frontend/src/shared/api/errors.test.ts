import { describe, expect, it } from 'vitest';
import { ApiError, describeApiError, normalizeApiError } from './errors';

const alerta = { media: 100, desvio: 5, n: 4, limiteInferior: 85, limiteSuperior: 115 };

describe('normalizeApiError', () => {
  it('keeps status and message', () => {
    const e = normalizeApiError(404, { message: 'Not found' }, null);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(404);
    expect(e.message).toBe('Not found');
    expect(e.requiereConfirmacion).toBe(false);
  });
  it('reads validation errors array', () => {
    const e = normalizeApiError(400, { errors: [{ field: 'valor', message: 'must be > 0' }] }, null);
    expect(e.errors).toEqual([{ field: 'valor', message: 'must be > 0' }]);
  });
  it('detects the atypical 409 confirmation flow', () => {
    const e = normalizeApiError(409, { message: 'x', requiereConfirmacion: true, alerta }, null);
    expect(e.requiereConfirmacion).toBe(true);
    expect(e.alerta).toEqual(alerta);
    expect(e.isAtypical()).toBe(true);
  });
  it('reads the percentile alert of the current rule', () => {
    const percentil = {
      metodo: 'PERCENTIL_VARIACION',
      variedad: '1111101',
      precioAnterior: 100,
      variacion: 1.5,
      percentilInferior: 5,
      percentilSuperior: 95,
      limiteInferior: 0.9,
      limiteSuperior: 1.1,
      rangoPrecio: { min: 90, max: 110 },
      n: 25,
    };
    const e = normalizeApiError(409, { message: 'x', requiereConfirmacion: true, alerta: percentil }, null);
    expect(e.alerta).toEqual(percentil);
    expect(e.isAtypical()).toBe(true);
    // A percentile alert missing its price range is not trusted.
    const broken = { ...percentil, rangoPrecio: undefined };
    expect(normalizeApiError(409, { message: 'x', requiereConfirmacion: true, alerta: broken }, null).alerta).toBeNull();
  });
  it('does not treat a plain 409 as atypical', () => {
    const e = normalizeApiError(409, { message: 'duplicate' }, null);
    expect(e.isAtypical()).toBe(false);
  });
  it('keeps the stable code of a 409 and ignores a non-string one', () => {
    expect(normalizeApiError(409, { message: 'x', code: 'USER_DUPLICATE' }, null).code).toBe('USER_DUPLICATE');
    expect(normalizeApiError(409, { message: 'x' }, null).code).toBeNull();
    expect(normalizeApiError(409, { message: 'x', code: 7 }, null).code).toBeNull();
  });
  it('parses Retry-After seconds', () => {
    expect(normalizeApiError(429, {}, '30').retryAfter).toBe(30);
    expect(normalizeApiError(429, {}, 'nope').retryAfter).toBeNull();
  });
  it('survives a non-object body', () => {
    const e = normalizeApiError(500, null, null);
    expect(e.status).toBe(500);
    expect(e.errors).toEqual([]);
  });
});

describe('describeApiError', () => {
  it('maps statuses to Spanish copy without leaking English server text', () => {
    const text = describeApiError(new ApiError({ status: 500, message: 'Internal error' }));
    expect(text).not.toMatch(/Internal/);
    expect(text).toMatch(/servidor/i);
  });
  it('mentions the wait time for 429', () => {
    expect(describeApiError(new ApiError({ status: 429, message: '', retryAfter: 45 }))).toMatch(/45/);
  });
  it('explains network failures (status 0)', () => {
    expect(describeApiError(new ApiError({ status: 0, message: 'Failed to fetch' }))).toMatch(/conexi/i);
  });
  it('uses context for 403 on precios', () => {
    expect(describeApiError(new ApiError({ status: 403, message: 'x' }), 'precio')).toMatch(/visita/i);
  });
  it('401 outside login mentions deactivation', () => {
    const text = describeApiError(new ApiError({ status: 401, message: 'Invalid or expired token' }));
    expect(text).toBe('Su sesión venció o su cuenta fue desactivada. Ingrese de nuevo o consulte con su coordinador.');
  });
  it('maps 400 on password context', () => {
    expect(describeApiError(new ApiError({ status: 400, message: 'x' }), 'password')).toMatch(/revise/i);
  });
});
