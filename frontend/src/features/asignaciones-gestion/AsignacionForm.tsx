import { useRef, useState, type FormEvent } from 'react';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { useCreateAsignacion, useGestionAsignaciones } from '@/features/gestion/queries';
import { FormField } from '@/features/gestion/ui/FormField';
import { fullName, type useLookups } from './lookups';
import { assignedComercios, mapAsignacionError, type AsignacionField } from './rules';

const FORM_ID = 'asignacion-form';
type Errors = Partial<Record<AsignacionField, string>>;

const REQUIRED: Record<AsignacionField, string> = {
  relevamiento: 'Elija un relevamiento.',
  encuestador: 'Elija un encuestador.',
  comercio: 'Elija un comercio.',
};

export function AsignacionForm({ lookups, onClose }: { lookups: ReturnType<typeof useLookups>; onClose: () => void }) {
  const create = useCreateAsignacion();
  const toast = useToast();
  // Unfiltered list: the same cache entry as the page when no filter is applied.
  const all = useGestionAsignaciones({});
  const [values, setValues] = useState({ relevamiento: '', encuestador: '', comercio: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<AsignacionField, HTMLElement | null>>>({});
  const set = (k: AsignacionField) => (el: HTMLElement | null) => {
    refs.current[k] = el;
  };

  const open = lookups.relevamientos.filter((r) => r.estado === 'ABIERTO');
  const encuestadores = lookups.encuestadores.filter((u) => u.estado === 'ACTIVO');
  const comercios = lookups.comercios
    .filter((c) => c.estado === 'ACTIVO')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const taken = values.relevamiento ? assignedComercios(all.data ?? [], values.relevamiento) : new Set<string>();

  function change(field: AsignacionField, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const found: Errors = {};
    for (const k of ['relevamiento', 'encuestador', 'comercio'] as const) {
      if (!values[k]) found[k] = REQUIRED[k];
    }
    setErrors(found);
    setFormError(null);
    const first = (['relevamiento', 'encuestador', 'comercio'] as const).find((k) => found[k]);
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    try {
      await create.mutateAsync(values);
      toast('Asignación creada.');
      onClose();
    } catch (err) {
      const mapped = mapAsignacionError(err);
      setErrors(mapped.fields);
      setFormError(mapped.form);
      const f = (Object.keys(mapped.fields)[0] ?? null) as AsignacionField | null;
      if (f) refs.current[f]?.focus();
    }
  }

  return (
    <Dialog
      title="Nueva asignación"
      onClose={create.isPending ? () => undefined : onClose}
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Guardando…' : 'Crear asignación'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={submit} noValidate>
        <FormField
          label="Relevamiento"
          error={errors.relevamiento}
          hint={open.length === 0 ? 'No hay relevamientos abiertos. Abra uno primero.' : undefined}
        >
          {(p) => (
            <select {...p} ref={set('relevamiento')} className="select" value={values.relevamiento} onChange={(e) => change('relevamiento', e.target.value)}>
              <option value="">Elija un relevamiento</option>
              {open.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.periodo}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Encuestador" error={errors.encuestador}>
          {(p) => (
            <select {...p} ref={set('encuestador')} className="select" value={values.encuestador} onChange={(e) => change('encuestador', e.target.value)}>
              <option value="">Elija un encuestador</option>
              {encuestadores.map((u) => (
                <option key={u.id} value={u.id}>
                  {fullName(u)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField
          label="Comercio"
          error={errors.comercio}
          hint="Cada comercio puede tener una sola asignación por relevamiento."
        >
          {(p) => (
            <select {...p} ref={set('comercio')} className="select" value={values.comercio} onChange={(e) => change('comercio', e.target.value)}>
              <option value="">Elija un comercio</option>
              {comercios.map((c) => (
                <option key={c.id} value={c.id} disabled={taken.has(c.id)}>
                  {c.nombre} ({c.zona}){taken.has(c.id) ? ' - ya asignado' : ''}
                </option>
              ))}
            </select>
          )}
        </FormField>
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
