import { Link } from 'react-router-dom';
import { landingFor } from '@/app/roles';
import { useAuth } from '@/features/auth/AuthProvider';
import './gestion.css';

export function ForbiddenPage() {
  const { session } = useAuth();
  const landing = session ? landingFor(session.user.role) : '/';
  return (
    <div className="gestion-page">
      <div className="gestion-state">
        <img className="gestion-state__art" src="/brand/state-forbidden.svg" alt="" aria-hidden="true" width={240} height={160} />
        <h1>No tiene acceso a esta sección</h1>
        <p>Su rol no incluye esta pantalla. Si cree que necesita acceso, consulte con la coordinación.</p>
        <Link to={landing} className="btn btn--primary">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
