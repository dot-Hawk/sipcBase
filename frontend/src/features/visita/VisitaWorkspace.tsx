import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EditBlockReason } from '@/features/asignaciones/rules';
import { usePrecioAnterior } from '@/shared/api/queries';
import type { ProductPending } from '@/features/outbox/view';
import type { Precio, Producto } from '@/shared/api/types';
import { IconCheckCircle, IconChevronDown, IconChevronUp, IconLock, IconInfo, IconSearch } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { Segmented } from '@/shared/ui/Segmented';
import type { Draft, DraftMap } from './drafts';
import { nextPendingId } from './nextPending';
import { formatQuantity, PriceEditor, type PriceSubmit } from './PriceEditor';
import { LIST_STEP, ProductList } from './ProductList';
import type { SeriesPoint } from './history';
import { resolvePrevious, type PreviousPrice } from './previous';
import type { SavePriceResult } from './savePrice';
import './visita.css';

type StatusFilter = 'TODOS' | 'SIN' | 'CON' | 'ALERTA';

const BLOCK_COPY: Record<'completed' | 'cancelled' | 'closed', string> = {
  completed: 'La visita está finalizada. Los precios y las fotos quedan solo para consulta.',
  cancelled: 'La visita fue cancelada. Los precios y las fotos quedan solo para consulta.',
  closed: 'El relevamiento está cerrado. Los precios y las fotos quedan solo para consulta.',
};
const blockCopy = (reason: EditBlockReason) => BLOCK_COPY[reason === 'not-started' ? 'closed' : reason];

export interface WorkspaceProps {
  /** Resets the editor and filters when the visit changes. */
  visitaId: string;
  productos: readonly Producto[];
  saved: ReadonlyMap<string, Precio>;
  /** Own-price "Anterior": the fallback when the endpoint has nothing to say. */
  previousFor: (productoId: string) => PreviousPrice | null;
  /** When set, the selected producto's "Anterior" comes from `GET /precios/anterior`. */
  previousSource?: { relevamiento: string; comercio: string };
  seriesFor: (productoId: string) => readonly SeriesPoint[];
  editable: boolean;
  blockReason: EditBlockReason | null;
  offline: boolean;
  /** true: list and editor side by side. false: list only, the editor opens as a sheet. */
  wide: boolean;
  initialDrafts: DraftMap;
  initialSelectedId?: string | null;
  onDraftChange: (productoId: string, draft: Draft | null) => void;
  onSave: (productoId: string, input: PriceSubmit) => Promise<SavePriceResult | { kind: 'queued' }>;
  /** Outbox state per producto (queued price, queued photos). */
  pending?: ReadonlyMap<string, ProductPending>;
  onConfirmPending?: (productoId: string) => void;
  onRetryPending?: () => void;
  onDiscardPending?: (productoId: string) => void;
  onDelete: (precio: Precio) => Promise<void>;
  photoSlotFor: (producto: Producto, saved: Precio | null) => ReactNode;
  onStartVisit: () => void;
  onFinishVisit: () => void;
  startingVisit?: boolean;
}

const byCategoryThenName = (a: Producto, b: Producto) =>
  a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es');

function AllDone({ onFinish, canFinish }: { onFinish: () => void; canFinish: boolean }) {
  return (
    <div className="alldone">
      <span className="state__icon alldone__icon">
        <IconCheckCircle size={32} />
      </span>
      <h2>Todos los productos tienen precio</h2>
      <p>Revise los que tengan alerta antes de cerrar. Puede volver a tocar cualquier producto para corregirlo.</p>
      {canFinish && (
        <button type="button" className="btn btn--primary btn--large" onClick={onFinish}>
          Finalizar visita
        </button>
      )}
    </div>
  );
}

/** One query for the selected producto only; mounted just for it, never per list row. */
function RemotePrevious({
  source,
  productoId,
  fallback,
  children,
}: {
  source: { relevamiento: string; comercio: string };
  productoId: string;
  fallback: PreviousPrice | null;
  children: (previous: PreviousPrice | null) => ReactNode;
}) {
  const query = usePrecioAnterior(source, productoId);
  const remote =
    query.status === 'success'
      ? ({ status: 'success', data: query.data ?? null } as const)
      : ({ status: query.status, data: undefined } as const);
  return <>{children(resolvePrevious(remote, fallback))}</>;
}

export function VisitaWorkspace(props: WorkspaceProps) {
  const {
    productos, saved, previousFor, previousSource, seriesFor, editable, blockReason, offline, wide, initialDrafts,
    onDraftChange, onSave, onDelete, photoSlotFor, onStartVisit, onFinishVisit, startingVisit,
    pending, onConfirmPending, onRetryPending, onDiscardPending,
  } = props;

  const sorted = useMemo(() => [...productos].sort(byCategoryThenName), [productos]);
  const orderedIds = useMemo(() => sorted.map((p) => p.id), [sorted]);
  const byId = useMemo(() => new Map(sorted.map((p) => [p.id, p])), [sorted]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('TODOS');
  const [visible, setVisible] = useState(LIST_STEP);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (props.initialSelectedId && sorted.some((p) => p.id === props.initialSelectedId)) return props.initialSelectedId;
    if (!wide) return null;
    const firstPending = sorted.find((p) => !saved.has(p.id));
    return (editable ? firstPending : undefined)?.id ?? sorted[0]?.id ?? null;
  });
  const [sheetOpen, setSheetOpen] = useState(() => !wide && Boolean(props.initialSelectedId));
  const [done, setDone] = useState(false);
  const interacted = useRef(false);
  const draftsRef = useRef(initialDrafts);

  const counts = useMemo(() => {
    let con = 0;
    let alerta = 0;
    for (const p of sorted) {
      const s = saved.get(p.id);
      if (s) con += 1;
      if (s?.alerta) alerta += 1;
    }
    return { TODOS: sorted.length, SIN: sorted.length - con, CON: con, ALERTA: alerta };
  }, [sorted, saved]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((p) => {
      if (q && !`${p.nombre} ${p.marca ?? ''} ${p.codigoVariedad}`.toLowerCase().includes(q)) return false;
      const s = saved.get(p.id);
      if (filter === 'SIN') return !s;
      if (filter === 'CON') return Boolean(s);
      if (filter === 'ALERTA') return Boolean(s?.alerta);
      return true;
    });
  }, [sorted, search, filter, saved]);

  const pricedIds = useMemo(() => new Set(saved.keys()), [saved]);

  const select = useCallback((id: string) => {
    interacted.current = true;
    setDone(false);
    setSelectedId(id);
    setSheetOpen(true);
    // Make sure a product reached through "next" is inside the rendered window.
    const index = orderedIds.indexOf(id);
    setVisible((v) => Math.max(v, index + 1));
  }, [orderedIds]);

  function handleDone(advance: boolean) {
    if (!advance) return;
    const next = nextPendingId(orderedIds, pricedIds, selectedId);
    // The list shown may be filtered; the next pending producto must be visible there too.
    if (next) {
      select(next);
      const inView = filtered.some((p) => p.id === next);
      if (!inView) {
        setSearch('');
        setFilter('TODOS');
      }
    } else {
      interacted.current = true;
      setSelectedId(null);
      setSheetOpen(false);
      setDone(true);
    }
  }

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const selectedPrice = selected ? (saved.get(selected.id) ?? null) : null;

  const renderEditor = (selected: Producto, previous: PreviousPrice | null) => (
    <PriceEditor
      key={`${props.visitaId}-${selected.id}`}
      producto={selected}
      previous={previous}
      series={seriesFor(selected.id)}
      saved={selectedPrice}
      readOnly={!editable}
      blockReason={blockReason}
      offline={offline}
      initialDraft={draftsRef.current[selected.id]}
      onDraftChange={(d) => {
        if (d) draftsRef.current[selected.id] = d;
        else delete draftsRef.current[selected.id];
        onDraftChange(selected.id, d);
      }}
      onSave={(input) => onSave(selected.id, input)}
      pending={pending?.get(selected.id) ?? null}
      onConfirmPending={onConfirmPending ? () => onConfirmPending(selected.id) : undefined}
      onRetryPending={onRetryPending}
      onDiscardPending={onDiscardPending ? () => onDiscardPending(selected.id) : undefined}
      onDelete={selectedPrice ? () => onDelete(selectedPrice) : undefined}
      onDone={({ advance }) => handleDone(advance)}
      onStartVisit={onStartVisit}
      startingVisit={startingVisit}
      photoSlot={photoSlotFor(selected, selectedPrice)}
      autoFocus={interacted.current}
      showHeader={wide}
    />
  );

  const fallbackPrevious = selected ? previousFor(selected.id) : null;
  const editor = selected
    ? previousSource
      ? (
          <RemotePrevious source={previousSource} productoId={selected.id} fallback={fallbackPrevious}>
            {(previous) => renderEditor(selected, previous)}
          </RemotePrevious>
        )
      : renderEditor(selected, fallbackPrevious)
    : null;

  const index = selected ? orderedIds.indexOf(selected.id) : -1;
  const go = (delta: number) => {
    const id = orderedIds[index + delta];
    if (id) select(id);
  };

  return (
    <div className="workspace">
      <section className="list-pane" aria-label="Productos">
        <div className="list-pane__tools">
          <div className="input-wrap">
            <span className="input-wrap__icon" aria-hidden="true">
              <IconSearch size={22} />
            </span>
            <input
              className="input"
              type="search"
              aria-label="Buscar producto"
              placeholder="Buscar por nombre, marca o código"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisible(LIST_STEP);
              }}
            />
          </div>
          <Segmented<StatusFilter>
            label="Filtrar productos"
            value={filter}
            onChange={(f) => {
              setFilter(f);
              setVisible(LIST_STEP);
            }}
            options={[
              { id: 'TODOS', label: 'Todos', count: counts.TODOS },
              { id: 'SIN', label: 'Pendientes', count: counts.SIN },
              { id: 'CON', label: 'Con precio', count: counts.CON },
              { id: 'ALERTA', label: 'Con alerta', count: counts.ALERTA },
            ]}
          />
        </div>

        {!wide && done && (
          <div className="list-pane__done">
            <AllDone onFinish={onFinishVisit} canFinish={editable} />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="list-pane__empty">
            <h3>No hay productos para este filtro</h3>
            <p>Cambie la búsqueda o muestre todos los productos.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSearch('');
                setFilter('TODOS');
              }}
            >
              Quitar filtros
            </button>
          </div>
        ) : (
          <div className="list-pane__scroll">
            <p className="visually-hidden" role="status">
              {filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}
            </p>
            <ProductList
              productos={filtered}
              saved={saved}
              selectedId={selectedId}
              pending={pending}
              visible={visible}
              onSelect={select}
              onShowMore={() => setVisible((v) => v + LIST_STEP)}
            />
          </div>
        )}
      </section>

      {wide && (
        <section className="editor-pane" aria-label="Precio del producto">
          {!editable && blockReason && blockReason !== 'not-started' && (
            <div className="notice notice--attn editor-pane__banner">
              <IconLock size={20} />
              <p>
                {blockCopy(blockReason)}
              </p>
            </div>
          )}
          {editor ?? (done ? (
            <AllDone onFinish={onFinishVisit} canFinish={editable} />
          ) : (
            <div className="editor-pane__empty">
              <span className="state__icon">
                <IconInfo size={28} />
              </span>
              <h2>Elija un producto</h2>
              <p>Toque un producto de la lista para cargar su precio.</p>
            </div>
          ))}
        </section>
      )}

      {!wide && sheetOpen && selected && editor && (
        <Dialog
          tall
          title={selected.nombre}
          onClose={() => setSheetOpen(false)}
          description={
            <p className="sheet-meta">
              {selected.marca ? `${selected.marca}, ` : ''}
              <span className="num">{formatQuantity(selected)}</span>
            </p>
          }
          headerExtra={
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label="Producto anterior"
                disabled={index <= 0}
                onClick={() => go(-1)}
              >
                <IconChevronUp size={24} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Producto siguiente"
                disabled={index < 0 || index >= orderedIds.length - 1}
                onClick={() => go(1)}
              >
                <IconChevronDown size={24} />
              </button>
            </>
          }
        >
          {!editable && blockReason && blockReason !== 'not-started' && (
            <div className="notice notice--attn" style={{ margin: '0 20px 12px' }}>
              <IconLock size={20} />
              <p>
                {blockCopy(blockReason)}
              </p>
            </div>
          )}
          {editor}
        </Dialog>
      )}
    </div>
  );
}
