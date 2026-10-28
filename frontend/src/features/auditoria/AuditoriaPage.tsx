import { useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams } from '@/features/catalogo/useListParams';
import { describeGestionError } from '@/features/gestion/errors';
import { useAuditoriaPage } from '@/features/gestion/queries';
import { useCatalogLookups } from '@/features/gestion/useCatalogLookups';
import { AdminPage, FilterBar } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { FormField } from '@/features/gestion/ui/FormField';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { StatusChip } from '@/features/gestion/ui/StatusChip';
import { roleLabel } from '@/app/roles';
import { countLabel } from '@/shared/api/page';
import type { AccionAuditoria, AuditoriaPrecio, AuditoriaQuery } from '@/shared/api/types';
import { IconCamera, IconLock, IconPlus, IconSwap, IconTrash } from '@/shared/icons';
import { formatDateTime } from '@/shared/lib/dates';
import { ACCIONES, ACCION_LABEL, actorLabel, describeChange } from './diff';
import './auditoria.css';

export const AUDITORIA_PAGE_SIZE = 25;
const FILTER_KEYS = ['precio', 'relevamiento', 'accion', 'usuario'] as const;

const ACCION_CHIP: Record<AccionAuditoria, { tone: 'ok' | 'info' | 'danger' | 'neutral'; icon: typeof IconPlus }> = {
  CREACION: { tone: 'ok', icon: IconPlus },
  MODIFICACION: { tone: 'info', icon: IconSwap },
  ELIMINACION: { tone: 'danger', icon: IconTrash },
  ADJUNTO_AGREGADO: { tone: 'neutral', icon: IconCamera },
  ADJUNTO_ELIMINADO: { tone: 'neutral', icon: IconCamera },
};

const isAccion = (v: string): v is AccionAuditoria => (ACCIONES as readonly string[]).includes(v);

/** Read-only trail of price events (`GET /auditoria/precios`). There is no action on this screen. */
export function AuditoriaPage() {
  const { session } = useAuth();
  const role = session?.user.role ?? 'DIRECCION';
  const selfId = session?.user.id ?? null;
  const lookups = useCatalogLookups(role);
  const url = useListParams(FILTER_KEYS);

  const accion = url.get('accion');
  const filters: AuditoriaQuery = {
    ...(url.get('precio') ? { precio: url.get('precio') } : {}),
    ...(url.get('relevamiento') ? { relevamiento: url.get('relevamiento') } : {}),
    ...(url.get('usuario') ? { usuario: url.get('usuario') } : {}),
    ...(isAccion(accion) ? { accion } : {}),
  };
  const query = useAuditoriaPage({ ...filters, page: url.page, limit: AUDITORIA_PAGE_SIZE });
  const precioFilter = url.get('precio');

  const columns = useMemo<Column<AuditoriaPrecio>[]>(
    () => [
      {
        key: 'cuando',
        header: 'Cuándo y qué',
        nowrap: true,
        cell: (e) => {
          const { tone, icon: Icon } = ACCION_CHIP[e.accion];
          return (
            <>
              <span className="num">{formatDateTime(e.createdAt)}</span>
              <StatusChip tone={tone} icon={<Icon size={16} />}>
                {ACCION_LABEL[e.accion]}
              </StatusChip>
            </>
          );
        },
      },
      {
        key: 'precio',
        header: 'Precio',
        primary: true,
        cell: (e) => {
          const prod = lookups.byId.producto.get(e.producto);
          const periodo = lookups.byId.relevamiento.get(e.relevamiento)?.periodo;
          return (
            <>
              <span>{prod?.nombre ?? 'Producto desconocido'}</span>
              <span className="cell-sub">{lookups.byId.comercio.get(e.comercio)?.nombre ?? 'Comercio desconocido'}</span>
              {periodo && <span className="cell-sub num">Relevamiento {periodo}</span>}
              {!precioFilter && (
                <button type="button" className="btn btn--quiet au-link" onClick={() => url.set({ precio: e.precio })}>
                  Historial de este precio
                </button>
              )}
            </>
          );
        },
      },
      {
        key: 'cambio',
        header: 'Cambio',
        cell: (e) => (
          <ul className="au-diff">
            {describeChange(e).map((l) => (
              <li key={l.label}>
                <span className="au-diff__label">{l.label}</span>
                {l.before !== null && l.after !== null ? (
                  <span className={l.label === 'Observación' ? 'au-diff__text' : 'au-diff__value'}>
                    <span className="au-diff__before">
                      <span className="visually-hidden">Antes: </span>
                      {l.before}
                    </span>
                    <span aria-hidden="true"> → </span>
                    <span className="au-diff__after">
                      <span className="visually-hidden">Ahora: </span>
                      {l.after}
                    </span>
                  </span>
                ) : l.before !== null ? (
                  <span className="au-diff__before">
                    <span className="visually-hidden">Eliminado: </span>
                    {l.before}
                  </span>
                ) : (
                  <span className="au-diff__after">{l.after}</span>
                )}
              </li>
            ))}
          </ul>
        ),
      },
      {
        key: 'quien',
        header: 'Quién',
        cell: (e) => {
          const a = actorLabel(e, lookups.userNames, selfId);
          return a.name ? (
            <>
              <span>{a.name}</span>
              <span className="cell-sub">{a.role}</span>
            </>
          ) : (
            <>
              <span>{a.role}</span>
              <span className="cell-sub">Nombre no disponible para su rol</span>
            </>
          );
        },
      },
    ],
    [lookups.byId, lookups.userNames, selfId, precioFilter, url],
  );

  const pending = query.isPending || lookups.isPending;
  const error = query.error ?? lookups.error;
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? null;
  const relevamientos = [...lookups.relevamientos].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  const mineOnly = selfId !== null && url.get('usuario') === selfId;

  return (
    <AdminPage
      title="Auditoría"
      description="Qué se cargó, corrigió o eliminó en los precios, quién lo hizo y cuándo."
      action={
        <span className="chip chip--info">
          <IconLock size={16} />
          Solo lectura
        </span>
      }
    >
      <FilterBar label="Filtrar cambios">
        <FormField label="Relevamiento">
          {(p) => (
            <select {...p} className="select" value={url.get('relevamiento')} onChange={(e) => url.set({ relevamiento: e.target.value })}>
              <option value="">Todos</option>
              {relevamientos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.periodo}
                  {r.estado === 'CERRADO' ? ' (cerrado)' : ''}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Acción">
          {(p) => (
            <select {...p} className="select" value={isAccion(accion) ? accion : ''} onChange={(e) => url.set({ accion: e.target.value })}>
              <option value="">Todas</option>
              {ACCIONES.map((a) => (
                <option key={a} value={a}>
                  {ACCION_LABEL[a]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {lookups.canResolveUsers ? (
          <FormField label="Usuario">
            {(p) => (
              <select {...p} className="select" value={url.get('usuario')} onChange={(e) => url.set({ usuario: e.target.value })}>
                <option value="">Todos</option>
                {lookups.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} {u.apellido} ({roleLabel(u.role)})
                  </option>
                ))}
              </select>
            )}
          </FormField>
        ) : (
          selfId && (
            <label className="switch au-switch">
              <input
                type="checkbox"
                role="switch"
                checked={mineOnly}
                onChange={(e) => url.set({ usuario: e.target.checked ? selfId : '' })}
              />
              <span>Solo mis cambios</span>
            </label>
          )
        )}
        {url.active && (
          <button type="button" className="btn btn--quiet" onClick={url.clear}>
            Quitar filtros
          </button>
        )}
      </FilterBar>

      {precioFilter && (
        <p className="notice au-notice">
          <span>Mostrando el historial de un solo precio.</span>
          <button type="button" className="btn btn--quiet" onClick={() => url.set({ precio: '' })}>
            Ver todos los cambios
          </button>
        </p>
      )}

      {pending && <LoadingRows label="Cargando cambios" />}
      {!pending && error && (
        <ErrorState
          message={describeGestionError(error)}
          onRetry={() => {
            void query.refetch();
            void lookups.refetch();
          }}
        />
      )}
      {!pending && !error && items.length === 0 && url.page > 1 && (
        <EmptyState
          title="No hay más resultados"
          text="Esta página queda más allá del último cambio."
          action={
            <button type="button" className="btn btn--primary" onClick={() => url.set({ page: url.page - 1 > 1 ? String(url.page - 1) : '' })}>
              Volver a la página anterior
            </button>
          }
        />
      )}
      {!pending && !error && items.length === 0 && url.page <= 1 && (
        <EmptyState
          title={url.active ? 'Ningún cambio coincide' : 'Todavía no hay cambios registrados'}
          text={
            url.active
              ? 'Pruebe con otros filtros o quítelos para ver todo el registro.'
              : 'Cada precio que se cargue, corrija o elimine quedará registrado aquí.'
          }
        />
      )}
      {!pending && !error && items.length > 0 && (
        <>
          {total !== null && (
            <p className="admin-note" aria-live="polite">
              {countLabel(total, 'cambio', 'cambios')}
            </p>
          )}
          <DataTable caption="Registro de cambios de precios" columns={columns} rows={items} rowKey={(e) => e.id} />
          <Pagination
            page={url.page}
            pageSize={AUDITORIA_PAGE_SIZE}
            count={items.length}
            total={total}
            busy={query.isFetching}
            onPage={(n) => url.set({ page: n > 1 ? String(n) : '' })}
          />
        </>
      )}
    </AdminPage>
  );
}
