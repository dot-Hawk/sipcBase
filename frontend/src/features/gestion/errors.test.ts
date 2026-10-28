import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { describeGestionError, mapFieldErrors } from './errors';

const api = (status: number, errors: { field: string; message: string }[] = []) =>
  new ApiError({ status, message: 'x', errors });

describe('mapFieldErrors', () => {
  it('maps known fields to Spanish copy and ignores the English server text', () => {
    const out = mapFieldErrors(api(400, [{ field: 'email', message: 'email must be a valid email address' }]), {
      email: 'Ingrese un correo válido.',
    });
    expect(out.fields).toEqual({ email: 'Ingrese un correo válido.' });
    expect(out.form).toBeNull();
  });
  it('sends unknown fields to a form-level message', () => {
    const out = mapFieldErrors(api(400, [{ field: 'body', message: 'send at least one' }]), { email: 'x' });
    expect(out.fields).toEqual({});
    expect(out.form).toMatch(/revise/i);
  });
  it('returns nothing for non-400 errors', () => {
    expect(mapFieldErrors(api(409), { email: 'x' })).toEqual({ fields: {}, form: null });
  });
});

describe('describeGestionError', () => {
  it('covers network, auth, permission, missing and server errors', () => {
    expect(describeGestionError(api(0))).toMatch(/conexión/i);
    expect(describeGestionError(api(401))).toMatch(/sesión/i);
    expect(describeGestionError(api(403))).toMatch(/permiso/i);
    expect(describeGestionError(api(404))).toMatch(/ya no existe/i);
    expect(describeGestionError(api(500))).toMatch(/servidor/i);
  });
  it('uses the caller copy for a 409', () => {
    expect(describeGestionError(api(409), 'Ya existe.')).toBe('Ya existe.');
    expect(describeGestionError(api(409))).toMatch(/actualice/i);
  });
  it('does not leak the server message', () => {
    expect(describeGestionError(new ApiError({ status: 418, message: 'secret internals' }))).not.toMatch(/secret/);
    expect(describeGestionError(new Error('boom'))).toMatch(/inesperado/i);
  });
});
