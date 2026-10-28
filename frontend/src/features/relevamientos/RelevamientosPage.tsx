import { useMemo, useState } from 'react';
import { FRECUENCIA_LABEL } from '@/features/asignaciones/labels';
import { countLabel } from '@/shared/api/page';
import { describeGestionError } from '@/features/gestion/errors';
import {
  useCloseRelevamiento,
  useGestionAsignaciones,
  useGestionRelevamientosPage,
} from '@/features/gestion/queries';
import { AdminPage } from '@/features/gestion/ui/AdminPage';
import { ConfirmDialog } from '@/features/gestion/ui/ConfirmDialog';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { StatusChip } from '@/features/gestion/ui/StatusChip';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import { ApiError } from '@/shared/api/errors';
import type { Asignacion, Relevamiento } from '@/shared/api/types';
import { IconCheck, IconOnline, IconPlus } from '@/shared/icons';
import { formatDate } from '@/shared/lib/dates';
import { useToast } from '@/shared/ui/Toast';
import { RelevamientoForm } from './RelevamientoForm';

const OFFLINE_NOTE_ID = 'relevamientos-offline';

function avanceOf(list: readonly Asignacion[] | undefined, id: string): { done: number; total: number } | null {
  if (!list) return null;
  // A cancelled visit is no longer expected work.
  const mine = list.filter((a) => a.relevamiento === id && a.estado !== 'CANCELADA');
  return { done: mine.filter((a) => a.estado === 'COMPLETADA').length, total: mine.length };
}

export function RelevamientosPage() {
  const query = useGestionRelevamientosPage();
  const asignaciones = useGestionAsignaciones();
  const gate = useWriteGate();
  const toast = useToast();
  const close = useCloseRelevamiento();
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<Relevamiento | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const columns = useMemo<Column<Relevamiento>[]>(
    () => [
      { key: 'periodo', header: 'Período', primary: true, cell: (r) => r.periodo },
      { key: 'frecuencia', header: 'Frecuencia', cell: (r) => FRECUENCIA_LABEL[r.frecuencia] },
      {
        key: 'vigencia',
        header: 'Vigencia',
        cell: (r) => (
          <>
            {formatDate(r.fechaInicio)}
            <span className="cell-sub">hasta {formatDate(r.fechaLimite)}</span>
          </>
        ),
      },
      {
        key: 'estado',
        header: 'Estado',
        nowrap: true,
        cell: (r) =>
          r.estado === 'ABIERTO' ? (
            <StatusChip tone="info" icon={<IconOnline size={16} />}>
              Abierto
            </StatusChip>
          ) : (
            <StatusChip tone="neutral" icon={<IconCheck size={16} />}>
              Cerrado
            </StatusChip>
          ),
      },
      {
        key: 'avance',
        header: 'Avance',
        cell: (r) => {
          const a = avanceOf(asignaciones.data, r.id);
          if (!a) return '—';
          return a.total === 0 ? 'Sin asignaciones' : `${a.done} de ${a.total} completadas`;
        },
      },
      {
        key: 'acciones',
        header: 'Acciones',
        align: 'end',
        cell: (r) =>
          r.estado === 'ABIERTO' ? (
            <button
              type="button"
              className="btn btn--danger"
              disabled={!gate.canWrite}
              aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
              onClick={() => {
                setCloseError(null);
                setClosing(r);
              }}
            >
              Cerrar{' '}<span className="visually-hidden">relevamiento {r.periodo}</span>
            </button>
          ) : null,
      },
    ],
    [asignaciones.data, gate.canWrite],
  );

  async function confirmClose() {
    if (!closing) return;
    try {
      await close.mutateAsync(closing.id);
      toast(`Relevamiento ${closing.periodo} cerrado.`);
      setClosing(null);
    } catch (err) {
      setCloseError(
        err instanceof ApiError && err.status === 409
          ? 'Este relevamiento ya estaba cerrado. Actualice la pantalla.'
          : describeGestionError(err),
      );
    }
  }

  const unfinished = closing
    ? (asignaciones.data ?? []).filter((a) => a.relevamiento === closing.id && (a.estado === 'PENDIENTE' || a.estado === 'EN_CURSO')).length
    : 0;

  return (
    <AdminPage
      title="Relevamientos"
      description="Períodos de relevamiento de precios. Abra uno nuevo para asignar comercios y ciérrelo cuando termine la carga."
      action={
        <button
          type="button"
          className="btn btn--primary"
          disabled={!gate.canWrite}
          aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
          onClick={() => setCreating(true)}
        >
          <IconPlus size={20} />
          Nuevo relevamiento
        </button>
      }
    >
      {gate.reason && (
        <p id={OFFLINE_NOTE_ID} className="notice notice--attn">
          {gate.reason}
        </p>
      )}
      {query.isPending && <LoadingRows label="Cargando relevamientos" />}
      {query.isError && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {query.isSuccess && query.data.items.length === 0 && (
        <EmptyState
          title="Todavía no hay relevamientos"
          text="Cree el primer relevamiento para poder asignar comercios a los encuestadores."
        />
      )}
      {query.isSuccess && query.data.items.length > 0 && (
        <>
          <p className="admin-note" aria-live="polite">
            {countLabel(query.data.total ?? query.data.items.length, 'relevamiento', 'relevamientos')}
          </p>
          <DataTable caption="Relevamientos" columns={columns} rows={query.data.items} rowKey={(r) => r.id} />
        </>
      )}

      {creating && <RelevamientoForm onClose={() => setCreating(false)} />}
      {closing && (
        <ConfirmDialog
          title={`Cerrar relevamiento ${closing.periodo}`}
          confirmLabel="Cerrar relevamiento"
          tone="danger"
          busy={close.isPending}
          error={closeError}
          blockedReason={gate.reason}
          onConfirm={() => void confirmClose()}
          onCancel={() => setClosing(null)}
        >
          <p>El relevamiento {closing.periodo} pasa a Cerrado y no se podrá volver a abrir.</p>
          <ul>
            <li>No se podrán crear asignaciones nuevas en él.</li>
            <li>Los encuestadores ya no podrán cargar ni modificar precios de este período.</li>
            {unfinished > 0 && (
              <li>
                Hay {unfinished} {unfinished === 1 ? 'asignación sin completar' : 'asignaciones sin completar'}: ya no
                podrán avanzar de estado ni cancelarse.
              </li>
            )}
          </ul>
        </ConfirmDialog>
      )}
    </AdminPage>
  );
}
