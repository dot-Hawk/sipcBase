import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { peekIdbOutbox } from '@/features/outbox/idbStore';
import { BrandSignature } from '@/shared/brand/BrandSignature';
import { IconLock } from '@/shared/icons';
import { LoginForm } from './LoginForm';
import { useAuth } from './AuthProvider';
import './login.css';

export function LoginPage() {
  const { session, login, notice } = useAuth();
  const location = useLocation() as { state?: { from?: string } };
  const [unsent, setUnsent] = useState(0);
  useEffect(() => {
    let alive = true;
    void peekIdbOutbox().then((found) => alive && setUnsent(found?.count ?? 0));
    return () => {
      alive = false;
    };
  }, []);
  if (session) return <Navigate to={location.state?.from ?? '/'} replace />;

  return (
    <main className="login">
      <div className="login__shell">
        <div className="login__hero">
          <div className="login__hero-copy">
            <BrandSignature className="login__signature" />
            <img className="login__art" src="/brand/login-panel.svg" alt="" width={560} height={400} />
            <p className="login__line">Precios reales, datos confiables.</p>
          </div>
        </div>
        <div className="login__panel">
          <div className="login__card">
            <div className="login__intro">
              <p className="login__eyebrow">Acceso al sistema</p>
              <h1>Ingresar</h1>
              <p>Use el correo y la contraseña que le dio su coordinador.</p>
            </div>
            {unsent > 0 && (
              <div className="notice notice--attn" role="status">
                <p>
                  <strong>{unsent === 1 ? '1 cambio sin enviar' : `${unsent} cambios sin enviar`}</strong> en este
                  dispositivo. Ingrese con la misma cuenta para enviarlos. Si ingresa con otra cuenta, se descartan.
                </p>
              </div>
            )}
            <LoginForm onLogin={login} notice={notice} />
            <p className="login__help">¿Problemas para ingresar? Consulte con su coordinador.</p>
          </div>
        </div>
      </div>
      <footer className="login__foot">
        <span className="login__secure">
          <IconLock size={16} />
          Acceso solo para personal autorizado
        </span>
        <span className="num">v{__APP_VERSION__}</span>
      </footer>
    </main>
  );
}
