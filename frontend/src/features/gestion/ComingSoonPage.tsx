import { SECTION_META, isReadOnly, type NavSection } from '@/app/roles';
import { useAuth } from '@/features/auth/AuthProvider';
import { IconInfo } from '@/shared/icons';
import './gestion.css';

/** Placeholder for a management section that is not built yet. No data, no API calls. */
export function ComingSoonPage({ section }: { section: NavSection }) {
  const { session } = useAuth();
  const meta = SECTION_META[section];
  const readOnly = session ? isReadOnly(session.user.role, section) : false;
  return (
    <div className="gestion-page">
      <header className="gestion-head">
        <h1>{meta.label}</h1>
        {readOnly && <span className="chip chip--info">Solo lectura</span>}
      </header>
      <section className="gestion-soon" aria-label="Estado de la sección">
        <img className="gestion-soon__art" src="/brand/state-soon.svg" alt="" aria-hidden="true" width={240} height={160} />
        <span className="chip chip--info">
          <IconInfo size={16} />
          Próximamente
        </span>
        <p>{meta.description}</p>
      </section>
    </div>
  );
}
