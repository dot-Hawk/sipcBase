import { useRef, useState, type FormEvent } from 'react';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import type { Frecuencia } from '@/shared/api/types';
import { FRECUENCIA_LABEL } from '@/features/asignaciones/labels';
import { ApiError } from '@/shared/api/errors';
import { describeGestionError } from '@/features/gestion/errors';
import { useCreateRelevamiento } from '@/features/gestion/queries';
import { FormField } from '@/features/gestion/ui/FormField';
import {
  periodoHint,
  suggestDates,
  toRelevamientoPayload,
  validateRelevamientoForm,
  mapRelevamientoServerErrors,
  type RelevamientoField,
  type RelevamientoFormErrors,
  type RelevamientoFormValues,
} from './rules';

const FORM_ID = 'relevamiento-form';

export function RelevamientoForm({ onClose }: { onClose: () => void }) {
  const create = useCreateRelevamiento();
  const toast = useToast();
  const [values, setValues] = useState<RelevamientoFormValues>({
    frecuencia: 'MENSUAL',
    periodo: '',
    fechaInicio: '',
    fechaLimite: '',
  });
  const [datesEdited, setDatesEdited] = useState(false);
  const [errors, setErrors] = useState<RelevamientoFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<RelevamientoField, HTMLElement | null>>>({});
  const setRef = (k: RelevamientoField) => (el: HTMLElement | null) => {
    refs.current[k] = el;
  };

  function change(patch: Partial<RelevamientoFormValues>, fromUserDate = false) {
    setValues((prev) => {
      const next = { ...prev, ...patch };
      if (!datesEdited && !fromUserDate) {
        const s = suggestDates(next.frecuencia, next.periodo.trim());
        if (s) return { ...next, ...s };
      }
      return next;
    });
    if (fromUserDate) setDatesEdited(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const found = validateRelevamientoForm(values);
    setErrors(found);
    setFormError(null);
    const first = (['frecuencia', 'periodo', 'fechaInicio', 'fechaLimite'] as const).find((k) => found[k]);
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    try {
      await create.mutateAsync(toRelevamientoPayload(values));
      toast(`Relevamiento ${values.periodo.trim()} creado.`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ periodo: 'Ya existe un relevamiento con este período y esta frecuencia.' });
        refs.current.periodo?.focus();
        return;
      }
      const mapped = mapRelevamientoServerErrors(err);
      if (Object.keys(mapped.fields).length > 0) {
        setErrors(mapped.fields);
        const f = (Object.keys(mapped.fields)[0] ?? 'periodo') as RelevamientoField;
        refs.current[f]?.focus();
      }
      if (mapped.form || Object.keys(mapped.fields).length === 0) setFormError(mapped.form ?? describeGestionError(err));
    }
  }

  return (
    <Dialog
      title="Nuevo relevamiento"
      onClose={create.isPending ? () => undefined : onClose}
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Guardando…' : 'Crear relevamiento'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={submit} noValidate>
        <FormField label="Frecuencia" error={errors.frecuencia}>
          {(p) => (
            <select
              {...p}
              ref={setRef('frecuencia')}
              className="select"
              value={values.frecuencia}
              onChange={(e) => change({ frecuencia: e.target.value as Frecuencia })}
            >
              {(Object.keys(FRECUENCIA_LABEL) as Frecuencia[]).map((f) => (
                <option key={f} value={f}>
                  {FRECUENCIA_LABEL[f]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Período" hint={periodoHint(values.frecuencia)} error={errors.periodo}>
          {(p) => (
            <input
              {...p}
              ref={setRef('periodo')}
              className="input"
              autoComplete="off"
              placeholder={values.frecuencia === 'MENSUAL' ? '2026-11' : '2026-11-Q1'}
              value={values.periodo}
              onChange={(e) => change({ periodo: e.target.value })}
            />
          )}
        </FormField>
        <div className="admin-form__row">
          <FormField label="Fecha de inicio" error={errors.fechaInicio}>
            {(p) => (
              <input
                {...p}
                ref={setRef('fechaInicio')}
                className="input"
                type="date"
                value={values.fechaInicio}
                onChange={(e) => change({ fechaInicio: e.target.value }, true)}
              />
            )}
          </FormField>
          <FormField label="Fecha límite" error={errors.fechaLimite}>
            {(p) => (
              <input
                {...p}
                ref={setRef('fechaLimite')}
                className="input"
                type="date"
                value={values.fechaLimite}
                onChange={(e) => change({ fechaLimite: e.target.value }, true)}
              />
            )}
          </FormField>
        </div>
        <p className="admin-note">Se crea abierto. Un relevamiento cerrado no se puede volver a abrir.</p>
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
