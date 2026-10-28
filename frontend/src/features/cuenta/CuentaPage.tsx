import { useState } from 'react';
import { PageHeader } from '@/app/PageHeader';
import { hasGestion, roleLabel } from '@/app/roles';
import { useAuth } from '@/features/auth/AuthProvider';
import { pluralize } from '@/features/outbox/labels';
import { useOutbox, useOutboxCounts } from '@/features/outbox/OutboxProvider';
import { api } from '@/shared/api/endpoints';
import { BrandSignature } from '@/shared/brand/BrandSignature';
import { IconLogout, IconOffline, IconOnline } from '@/shared/icons';
import { formatDateTime } from '@/shared/lib/dates';
import { initials } from '@/shared/lib/initials';
import { useOnline } from '@/shared/lib/useOnline';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { PasswordForm } from './PasswordForm';
import './cuenta.css';

export function CuentaPage() {
  const { session, logout } = useAuth();
  const online = useOnline();
  const user = session?.user;
  const toast = useToast();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const outbox = useOutbox();
  const unsent = useOutboxCounts();
  const surveyor = !user || !hasGestion(user.role);

  return (
    <div className="page">
      <PageHeader eyebrow={surveyor ? 'Relevamiento' : 'Gestión'} title="Cuenta" />

      <div className="cuenta">
        <section className="cuenta__profile" aria-label="Perfil">
          <div className="cuenta__who">
            <span className="cuenta__avatar" aria-hidden="true">
              {initials(user?.nombre, user?.apellido)}
            </span>
            <div>
              <h2>{user ? `${user.nombre} ${user.apellido}` : ''}</h2>
              <p className="cuenta__role">{user ? roleLabel(user.role) : ''}</p>
            </div>
          </div>
          <dl className="cuenta__data">
            {user?.legajo && (
              <div>
                <dt>Legajo</dt>
                <dd className="num">{user.legajo}</dd>
              </div>
            )}
            {user?.email && (
              <div>
                <dt>Correo electrónico</dt>
                <dd className="cuenta__email">{user.email}</dd>
              </div>
            )}
            {user && (
              <div>
                <dt>Último acceso</dt>
                <dd>{formatDateTime(user.ultimoAcceso)}</dd>
              </div>
            )}
            <div>
              <dt>Conexión</dt>
              <dd>
                <span className={`chip ${online ? 'chip--ok' : 'chip--attn'}`}>
                  {online ? <IconOnline size={16} /> : <IconOffline size={16} />}
                  {online ? 'En línea' : 'Sin conexión'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Versión de la aplicación</dt>
              <dd className="num">{__APP_VERSION__}</dd>
            </div>
          </dl>
        </section>

        <div className="cuenta__side">
          <PasswordForm
            online={online}
            onChangePassword={api.changePassword}
            onSuccess={() => toast('Contraseña actualizada')}
          />

          <section className="cuenta__org" aria-label="Institución">
            <BrandSignature />
            <p className="cuenta__org-name">Dirección de Estadística y Censos – Formosa</p>
          </section>

          <button type="button" className="btn btn--large cuenta__logout" onClick={() => setConfirmLogout(true)}>
            <IconLogout size={22} />
            Cerrar sesión
          </button>
        </div>
      </div>

      {confirmLogout && (
        <Dialog
          title="Cerrar sesión"
          onClose={() => setConfirmLogout(false)}
          actions={
            <>
              <button type="button" className="btn" data-autofocus onClick={() => setConfirmLogout(false)}>
                Cancelar
              </button>
              {unsent.total > 0 ? (
                <button
                  type="button"
                  className="btn btn--danger-solid"
                  onClick={() => {
                    void (outbox?.discardAll() ?? Promise.resolve()).then(logout);
                  }}
                >
                  Descartar y cerrar sesión
                </button>
              ) : (
                <button type="button" className="btn btn--primary" onClick={logout}>
                  Cerrar sesión
                </button>
              )}
            </>
          }
        >
          {unsent.total > 0 ? (
            <>
              <p>
                Tiene <strong>{pluralize(unsent.prices, 'precio', 'precios')} y {pluralize(unsent.photos, 'foto', 'fotos')}</strong>{' '}
                que todavía no se enviaron. Si cierra sesión ahora se perderán.
              </p>
              <p>Conéctese y espere a que se envíen, o siga trabajando.</p>
            </>
          ) : (
            <p>
              {surveyor
                ? 'Los precios sin guardar de este dispositivo se conservan. Deberá ingresar de nuevo para continuar.'
                : 'Deberá ingresar de nuevo para continuar.'}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
