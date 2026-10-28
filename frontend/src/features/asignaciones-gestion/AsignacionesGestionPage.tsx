import { useMemo, useState } from 'react';
import { EstadoChip } from '@/features/asignaciones/EstadoChip';
import { ESTADO_LABEL } from '@/features/asignaciones/labels';
import { describeGestionError } from '@/features/gestion/errors';
import { useGestionAsignacionesPage } from '@/features/gestion/queries';
import { AdminPage, FilterBar } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { FormField } from '@/features/gestion/ui/FormField';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import type { Asignacion, AsignacionEstado, AsignacionesQuery } from '@/shared/api/types';
import { IconPlus } from '@/shared/icons';
import { AsignacionForm } from './AsignacionForm';
import { fullName, useLookups } from './lookups';
import { countLabel } from '@/shared/api/page';
import { ReassignDialog } from './ReassignDialog';
import { CancelDialog } from './CancelDialog';
import { canCancel, canReassign, cancelBlockReason } from './rules';

const OFFLINE_NOTE_ID = 'asignaciones-offline';
const ESTADOS: AsignacionEstado[] = ['PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'CANCELADA'];

export function AsignacionesGestionPage() {
  const [filters, setFilters] = useState<AsignacionesQuery>({});
  const query = useGestionAsignacionesPage(filters);
  const lookups = useLookups();
  const gate = useWriteGate();
  const [creating, setCreating] = useState(false);
  const [reassigning, setReassigning] = useState<Asignacion | null>(null);
  const [cancelling, setCancelling] = useState<Asignacion | null>(null);
  const hasFilters = Object.keys(filters).length > 0;

  function setFilter<K extends keyof AsignacionesQuery>(key: K, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) (next as Record<string, string>)[key] = value;
      else delete next[key];
      return next;
    });
  }

  const columns = useMemo<Column<Asignacion>[]>(
    () => [
      {
        key: 'comercio',
        header: 'Comercio',
        primary: true,
        cell: (a) => {
          const c = lookups.byId.comercio.get(a.comercio);
          return (
            <>
              {c?.nombre ?? 'Comercio desconocido'}
              {c && <span className="cell-sub">{c.zona}</span>}
            </>
          );
        },
      },
      { key: 'relevamiento', header: 'Relevamiento', nowrap: true, cell: (a) => lookups.byId.relevamiento.get(a.relevamiento)?.periodo ?? '—' },
      {
        key: 'encuestador',
        header: 'Encuestador',
        cell: (a) => {
          const u = lookups.byId.encuestador.get(a.encuestador);
          return u ? fullName(u) : 'Encuestador desconocido';
        },
      },
      { key: 'estado', header: 'Estado', nowrap: true, cell: (a) => <EstadoChip estado={a.estado} /> },
      {
        key: 'acciones',
        header: 'Acciones',
        align: 'end',
        cell: (a) => {
          const nombre = lookups.byId.comercio.get(a.comercio)?.nombre ?? 'comercio';
          const rel = lookups.byId.relevamiento.get(a.relevamiento);
          const blocked = cancelBlockReason(a, rel);
          const hintId = `cancel-block-${a.id}`;
          const cancellable = canCancel(a, rel);
          return (
            <>
              {canReassign(a) && (
                <button
                  type="button"
                  className="btn"
                  disabled={!gate.canWrite}
                  aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
                  onClick={() => setReassigning(a)}
                >
                  Reasignar <span className="visually-hidden">visita de {nombre}</span>
                </button>
              )}
              {(cancellable || blocked) && (
                <>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={!gate.canWrite || !cancellable}
                    aria-describedby={blocked ? hintId : gate.canWrite ? undefined : OFFLINE_NOTE_ID}
                    onClick={() => setCancelling(a)}
                  >
                    Cancelar asignación <span className="visually-hidden">de {nombre}</span>
                  </button>
                  {blocked && (
                    <span id={hintId} className="cell-sub">
                      {blocked}
                    </span>
                  )}
                </>
              )}
            </>
          );
        },
      },
    ],
    [lookups.byId, gate.canWrite],
  );

  const pending = query.isPending || lookups.isPending;
  const error = query.error ?? lookups.error;

  return (
    <AdminPage
      title="Asignaciones"
      description="Qué encuestador visita cada comercio en cada relevamiento. Solo se pueden reasignar las visitas pendientes; las pendientes y en curso de un relevamiento abierto se pueden cancelar."
      action={
        <button
          type="button"
          className="btn btn--primary"
          disabled={!gate.canWrite}
          aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
          onClick={() => setCreating(true)}
        >
          <IconPlus size={20} />
          Nueva asignación
        </button>
      }
    >
      {gate.reason && (
        <p id={OFFLINE_NOTE_ID} className="notice notice--attn">
          {gate.reason}
        </p>
      )}

      <FilterBar label="Filtrar asignaciones">
        <FormField label="Relevamiento">
          {(p) => (
            <select {...p} className="select" value={filters.relevamiento ?? ''} onChange={(e) => setFilter('relevamiento', e.target.value)}>
              <option value="">Todos</option>
              {lookups.relevamientos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.periodo}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Encuestador">
          {(p) => (
            <select {...p} className="select" value={filters.encuestador ?? ''} onChange={(e) => setFilter('encuestador', e.target.value)}>
              <option value="">Todos</option>
              {lookups.encuestadores.map((u) => (
                <option key={u.id} value={u.id}>
                  {fullName(u)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Comercio">
          {(p) => (
            <select {...p} className="select" value={filters.comercio ?? ''} onChange={(e) => setFilter('comercio', e.target.value)}>
              <option value="">Todos</option>
              {lookups.comercios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Estado">
          {(p) => (
            <select {...p} className="select" value={filters.estado ?? ''} onChange={(e) => setFilter('estado', e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {ESTADO_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {hasFilters && (
          <button type="button" className="btn btn--quiet" onClick={() => setFilters({})}>
            Quitar filtros
          </button>
        )}
      </FilterBar>

      {pending && <LoadingRows label="Cargando asignaciones" />}
      {!pending && error && (
        <ErrorState
          message={describeGestionError(error)}
          onRetry={() => {
            void query.refetch();
            void lookups.refetch();
          }}
        />
      )}
      {!pending && !error && query.data && query.data.items.length === 0 && (
        <EmptyState
          title={hasFilters ? 'Ninguna asignación coincide' : 'Todavía no hay asignaciones'}
          text={
            hasFilters
              ? 'Pruebe con otros filtros o quítelos para ver todas las asignaciones.'
              : 'Cree la primera asignación para que un encuestador visite un comercio.'
          }
        />
      )}
      {!pending && !error && query.data && query.data.items.length > 0 && (
        <>
          <p className="admin-note" aria-live="polite">
            {countLabel(query.data.total ?? query.data.items.length, 'asignación', 'asignaciones')}
          </p>
          <DataTable caption="Asignaciones" columns={columns} rows={query.data.items} rowKey={(a) => a.id} />
        </>
      )}

      {creating && <AsignacionForm lookups={lookups} onClose={() => setCreating(false)} />}
      {cancelling && (
        <CancelDialog asignacion={cancelling} lookups={lookups} blockedReason={gate.reason} onClose={() => setCancelling(null)} />
      )}
      {reassigning && (
        <ReassignDialog
          asignacion={reassigning}
          lookups={lookups}
          blockedReason={gate.reason}
          onClose={() => setReassigning(null)}
        />
      )}
    </AdminPage>
  );
}
