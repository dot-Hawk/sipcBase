import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { sectionPath } from '@/app/roles';
import { describeGestionError } from '@/features/gestion/errors';
import { FormField } from '@/features/gestion/ui/FormField';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import { ApiError } from '@/shared/api/errors';
import type { FormatoArchivo } from '@/shared/api/types';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { useCalculoDownload, useCreateCalculo } from './queries';
import {
  DEFAULT_FORM,
  MAX_RANGE_MONTHS,
  describeCalculoConflict,
  exportacionFilename,
  mapCalculoServerErrors,
  toCalculoPayload,
  validateCalculoForm,
  type CalculoField,
  type CalculoFormErrors,
  type CalculoFormValues,
} from './rules';

const FORM_ID = 'calculo-form';
const ORDER: readonly CalculoField[] = ['mesBase', 'mesObjetivo', 'esperarMeses', 'pesoSuper', 'pesoTrad'];
const ADVANCED: readonly CalculoField[] = ['esperarMeses', 'pesoSuper', 'pesoTrad'];

function errorCopy(err: unknown): string {
  return err instanceof ApiError && err.status === 409 ? describeCalculoConflict(err) : describeGestionError(err);
}

/** Dialog that starts a run (or downloads the engine input for the same range). Write roles only. */
export function CalculoForm({ onClose }: { onClose: () => void }) {
  const create = useCreateCalculo();
  const download = useCalculoDownload();
  const gate = useWriteGate();
  const toast = useToast();
  const navigate = useNavigate();
  const [values, setValues] = useState<CalculoFormValues>(DEFAULT_FORM);
  const [errors, setErrors] = useState<CalculoFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<CalculoField, HTMLElement | null>>>({});
  const advanced = useRef<HTMLDetailsElement>(null);
  const setRef = (k: CalculoField) => (el: HTMLElement | null) => {
    refs.current[k] = el;
  };
  const busy = create.isPending || download.isPending;
  const change = (patch: Partial<CalculoFormValues>) => setValues((v) => ({ ...v, ...patch }));

  /** Shows the problems, opens the advanced block when one is inside it and focuses the first field. */
  function showErrors(found: CalculoFormErrors): boolean {
    setErrors(found);
    const first = ORDER.find((k) => found[k]);
    if (!first) return false;
    if (ADVANCED.includes(first) && advanced.current) advanced.current.open = true;
    refs.current[first]?.focus();
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    if (showErrors(validateCalculoForm(values))) return;
    try {
      const run = await create.mutateAsync(toCalculoPayload(values));
      toast('Cálculo iniciado.');
      onClose();
      navigate(`${sectionPath('calculos')}/${run.id}`);
    } catch (err) {
      const mapped = mapCalculoServerErrors(err);
      if (Object.keys(mapped.fields).length > 0) showErrors(mapped.fields);
      if (mapped.form || Object.keys(mapped.fields).length === 0) setFormError(mapped.form ?? errorCopy(err));
    }
  }

  async function downloadInput(formato: FormatoArchivo) {
    if (busy) return;
    setFormError(null);
    const found = validateCalculoForm(values);
    const rangeErrors: CalculoFormErrors = { mesBase: found.mesBase, mesObjetivo: found.mesObjetivo };
    if (showErrors(rangeErrors)) return;
    const query = {
      mesBase: values.mesBase.trim(),
      mesObjetivo: values.mesObjetivo.trim(),
      excluirOfertas: values.excluirOfertas,
      formato,
    };
    try {
      await download.mutateAsync({ kind: 'exportacion', query, filename: exportacionFilename(query) });
    } catch (err) {
      setFormError(errorCopy(err));
    }
  }

  return (
    <Dialog
      title="Nuevo cálculo"
      description="Calcula los relativos de precios por variedad entre el mes base y el mes objetivo."
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={busy || !gate.canWrite}>
            {create.isPending ? 'Iniciando…' : 'Iniciar cálculo'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="admin-form__row">
          <FormField label="Mes base" hint="Formato AAAA-MM, por ejemplo 2026-01." error={errors.mesBase}>
            {(p) => (
              <input
                {...p}
                ref={setRef('mesBase')}
                className="input"
                autoComplete="off"
                inputMode="numeric"
                placeholder="2026-01"
                value={values.mesBase}
                onChange={(e) => change({ mesBase: e.target.value })}
              />
            )}
          </FormField>
          <FormField
            label="Mes objetivo"
            hint={`Igual o posterior al mes base, hasta ${MAX_RANGE_MONTHS} meses después.`}
            error={errors.mesObjetivo}
          >
            {(p) => (
              <input
                {...p}
                ref={setRef('mesObjetivo')}
                className="input"
                autoComplete="off"
                inputMode="numeric"
                placeholder="2026-06"
                value={values.mesObjetivo}
                onChange={(e) => change({ mesObjetivo: e.target.value })}
              />
            )}
          </FormField>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={values.excluirOfertas}
            onChange={(e) => change({ excluirOfertas: e.target.checked })}
          />
          <span>Excluir precios en oferta</span>
        </label>

        <details ref={advanced} className="calc-advanced">
          <summary>Parámetros avanzados</summary>
          <div className="calc-advanced__body">
            <FormField label="Meses de espera" hint="Entero entre 0 y 12. Por defecto 2." error={errors.esperarMeses}>
              {(p) => (
                <input
                  {...p}
                  ref={setRef('esperarMeses')}
                  className="input"
                  inputMode="numeric"
                  value={values.esperarMeses}
                  onChange={(e) => change({ esperarMeses: e.target.value })}
                />
              )}
            </FormField>
            <div className="admin-form__row">
              <FormField label="Peso supermercados" hint="0 o mayor. Por defecto 0,25." error={errors.pesoSuper}>
                {(p) => (
                  <input
                    {...p}
                    ref={setRef('pesoSuper')}
                    className="input"
                    inputMode="decimal"
                    value={values.pesoSuper}
                    onChange={(e) => change({ pesoSuper: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="Peso comercios tradicionales" hint="0 o mayor. Por defecto 0,75." error={errors.pesoTrad}>
                {(p) => (
                  <input
                    {...p}
                    ref={setRef('pesoTrad')}
                    className="input"
                    inputMode="decimal"
                    value={values.pesoTrad}
                    onChange={(e) => change({ pesoTrad: e.target.value })}
                  />
                )}
              </FormField>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={values.omitirGruposCompletos}
                onChange={(e) => change({ omitirGruposCompletos: e.target.checked })}
              />
              <span>Omitir grupos completos</span>
            </label>
          </div>
        </details>

        <p className="admin-note">
          El cálculo se ejecuta en segundo plano y solo puede haber uno a la vez. Requiere que los relevamientos del rango estén
          cerrados.
        </p>

        <fieldset className="calc-export">
          <legend>Datos de entrada</legend>
          <p className="admin-note">Descargue lo que recibiría el cálculo para este rango, sin ejecutarlo.</p>
          <div className="calc-export__actions">
            <button type="button" className="btn" disabled={busy || !gate.canWrite} onClick={() => void downloadInput('xlsx')}>
              Descargar datos de entrada (.xlsx)
            </button>
            <button type="button" className="btn" disabled={busy || !gate.canWrite} onClick={() => void downloadInput('csv')}>
              Descargar datos de entrada (.csv)
            </button>
          </div>
        </fieldset>

        {gate.reason && <p className="field__hint">{gate.reason}</p>}
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
