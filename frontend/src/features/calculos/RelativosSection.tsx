import { useMemo } from 'react';
import { useListParams } from '@/features/catalogo/useListParams';
import { describeGestionError } from '@/features/gestion/errors';
import { FilterBar } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { FormField } from '@/features/gestion/ui/FormField';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import type { Calculo, CalculoRelativo } from '@/shared/api/types';
import { useCalculoRelativos } from './queries';
import { formatRelativo, monthsInRange } from './rules';
import type { NameLookups } from './useNameLookups';
import { VariedadCell } from './VariedadCell';

export const RELATIVOS_PAGE_SIZE = 25;
const VARIEDAD_FORMAT = /^\d{7}$/;
export const NO_DATA = 'Sin dato: ningún comercio tuvo precio en ambos meses.';

type Url = ReturnType<typeof useListParams>;

/** Relative prices by variedad and month. Filters and page live in the URL (`variedad`, `mes`, `rpage`). */
export function RelativosSection({ calculo, names, url }: { calculo: Calculo; names: NameLookups; url: Url }) {
  const months = useMemo(() => monthsInRange(calculo.mesBase, calculo.mesObjetivo), [calculo.mesBase, calculo.mesObjetivo]);
  const variedadText = url.get('variedad');
  const variedadValid = VARIEDAD_FORMAT.test(variedadText);
  const mesParam = url.get('mes');
  const mes = months.includes(mesParam) ? mesParam : '';
  const filters = { ...(variedadValid ? { variedad: variedadText } : {}), ...(mes ? { mes } : {}) };
  const query = useCalculoRelativos(calculo.id, filters);
  const rpage = Math.max(1, Number(url.get('rpage')) || 1);
  // The listing keeps the imputations page when a filter changes (the shared hook would reset `page`).
  const keepPage = { page: url.get('page') };

  const columns = useMemo<Column<CalculoRelativo>[]>(
    () => [
      { key: 'variedad', header: 'Variedad', primary: true, cell: (r) => <VariedadCell codigo={r.variedad} names={names} /> },
      { key: 'mes', header: 'Mes', nowrap: true, cell: (r) => <span className="num">{r.mes}</span> },
      {
        key: 'valor',
        header: 'Relativo',
        nowrap: true,
        cell: (r) => {
          const text = formatRelativo(r.valor);
          return text !== null ? (
            <span className="num">{text}</span>
          ) : (
            <>
              <span aria-hidden="true">—</span>
              <span className="visually-hidden">{NO_DATA}</span>
            </>
          );
        },
      },
      { key: 'super', header: 'Súper (n)', align: 'end', cell: (r) => <span className="num">{r.nSuper}</span> },
      { key: 'trad', header: 'Tradicional (n)', align: 'end', cell: (r) => <span className="num">{r.nTrad}</span> },
    ],
    [names],
  );

  const all = query.data ?? [];
  const rows = all.slice((rpage - 1) * RELATIVOS_PAGE_SIZE, rpage * RELATIVOS_PAGE_SIZE);
  const filtered = Boolean(variedadText || mes);

  return (
    <section className="calc-section" aria-labelledby="calc-relativos-h">
      <h2 id="calc-relativos-h">Relativos por variedad</h2>
      <p className="admin-note">Cociente entre el precio del mes y el del mes base. Un guion indica que ningún comercio tuvo precio en ambos meses.</p>
      <FilterBar label="Filtrar relativos">
        <FormField label="Variedad (código de 7 dígitos)" error={variedadText && !variedadValid ? 'El código de variedad tiene 7 dígitos.' : undefined}>
          {(p) => (
            <input
              {...p}
              className="input"
              inputMode="numeric"
              autoComplete="off"
              value={variedadText}
              onChange={(e) => url.set({ variedad: e.target.value.trim(), rpage: '', ...keepPage })}
            />
          )}
        </FormField>
        <FormField label="Mes">
          {(p) => (
            <select {...p} className="select" value={mes} onChange={(e) => url.set({ mes: e.target.value, rpage: '', ...keepPage })}>
              <option value="">Todos</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {filtered && (
          <button type="button" className="btn btn--quiet" onClick={() => url.set({ variedad: '', mes: '', rpage: '', ...keepPage })}>
            Quitar filtros
          </button>
        )}
      </FilterBar>

      {query.isPending && <LoadingRows label="Cargando relativos" />}
      {query.isError && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {query.isSuccess && all.length === 0 && (
        <EmptyState
          title={filtered ? 'Ningún relativo coincide' : 'Sin relativos'}
          text={filtered ? 'Pruebe con otro código o mes, o quite los filtros.' : 'Este cálculo no produjo relativos.'}
        />
      )}
      {query.isSuccess && all.length > 0 && (
        <>
          <DataTable
            caption="Relativos por variedad y mes"
            columns={columns}
            rows={rows}
            rowKey={(r) => `${r.variedad}-${r.mes}`}
          />
          {all.length > RELATIVOS_PAGE_SIZE && (
            <Pagination
              page={rpage}
              pageSize={RELATIVOS_PAGE_SIZE}
              count={rows.length}
              total={all.length}
              label="Paginación de relativos"
              onPage={(n) => url.set({ rpage: n > 1 ? String(n) : '', ...keepPage })}
            />
          )}
        </>
      )}
    </section>
  );
}
