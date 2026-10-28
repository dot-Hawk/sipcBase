import { useMemo, useState } from 'react';
import { describeGestionError } from '@/features/gestion/errors';
import { AdminPage, FilterBar } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { FormField } from '@/features/gestion/ui/FormField';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import { countLabel } from '@/shared/api/page';
import type { CatalogEstado, Producto, ProductosQuery, Unidad } from '@/shared/api/types';
import { IconMore, IconPlus } from '@/shared/icons';
import { Menu } from '@/shared/ui/Menu';
import { CatalogEstadoChip } from './EstadoChip';
import { ProductoDetailDialog, ProductoEstadoDialog } from './ProductoDialogs';
import { ProductoForm } from './ProductoForm';
import { useProductosList } from './queries';
import { CATALOGO_PAGE_SIZE, ESTADOS, ESTADO_LABEL, UNIDADES, UNIDAD_LABEL, formatCantidad, matchesSearch, paginate } from './rules';
import { useListParams } from './useListParams';
import { useVariedades } from './variedades';

const OFFLINE_NOTE_ID = 'productos-offline';

type Dialogs =
  | { kind: 'create' }
  | { kind: 'edit'; producto: Producto }
  | { kind: 'estado'; producto: Producto }
  | { kind: 'detail'; producto: Producto };

export function ProductosPage() {
  const gate = useWriteGate();
  const url = useListParams(['estado', 'categoria', 'unidad', 'q']);
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const estado = url.get('estado') as CatalogEstado | '';
  const categoria = url.get('categoria');
  const unidad = url.get('unidad') as Unidad | '';
  const term = url.get('q');

  const filters: ProductosQuery = {
    ...(estado ? { estado } : {}),
    ...(unidad ? { unidad } : {}),
    ...(categoria ? { categoria } : {}),
  };
  const query = useProductosList(filters);
  const everything = useProductosList({});
  const variedades = useVariedades();
  const categorias = useMemo(
    () => Array.from(new Set((everything.data ?? []).map((p) => p.categoria))).sort((a, b) => a.localeCompare(b, 'es')),
    [everything.data],
  );

  const visible = useMemo(
    () => (query.data ?? []).filter((p) => matchesSearch([p.nombre, p.marca, p.categoria], term)),
    [query.data, term],
  );
  const slice = paginate(visible, url.page);

  const columns = useMemo<Column<Producto>[]>(() => {
    const note = gate.canWrite ? undefined : OFFLINE_NOTE_ID;
    return [
      {
        key: 'producto',
        header: 'Producto',
        primary: true,
        cell: (p) => (
          <>
            <span>{p.nombre}</span>
            <span className="cell-sub">
              {p.marca ?? 'Sin marca'} · {p.categoria}
            </span>
          </>
        ),
      },
      { key: 'presentacion', header: 'Presentación', nowrap: true, cell: (p) => formatCantidad(Number(p.cantidadReferencia), p.unidad) },
      {
        key: 'variedad',
        header: 'Variedad',
        cell: (p) => {
          const v = variedades.byCodigo.get(p.codigoVariedad);
          return (
            <>
              {v ? <span>{v.nombre}</span> : null}
              <span className="cell-sub num">{p.codigoVariedad}{v?.estado === 'INACTIVO' ? ' · inactiva' : ''}</span>
            </>
          );
        },
      },
      { key: 'estado', header: 'Estado', nowrap: true, cell: (p) => <CatalogEstadoChip estado={p.estado} /> },
      {
        key: 'acciones',
        header: 'Acciones',
        align: 'end',
        cell: (p) => (
          <span className="row-actions">
            <button type="button" className="btn" disabled={!gate.canWrite} aria-describedby={note} onClick={() => setDialog({ kind: 'edit', producto: p })}>
              Editar<span className="visually-hidden"> {p.nombre}</span>
            </button>
            <Menu
              label={`Más acciones de ${p.nombre}`}
              trigger={<IconMore size={22} />}
              items={[
                { id: 'detail', label: 'Ver detalle', onSelect: () => setDialog({ kind: 'detail', producto: p }) },
                {
                  id: 'estado',
                  label: p.estado === 'ACTIVO' ? 'Desactivar' : 'Reactivar',
                  danger: p.estado === 'ACTIVO',
                  disabled: !gate.canWrite,
                  detail: gate.canWrite ? undefined : 'Necesita conexión.',
                  onSelect: () => setDialog({ kind: 'estado', producto: p }),
                },
              ]}
            />
          </span>
        ),
      },
    ];
  }, [gate.canWrite, variedades.byCodigo]);

  const close = () => setDialog(null);

  return (
    <AdminPage
      title="Productos"
      description="Productos con marca y presentación, ligados a una variedad."
      action={
        <button
          type="button"
          className="btn btn--primary"
          disabled={!gate.canWrite}
          aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
          onClick={() => setDialog({ kind: 'create' })}
        >
          <IconPlus size={20} />
          Nuevo producto
        </button>
      }
    >
      {gate.reason && (
        <p id={OFFLINE_NOTE_ID} className="notice notice--attn">
          {gate.reason}
        </p>
      )}

      <FilterBar label="Filtrar productos" className="filters--search">
        <FormField label="Buscar">
          {(p) => (
            <input {...p} className="input" type="search" placeholder="Nombre o marca" value={term} onChange={(e) => url.set({ q: e.target.value })} />
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
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Unidad">
          {(p) => (
            <select {...p} className="select" value={unidad} onChange={(e) => url.set({ unidad: e.target.value })}>
              <option value="">Todas</option>
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {UNIDAD_LABEL[u]}
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

      {query.isPending && <LoadingRows label="Cargando productos" />}
      {query.isError && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {query.isSuccess && visible.length === 0 && (
        <EmptyState
          title={url.active ? 'Ningún producto coincide' : 'Todavía no hay productos'}
          text={url.active ? 'Pruebe con otros filtros o con otra búsqueda.' : 'Cree el primer producto para poder relevar su precio.'}
        />
      )}
      {query.isSuccess && visible.length > 0 && (
        <>
          <p className="admin-note" aria-live="polite">
            {countLabel(visible.length, 'producto', 'productos')}
          </p>
          <DataTable caption="Productos" columns={columns} rows={slice.items} rowKey={(p) => p.id} />
          {slice.pageCount > 1 && (
            <Pagination page={slice.page} pageSize={CATALOGO_PAGE_SIZE} count={slice.items.length} total={slice.total} onPage={(p) => url.set({ page: String(p) })} />
          )}
        </>
      )}

      {dialog?.kind === 'create' && <ProductoForm categorias={categorias} blockedReason={gate.reason} onClose={close} />}
      {dialog?.kind === 'edit' && <ProductoForm producto={dialog.producto} categorias={categorias} blockedReason={gate.reason} onClose={close} />}
      {dialog?.kind === 'estado' && <ProductoEstadoDialog producto={dialog.producto} blockedReason={gate.reason} onClose={close} />}
      {dialog?.kind === 'detail' && <ProductoDetailDialog producto={dialog.producto} onClose={close} />}
    </AdminPage>
  );
}
