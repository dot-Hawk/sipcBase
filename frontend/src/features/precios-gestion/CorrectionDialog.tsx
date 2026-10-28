import { useEffect, useRef, useState, type FormEvent } from 'react';
import { diffSnapshots } from '@/features/auditoria/diff';
import { describeGestionError } from '@/features/gestion/errors';
import { useCorregirPrecio } from '@/features/gestion/queries';
import { FormField } from '@/features/gestion/ui/FormField';
import type { Alerta, Precio, PrecioSnapshot, UpdatePrecioInput } from '@/shared/api/types';
import { IconAlert } from '@/shared/icons';
import { formatMoney } from '@/shared/lib/money';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { AlertRange } from './AlertRange';
import {
  MAX_OBSERVACION,
  formFromPrecio,
  mapCorrectionError,
  validateCorrection,
  type CorrectionError,
  type CorrectionValidation,
} from './rules';

const FORM_ID = 'correction-form';

type Step = 'edit' | 'confirm' | 'atypical';

export interface PrecioLabels {
  producto: string;
  comercio: string;
  periodo: string;
}

interface Props {
  precio: Precio;
  labels: PrecioLabels;
  /** Offline: nothing is queued, the confirmation is disabled with this reason. */
  blockedReason: string | null;
  onClose: () => void;
  /** After the server accepted the correction. */
  onDone: () => void;
}

const snapshotOf = (p: Precio): PrecioSnapshot => ({
  valor: p.valor,
  oferta: p.oferta,
  observacion: p.observacion,
  fechaRelevamiento: p.fechaRelevamiento,
});

/**
 * Edit -> review (before and after, consequences) -> confirm. A new value far from the history makes
 * the server answer 409 `requiereConfirmacion`: that is a third step, sent again with `confirmarDesvio`.
 * The screen only shows what the server answers; nothing is applied optimistically.
 */
export function CorrectionDialog({ precio, labels, blockedReason, onClose, onDone }: Props) {
  const corregir = useCorregirPrecio();
  const toast = useToast();
  const busy = corregir.isPending;
  const [form, setForm] = useState(() => formFromPrecio(precio));
  const [errors, setErrors] = useState<CorrectionValidation['errors']>({});
  const [step, setStep] = useState<Step>('edit');
  const [changes, setChanges] = useState<UpdatePrecioInput | null>(null);
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [failure, setFailure] = useState<Exclude<CorrectionError, { kind: 'atypical' }> | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // The dialog stays mounted across steps (so focus returns to the row on close); move focus by hand.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const dialog = bodyRef.current?.closest('[role="dialog"]');
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [step]);

  const terminal = failure !== null && ['closed', 'gone', 'forbidden'].includes(failure.kind);
  const diff = changes ? diffSnapshots(snapshotOf(precio), { ...snapshotOf(precio), ...asSnapshotChanges(changes) }) : [];

  function review(e: FormEvent) {
    e.preventDefault();
    const result = validateCorrection(form, precio);
    setErrors(result.errors);
    if (!result.changes) return;
    setChanges(result.changes);
    setFailure(null);
    setStep('confirm');
  }

  async function send(confirmarDesvio: boolean) {
    if (!changes || busy || blockedReason) return;
    setFailure(null);
    try {
      const updated = await corregir.mutateAsync({
        id: precio.id,
        changes: confirmarDesvio ? { ...changes, confirmarDesvio: true } : changes,
      });
      toast(`Precio corregido: ${labels.producto} ahora figura a ${formatMoney(updated.valor)}.`);
      onDone();
    } catch (err) {
      const mapped = mapCorrectionError(err);
      if (mapped.kind === 'atypical') {
        setAlerta(mapped.alerta);
        setStep('atypical');
        return;
      }
      if (mapped.kind === 'invalid' && Object.keys(mapped.fields).length > 0) {
        setErrors({ ...mapped.fields, ...(mapped.form ? { form: mapped.form } : {}) });
        setStep('edit');
        return;
      }
      setFailure(mapped);
    }
  }

  const safeClose = busy ? () => undefined : onClose;
  const newValor = changes?.valor ?? precio.valor;

  let title = 'Corregir precio';
  let actions;
  if (step === 'edit') {
    actions = (
      <>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" form={FORM_ID} className="btn btn--primary">
          Revisar corrección
        </button>
      </>
    );
  } else {
    title = terminal
      ? 'No se pudo corregir el precio'
      : step === 'confirm'
        ? 'Confirmar corrección'
        : 'El nuevo valor se aleja de lo habitual';
    actions = (
      <>
        {!terminal && (
          <button
            type="button"
            className="btn btn--quiet"
            data-autofocus
            disabled={busy}
            onClick={() => {
              setFailure(null);
              setStep('edit');
            }}
          >
            Volver a editar
          </button>
        )}
        {terminal ? (
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            Cerrar
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || Boolean(blockedReason)}
            onClick={() => void send(step === 'atypical')}
          >
            {busy ? 'Guardando…' : step === 'atypical' ? 'Confirmar de todos modos' : 'Confirmar corrección'}
          </button>
        )}
      </>
    );
  }

  return (
    <Dialog
      title={title}
      onClose={safeClose}
      description={
        <p className="field__hint">
          {labels.producto} en {labels.comercio}, relevamiento {labels.periodo}
        </p>
      }
      actions={actions}
    >
      <div ref={bodyRef}>
        {step === 'edit' && (
          <form id={FORM_ID} className="admin-form" onSubmit={review} noValidate>
            <FormField
              label="Valor"
              hint="Precio en pesos, por ejemplo 1.234,50."
              error={errors.valor}
            >
              {(p) => (
                <input
                  {...p}
                  data-autofocus
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                />
              )}
            </FormField>
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={form.oferta}
                onChange={(e) => setForm({ ...form, oferta: e.target.checked })}
              />
              <span>Precio en oferta</span>
            </label>
            <FormField
              label="Observación (opcional)"
              hint={`Reemplaza la observación actual y queda registrada en la auditoría. Hasta ${MAX_OBSERVACION} caracteres.`}
              error={errors.observacion}
            >
              {(p) => (
                <textarea
                  {...p}
                  className="input"
                  value={form.observacion}
                  onChange={(e) => setForm({ ...form, observacion: e.target.value })}
                />
              )}
            </FormField>
            {errors.form && (
              <div className="notice notice--danger" role="alert">
                <IconAlert size={20} />
                <span>{errors.form}</span>
              </div>
            )}
          </form>
        )}

        {step !== 'edit' && (
          <div className="confirm">
            {step === 'atypical' && alerta && (
              <>
                <AlertRange alerta={alerta} value={newValor} caption="Este valor es atípico para este producto en este comercio." />
                <p>Confirme solo si verificó el dato. Se guarda igual que cualquier corrección y el precio queda marcado como atípico.</p>
              </>
            )}
            <dl className="pg-diff">
              {diff.map((l) => (
                <div key={l.label} className="pg-diff__row">
                  <dt>{l.label}</dt>
                  <dd>
                    <span className="pg-diff__before">
                      <span className="visually-hidden">Antes: </span>
                      {l.before}
                    </span>
                    <span aria-hidden="true"> → </span>
                    <span className="pg-diff__after">
                      <span className="visually-hidden">Ahora: </span>
                      {l.after}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            {step === 'confirm' && !terminal && (
              <p className="admin-note">
                El cambio queda registrado en la auditoría con su nombre, su rol y los valores anteriores. Si el nuevo
                valor se aleja de lo habitual, se le pedirá una confirmación adicional.
              </p>
            )}
            {blockedReason && <p className="field__hint">{blockedReason}</p>}
            {failure && (
              <div className="notice notice--danger" role="alert">
                <IconAlert size={20} />
                <span>{failure.form || describeGestionError(undefined)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** The update payload as snapshot fields (the observation arrives as `null` to clear it). */
function asSnapshotChanges(c: UpdatePrecioInput): Partial<PrecioSnapshot> {
  const out: Partial<PrecioSnapshot> = {};
  if (c.valor !== undefined) out.valor = c.valor;
  if (c.oferta !== undefined) out.oferta = c.oferta;
  if (c.observacion !== undefined) out.observacion = c.observacion;
  return out;
}
