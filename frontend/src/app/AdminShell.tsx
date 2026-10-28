import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { getUpdateController } from '@/pwa/updates';
import {
  IconAlert,
  IconAssign,
  IconAudit,
  IconCalculator,
  IconCalendar,
  IconCatalog,
  IconClose,
  IconLogout,
  IconMenu,
  IconPrices,
  IconUser,
  IconUsers,
} from '@/shared/icons';
import { BrandSignature } from '@/shared/brand/BrandSignature';
import { useOnline } from '@/shared/lib/useOnline';
import { navFor, roleLabel, sectionPath, type NavIcon } from './roles';
import './admin-shell.css';

const ICONS: Record<NavIcon, typeof IconPrices> = {
  relevamientos: IconCalendar,
  asignaciones: IconAssign,
  usuarios: IconUsers,
  catalogo: IconCatalog,
  precios: IconPrices,
  calculos: IconCalculator,
  auditoria: IconAudit,
};

/**
 * Desktop-first layout of the management roles: sidebar with the nav of the role, account and
 * logout. Below 900px the sidebar becomes a drawer opened from the top bar.
 * It deliberately has no outbox chip: management roles have no offline work.
 */
export function AdminShell() {
  const { session, logout } = useAuth();
  const online = useOnline();
  const updates = getUpdateController();
  const updateReady = useSyncExternalStore(updates.subscribe, updates.getSnapshot, () => false);
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const user = session?.user;

  useEffect(() => setOpen(false), [location.pathname]);

  // Lets shared, portaled UI (dialogs) pick the desktop density without touching the surveyor flow.
  useEffect(() => {
    document.documentElement.dataset.surface = 'admin';
    return () => {
      delete document.documentElement.dataset.surface;
    };
  }, []);

  // "/" jumps to the first filter field of the screen, the usual shortcut of data-heavy web apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const field = document.querySelector<HTMLElement>(
        '.admin__content [role="search"] input:not([disabled]), .admin__content [role="search"] select:not([disabled])',
      );
      if (!field) return;
      e.preventDefault();
      field.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const items = user ? navFor(user.role) : [];
  const fullName = user ? `${user.nombre} ${user.apellido}` : '';

  return (
    <div className="admin" data-open={open}>
      <a
        className="skip-link"
        href="#contenido"
        onClick={(e) => {
          // The router owns the URL: move focus without touching the hash.
          e.preventDefault();
          document.getElementById('contenido')?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <header className="admin__bar">
        <button
          type="button"
          className="icon-btn"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
          aria-controls="admin-sidebar"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <IconClose size={24} /> : <IconMenu size={24} />}
        </button>
        <span className="mark admin__bar-mark" aria-hidden="true" />
        <span className="admin__bar-title">SIPC</span>
      </header>

      <aside className="admin__side" id="admin-sidebar">
        <div className="admin__brand">
          <BrandSignature layout="compact" />
        </div>

        <div className="admin__who">
          <p className="admin__role">{user ? roleLabel(user.role) : ''}</p>
          <p className="admin__name">{fullName}</p>
        </div>

        <nav className="admin__nav" aria-label="Secciones">
          <ul>
            {items.map(({ section, label, path }) => {
              const Icon = ICONS[section];
              return (
                <li key={section}>
                  <NavLink to={path} className="admin__link">
                    <Icon size={22} />
                    <span>{label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="admin__foot">
          <NavLink to={sectionPath('cuenta')} className="admin__link">
            <IconUser size={22} />
            <span>Mi cuenta</span>
          </NavLink>
          <button type="button" className="admin__link admin__logout" onClick={logout}>
            <IconLogout size={22} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {open && <div className="admin__scrim" aria-hidden="true" onClick={() => setOpen(false)} />}

      <div className="admin__main">
        {!online && (
          <div className="admin__banner admin__banner--attn" role="status">
            <IconAlert size={20} />
            <p>
              <strong>Sin conexión.</strong> Los datos pueden no estar al día. Se actualizarán al recuperar la
              conexión.
            </p>
          </div>
        )}
        {updateReady && (
          <div className="admin__banner" role="status">
            <p>Hay una versión nueva de la aplicación.</p>
            <button type="button" className="btn btn--primary" onClick={() => updates.apply()}>
              Actualizar
            </button>
          </div>
        )}
        <main className="admin__content" id="contenido" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

