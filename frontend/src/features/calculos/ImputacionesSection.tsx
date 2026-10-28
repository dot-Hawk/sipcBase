import { useMemo } from 'react';
import { useListParams } from '@/features/catalogo/useListParams';
import { describeGestionError } from '@/features/gestion/errors';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import type { CalculoImputacion } from '@/shared/api/types';
import { formatMoney } from '@/shared/lib/money';
import { IMPUTACIONES_PAGE_SIZE, useCalculoImputaciones } from './queries';
import { formatRelativo } from './rules';
import type { NameLookups } from './useNameLookups';
import { VariedadCell } from './VariedadCell';

type Url = ReturnType<typeof useListParams>;

/** Prices the engine filled in, page by page (`page` in the URL). The backend sends no total. */
export function ImputacionesSection({ calculoId, names, url }: { calculoId: string; names: NameLookups; url: Url }) {
  const query = useCalculoImputaciones(calculoId, { page: url.page, limit: IMPUTACIONES_PAGE_SIZE });

  const columns = useMemo<Column<CalculoImputacion>[]>(
    () => [
      { key: 'variedad', header: 'Variedad', primary: true, cell: (i) => <VariedadCell codigo={i.variedad} names={names} /> },
      { key: 'comercio', header: 'Comercio', cell: (i) => names.comercioNombre(i.comercio) },
      { key: 'mes', header: 'Mes', nowrap: true, cell: (i) => <span className="num">{i.mes}</span> },
      { key: 'precio', header: 'Precio imputado', nowrap: true, cell: (i) => <span className="num">{formatMoney(i.precio)}</span> },
      { key: 'nivel', header: 'Nivel', cell: (i) => String(i.nivel) },
      { key: 'grupo', header: 'Grupo', cell: (i) => (i.grupo === null ? '—' : String(i.grupo)) },
      { key: 'factor', header: 'Factor', align: 'end', cell: (i) => <span className="num">{formatRelativo(i.factor) ?? '—'}</span> },
    ],
    [names],
  );
  const items = query.data?.items ?? [];

  return (
    <section className="calc-section" aria-labelledby="calc-imputaciones-h">
      <h2 id="calc-imputaciones-h">Imputaciones</h2>
      <p className="admin-note">Precios que el cálculo completó donde un comercio no tenía dato, y cómo se estimaron.</p>
      {query.isPending && <LoadingRows label="Cargando imputaciones" />}
      {query.isError && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {query.isSuccess && items.length === 0 && url.page > 1 && (
        <EmptyState
          title="No hay más resultados"
          text="Esta página queda más allá de la última imputación."
          action={
            <button type="button" className="btn btn--primary" onClick={() => url.set({ page: url.page - 1 > 1 ? String(url.page - 1) : '' })}>
              Volver a la página anterior
            </button>
          }
        />
      )}
      {query.isSuccess && items.length === 0 && url.page <= 1 && (
        <EmptyState title="Sin imputaciones" text="Este cálculo no necesitó completar ningún precio." />
      )}
      {query.isSuccess && items.length > 0 && (
        <>
          <DataTable caption="Imputaciones aplicadas" columns={columns} rows={items} rowKey={(i) => i.id} />
          <Pagination
            page={url.page}
            pageSize={IMPUTACIONES_PAGE_SIZE}
            count={items.length}
            total={query.data?.total ?? null}
            busy={query.isFetching}
            label="Paginación de imputaciones"
            onPage={(n) => url.set({ page: n > 1 ? String(n) : '' })}
          />
        </>
      )}
    </section>
  );
}
