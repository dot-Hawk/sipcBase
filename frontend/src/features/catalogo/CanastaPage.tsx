import { useMemo, useState } from 'react';
import { describeGestionError } from '@/features/gestion/errors';
import { AdminPage, FilterBar } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { FormField } from '@/features/gestion/ui/FormField';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import { countLabel } from '@/shared/api/page';
import type { CanastaCategoria, CanastaNodo, CanastaQuery, CatalogEstado } from '@/shared/api/types';
import { IconMore, IconPlus } from '@/shared/icons';
import { Menu } from '@/shared/ui/Menu';
import { CatalogEstadoChip } from './EstadoChip';
import { useCanastaList } from './queries';
import { CATALOGO_PAGE_SIZE, CATEGORIAS, CATEGORIA_LABEL, ESTADOS, ESTADO_LABEL, matchesSearch, paginate } from './rules';
import { useListParams } from './useListParams';
import { VariedadDetailDialog, VariedadEstadoDialog } from './VariedadDialogs';
import { VariedadForm } from './VariedadForm';
import { useProductoNodos } from './variedades';

const OFFLINE_NOTE_ID = 'canasta-offline';

type Dialogs = { kind: 'create' } | { kind: 'estado'; nodo: CanastaNodo } | { kind: 'detail'; nodo: CanastaNodo };

export function CanastaPage() {
  const gate = useWriteGate();
  const url = useListParams(['estado', 'categoria', 'q']);
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const estado = url.get('estado') as CatalogEstado | '';
  const categoria = url.get('categoria') as CanastaCategoria | '';
  const term = url.get('q');

  // The priced level only: the upper levels of the tree are not editable through the API.
  const filters: CanastaQuery = { nivel: 6, ...(estado ? { estado } : {}), ...(categoria ? { categoria } : {}) };
  const query = useCanastaList(filters);
  const productos = useProductoNodos();

  const visible = useMemo(
    () =>
      (query.data ?? []).filter((n) =>
        matchesSearch([n.nombre, n.codigo, n.padre, n.padre ? productos.byCodigo.get(n.padre)?.nombre : null], term),
      ),
    [query.data, term, productos.byCodigo],
  );
  const slice = paginate(visible, url.page);

  const columns = useMemo<Column<CanastaNodo>[]>(() => {
    return [
      {
        key: 'variedad',
        header: 'Variedad',
        primary: true,
        cell: (n) => (
          <>
            <span>{n.nombre}</span>
            <span className="cell-sub num">{n.codigo}</span>
          </>
        ),
      },
      {
        key: 'producto',
        header: 'Producto',
        cell: (n) => (
          <>
            {n.padre && productos.byCodigo.get(n.padre) ? <span>{productos.byCodigo.get(n.padre)?.nombre}</span> : null}
            <span className="cell-sub num">{n.padre ?? '—'}</span>
          </>
        ),
      },
      { key: 'categoria', header: 'Categoría', nowrap: true, cell: (n) => (n.categoria ? CATEGORIA_LABEL[n.categoria] : '—') },
      { key: 'estado', header: 'Estado', nowrap: true, cell: (n) => <CatalogEstadoChip estado={n.estado} /> },
      {
        key: 'acciones',
        header: 'Acciones',
        align: 'end',
        cell: (n) => (
          <span className="row-actions">
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'detail', nodo: n })}>
              Ver detalle<span className="visually-hidden"> {n.nombre}</span>
            </button>
            <Menu
              label={`Más acciones de ${n.nombre}`}
              trigger={<IconMore size={22} />}
              items={[
                {
                  id: 'estado',
                  label: n.estado === 'ACTIVO' ? 'Quitar de la canasta' : 'Reincorporar',
                  danger: n.estado === 'ACTIVO',
                  disabled: !gate.canWrite,
                  detail: gate.canWrite ? undefined : 'Necesita conexión.',
                  onSelect: () => setDialog({ kind: 'estado', nodo: n }),
                },
              ]}
            />
          </span>
        ),
      },
    ];
  }, [gate.canWrite, productos.byCodigo]);

  const close = () => setDialog(null);

  return (
    <AdminPage
      title="Canasta"
      description="Variedades que se relevan. La estructura superior es fija."
      action={
        <button
          type="button"
          className="btn btn--primary"
          disabled={!gate.canWrite}
          aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
          onClick={() => setDialog({ kind: 'create' })}
        >
          <IconPlus size={20} />
          Agregar variedad
        </button>
      }
    >
      {gate.reason && (
        <p id={OFFLINE_NOTE_ID} className="notice notice--attn">
          {gate.reason}
        </p>
      )}

      <FilterBar label="Filtrar la canasta" className="filters--search">
        <FormField label="Buscar">
          {(p) => (
            <input {...p} className="input" type="search" placeholder="Nombre o código" value={term} onChange={(e) => url.set({ q: e.target.value })} />
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
        <FormField label="Categoría">
          {(p) => (
            <select {...p} className="select" value={categoria} onChange={(e) => url.set({ categoria: e.target.value })}>
              <option value="">Todas</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_LABEL[c]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {url.active && (
          <button type="button" className="btn btn--quiet" onClick={url.clear}>
            Quitar filtros
          </button>
        )}
      </FilterBar>

      {query.isPending && <LoadingRows label="Cargando la canasta" />}
      {query.isError && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {query.isSuccess && visible.length === 0 && (
        <EmptyState
          title={url.active ? 'Ninguna variedad coincide' : 'La canasta no tiene variedades'}
          text={url.active ? 'Pruebe con otros filtros o con otra búsqueda.' : 'Agregue una variedad bajo un producto de la canasta.'}
        />
      )}
      {query.isSuccess && visible.length > 0 && (
        <>
          <p className="admin-note" aria-live="polite">
            {countLabel(visible.length, 'variedad', 'variedades')}
          </p>
          <DataTable caption="Canasta" columns={columns} rows={slice.items} rowKey={(n) => n.codigo} />
          {slice.pageCount > 1 && (
            <Pagination page={slice.page} pageSize={CATALOGO_PAGE_SIZE} count={slice.items.length} total={slice.total} onPage={(p) => url.set({ page: String(p) })} />
          )}
        </>
      )}

      {dialog?.kind === 'create' && <VariedadForm blockedReason={gate.reason} onClose={close} />}
      {dialog?.kind === 'estado' && <VariedadEstadoDialog nodo={dialog.nodo} blockedReason={gate.reason} onClose={close} />}
      {dialog?.kind === 'detail' && (
        <VariedadDetailDialog
          nodo={dialog.nodo}
          productoNombre={dialog.nodo.padre ? (productos.byCodigo.get(dialog.nodo.padre)?.nombre ?? null) : null}
          onClose={close}
        />
      )}
    </AdminPage>
  );
}
