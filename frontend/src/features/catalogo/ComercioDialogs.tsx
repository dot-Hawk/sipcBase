import { useState } from 'react';
import { TIPO_LABEL } from '@/features/asignaciones/labels';
import { describeGestionError } from '@/features/gestion/errors';
import { useGestionAsignaciones } from '@/features/gestion/queries';
import { ConfirmDialog } from '@/features/gestion/ui/ConfirmDialog';
import { api } from '@/shared/api/endpoints';
import type { Comercio } from '@/shared/api/types';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { useQuery } from '@tanstack/react-query';
import { CatalogEstadoChip } from './EstadoChip';
import { ckeys, useSetComercioEstado } from './queries';

const DATE_FMT = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE_FMT.format(d);
};

export function ComercioEstadoDialog({ comercio, blockedReason, onClose }: { comercio: Comercio; blockedReason: string | null; onClose: () => void }) {
  const deactivating = comercio.estado === 'ACTIVO';
  const next = deactivating ? 'INACTIVO' : 'ACTIVO';
  const setter = useSetComercioEstado();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const visits = useGestionAsignaciones({ comercio: comercio.id }, deactivating);
  const open = visits.data ? visits.data.filter((a) => a.estado === 'PENDIENTE' || a.estado === 'EN_CURSO') : null;
  const pendiente = open?.filter((a) => a.estado === 'PENDIENTE').length ?? 0;
  const enCurso = open?.filter((a) => a.estado === 'EN_CURSO').length ?? 0;

  async function confirm() {
    setError(null);
    try {
      await setter.mutateAsync({ id: comercio.id, estado: next });
      toast(`${comercio.nombre} ahora está ${deactivating ? 'inactivo' : 'activo'}.`);
      onClose();
    } catch (err) {
      setError(describeGestionError(err));
    }
  }

  return (
    <ConfirmDialog
      title={`${deactivating ? 'Desactivar' : 'Reactivar'} ${comercio.nombre}`}
      confirmLabel={deactivating ? 'Desactivar comercio' : 'Reactivar comercio'}
      tone={deactivating ? 'danger' : 'primary'}
      busy={setter.isPending}
      error={error}
      blockedReason={blockedReason}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {deactivating ? (
        <>
          <p>
            No se podrá asignar a nuevos relevamientos: el servidor rechaza comercios inactivos. No se borra nada y puede
            reactivarlo cuando quiera.
          </p>
          <p>
            Las visitas ya asignadas y los precios ya cargados se conservan: el servidor no los modifica ni los cancela.
          </p>
          {open && pendiente + enCurso > 0 && (
            <p className="notice notice--attn">
              Tiene {pendiente} {pendiente === 1 ? 'visita pendiente' : 'visitas pendientes'} y {enCurso} en curso.
              Siguen asignadas y los encuestadores pueden seguir trabajándolas.
            </p>
          )}
        </>
      ) : (
        <p>Volverá a poder asignarse a los relevamientos abiertos.</p>
      )}
    </ConfirmDialog>
  );
}

export function ComercioDetailDialog({ comercio, onClose }: { comercio: Comercio; onClose: () => void }) {
  const query = useQuery({
    queryKey: ckeys.comercio(comercio.id),
    queryFn: () => api.getComercio(comercio.id),
    initialData: comercio,
    staleTime: 0,
  });
  const c = query.data;
  return (
    <Dialog
      title={c.nombre}
      onClose={onClose}
      actions={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <dl className="detail">
        <dt>Estado</dt>
        <dd>
          <CatalogEstadoChip estado={c.estado} />
        </dd>
        <dt>Tipo</dt>
        <dd>{TIPO_LABEL[c.tipo]}</dd>
        <dt>Dirección</dt>
        <dd>{c.direccion}</dd>
        <dt>Zona</dt>
        <dd>{c.zona}</dd>
        <dt>Alta</dt>
        <dd>{fmtDate(c.createdAt)}</dd>
        <dt>Última modificación</dt>
        <dd>{fmtDate(c.updatedAt)}</dd>
      </dl>
      <p className="admin-note">La API no expone coordenadas ni rubro del comercio: solo estos datos.</p>
    </Dialog>
  );
}
