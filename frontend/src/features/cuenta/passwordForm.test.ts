import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { mapPasswordError, validatePasswordForm } from './passwordForm';

const ok = { current: 'old-password', next: 'new-password', repeat: 'new-password' };

describe('validatePasswordForm', () => {
  it('passes a valid form', () => expect(validatePasswordForm(ok)).toEqual({}));
  it('requires the current password', () => {
    expect(validatePasswordForm({ ...ok, current: '' }).current).toBe('Ingrese su contraseña actual.');
  });
  it('requires 8+ characters', () => {
    expect(validatePasswordForm({ ...ok, next: 'short', repeat: 'short' }).next).toMatch(/al menos 8/);
  });
  it('requires a new password different from the current', () => {
    expect(validatePasswordForm({ current: 'same-password', next: 'same-password', repeat: 'same-password' }).next)
      .toMatch(/distinta/);
  });
  it('requires the confirmation to match', () => {
    expect(validatePasswordForm({ ...ok, repeat: 'other-password' }).repeat).toBe('Las contraseñas no coinciden.');
  });
});

describe('mapPasswordError', () => {
  it('400 without field errors means wrong current password', () => {
    expect(mapPasswordError(new ApiError({ status: 400, message: 'The current password is not correct' })))
      .toEqual({ field: 'current', message: 'La contraseña actual no es correcta.' });
  });
  it('400 with validation errors targets the new password', () => {
    const e = new ApiError({ status: 400, message: 'x', errors: [{ field: 'newPassword', message: 'min' }] });
    expect(mapPasswordError(e)).toEqual({
      field: 'next',
      message: 'La nueva contraseña debe tener al menos 8 caracteres.',
    });
  });
  it('429 and network use generic Spanish copy', () => {
    expect(mapPasswordError(new ApiError({ status: 429, message: '', retryAfter: 30 })).message).toMatch(/30 segundos/);
    expect(mapPasswordError(new ApiError({ status: 0, message: '' })).message).toMatch(/conexión/);
  });
});
