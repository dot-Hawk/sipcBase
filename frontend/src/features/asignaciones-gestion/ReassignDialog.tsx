import { useState } from 'react';
import { describeGestionError } from '@/features/gestion/errors';
import { useReassignAsignacion } from '@/features/gestion/queries';
import { FormField } from '@/features/gestion/ui/FormField';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import type { Asignacion } from '@/shared/api/types';
import { fullName, type useLookups } from './lookups';
import { mapAsignacionError } from './rules';

const FORM_ID = 'reassign-form';

interface Props {
  asignacion: Asignacion;
  lookups: ReturnType<typeof useLookups>;
  blockedReason: string | null;
  onClose: () => void;
}

export function ReassignDialog({ asignacion, lookups, blockedReason, onClose }: Props) {
  const reassign = useReassignAsignacion();
  const toast = useToast();
  const [choice, setChoice] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const current = lookups.byId.encuestador.get(asignacion.encuestador);
  const currentName = current ? fullName(current) : 'El encuestador actual';
  const comercio = lookups.byId.comercio.get(asignacion.comercio)?.nombre ?? 'el comercio';
  const periodo = lookups.byId.relevamiento.get(asignacion.relevamiento)?.periodo ?? '';
  const options = lookups.encuestadores.filter((u) => u.estado === 'ACTIVO' && u.id !== asignacion.encuestador);
  const next = lookups.byId.encuestador.get(choice);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reassign.isPending || blockedReason) return;
    if (!choice) {
      setFieldError('Elija el nuevo encuestador.');
      return;
    }
    setFieldError(null);
    setFormError(null);
    try {
      await reassign.mutateAsync({ id: asignacion.id, encuestador: choice });
      toast(`Visita reasignada a ${next ? fullName(next) : 'otro encuestador'}.`);
      onClose();
    } catch (err) {
      const mapped = mapAsignacionError(err);
      if (mapped.fields.encuestador) setFieldError(mapped.fields.encuestador);
      else setFormError(mapped.form ?? describeGestionError(err));
    }
  }

  return (
    <Dialog
      title="Reasignar visita"
      onClose={reassign.isPending ? () => undefined : onClose}
      description={
        <p className="field__hint">
          {comercio}
          {periodo ? `, relevamiento ${periodo}` : ''}
        </p>
      }
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={reassign.isPending}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={reassign.isPending || Boolean(blockedReason)}>
            {reassign.isPending ? 'Guardando…' : 'Reasignar visita'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={submit} noValidate>
        <p>
          Asignada hoy a <strong>{currentName}</strong>.
        </p>
        <FormField label="Nuevo encuestador" error={fieldError ?? undefined}>
          {(p) => (
            <select
              {...p}
              data-autofocus
              className="select"
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value);
                setFieldError(null);
              }}
            >
              <option value="">Elija un encuestador</option>
              {options.map((u) => (
                <option key={u.id} value={u.id}>
                  {fullName(u)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <p className="admin-note">
          {next ? `${fullName(next)} verá esta visita en su lista. ` : ''}
          {currentName} dejará de ver esta visita. Solo se pueden reasignar visitas pendientes.
        </p>
        {blockedReason && <p className="field__hint">{blockedReason}</p>}
        {formError && (
          <div className="notice notice--danger" role="alert">
            <IconAlert size={20} />
            <span>{formError}</span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
