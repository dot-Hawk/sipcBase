import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@/shared/api/errors';
import type { ManagedUser } from '@/shared/api/types';
import { IconAlert, IconEye, IconEyeOff } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { describeGestionError, mapFieldErrors } from '@/features/gestion/errors';
import { useResetUserPassword } from '@/features/gestion/queries';
import { FormField } from '@/features/gestion/ui/FormField';
import { MIN_PASSWORD_LENGTH, validateResetPassword } from './rules';

const FORM_ID = 'reset-form';

interface Props {
  user: ManagedUser;
  blockedReason: string | null;
  onClose: () => void;
}

export function PasswordResetDialog({ user, blockedReason, onClose }: Props) {
  const reset = useResetUserPassword();
  const toast = useToast();
  const [values, setValues] = useState({ password: '', repeat: '' });
  const [errors, setErrors] = useState<{ password?: string; repeat?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const refs = useRef<{ password?: HTMLInputElement | null; repeat?: HTMLInputElement | null }>({});
  const name = `${user.nombre} ${user.apellido}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (reset.isPending || blockedReason) return;
    const found = validateResetPassword(values);
    setErrors(found);
    setFormError(null);
    if (found.password || found.repeat) {
      (found.password ? refs.current.password : refs.current.repeat)?.focus();
      return;
    }
    try {
      await reset.mutateAsync({ id: user.id, password: values.password });
      toast(`Contraseña de ${name} restablecida.`);
      onClose();
    } catch (err) {
      const mapped = mapFieldErrors(err, {
        password: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      });
      if (mapped.fields.password) {
        setErrors({ password: mapped.fields.password });
        refs.current.password?.focus();
      } else {
        setFormError(
          err instanceof ApiError && err.status === 404
            ? 'Este usuario ya no existe. Actualice la pantalla.'
            : (mapped.form ?? describeGestionError(err)),
        );
      }
    }
  }

  const type = visible ? 'text' : 'password';

  return (
    <Dialog
      title={`Restablecer contraseña`}
      description={<p className="field__hint">{name}</p>}
      onClose={reset.isPending ? () => undefined : onClose}
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={reset.isPending}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--danger-solid" disabled={reset.isPending || Boolean(blockedReason)}>
            {reset.isPending ? 'Guardando…' : 'Restablecer contraseña'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={submit} noValidate>
        <p className="notice notice--attn">
          La contraseña actual de {name} dejará de funcionar. Comuníquele la nueva por un canal seguro y pídale que la
          cambie desde Mi cuenta.
        </p>
        <FormField label="Nueva contraseña" hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres.`} error={errors.password}>
          {(p) => (
            <input
              {...p}
              ref={(el) => {
                refs.current.password = el;
              }}
              className="input"
              type={type}
              autoComplete="new-password"
              value={values.password}
              onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
            />
          )}
        </FormField>
        <FormField label="Repetir contraseña" error={errors.repeat}>
          {(p) => (
            <input
              {...p}
              ref={(el) => {
                refs.current.repeat = el;
              }}
              className="input"
              type={type}
              autoComplete="new-password"
              value={values.repeat}
              onChange={(e) => setValues((v) => ({ ...v, repeat: e.target.value }))}
            />
          )}
        </FormField>
        <button type="button" className="btn btn--quiet" aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
          {visible ? <IconEyeOff size={20} /> : <IconEye size={20} />}
          {visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
        </button>
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
