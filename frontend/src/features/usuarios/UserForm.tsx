import { useRef, useState, type FormEvent } from 'react';
import { roleLabel } from '@/app/roles';
import { ApiError } from '@/shared/api/errors';
import type { ManagedUser, Role } from '@/shared/api/types';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { describeGestionError, mapFieldErrors } from '@/features/gestion/errors';
import { useCreateUser, useUpdateUser } from '@/features/gestion/queries';
import { FormField } from '@/features/gestion/ui/FormField';
import {
  MIN_PASSWORD_LENGTH,
  changedFields,
  mapUserConflict,
  validateUserForm,
  type UserField,
  type UserFormErrors,
  type UserFormValues,
} from './rules';

const FORM_ID = 'user-form';
export const ROLES: readonly Role[] = ['ENCUESTADOR', 'SUPERVISOR', 'ANALISTA', 'COORDINADOR', 'DIRECCION', 'AUDITOR'];

const SERVER_COPY: Record<string, string> = {
  nombre: 'Ingrese el nombre.',
  apellido: 'Ingrese el apellido.',
  dni: 'Ingrese el DNI.',
  legajo: 'Ingrese el legajo.',
  email: 'Ingrese un correo válido.',
  password: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  role: 'Elija un rol válido.',
};

interface Props {
  /** Present when editing. */
  user?: ManagedUser;
  isSelf?: boolean;
  blockedReason: string | null;
  onClose: () => void;
}

const ORDER: UserField[] = ['nombre', 'apellido', 'dni', 'legajo', 'email', 'role', 'password'];

export function UserForm({ user, isSelf = false, blockedReason, onClose }: Props) {
  const mode = user ? 'edit' : 'create';
  const create = useCreateUser();
  const update = useUpdateUser();
  const toast = useToast();
  const busy = create.isPending || update.isPending;
  const [values, setValues] = useState<UserFormValues>({
    nombre: user?.nombre ?? '',
    apellido: user?.apellido ?? '',
    dni: user?.dni ?? '',
    legajo: user?.legajo ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'ENCUESTADOR',
    password: '',
  });
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<UserField, HTMLElement | null>>>({});
  const ref = (k: UserField) => (el: HTMLElement | null) => {
    refs.current[k] = el;
  };
  const text = (k: 'nombre' | 'apellido' | 'dni' | 'legajo' | 'email') => ({
    value: values[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });

  function focusFirst(found: UserFormErrors) {
    const first = ORDER.find((k) => found[k]);
    if (first) refs.current[first]?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || blockedReason) return;
    const found = validateUserForm(values, mode);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    try {
      if (user) {
        const changes = changedFields(user, values, isSelf);
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await update.mutateAsync({ id: user.id, changes });
        toast(`Datos de ${values.nombre.trim()} ${values.apellido.trim()} actualizados.`);
      } else {
        await create.mutateAsync({
          nombre: values.nombre.trim(),
          apellido: values.apellido.trim(),
          dni: values.dni.trim(),
          legajo: values.legajo.trim(),
          email: values.email.trim(),
          role: values.role,
          password: values.password,
        });
        toast(`Usuario ${values.nombre.trim()} ${values.apellido.trim()} creado.`);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const conflict = mapUserConflict(err);
        setErrors(conflict.fields);
        setFormError(conflict.form);
        focusFirst(conflict.fields);
        return;
      }
      if (err instanceof ApiError && err.status === 403 && user) {
        setFormError('No puede cambiar su propio rol.');
        return;
      }
      const mapped = mapFieldErrors(err, SERVER_COPY);
      if (Object.keys(mapped.fields).length > 0) {
        setErrors(mapped.fields as UserFormErrors);
        focusFirst(mapped.fields as UserFormErrors);
      }
      if (mapped.form || Object.keys(mapped.fields).length === 0) setFormError(mapped.form ?? describeGestionError(err));
    }
  }

  return (
    <Dialog
      title={user ? 'Editar usuario' : 'Nuevo usuario'}
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={busy || Boolean(blockedReason)}>
            {busy ? 'Guardando…' : user ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={submit} noValidate>
        <div className="admin-form__row">
          <FormField label="Nombre" error={errors.nombre}>
            {(p) => <input {...p} ref={ref('nombre')} className="input" autoComplete="off" {...text('nombre')} />}
          </FormField>
          <FormField label="Apellido" error={errors.apellido}>
            {(p) => <input {...p} ref={ref('apellido')} className="input" autoComplete="off" {...text('apellido')} />}
          </FormField>
        </div>
        <div className="admin-form__row">
          <FormField label="DNI" error={errors.dni}>
            {(p) => <input {...p} ref={ref('dni')} className="input" inputMode="numeric" autoComplete="off" {...text('dni')} />}
          </FormField>
          <FormField label="Legajo" error={errors.legajo}>
            {(p) => <input {...p} ref={ref('legajo')} className="input" autoComplete="off" {...text('legajo')} />}
          </FormField>
        </div>
        <FormField label="Correo" error={errors.email}>
          {(p) => <input {...p} ref={ref('email')} className="input" type="email" autoComplete="off" {...text('email')} />}
        </FormField>
        <FormField
          label="Rol"
          error={errors.role}
          hint={isSelf ? 'No puede cambiar su propio rol.' : undefined}
        >
          {(p) => (
            <select
              {...p}
              ref={ref('role')}
              className="select"
              disabled={isSelf}
              value={values.role}
              onChange={(e) => setValues((v) => ({ ...v, role: e.target.value as Role }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {mode === 'create' && (
          <FormField
            label="Contraseña inicial"
            hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres. Comuníquela por un canal seguro.`}
            error={errors.password}
          >
            {(p) => (
              <input
                {...p}
                ref={ref('password')}
                className="input"
                type="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
              />
            )}
          </FormField>
        )}
        {blockedReason && <p className="field__hint">{blockedReason}</p>}
        {formError && (
          <div className="notice notice--danger" role="alert">
            <IconAlert size={20} />
            <span>{formError}</span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
