import { useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams } from '@/features/catalogo/useListParams';
import { describeGestionError } from '@/features/gestion/errors';
import { usePreciosGestionPage } from '@/features/gestion/queries';
import { useCatalogLookups } from '@/features/gestion/useCatalogLookups';
import { AdminPage, FilterBar } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { FormField } from '@/features/gestion/ui/FormField';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { StatusChip } from '@/features/gestion/ui/StatusChip';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import { describeAlerta } from '@/features/visita/alertaView';
import { computeVariation, formatVariation } from '@/features/visita/variation';
import { countLabel } from '@/shared/api/page';
import type { Precio, PreciosGestionQuery } from '@/shared/api/types';
import { IconAlert, IconPrices } from '@/shared/icons';
import { formatDate, formatDateTime } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/money';
import { CorrectionDialog, type PrecioLabels } from './CorrectionDialog';
import { PrecioDetailDialog } from './PrecioDetailDialog';
import { canCorrectPrecios, correctionBlockedReason } from './rules';
import './precios-gestion.css';

export const PRECIOS_GESTION_PAGE_SIZE = 25;
const OFFLINE_NOTE_ID = 'precios-offline';
const FILTER_KEYS = ['relevamiento', 'comercio', 'producto', 'encuestador', 'oferta', 'conAlerta'] as const;

type DialogState = { kind: 'detail'; precio: Precio } | { kind: 'correct'; precio: Precio; fromDetail: boolean };

const shortId = (id: string) => `#${id.slice(0, 8)}`;

export function PreciosGestionPage() {
  const { session } = useAuth();
  const role = session?.user.role ?? 'DIRECCION';
  const mayCorrect = canCorrectPrecios(role);
  const gate = useWriteGate();
  const url = useListParams(FILTER_KEYS);
  const lookups = useCatalogLookups(role);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const oferta = url.get('oferta');
  const filters: PreciosGestionQuery = {
    ...(url.get('relevamiento') ? { relevamiento: url.get('relevamiento') } : {}),
    ...(url.get('comercio') ? { comercio: url.get('comercio') } : {}),
    ...(url.get('producto') ? { producto: url.get('producto') } : {}),
    ...(url.get('encuestador') ? { encuestador: url.get('encuestador') } : {}),
    ...(oferta === 'true' || oferta === 'false' ? { oferta: oferta === 'true' } : {}),
    ...(url.get('conAlerta') === 'true' ? { conAlerta: true } : {}),
  };
  const query = usePreciosGestionPage({ ...filters, page: url.page, limit: PRECIOS_GESTION_PAGE_SIZE });

  const labelsOf = (p: Precio): PrecioLabels => {
    const prod = lookups.byId.producto.get(p.producto);
    return {
      producto: prod ? `${prod.nombre}${prod.marca ? ` ${prod.marca}` : ''}` : 'Producto desconocido',
      comercio: lookups.byId.comercio.get(p.comercio)?.nombre ?? 'Comercio desconocido',
      periodo: lookups.byId.relevamiento.get(p.relevamiento)?.periodo ?? 'desconocido',
    };
  };
  const encuestadorOf = (id: string) => {
    const name = lookups.userNames.get(id);
    return name ?? `Encuestador ${shortId(id)}`;
  };
  const reasonFor = (p: Precio) => correctionBlockedReason(lookups.byId.relevamiento.get(p.relevamiento));

  const columns = useMemo<Column<Precio>[]>(() => {
    const cols: Column<Precio>[] = [
      {
        key: 'producto',
        header: 'Producto',
        primary: true,
        cell: (p) => {
          const l = labelsOf(p);
          const prod = lookups.byId.producto.get(p.producto);
          return (
            <>
              <span>{prod?.nombre ?? l.producto}</span>
              <span className="cell-sub">{prod?.marca ? `${prod.marca} · ${l.comercio}` : l.comercio}</span>
            </>
          );
        },
      },
      {
        key: 'relevamiento',
        header: 'Relevamiento',
        nowrap: true,
        cell: (p) => {
          const closed = lookups.byId.relevamiento.get(p.relevamiento)?.estado === 'CERRADO';
          return (
            <>
              <span className="num">{labelsOf(p).periodo}</span>
              {closed && <span className="cell-sub">Cerrado</span>}
            </>
          );
        },
      },
      {
        key: 'valor',
        header: 'Valor',
        cell: (p) => {
          const view = p.alerta ? describeAlerta(p.alerta) : null;
          const variation = view ? computeVariation(view.reference, p.valor) : null;
          return (
            <>
              <span className="num pg-valor">{formatMoney(p.valor)}</span>
              {variation !== null && <span className="cell-sub num">{formatVariation(variation)} vs. {view?.kind === 'variedad' ? 'precio anterior' : 'promedio'}</span>}
              {(p.oferta || p.alerta) && (
                <span className="pg-chips">
                  {p.oferta && (
                    <StatusChip tone="info" icon={<IconPrices size={16} />}>
                      En oferta
                    </StatusChip>
                  )}
                  {p.alerta && (
                    <StatusChip tone="attn" icon={<IconAlert size={16} />}>
                      Atípico
                    </StatusChip>
                  )}
                </span>
              )}
            </>
          );
        },
      },
      {
        key: 'relevado',
        header: 'Relevado',
        cell: (p) => {
          const corrected = Date.parse(p.updatedAt) - Date.parse(p.createdAt) > 1000;
          return (
            <>
              <span className="num">{formatDate(p.fechaRelevamiento)}</span>
              <span className="cell-sub">{encuestadorOf(p.encuestador)}</span>
              {corrected && <span className="cell-sub">Corregido el {formatDateTime(p.updatedAt)}</span>}
            </>
          );
        },
      },
      {
        key: 'acciones',
        header: 'Acciones',
        align: 'end',
        cell: (p) => {
          const l = labelsOf(p);
          const closedReason = mayCorrect ? reasonFor(p) : null;
          const describedBy = !gate.canWrite ? OFFLINE_NOTE_ID : closedReason ? `pg-closed-${p.id}` : undefined;
          return (
            <span className="row-actions pg-actions">
              <button type="button" className="btn" onClick={() => setDialog({ kind: 'detail', precio: p })}>
                Ver detalle<span className="visually-hidden"> de {l.producto} en {l.comercio}</span>
              </button>
              {mayCorrect && (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={!gate.canWrite || Boolean(closedReason)}
                    aria-describedby={describedBy}
                    onClick={() => setDialog({ kind: 'correct', precio: p, fromDetail: false })}
                  >
                    Corregir<span className="visually-hidden"> {l.producto} en {l.comercio}</span>
                  </button>
                  {closedReason && (
                    <span id={`pg-closed-${p.id}`} className="visually-hidden">
                      {closedReason}
                    </span>
                  )}
                </>
              )}
            </span>
          );
        },
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups.byId, lookups.userNames, gate.canWrite, mayCorrect]);

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) => url.set({ [key]: value });
  const pending = query.isPending || lookups.isPending;
  const error = query.error ?? lookups.error;
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? null;
  const relevamientos = [...lookups.relevamientos].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));

  const detail = dialog && (dialog.kind === 'detail' || dialog.fromDetail) ? dialog.precio : null;
  const closeDialog = () => setDialog(null);

  return (
    <AdminPage
      title="Precios"
      description={
        mayCorrect
          ? 'Revise los precios relevados, sus marcas y alertas, y corríjalos mientras el relevamiento siga abierto.'
          : 'Precios relevados, sus marcas y alertas. Su rol no puede corregirlos.'
      }
    >
      {gate.reason && mayCorrect && (
        <p id={OFFLINE_NOTE_ID} className="notice notice--attn">
          {gate.reason}
        </p>
      )}

      <FilterBar label="Filtrar precios">
        <FormField label="Relevamiento">
          {(p) => (
            <select {...p} className="select" value={url.get('relevamiento')} onChange={(e) => setFilter('relevamiento', e.target.value)}>
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
        <FormField label="Comercio">
          {(p) => (
            <select {...p} className="select" value={url.get('comercio')} onChange={(e) => setFilter('comercio', e.target.value)}>
              <option value="">Todos</option>
              {lookups.comercios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Producto">
          {(p) => (
            <select {...p} className="select" value={url.get('producto')} onChange={(e) => setFilter('producto', e.target.value)}>
              <option value="">Todos</option>
              {lookups.productos.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.nombre}
                  {pr.marca ? ` (${pr.marca})` : ''}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {lookups.canResolveUsers && (
          <FormField label="Encuestador">
            {(p) => (
              <select {...p} className="select" value={url.get('encuestador')} onChange={(e) => setFilter('encuestador', e.target.value)}>
                <option value="">Todos</option>
                {lookups.users
                  .filter((u) => u.role === 'ENCUESTADOR')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} {u.apellido}
                    </option>
                  ))}
              </select>
            )}
          </FormField>
        )}
        <FormField label="Oferta">
          {(p) => (
            <select {...p} className="select" value={oferta} onChange={(e) => setFilter('oferta', e.target.value)}>
              <option value="">Todos</option>
              <option value="true">En oferta</option>
              <option value="false">Sin oferta</option>
            </select>
          )}
        </FormField>
        <label className="switch pg-switch">
          <input
            type="checkbox"
            role="switch"
            checked={url.get('conAlerta') === 'true'}
            onChange={(e) => setFilter('conAlerta', e.target.checked ? 'true' : '')}
          />
          <span>Solo con alerta</span>
        </label>
        {url.active && (
          <button type="button" className="btn btn--quiet" onClick={url.clear}>
            Quitar filtros
          </button>
        )}
      </FilterBar>

      {pending && <LoadingRows label="Cargando precios" />}
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
          text="Esta página queda más allá del último precio."
          action={
            <button type="button" className="btn btn--primary" onClick={() => url.set({ page: url.page - 1 > 1 ? String(url.page - 1) : '' })}>
              Volver a la página anterior
            </button>
          }
        />
      )}
      {!pending && !error && items.length === 0 && url.page <= 1 && (
        <EmptyState
          title={url.active ? 'Ningún precio coincide' : 'Todavía no hay precios relevados'}
          text={
            url.active
              ? 'Pruebe con otros filtros o quítelos para ver todos los precios.'
              : 'Cuando los encuestadores carguen precios en un relevamiento, aparecerán aquí.'
          }
        />
      )}
      {!pending && !error && items.length > 0 && (
        <>
          {total !== null && (
            <p className="admin-note" aria-live="polite">
              {countLabel(total, 'precio', 'precios')}
            </p>
          )}
          <DataTable caption="Precios relevados" columns={columns} rows={items} rowKey={(p) => p.id} />
          <Pagination
            page={url.page}
            pageSize={PRECIOS_GESTION_PAGE_SIZE}
            count={items.length}
            total={total}
            busy={query.isFetching}
            onPage={(n) => url.set({ page: n > 1 ? String(n) : '' })}
          />
        </>
      )}

      {detail && (
        <PrecioDetailDialog
          precio={detail}
          labels={labelsOf(detail)}
          relevamiento={lookups.byId.relevamiento.get(detail.relevamiento)}
          encuestador={encuestadorOf(detail.encuestador)}
          onCorrect={mayCorrect ? () => setDialog({ kind: 'correct', precio: detail, fromDetail: true }) : null}
          correctBlockedReason={reasonFor(detail) ?? gate.reason}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'correct' && mayCorrect && (
        <CorrectionDialog
          precio={dialog.precio}
          labels={labelsOf(dialog.precio)}
          blockedReason={gate.reason}
          onClose={() => setDialog(dialog.fromDetail ? { kind: 'detail', precio: dialog.precio } : null)}
          onDone={closeDialog}
        />
      )}
    </AdminPage>
  );
}
