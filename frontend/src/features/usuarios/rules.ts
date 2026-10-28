import { describeGestionError } from '@/features/gestion/errors';
import type { ApiError } from '@/shared/api/errors';
import type { ManagedUser, Role, UpdateUserInput } from '@/shared/api/types';

export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserFormValues {
  nombre: string;
  apellido: string;
  dni: string;
  legajo: string;
  email: string;
  role: Role;
  password: string;
}
export type UserField = keyof UserFormValues;
export type UserFormErrors = Partial<Record<UserField, string>>;

const REQUIRED: { key: 'nombre' | 'apellido' | 'dni' | 'legajo'; label: string }[] = [
  { key: 'nombre', label: 'el nombre' },
  { key: 'apellido', label: 'el apellido' },
  { key: 'dni', label: 'el DNI' },
  { key: 'legajo', label: 'el legajo' },
];

export function validateUserForm(v: UserFormValues, mode: 'create' | 'edit'): UserFormErrors {
  const errors: UserFormErrors = {};
  for (const f of REQUIRED) {
    if (v[f.key].trim() === '') errors[f.key] = `Ingrese ${f.label}.`;
  }
  if (!EMAIL_FORMAT.test(v.email.trim())) errors.email = 'Ingrese un correo válido, por ejemplo nombre@organismo.gob.ar.';
  if (mode === 'create' && v.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return errors;
}

/**
 * PATCH body of an edit: only what changed (the API needs at least one field).
 * The signed-in coordinator's `role` is never sent: the API answers 403 even for an unchanged role.
 */
export function changedFields(user: ManagedUser, v: UserFormValues, isSelf: boolean): UpdateUserInput {
  const out: UpdateUserInput = {};
  for (const key of ['nombre', 'apellido', 'dni', 'legajo'] as const) {
    const next = v[key].trim();
    if (next !== user[key]) out[key] = next;
  }
  const email = v.email.trim().toLowerCase();
  if (email !== user.email.trim().toLowerCase()) out.email = email;
  if (!isSelf && v.role !== user.role) out.role = v.role;
  return out;
}

export interface ResetValues {
  password: string;
  repeat: string;
}

export function validateResetPassword(v: ResetValues): Partial<Record<keyof ResetValues, string>> {
  const errors: Partial<Record<keyof ResetValues, string>> = {};
  if (v.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (v.repeat !== v.password) errors.repeat = 'Las contraseñas no coinciden.';
  return errors;
}

export const DUPLICATE_COPY = 'El DNI, el legajo o el correo ya pertenece a otro usuario. Revise cuál se repite.';

const DUPLICATE_FIELD_COPY: Partial<Record<UserField, string>> = {
  dni: 'Ya existe un usuario con este DNI.',
  legajo: 'Ya existe un usuario con este legajo.',
  email: 'Ya existe un usuario con este correo.',
};

export const LAST_COORDINADOR_COPY =
  'No se puede dejar el sistema sin un coordinador activo. Designe o active a otro coordinador antes de hacer este cambio.';

export interface UserConflict {
  fields: Partial<Record<UserField, string>>;
  form: string | null;
}

/**
 * 409 of POST/PATCH /users. `USER_DUPLICATE` carries `errors[].field` (dni | legajo | email; it may
 * be empty when the driver gave no detail). Without `code` (older backend) any 409 is read as the
 * duplicate, as before; an unknown code is a generic conflict.
 */
export function mapUserConflict(error: ApiError): UserConflict {
  if (error.code === 'LAST_COORDINADOR') return { fields: {}, form: LAST_COORDINADOR_COPY };
  if (error.code !== null && error.code !== 'USER_DUPLICATE') {
    return { fields: {}, form: describeGestionError(error) };
  }
  const fields: UserConflict['fields'] = {};
  for (const e of error.errors) {
    const copy = DUPLICATE_FIELD_COPY[e.field as UserField];
    if (copy) fields[e.field as UserField] = copy;
  }
  return Object.keys(fields).length > 0 ? { fields, form: null } : { fields: {}, form: DUPLICATE_COPY };
}
