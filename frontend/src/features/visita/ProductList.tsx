import { memo, useEffect, useMemo } from 'react';
import type { Precio, Producto } from '@/shared/api/types';
import { IconAlert, IconCheckCircle, IconPending } from '@/shared/icons';
import { formatMoney } from '@/shared/lib/money';
import { STATE_LABEL } from '@/features/outbox/labels';
import type { ProductPending } from '@/features/outbox/view';
import { formatQuantity } from './PriceEditor';

export const LIST_STEP = 60;

interface RowProps {
  producto: Producto;
  valor: number | null;
  alert: boolean;
  selected: boolean;
  pending: ProductPending | null;
  onSelect: (id: string) => void;
}

/** Re-renders only when its own producto, price or selection changes. */
const ProductRow = memo(function ProductRow({ producto, valor, alert, selected, pending, onSelect }: RowProps) {
  const queued = pending?.price ?? null;
  const needsLook = queued === 'needs-confirmation' || queued === 'rejected' || queued === 'failed';
  const state = queued
    ? STATE_LABEL[queued]
    : alert
      ? 'Precio atípico'
      : valor !== null
        ? 'Con precio'
        : 'Pendiente';
  const photos = pending && pending.photos > 0 ? pending.photos : 0;
  const bad = queued === 'rejected' || queued === 'failed';
  const mark = bad ? 'bad' : needsLook || (alert && !queued) ? 'alert' : queued ? 'queued' : valor !== null ? 'done' : 'todo';
  return (
    <li>
      <button
        type="button"
        id={`prod-${producto.id}`}
        className={`prow${selected ? ' prow--selected' : ''}`}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(producto.id)}
      >
        <span className="prow__main">
          <span className="prow__name">{producto.nombre}</span>
          <span className="prow__meta">
            {producto.marca ? `${producto.marca}, ` : ''}
            <span className="num">{formatQuantity(producto)}</span>
          </span>
          {(queued || photos > 0) && (
            <span className={`prow__queued${bad ? ' prow__queued--bad' : needsLook ? ' prow__queued--look' : ''}`}>
              {queued && <span>{STATE_LABEL[queued]}</span>}
              {photos > 0 && (
                <span>
                  {queued ? ' · ' : ''}
                  {photos} {photos === 1 ? 'foto' : 'fotos'} por enviar
                </span>
              )}
            </span>
          )}
        </span>
        <span className={`prow__price num${valor === null ? ' prow__price--empty' : ''}`}>
          {valor !== null ? formatMoney(valor) : '—'}
        </span>
        <span className={`prow__mark prow__mark--${mark}`}>
          {mark === 'alert' || mark === 'bad' ? (
            <IconAlert size={24} />
          ) : mark === 'queued' ? (
            <IconPending size={24} />
          ) : mark === 'done' ? (
            <IconCheckCircle size={24} />
          ) : (
            <IconPending size={24} />
          )}
          {/* The visible label above already says it; keep one accessible state. */}
          <span className="visually-hidden">{queued ? '' : state}</span>
        </span>
      </button>
    </li>
  );
});

interface Props {
  productos: readonly Producto[];
  saved: ReadonlyMap<string, Precio>;
  selectedId: string | null;
  pending?: ReadonlyMap<string, ProductPending>;
  visible: number;
  onSelect: (id: string) => void;
  onShowMore: () => void;
}

export function ProductList({ productos, saved, selectedId, pending, visible, onSelect, onShowMore }: Props) {
  const shown = productos.slice(0, visible);
  const groups = useMemo(() => {
    const out: { categoria: string; items: Producto[] }[] = [];
    for (const p of shown) {
      const last = out[out.length - 1];
      if (last && last.categoria === p.categoria) last.items.push(p);
      else out.push({ categoria: p.categoria, items: [p] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, visible]);

  useEffect(() => {
    if (selectedId) document.getElementById(`prod-`)?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div className="plist">
      {groups.map((g) => (
        <section key={g.categoria} aria-label={g.categoria}>
          <h2 className="plist__cat">{g.categoria}</h2>
          <ul>
            {g.items.map((p) => {
              const precio = saved.get(p.id);
              return (
                <ProductRow
                  key={p.id}
                  producto={p}
                  valor={precio ? precio.valor : null}
                  alert={Boolean(precio?.alerta)}
                  selected={p.id === selectedId}
                  pending={pending?.get(p.id) ?? null}
                  onSelect={onSelect}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {productos.length > visible && (
        <div className="plist__more">
          <button type="button" className="btn" onClick={onShowMore}>
            Mostrar {Math.min(LIST_STEP, productos.length - visible)} más
          </button>
        </div>
      )}
    </div>
  );
}
