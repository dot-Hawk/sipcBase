import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasGestion, sectionPath } from './roles';
import { IconOffline, IconOnline, IconRefresh } from '@/shared/icons';
import { initials } from '@/shared/lib/initials';
import { useOnline } from '@/shared/lib/useOnline';

/** Connection chip, refresh and account shortcut. Shared by every top bar. */
export function TopTools({ showConnection = true }: { showConnection?: boolean }) {
  const { session } = useAuth();
  const online = useOnline();
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  const user = session?.user;
  const fullName = user ? `${user.nombre} ${user.apellido}` : 'Cuenta';
  const initial = initials(user?.nombre, user?.apellido);
  const accountPath = user && hasGestion(user.role) ? sectionPath('cuenta') : '/cuenta';

  return (
    <div className="tools">
      {showConnection && (
        <span className={`chip ${online ? 'chip--ok' : 'chip--attn'}`}>
          {online ? <IconOnline size={16} /> : <IconOffline size={16} />}
          <span className="tools__conn">{online ? 'En línea' : 'Sin conexión'}</span>
        </span>
      )}
      <button
        type="button"
        className="icon-btn icon-btn--fill"
        aria-label={fetching ? 'Actualizando datos' : 'Actualizar datos'}
        aria-busy={fetching}
        disabled={!online || fetching}
        onClick={() => void queryClient.refetchQueries({ type: 'active' })}
      >
        {fetching ? <span className="spinner" aria-hidden="true" /> : <IconRefresh size={22} />}
      </button>
      <Link to={accountPath} className="avatar" aria-label={`${initial}, cuenta de ${fullName}`}>
        {initial}
      </Link>
    </div>
  );
}

export function PageHeader({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head__title">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children}
      <TopTools />
    </header>
  );
}
