import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isReadOnly, sectionPath } from '@/app/roles';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams } from '@/features/catalogo/useListParams';
import { describeGestionError } from '@/features/gestion/errors';
import { AdminPage } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import type { Calculo } from '@/shared/api/types';
import { IconLock, IconPlus } from '@/shared/icons';
import { formatDateTime } from '@/shared/lib/dates';
import { CalculoForm } from './CalculoForm';
import { EstadoChip } from './EstadoChip';
import { CALCULOS_PAGE_SIZE, useCalculosList } from './queries';
import { useCreatorLabel } from './useCreatorLabel';

const OFFLINE_NOTE_ID = 'calculos-offline';

export function CalculosListPage() {
  const { session } = useAuth();
  const role = session?.user.role ?? 'DIRECCION';
  const readOnly = isReadOnly(role, 'calculos');
  const creatorLabel = useCreatorLabel(role, session?.user.id ?? null);
  const gate = useWriteGate();
  const url = useListParams([]);
  const query = useCalculosList({ page: url.page, limit: CALCULOS_PAGE_SIZE });
  const [creating, setCreating] = useState(false);

  const columns = useMemo<Column<Calculo>[]>(
    () => [
      { key: 'estado', header: 'Estado', nowrap: true, cell: (c) => <EstadoChip estado={c.estado} /> },
      {
        key: 'rango',
        header: 'Rango',
        primary: true,
        cell: (c) => (
          <>
            <span className="num">
              {c.mesBase} a {c.mesObjetivo}
            </span>
            {c.excluirOfertas && <span className="cell-sub">Sin ofertas</span>}
          </>
        ),
      },
      {
        key: 'creado',
        header: 'Creado',
        cell: (c) => (
          <>
            <span className="num">{formatDateTime(c.createdAt)}</span>
            <span className="cell-sub">Por {creatorLabel(c.creadoPor)}</span>
          </>
        ),
      },
      {
        key: 'acciones',
        header: 'Acciones',
        align: 'end',
        cell: (c) => (
          <Link className="btn" to={`${sectionPath('calculos')}/${c.id}`}>
            Ver detalle<span className="visually-hidden"> del cálculo {c.mesBase} a {c.mesObjetivo}</span>
          </Link>
        ),
      },
    ],
    [creatorLabel],
  );

  const items = query.data?.items ?? [];

  return (
    <AdminPage
      title="Cálculos"
      description="Corridas del cálculo de relativos de precios por variedad y de las imputaciones que se aplicaron. El sistema no calcula un índice final."
      action={
        readOnly ? (
          <span className="chip chip--info">
            <IconLock size={16} />
            Solo lectura
          </span>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={!gate.canWrite}
            aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
            onClick={() => setCreating(true)}
          >
            <IconPlus size={20} />
            Nuevo cálculo
          </button>
        )
      }
    >
      {!readOnly && gate.reason && (
        <p id={OFFLINE_NOTE_ID} className="notice notice--attn">
          {gate.reason}
        </p>
      )}
      {query.isPending && <LoadingRows label="Cargando cálculos" />}
      {query.isError && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {query.isSuccess && items.length === 0 && url.page > 1 && (
        <EmptyState
          title="No hay más resultados"
          text="Esta página queda más allá del último cálculo."
          action={
            <button type="button" className="btn btn--primary" onClick={() => url.set({ page: url.page - 1 > 1 ? String(url.page - 1) : '' })}>
              Volver a la página anterior
            </button>
          }
        />
      )}
      {query.isSuccess && items.length === 0 && url.page <= 1 && (
        <EmptyState
          title="Todavía no hay cálculos"
          text={readOnly ? 'Cuando se realice un cálculo aparecerá aquí.' : 'Inicie el primero con "Nuevo cálculo" una vez cerrados los relevamientos del rango.'}
        />
      )}
      {query.isSuccess && items.length > 0 && (
        <>
          <DataTable caption="Cálculos realizados, del más reciente al más antiguo" columns={columns} rows={items} rowKey={(c) => c.id} />
          <Pagination
            page={url.page}
            pageSize={CALCULOS_PAGE_SIZE}
            count={items.length}
            total={query.data.total}
            busy={query.isFetching}
            onPage={(n) => url.set({ page: n > 1 ? String(n) : '' })}
          />
        </>
      )}
      {creating && <CalculoForm onClose={() => setCreating(false)} />}
    </AdminPage>
  );
}
