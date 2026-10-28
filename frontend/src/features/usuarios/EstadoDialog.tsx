import { useState } from 'react';
import { describeGestionError } from '@/features/gestion/errors';
import { useGestionAsignaciones, useSetUserEstado } from '@/features/gestion/queries';
import { ConfirmDialog } from '@/features/gestion/ui/ConfirmDialog';
import { pendingFor } from '@/features/asignaciones-gestion/rules';
import type { ManagedUser, UserEstado } from '@/shared/api/types';
import { useToast } from '@/shared/ui/Toast';

export const ESTADO_LABEL: Record<UserEstado, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  LICENCIA: 'Licencia',
};

const OPTIONS: { value: UserEstado; detail: string }[] = [
  { value: 'ACTIVO', detail: 'Puede ingresar y trabajar con normalidad.' },
  { value: 'INACTIVO', detail: 'Baja: no puede ingresar.' },
  { value: 'LICENCIA', detail: 'Ausencia temporal: no puede ingresar hasta volver a Activo.' },
];

interface Props {
  user: ManagedUser;
  blockedReason: string | null;
  onClose: () => void;
}

export function EstadoDialog({ user, blockedReason, onClose }: Props) {
  const [estado, setEstado] = useState<UserEstado>(user.estado);
  const [error, setError] = useState<string | null>(null);
  const setter = useSetUserEstado();
  const toast = useToast();
  const name = `${user.nombre} ${user.apellido}`;
  const blocksAccess = estado !== 'ACTIVO';
  const checkVisits = user.role === 'ENCUESTADOR' && blocksAccess;
  const visits = useGestionAsignaciones({ encuestador: user.id }, checkVisits);
  const open = visits.data ? pendingFor(visits.data, user.id) : null;

  async function confirm() {
    setError(null);
    try {
      await setter.mutateAsync({ id: user.id, estado });
      toast(`${name} ahora está en estado ${ESTADO_LABEL[estado].toLowerCase()}.`);
      onClose();
    } catch (err) {
      setError(describeGestionError(err));
    }
  }

  return (
    <ConfirmDialog
      title={`Cambiar estado de ${name}`}
      confirmLabel="Aplicar estado"
      tone={blocksAccess ? 'danger' : 'primary'}
      busy={setter.isPending}
      error={error}
      blockedReason={blockedReason}
      disabled={estado === user.estado}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      <fieldset className="radio-group">
        <legend className="field__label">Estado</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className="radio">
            <input type="radio" name="estado" value={o.value} checked={estado === o.value} onChange={() => setEstado(o.value)} />
            <span>
              <strong>{ESTADO_LABEL[o.value]}</strong>
              <small>{o.detail}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {blocksAccess && estado !== user.estado && (
        <p>
          {name} no podrá ingresar al sistema. Si tiene una sesión abierta, se cierra en su próxima solicitud. Sus datos
          y sus asignaciones se conservan.
        </p>
      )}
      {estado === 'ACTIVO' && user.estado !== 'ACTIVO' && (
        <p>{name} podrá volver a ingresar con su contraseña actual.</p>
      )}
      {checkVisits && open && open.pendiente + open.enCurso > 0 && (
        <p className="notice notice--attn">
          Tiene {open.pendiente} {open.pendiente === 1 ? 'visita pendiente' : 'visitas pendientes'} y {open.enCurso} en
          curso. Siguen asignadas a esta persona: reasigne las pendientes desde Asignaciones; las que están en curso no
          se pueden reasignar.
        </p>
      )}
    </ConfirmDialog>
  );
}
