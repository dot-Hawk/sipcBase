import { useId, useRef, useState, type FormEvent } from 'react';
import { IconAlert, IconEye, IconEyeOff } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import {
  mapPasswordError,
  validatePasswordForm,
  type PasswordField,
  type PasswordFormErrors,
  type PasswordFormValues,
} from './passwordForm';

interface Props {
  online: boolean;
  onChangePassword: (current: string, next: string) => Promise<void>;
  onSuccess: () => void;
}

const EMPTY: PasswordFormValues = { current: '', next: '', repeat: '' };

const FIELDS: { key: PasswordField; label: string; autoComplete: string }[] = [
  { key: 'current', label: 'Contraseña actual', autoComplete: 'current-password' },
  { key: 'next', label: 'Nueva contraseña', autoComplete: 'new-password' },
  { key: 'repeat', label: 'Repetir nueva contraseña', autoComplete: 'new-password' },
];

export function PasswordForm({ online, onChangePassword, onSuccess }: Props) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PasswordFormValues>(EMPTY);
  const [errors, setErrors] = useState<PasswordFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs = useRef<Partial<Record<PasswordField, HTMLInputElement | null>>>({});
  const openRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setValues(EMPTY);
    setErrors({});
    setFormError(null);
    setVisible(false);
    window.setTimeout(() => openRef.current?.focus(), 0);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !online) return;
    const found = validatePasswordForm(values);
    setFormError(null);
    setErrors(found);
    const first = FIELDS.find((f) => found[f.key]);
    if (first) {
      refs.current[first.key]?.focus();
      return;
    }
    setBusy(true);
    try {
      await onChangePassword(values.current, values.next);
      close();
      onSuccess();
    } catch (err) {
      const mapped = mapPasswordError(err);
      if (mapped.field) {
        setErrors({ [mapped.field]: mapped.message });
        refs.current[mapped.field]?.focus();
      } else {
        setFormError(mapped.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="cuenta__password" aria-labelledby={`${baseId}-h`}>
        <h2 id={`${baseId}-h`}>Contraseña</h2>
        <button
          ref={openRef}
          type="button"
          className="btn"
          disabled={!online}
          aria-describedby={online ? undefined : `${baseId}-offline`}
          onClick={() => setOpen(true)}
        >
          Cambiar contraseña
        </button>
        {!online && (
          <p id={`${baseId}-offline`} className="field__hint">
            Cambiar la contraseña necesita conexión. Vuelva a intentarlo cuando esté en línea.
          </p>
        )}
      </section>
    );
  }

  return (
    <Dialog title="Cambiar contraseña" onClose={close}>
      <form className="cuenta__pwform" onSubmit={submit} noValidate>
        {FIELDS.map((f) => {
          const id = `${baseId}-${f.key}`;
          const err = errors[f.key];
          return (
            <div className="field" key={f.key}>
              <label className="field__label" htmlFor={id}>
                {f.label}
              </label>
              <input
                id={id}
                ref={(el) => {
                  refs.current[f.key] = el;
                }}
                className="input"
                style={{ paddingLeft: 16 }}
                type={visible ? 'text' : 'password'}
                autoComplete={f.autoComplete}
                value={values[f.key]}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `${id}-err` : f.key === 'next' ? `${id}-hint` : undefined}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.key === 'next' && !err && (
                <span id={`${id}-hint`} className="field__hint">
                  Use al menos 8 caracteres.
                </span>
              )}
              {err && (
                <span id={`${id}-err`} className="field__error">
                  {err}
                </span>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn--quiet cuenta__toggle"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <IconEyeOff size={20} /> : <IconEye size={20} />}
          {visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
        </button>
        {formError && (
          <div className="notice notice--danger" role="alert">
            <IconAlert size={20} />
            <span>{formError}</span>
          </div>
        )}
        {!online && (
          <p className="field__hint">Cambiar la contraseña necesita conexión. Espere a estar en línea.</p>
        )}
        <div className="cuenta__pwactions">
          <button type="submit" className="btn btn--primary btn--large" disabled={busy || !online}>
            {busy ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
          <button type="button" className="btn btn--quiet btn--large" onClick={close} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialog>
  );
}
