import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { PageHeader } from '@/app/PageHeader';
import { api, PRECIOS_PAGE_SIZE } from '@/shared/api/endpoints';
import { describeApiError } from '@/shared/api/errors';
import { keys, useAsignaciones, useComercios, useProductos, useRelevamientos } from '@/shared/api/queries';
import type { Precio } from '@/shared/api/types';
import { IconAlert, IconChevronDown, IconChevronRight, IconPrices } from '@/shared/icons';
import { formatDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/money';
import { humanizePeriodo } from '@/shared/lib/periodo';
import { useOnline } from '@/shared/lib/useOnline';
import { OfflineNoData } from '@/shared/ui/OfflineNoData';
import { Segmented } from '@/shared/ui/Segmented';
import './precios.css';

type Filter = 'TODOS' | 'ALERTA' | 'OFERTA';

interface ComercioGroup {
  id: string;
  items: Precio[];
}
interface RelGroup {
  id: string;
  comercios: ComercioGroup[];
}

export function PreciosPage() {
  const online = useOnline();
  const [filter, setFilter] = useState<Filter>('TODOS');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const productos = useProductos();
  const comercios = useComercios();
  const relevamientos = useRelevamientos();
  const asignaciones = useAsignaciones();

  const query = useInfiniteQuery({
    queryKey: keys.preciosList(filter),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.listPrecios({
        page: pageParam,
        limit: PRECIOS_PAGE_SIZE,
        conAlerta: filter === 'ALERTA',
        oferta: filter === 'OFERTA',
      }),
    getNextPageParam: (last, _all, lastParam) => (last.length < PRECIOS_PAGE_SIZE ? undefined : lastParam + 1),
  });

  const lookups = useMemo(
    () => ({
      producto: new Map((productos.data ?? []).map((p) => [p.id, p])),
      comercio: new Map((comercios.data ?? []).map((c) => [c.id, c])),
      relevamiento: new Map((relevamientos.data ?? []).map((r) => [r.id, r])),
      asignacion: new Map((asignaciones.data ?? []).map((a) => [`${a.relevamiento}|${a.comercio}`, a.id])),
    }),
    [productos.data, comercios.data, relevamientos.data, asignaciones.data],
  );

  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  const groups = useMemo<RelGroup[]>(() => {
    const byRel = new Map<string, Map<string, Precio[]>>();
    for (const p of items) {
      const rel = byRel.get(p.relevamiento) ?? new Map<string, Precio[]>();
      const list = rel.get(p.comercio) ?? [];
      list.push(p);
      rel.set(p.comercio, list);
      byRel.set(p.relevamiento, rel);
    }
    return [...byRel.entries()]
      .map(([id, com]) => ({
        id,
        comercios: [...com.entries()]
          .map(([cid, list]) => ({
            id: cid,
            items: [...list].sort((a, b) => b.fechaRelevamiento.localeCompare(a.fechaRelevamiento)),
          }))
          .sort((a, b) =>
            (lookups.comercio.get(a.id)?.nombre ?? '').localeCompare(lookups.comercio.get(b.id)?.nombre ?? '', 'es'),
          ),
      }))
      .sort((a, b) =>
        (lookups.relevamiento.get(b.id)?.fechaInicio ?? '').localeCompare(lookups.relevamiento.get(a.id)?.fechaInicio ?? ''),
      );
  }, [items, lookups]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Relevamiento" title="Precios cargados" />

      <Segmented<Filter>
        label="Filtrar precios"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'TODOS', label: 'Todos' },
          { id: 'ALERTA', label: 'Con alerta' },
          { id: 'OFERTA', label: 'En oferta' },
        ]}
      />

      {query.isPending && !online && <OfflineNoData />}
      {query.isPending && online && (
        <div aria-hidden="true" className="pl-loading">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="skeleton" style={{ height: 72, borderRadius: 20 }} />
          ))}
        </div>
      )}
      <p className="visually-hidden" role="status">
        {query.isPending ? 'Cargando precios' : ''}
      </p>

      {query.error && query.data === undefined && (
        <div className="state" role="alert">
          <h2>No se pudieron cargar los precios</h2>
          <p>{describeApiError(query.error)}</p>
          <button type="button" className="btn btn--primary" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {!query.isPending && !(query.error && query.data === undefined) && items.length === 0 && (
        <div className="state">
          <span className="state__icon">
            <IconPrices size={30} />
          </span>
          <h2>No hay precios para mostrar</h2>
          <p>
            {filter === 'TODOS'
              ? 'Inicie una visita y guarde el primer precio para verlo aquí.'
              : 'Ningún precio cumple este filtro.'}
          </p>
          {filter === 'TODOS' ? (
            <Link className="btn btn--primary" to="/">
              Ir a visitas
            </Link>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => setFilter('TODOS')}>
              Ver todos los precios
            </button>
          )}
        </div>
      )}

      {groups.map((g) => {
        const rel = lookups.relevamiento.get(g.id);
        return (
          <section key={g.id} className="pl-rel" aria-labelledby={`pl-rel-${g.id}`}>
            <header className="pl-rel__head">
              <h2 id={`pl-rel-${g.id}`}>{rel ? humanizePeriodo(rel.periodo) : 'Relevamiento sin datos'}</h2>
              {rel?.estado === 'CERRADO' && <span className="chip">Cerrado</span>}
            </header>
            {g.comercios.map((c) => {
              const key = `${g.id}|${c.id}`;
              const isClosed = collapsed.has(key);
              const com = lookups.comercio.get(c.id);
              const asig = lookups.asignacion.get(key);
              return (
                <div key={key} className="pl-com">
                  <button
                    type="button"
                    className="pl-com__head"
                    aria-expanded={!isClosed}
                    aria-controls={`pl-list-${key}`}
                    onClick={() => toggle(key)}
                  >
                    <span className="pl-com__name">{com?.nombre ?? 'Comercio'}</span>
                    <span className="pl-com__count num">
                      {c.items.length} {c.items.length === 1 ? 'precio' : 'precios'}
                    </span>
                    {isClosed ? <IconChevronRight size={22} /> : <IconChevronDown size={22} />}
                  </button>
                  {!isClosed && (
                    <ul id={`pl-list-${key}`} className="pl-list">
                      {c.items.map((p) => {
                        const prod = lookups.producto.get(p.producto);
                        const body = (
                          <>
                            <span className="pl-row__main">
                              <span className="pl-row__name">{prod?.nombre ?? 'Producto'}</span>
                              <span className="pl-row__date num">{formatDate(p.fechaRelevamiento)}</span>
                            </span>
                            <span className="pl-row__chips">
                              {p.oferta && <span className="chip chip--info">En oferta</span>}
                              {p.alerta && (
                                <span className="chip chip--attn">
                                  <IconAlert size={16} /> Con alerta
                                </span>
                              )}
                            </span>
                            <span className="pl-row__value num">{formatMoney(p.valor)}</span>
                          </>
                        );
                        return (
                          <li key={p.id}>
                            {asig ? (
                              <Link
                                className="pl-row"
                                to={`/visita/${asig}?producto=${encodeURIComponent(p.producto)}`}
                              >
                                {body}
                              </Link>
                            ) : (
                              <div className="pl-row">{body}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      {query.hasNextPage && (
        <button
          type="button"
          className="btn btn--large"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </div>
  );
}
