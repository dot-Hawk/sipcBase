import { describe, expect, it } from 'vitest';
import type { ManagedUser } from '@/shared/api/types';
import { ApiError } from '@/shared/api/errors';
import { changedFields, LAST_COORDINADOR_COPY, mapUserConflict, validateResetPassword, validateUserForm } from './rules';

const base = {
  nombre: 'Ana',
  apellido: 'Paz',
  dni: '30111222',
  legajo: 'ENC-9',
  email: 'ana@sipc.test',
  role: 'ENCUESTADOR' as const,
  password: 'password1',
};

describe('validateUserForm', () => {
  it('accepts a complete create form', () => {
    expect(validateUserForm(base, 'create')).toEqual({});
  });
  it('requires every text field, a valid email, a role and an 8+ password on create', () => {
    const e = validateUserForm({ ...base, nombre: ' ', dni: '', email: 'x', password: 'short' }, 'create');
    expect(Object.keys(e).sort()).toEqual(['dni', 'email', 'nombre', 'password']);
  });
  it('does not ask for a password on edit', () => {
    expect(validateUserForm({ ...base, password: '' }, 'edit')).toEqual({});
  });
});

describe('changedFields', () => {
  const user: ManagedUser = { id: 'u', nombre: 'Ana', apellido: 'Paz', dni: '30111222', legajo: 'ENC-9', email: 'ana@sipc.test', role: 'ENCUESTADOR', estado: 'ACTIVO' };
  it('sends only what changed, trimmed', () => {
    expect(changedFields(user, { ...base, nombre: '  Anita ', email: 'ANA@sipc.test' }, false)).toEqual({ nombre: 'Anita' });
  });
  it('never sends role for the signed-in coordinator (the API answers 403)', () => {
    expect(changedFields(user, { ...base, role: 'ANALISTA' }, true)).toEqual({});
    expect(changedFields(user, { ...base, role: 'ANALISTA' }, false)).toEqual({ role: 'ANALISTA' });
  });
  it('returns an empty object when nothing changed', () => {
    expect(changedFields(user, base, false)).toEqual({});
  });
});

describe('validateResetPassword', () => {
  it('needs 8+ characters and a matching repeat', () => {
    expect(validateResetPassword({ password: 'short', repeat: 'short' }).password).toBeDefined();
    expect(validateResetPassword({ password: 'longenough', repeat: 'different' }).repeat).toBeDefined();
    expect(validateResetPassword({ password: 'longenough', repeat: 'longenough' })).toEqual({});
  });
});

describe('mapUserConflict', () => {
  const dup = (errors: { field: string; message: string }[]) =>
    new ApiError({ status: 409, message: 'A user with this dni, legajo or email already exists', code: 'USER_DUPLICATE', errors });

  it('puts each collided field on its own form field', () => {
    const out = mapUserConflict(dup([{ field: 'dni', message: 'x' }, { field: 'email', message: 'y' }]));
    expect(out.fields.dni).toMatch(/DNI/);
    expect(out.fields.email).toMatch(/correo/i);
    expect(out.fields.legajo).toBeUndefined();
    expect(out.form).toBeNull();
  });
  it('names the three fields at form level when the server could not tell which', () => {
    const out = mapUserConflict(dup([]));
    expect(out.fields).toEqual({});
    expect(out.form).toMatch(/DNI/);
    expect(out.form).toMatch(/legajo/i);
    expect(out.form).toMatch(/correo/i);
  });
  it('ignores fields the form does not have and falls back to the form-level message', () => {
    const out = mapUserConflict(dup([{ field: 'nombre', message: 'x' }]));
    expect(out.fields).toEqual({});
    expect(out.form).toMatch(/DNI/);
  });
  it('a 409 without code (older backend) uses the same form-level message', () => {
    const out = mapUserConflict(new ApiError({ status: 409, message: 'A user with this dni, legajo or email already exists' }));
    expect(out.form).toMatch(/DNI/);
  });
  it('an unknown code degrades to the generic conflict message', () => {
    const out = mapUserConflict(new ApiError({ status: 409, message: 'x', code: 'NEW_THING' }));
    expect(out.fields).toEqual({});
    expect(out.form).toMatch(/conflicto/i);
  });
});

describe('LAST_COORDINADOR', () => {
  it('is a form-level message, never a duplicate field error', () => {
    const err = new ApiError({ status: 409, message: 'The system cannot be left without an active coordinador', code: 'LAST_COORDINADOR' });
    expect(mapUserConflict(err)).toEqual({ fields: {}, form: LAST_COORDINADOR_COPY });
    expect(LAST_COORDINADOR_COPY).toMatch(/coordinador activo/i);
  });
});
