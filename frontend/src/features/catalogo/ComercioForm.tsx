import { useRef, useState, type FormEvent } from 'react';
import { describeGestionError, mapFieldErrors } from '@/features/gestion/errors';
import { FormField } from '@/features/gestion/ui/FormField';
import { TIPO_LABEL } from '@/features/asignaciones/labels';
import type { Comercio } from '@/shared/api/types';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { useCreateComercio, useUpdateComercio } from './queries';
import {
  COMERCIO_SERVER_COPY,
  TIPOS,
  comercioChanges,
  validateComercioForm,
  type ComercioField,
  type ComercioFormErrors,
  type ComercioFormValues,
} from './rules';

const FORM_ID = 'comercio-form';
const ORDER: ComercioField[] = ['nombre', 'direccion', 'zona', 'tipo'];

interface Props {
  comercio?: Comercio;
  blockedReason: string | null;
  onClose: () => void;
}

export function ComercioForm({ comercio, blockedReason, onClose }: Props) {
  const create = useCreateComercio();
  const update = useUpdateComercio();
  const toast = useToast();
  const busy = create.isPending || update.isPending;
  const [values, setValues] = useState<ComercioFormValues>({
    nombre: comercio?.nombre ?? '',
    direccion: comercio?.direccion ?? '',
    zona: comercio?.zona ?? '',
    tipo: comercio?.tipo ?? '',
  });
  const [errors, setErrors] = useState<ComercioFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<ComercioField, HTMLElement | null>>>({});
  const ref = (k: ComercioField) => (el: HTMLElement | null) => {
    refs.current[k] = el;
  };
  const text = (k: 'nombre' | 'direccion' | 'zona') => ({
    value: values[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });
  const focusFirst = (found: ComercioFormErrors) => {
    const first = ORDER.find((k) => found[k]);
    if (first) refs.current[first]?.focus();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || blockedReason) return;
    const found = validateComercioForm(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    try {
      if (comercio) {
        const changes = comercioChanges(comercio, values);
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await update.mutateAsync({ id: comercio.id, changes });
        toast(`Datos de ${values.nombre.trim()} actualizados.`);
      } else {
        await create.mutateAsync({
          nombre: values.nombre.trim(),
          direccion: values.direccion.trim(),
          zona: values.zona.trim(),
          tipo: values.tipo as Comercio['tipo'],
        });
        toast(`Comercio ${values.nombre.trim()} creado.`);
      }
      onClose();
    } catch (err) {
      const mapped = mapFieldErrors(err, COMERCIO_SERVER_COPY);
      if (Object.keys(mapped.fields).length > 0) {
        setErrors(mapped.fields as ComercioFormErrors);
        focusFirst(mapped.fields as ComercioFormErrors);
      }
      if (mapped.form || Object.keys(mapped.fields).length === 0) setFormError(mapped.form ?? describeGestionError(err));
    }
  }

  return (
    <Dialog
      title={comercio ? 'Editar comercio' : 'Nuevo comercio'}
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={busy || Boolean(blockedReason)}>
            {busy ? 'Guardando…' : comercio ? 'Guardar cambios' : 'Crear comercio'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={submit} noValidate>
        <FormField label="Nombre" error={errors.nombre}>
          {(p) => <input {...p} ref={ref('nombre')} className="input" autoComplete="off" {...text('nombre')} />}
        </FormField>
        <FormField label="Dirección" error={errors.direccion}>
          {(p) => <input {...p} ref={ref('direccion')} className="input" autoComplete="off" {...text('direccion')} />}
        </FormField>
        <div className="admin-form__row">
          <FormField label="Zona" error={errors.zona} hint="Los filtros usan el texto exacto: escriba siempre igual la misma zona.">
            {(p) => <input {...p} ref={ref('zona')} className="input" autoComplete="off" {...text('zona')} />}
          </FormField>
          <FormField label="Tipo" error={errors.tipo}>
            {(p) => (
              <select
                {...p}
                ref={ref('tipo')}
                className="select"
                value={values.tipo}
                onChange={(e) => setValues((v) => ({ ...v, tipo: e.target.value as ComercioFormValues['tipo'] }))}
              >
                <option value="">Elegir…</option>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
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
