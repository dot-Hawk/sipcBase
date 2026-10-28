import { useState } from 'react';
import { useCancelAsignacion } from '@/features/gestion/queries';
import { ConfirmDialog } from '@/features/gestion/ui/ConfirmDialog';
import type { Asignacion } from '@/shared/api/types';
import { useToast } from '@/shared/ui/Toast';
import { fullName, type useLookups } from './lookups';
import { mapCancelError } from './rules';

interface Props {
  asignacion: Asignacion;
  lookups: ReturnType<typeof useLookups>;
  blockedReason: string | null;
  onClose: () => void;
}

/** Confirmation that states what cancelling a visit does before it is sent. */
export function CancelDialog({ asignacion, lookups, blockedReason, onClose }: Props) {
  const cancel = useCancelAsignacion();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const encuestador = lookups.byId.encuestador.get(asignacion.encuestador);
  const who = encuestador ? fullName(encuestador) : 'El encuestador';
  const comercio = lookups.byId.comercio.get(asignacion.comercio)?.nombre ?? 'el comercio';
  const periodo = lookups.byId.relevamiento.get(asignacion.relevamiento)?.periodo ?? '';

  async function confirm() {
    setError(null);
    try {
      await cancel.mutateAsync(asignacion.id);
      toast('Visita cancelada.');
      onClose();
    } catch (err) {
      setError(mapCancelError(err));
    }
  }

  return (
    <ConfirmDialog
      title={`Cancelar asignación de ${comercio}`}
      confirmLabel="Cancelar asignación"
      dismissLabel="Volver"
      tone="danger"
      busy={cancel.isPending}
      error={error}
      blockedReason={blockedReason}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      <p>
        Va a cancelar la visita a {comercio}
        {periodo ? `, relevamiento ${periodo}` : ''}. La cancelación no se puede deshacer.
      </p>
      <ul>
        <li>Los precios que ya cargó se conservan.</li>
        <li>
          {who} dejará de ver esta visita y ya no podrá cargar precios ni fotos en ella.
        </li>
        <li>El comercio podrá asignarse de nuevo en este relevamiento.</li>
        {asignacion.estado === 'EN_CURSO' && (
          <li>La visita ya está en curso: puede tener precios cargados que no se pierden.</li>
        )}
      </ul>
    </ConfirmDialog>
  );
}
