import { useMemo, useState } from 'react';
import { TIPO_LABEL } from '@/features/asignaciones/labels';
import { describeGestionError } from '@/features/gestion/errors';
import { AdminPage, FilterBar } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { FormField } from '@/features/gestion/ui/FormField';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import { countLabel } from '@/shared/api/page';
import type { CatalogEstado, Comercio, ComercioTipo, ComerciosQuery } from '@/shared/api/types';
import { IconMore, IconPlus, IconTipo } from '@/shared/icons';
import { Menu } from '@/shared/ui/Menu';
import { ComercioDetailDialog, ComercioEstadoDialog } from './ComercioDialogs';
import { ComercioForm } from './ComercioForm';
import { CatalogEstadoChip } from './EstadoChip';
import { useComerciosList } from './queries';
import { CATALOGO_PAGE_SIZE, ESTADOS, ESTADO_LABEL, TIPOS, matchesSearch, paginate } from './rules';
import { useListParams } from './useListParams';

const OFFLINE_NOTE_ID = 'comercios-offline';

type Dialogs =
  | { kind: 'create' }
  | { kind: 'edit'; comercio: Comercio }
  | { kind: 'estado'; comercio: Comercio }
  | { kind: 'detail'; comercio: Comercio };

export function ComerciosPage() {
  const gate = useWriteGate();
  const url = useListParams(['estado', 'tipo', 'zona', 'q']);
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const estado = url.get('estado') as CatalogEstado | '';
  const tipo = url.get('tipo') as ComercioTipo | '';
  const zona = url.get('zona');
  const term = url.get('q');

  const filters: ComerciosQuery = { ...(estado ? { estado } : {}), ...(tipo ? { tipo } : {}), ...(zona ? { zona } : {}) };
  const query = useComerciosList(filters);
  // Zones offered by the filter come from the unfiltered list (same cache entry when no filter is set).
  const everything = useComerciosList({});
  const zonas = useMemo(
    () => Array.from(new Set((everything.data ?? []).map((c) => c.zona))).sort((a, b) => a.localeCompare(b, 'es')),
    [everything.data],
  );

  const visible = useMemo(
    () => (query.data ?? []).filter((c) => matchesSearch([c.nombre, c.direccion, c.zona], term)),
    [query.data, term],
  );
  const slice = paginate(visible, url.page);
  const hasFilters = url.active;

  const columns = useMemo<Column<Comercio>[]>(() => {
    const note = gate.canWrite ? undefined : OFFLINE_NOTE_ID;
    return [
      {
        key: 'comercio',
        header: 'Comercio',
        primary: true,
        cell: (c) => (
          <>
            <span>{c.nombre}</span>
            <span className="cell-sub">{c.direccion}</span>
          </>
        ),
      },
      { key: 'zona', header: 'Zona', cell: (c) => c.zona },
      {
        key: 'tipo',
        header: 'Tipo',
        nowrap: true,
        cell: (c) => (
          <span className="cell-icon">
            <IconTipo tipo={c.tipo} size={18} />
            {TIPO_LABEL[c.tipo]}
          </span>
        ),
      },
      { key: 'estado', header: 'Estado', nowrap: true, cell: (c) => <CatalogEstadoChip estado={c.estado} /> },
      {
        key: 'acciones',
        header: 'Acciones',
        align: 'end',
        cell: (c) => (
          <span className="row-actions">
            <button
              type="button"
              className="btn"
              disabled={!gate.canWrite}
              aria-describedby={note}
              onClick={() => setDialog({ kind: 'edit', comercio: c })}
            >
              Editar<span className="visually-hidden"> {c.nombre}</span>
            </button>
            <Menu
              label={`Más acciones de ${c.nombre}`}
              trigger={<IconMore size={22} />}
              items={[
                { id: 'detail', label: 'Ver detalle', onSelect: () => setDialog({ kind: 'detail', comercio: c }) },
                {
                  id: 'estado',
                  label: c.estado === 'ACTIVO' ? 'Desactivar' : 'Reactivar',
                  danger: c.estado === 'ACTIVO',
                  disabled: !gate.canWrite,
                  detail: gate.canWrite ? undefined : 'Necesita conexión.',
                  onSelect: () => setDialog({ kind: 'estado', comercio: c }),
                },
              ]}
            />
          </span>
        ),
      },
    ];
  }, [gate.canWrite]);

  const close = () => setDialog(null);

  return (
    <AdminPage
      title="Comercios"
      description="Comercios donde se relevan los precios."
      action={
        <button
          type="button"
          className="btn btn--primary"
          disabled={!gate.canWrite}
          aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
          onClick={() => setDialog({ kind: 'create' })}
        >
          <IconPlus size={20} />
          Nuevo comercio
        </button>
      }
    >
      {gate.reason && (
        <p id={OFFLINE_NOTE_ID} className="notice notice--attn">
          {gate.reason}
        </p>
      )}

      <FilterBar label="Filtrar comercios" className="filters--search">
        <FormField label="Buscar">
          {(p) => (
            <input
              {...p}
              className="input"
              type="search"
              placeholder="Nombre o dirección"
              value={term}
              onChange={(e) => url.set({ q: e.target.value })}
            />
          )}
        </FormField>
        <FormField label="Estado">
          {(p) => (
            <select {...p} className="select" value={estado} onChange={(e) => url.set({ estado: e.target.value })}>
              <option value="">Todos</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {ESTADO_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Tipo">
          {(p) => (
            <select {...p} className="select" value={tipo} onChange={(e) => url.set({ tipo: e.target.value })}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Zona">
          {(p) => (
            <select {...p} className="select" value={zona} onChange={(e) => url.set({ zona: e.target.value })}>
              <option value="">Todas</option>
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {hasFilters && (
          <button type="button" className="btn btn--quiet" onClick={url.clear}>
            Quitar filtros
          </button>
        )}
      </FilterBar>

      {query.isPending && <LoadingRows label="Cargando comercios" />}
      {query.isError && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {query.isSuccess && visible.length === 0 && (
        <EmptyState
          title={hasFilters ? 'Ningún comercio coincide' : 'Todavía no hay comercios'}
          text={hasFilters ? 'Pruebe con otros filtros o con otra búsqueda.' : 'Cree el primer comercio para poder asignarlo a un relevamiento.'}
        />
      )}
      {query.isSuccess && visible.length > 0 && (
        <>
          <p className="admin-note" aria-live="polite">
            {countLabel(visible.length, 'comercio', 'comercios')}
          </p>
          <DataTable caption="Comercios" columns={columns} rows={slice.items} rowKey={(c) => c.id} />
          {slice.pageCount > 1 && (
            <Pagination
              page={slice.page}
              pageSize={CATALOGO_PAGE_SIZE}
              count={slice.items.length}
              total={slice.total}
              onPage={(p) => url.set({ page: String(p) })}
            />
          )}
        </>
      )}

      {dialog?.kind === 'create' && <ComercioForm blockedReason={gate.reason} onClose={close} />}
      {dialog?.kind === 'edit' && <ComercioForm comercio={dialog.comercio} blockedReason={gate.reason} onClose={close} />}
      {dialog?.kind === 'estado' && <ComercioEstadoDialog comercio={dialog.comercio} blockedReason={gate.reason} onClose={close} />}
      {dialog?.kind === 'detail' && <ComercioDetailDialog comercio={dialog.comercio} onClose={close} />}
    </AdminPage>
  );
}
