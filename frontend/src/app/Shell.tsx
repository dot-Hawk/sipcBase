import { useSyncExternalStore } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useOutbox, useOutboxSnapshot } from '@/features/outbox/OutboxProvider';
import { countItems } from '@/features/outbox/types';
import { getUpdateController } from '@/pwa/updates';
import { IconAlert, IconPending, IconPrices, IconUser, IconVisits } from '@/shared/icons';
import { useOnline } from '@/shared/lib/useOnline';
import './shell.css';

function OutboxBar({ online }: { online: boolean }) {
  const outbox = useOutbox();
  const { items, flushing } = useOutboxSnapshot();
  const counts = countItems(items);
  if (counts.total === 0) return null;
  const attention = counts.attention > 0;
  return (
    <div className="shell__outbox" role="status">
      <span className={`chip ${attention ? 'chip--attn' : 'chip--info'}`}>
        {attention ? <IconAlert size={16} /> : <IconPending size={16} />}
        <span>{counts.total === 1 ? '1 cambio sin enviar' : `${counts.total} cambios sin enviar`}</span>
        {attention && (
          <span>
            {' · '}
            {counts.attention === 1 ? '1 requiere su atención' : `${counts.attention} requieren su atención`}
          </span>
        )}
      </span>
      {flushing && online && <span className="shell__outbox-note">Enviando…</span>}
      {online && !flushing && (
        <button type="button" className="btn shell__outbox-retry" onClick={() => void outbox?.retry()}>
          Reintentar
        </button>
      )}
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Visitas', end: true, icon: IconVisits },
  { to: '/precios', label: 'Precios', end: false, icon: IconPrices },
  { to: '/cuenta', label: 'Cuenta', end: false, icon: IconUser },
] as const;

export function Shell() {
  const online = useOnline();
  const updates = getUpdateController();
  const updateReady = useSyncExternalStore(updates.subscribe, updates.getSnapshot, () => false);
  return (
    <div className="shell">
      <nav className="nav" aria-label="Secciones">
        <span className="mark nav__mark" role="img" aria-label="Dirección de Estadística" />
        <ul className="nav__list">
          {NAV.map(({ to, label, end, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} end={end} className="nav__link">
                <span className="nav__pill">
                  <Icon size={24} />
                </span>
                <span className="nav__label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="shell__main">
        {!online && (
          <div className="shell__offline" role="status">
            <IconAlert size={20} />
            <p>
              <strong>Sin conexión.</strong> Precios y fotos se guardan en este dispositivo y se enviarán al
              recuperar la conexión.
            </p>
          </div>
        )}
        <OutboxBar online={online} />
        {updateReady && (
          <div className="shell__offline shell__update" role="status">
            <p>Hay una versión nueva de la aplicación.</p>
            <button type="button" className="btn btn--primary" onClick={() => updates.apply()}>
              Actualizar
            </button>
          </div>
        )}
        <main className="shell__content" id="contenido">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
