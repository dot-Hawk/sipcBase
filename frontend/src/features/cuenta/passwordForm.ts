import { ApiError, describeApiError } from '@/shared/api/errors';

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordFormValues {
  current: string;
  next: string;
  repeat: string;
}
export type PasswordField = keyof PasswordFormValues;
export type PasswordFormErrors = Partial<Record<PasswordField, string>>;

const TOO_SHORT = `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;

export function validatePasswordForm(v: PasswordFormValues): PasswordFormErrors {
  const errors: PasswordFormErrors = {};
  if (!v.current) errors.current = 'Ingrese su contraseña actual.';
  if (v.next.length < MIN_PASSWORD_LENGTH) errors.next = TOO_SHORT;
  else if (v.next === v.current) errors.next = 'La nueva contraseña debe ser distinta de la actual.';
  if (v.repeat !== v.next) errors.repeat = 'Las contraseñas no coinciden.';
  return errors;
}

/** By status/shape: 400 without `errors` is the wrong current password; with `errors` it is validation. */
export function mapPasswordError(error: unknown): { field?: PasswordField; message: string } {
  if (error instanceof ApiError && error.status === 400) {
    if (error.errors.length === 0) return { field: 'current', message: 'La contraseña actual no es correcta.' };
    return { field: 'next', message: TOO_SHORT };
  }
  return { message: describeApiError(error, 'password') };
}
