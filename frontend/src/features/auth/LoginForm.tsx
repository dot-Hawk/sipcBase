import { useId, useState, type FormEvent } from 'react';
import { describeApiError } from '@/shared/api/errors';
import { IconAlert, IconArrowRight, IconEye, IconEyeOff, IconLock, IconMail } from '@/shared/icons';
import { RoleRejectedError } from './errors';
import { ROLE_REJECTED_COPY } from './meValidation';

interface Props {
  /** Why the previous session ended (e.g. account disabled). */
  notice?: string | null;
  onLogin: (credentials: { email: string; password: string }) => Promise<void>;
}

export function LoginForm({ onLogin, notice }: Props) {
  const emailId = useId();
  const passId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Ingrese su correo y su contraseña.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onLogin({ email: trimmed, password });
    } catch (err) {
      if (err instanceof RoleRejectedError) {
        setError(ROLE_REJECTED_COPY);
      } else {
        setError(describeApiError(err, 'login'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login__form" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor={emailId}>
          Correo electrónico
        </label>
        <div className="input-wrap">
          <span className="input-wrap__icon">
            <IconMail size={20} />
          </span>
          <input
            id={emailId}
            className="input"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            placeholder="nombre@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={passId}>
          Contraseña
        </label>
        <div className="input-wrap input-wrap--end">
          <span className="input-wrap__icon">
            <IconLock size={20} />
          </span>
          <input
            id={passId}
            className="input"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="icon-btn input-wrap__end"
            aria-label={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={reveal}
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? <IconEyeOff size={22} /> : <IconEye size={22} />}
          </button>
        </div>
      </div>
      {notice && !error && (
        <div className="notice notice--danger" role="alert">
          <IconAlert size={20} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="notice notice--danger" role="alert">
          <IconAlert size={20} />
          <span>{error}</span>
        </div>
      )}
      <button className="btn btn--primary btn--large login__submit" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? (
          <>
            <span className="login__spinner" aria-hidden="true" />
            Ingresando…
          </>
        ) : (
          <>
            Ingresar
            <IconArrowRight size={20} />
          </>
        )}
      </button>
    </form>
  );
}
