import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { EditBlockReason } from '@/features/asignaciones/rules';
import { describeApiError } from '@/shared/api/errors';
import type { Alerta, Precio, Producto } from '@/shared/api/types';
import { IconAlert, IconArrowDown, IconArrowUp, IconCheck, IconMore, IconNote, IconPending, IconPlay, IconTrash } from '@/shared/icons';
import { formatMoney, parseMoney, toInputText } from '@/shared/lib/money';
import { humanizePeriodo } from '@/shared/lib/periodo';
import { Dialog } from '@/shared/ui/Dialog';
import { Menu } from '@/shared/ui/Menu';
import type { Draft } from './drafts';
import type { SeriesPoint } from './history';
import type { PreviousPrice } from './previous';
import { quickFillOptions } from './quickFill';
import { RangeBar } from './RangeBar';
import { describeItemError, STATE_LABEL } from '@/features/outbox/labels';
import type { ProductPending } from '@/features/outbox/view';
import type { SavePriceResult } from './savePrice';
import { Sparkline } from './Sparkline';
import { classifyVariation, computeVariation, formatVariation } from './variation';
import './visita.css';

export interface PriceSubmit {
  valor: number;
  oferta: boolean;
  observacion: string;
  confirmarDesvio?: true;
}

export interface PriceEditorProps {
  producto: Producto;
  previous: PreviousPrice | null;
  series?: readonly SeriesPoint[];
  saved: Precio | null;
  readOnly: boolean;
  /** Why the editor is read-only, used to explain the disabled actions. */
  blockReason?: EditBlockReason | null;
  offline: boolean;
  initialDraft?: Draft;
  onDraftChange?: (draft: Draft | null) => void;
  onSave: (input: PriceSubmit) => Promise<SavePriceResult | { kind: 'queued' }>;
  /** State of this product in the offline outbox, when something is queued for it. */
  pending?: ProductPending | null;
  /** The surveyor confirms the atypical price the server flagged after the queued send. */
  onConfirmPending?: () => void;
  onRetryPending?: () => void;
  onDiscardPending?: () => void;
  onDelete?: () => Promise<void>;
  /** Called after a successful save, or after "Siguiente" on an unchanged price. */
  onDone?: (info: { advance: boolean }) => void;
  onStartVisit?: () => void;
  startingVisit?: boolean;
  photoSlot?: ReactNode;
  /** Move focus to the price field when the editor appears. */
  autoFocus?: boolean;
  /** The sheet shows the producto in its own header, so the editor skips it. */
  showHeader?: boolean;
}

export const UNIT_LABEL: Record<Producto['unidad'], string> = {
  KG: 'kg',
  G: 'g',
  LT: 'l',
  ML: 'ml',
  UNIDAD: 'unidad',
};

export function formatQuantity(p: Pick<Producto, 'cantidadReferencia' | 'unidad'>): string {
  const qty = new Intl.NumberFormat('es-AR').format(p.cantidadReferencia);
  return `${qty} ${UNIT_LABEL[p.unidad]}`;
}

function baselineOf(saved: Precio | null) {
  return {
    valor: saved ? toInputText(saved.valor) : '',
    oferta: saved?.oferta ?? false,
    observacion: saved?.observacion ?? '',
  };
}

export function PriceEditor({
  producto,
  previous,
  series = [],
  saved,
  readOnly,
  blockReason = null,
  offline,
  initialDraft,
  onDraftChange,
  onSave,
  pending = null,
  onConfirmPending,
  onRetryPending,
  onDiscardPending,
  onDelete,
  onDone,
  onStartVisit,
  startingVisit,
  photoSlot,
  autoFocus,
  showHeader = true,
}: PriceEditorProps) {
  const base = baselineOf(saved);
  const inputId = useId();
  const obsId = useId();
  const errId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [valor, setValor] = useState(initialDraft?.valor ?? base.valor);
  const [oferta, setOferta] = useState(initialDraft?.oferta ?? base.oferta);
  const [observacion, setObservacion] = useState(initialDraft?.observacion ?? base.observacion);
  const [obsOpen, setObsOpen] = useState(Boolean(initialDraft?.observacion || base.observacion));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ alerta: Alerta; valor: number; advance: boolean } | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const [focusField, setFocusField] = useState(0);

  // When the stored precio changes (save, refetch), take it as the new baseline.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const b = baselineOf(saved);
    setValor(b.valor);
    setOferta(b.oferta);
    setObservacion(b.observacion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id, saved?.valor, saved?.oferta, saved?.observacion, saved?.updatedAt]);

  useEffect(() => {
    if (focusField > 0) inputRef.current?.focus();
  }, [focusField]);

  useEffect(() => {
    if (autoFocus && !readOnly) inputRef.current?.focus();
    // Only when the editor appears for this producto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = parseMoney(valor);
  const dirty = valor.trim() !== base.valor || oferta !== base.oferta || observacion.trim() !== base.observacion.trim();
  const variation = computeVariation(previous?.valor ?? null, parsed);
  const level = classifyVariation(variation);
  const showClientHint = !readOnly && !oferta && level === 'attention' && variation !== null && (dirty || !saved);
  const serverAlert = saved?.alerta && !dirty && !oferta ? saved.alerta : null;
  const unchanged = Boolean(saved) && !dirty;
  // Offline saves go to the outbox on this device, so they stay enabled.
  const canSave = !readOnly && !saving && (dirty || !saved);
  const canAdvance = !readOnly && !saving && (unchanged || canSave);
  const queuedState = pending?.price ?? null;
  // The server flagged the queued value: the main action is to confirm it (or edit it to save another).
  const confirmQueued = !readOnly && queuedState === 'needs-confirmation' && !dirty && onConfirmPending !== undefined;
  const canDiscardPending = !readOnly && queuedState !== null && queuedState !== 'sending' && onDiscardPending !== undefined;
  const absVar = variation !== null ? formatVariation(variation) : null;
  const quick = readOnly ? [] : quickFillOptions(previous?.valor ?? null);

  function emitDraft(next: Draft) {
    if (!onDraftChange) return;
    const same =
      next.valor.trim() === base.valor && next.oferta === base.oferta && next.observacion.trim() === base.observacion.trim();
    onDraftChange(same ? null : next);
  }

  function fill(n: number) {
    const text = toInputText(n);
    setValor(text);
    setStatus(null);
    setError(null);
    emitDraft({ valor: text, oferta, observacion });
    inputRef.current?.focus();
  }

  async function submit({ advance, confirmarDesvio = false }: { advance: boolean; confirmarDesvio?: boolean }) {
    if (!dirty && saved) {
      onDone?.({ advance });
      return;
    }
    if (parsed === null) {
      setError('Ingrese un precio mayor que cero. Ejemplo: 1.234,50');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setStatus(null);
    setSaving(true);
    try {
      const payload: PriceSubmit = {
        valor: parsed,
        oferta,
        observacion: observacion.trim(),
        ...(confirmarDesvio ? { confirmarDesvio: true as const } : {}),
      };
      const result = await onSave(payload);
      if (result.kind === 'needs-confirmation') {
        setConfirm({ alerta: result.alerta, valor: parsed, advance });
      } else {
        setConfirm(null);
        setStatus(
          result.kind === 'queued'
            ? 'Guardado en este dispositivo'
            : result.kind === 'duplicate-recovered'
              ? 'Este precio ya estaba guardado'
              : 'Precio guardado',
        );
        onDraftChange?.(null);
        onDone?.({ advance });
      }
    } catch (e) {
      setConfirm(null);
      setError(describeApiError(e, 'precio'));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setAskDelete(false);
    if (!onDelete) return;
    try {
      await onDelete();
      setStatus('Precio eliminado');
    } catch (e) {
      setError(describeApiError(e, 'precio'));
    }
  }

  const stateTone = serverAlert || showClientHint ? ' figure--attn' : '';

  return (
    <div className="editor">
      <div className="editor__scroll">
        {showHeader && (
          <header className="editor__head">
            <h2>{producto.nombre}</h2>
            <p className="editor__meta">
              {producto.marca ? `${producto.marca}, ` : ''}
              <span className="num">{formatQuantity(producto)}</span>
              <span className="editor__code num">Código {producto.codigoVariedad}</span>
            </p>
          </header>
        )}

        <div className="compare">
          <div className={`prev${previous ? '' : ' prev--empty'}`}>
            <span className="label">Anterior</span>
            {previous ? (
              <>
                <span className="prev__value num">{formatMoney(previous.valor)}</span>
                <span className="prev__meta">{humanizePeriodo(previous.periodo)}</span>
                {previous.oferta && (
                  <span className="chip chip--attn prev__offer" role="note" aria-label="Anterior en oferta">
                    <IconAlert size={16} />
                    El precio anterior era una oferta
                  </span>
                )}
                {series.length >= 2 && <Sparkline points={series} current={parsed} attention={showClientHint} />}
              </>
            ) : (
              <span className="prev__meta">Sin precio anterior en este comercio.</span>
            )}
          </div>

          <div className="now">
            <label className="label" htmlFor={inputId}>
              Precio actual
            </label>
            <div className={`figure${stateTone}${valor.length > 12 ? ' figure--xlong' : valor.length > 9 ? ' figure--long' : ''}`}>
              <span className="figure__cur" aria-hidden="true">
                $
              </span>
              <input
                id={inputId}
                ref={inputRef}
                className="figure__input num"
                inputMode="decimal"
                autoComplete="off"
                placeholder={readOnly ? 'Sin precio' : '0,00'}
                value={readOnly && saved && valor === base.valor ? formatMoney(saved.valor, { symbol: false }) : valor}
                readOnly={readOnly}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
                onChange={(e) => {
                  setValor(e.target.value);
                  setStatus(null);
                  setError(null);
                  emitDraft({ valor: e.target.value, oferta, observacion });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canAdvance) {
                    e.preventDefault();
                    void submit({ advance: true });
                  }
                }}
              />
            </div>
            {error && (
              <p className="field__error" id={errId} role="alert">
                {error}
              </p>
            )}
            {!error && variation !== null && absVar && (
              <p className={`var${level === 'attention' && !oferta ? ' var--attn' : ''}`}>
                <span className="var__chip">
                  {variation > 0 ? <IconArrowUp size={16} /> : variation < 0 ? <IconArrowDown size={16} /> : null}
                  <span className="num">{absVar}</span>
                </span>
                <span>frente al anterior</span>
              </p>
            )}
            {showClientHint && (
              <p className="hint hint--attn">
                <IconAlert size={18} />
                <span>Variación atípica ({absVar}). Verifique el precio o adjunte una foto.</span>
              </p>
            )}
            {quick.length > 0 && (
              <div className="quick" role="group" aria-label="Completar con el precio anterior">
                {quick.map((q) => (
                  <button key={q.id} type="button" className="btn quick__btn" onClick={() => fill(q.valor)}>
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {serverAlert && queuedState !== 'needs-confirmation' && (
          <RangeBar alerta={serverAlert} value={saved?.valor ?? null} caption="Precio fuera de lo habitual" />
        )}

        {queuedState && (
          <div
            className={`notice queued queued--${queuedState}${
              queuedState === 'rejected' || queuedState === 'failed' ? ' notice--danger' : queuedState === 'needs-confirmation' ? ' notice--attn' : ''
            }`}
          >
            {queuedState === 'pending' || queuedState === 'sending' ? <IconPending size={20} /> : <IconAlert size={20} />}
            <div className="queued__body">
              <p>
                <strong>{STATE_LABEL[queuedState]}</strong>
                {queuedState === 'pending' && (
                  <> {offline ? 'Se enviará al recuperar la conexión.' : 'Se enviará en unos segundos.'}</>
                )}
                {queuedState === 'sending' && <>: el precio se está enviando al servidor.</>}
                {queuedState === 'needs-confirmation' && (
                  <>. El servidor lo ve fuera de lo habitual: confírmelo si es correcto o corríjalo.</>
                )}
                {queuedState === 'rejected' && <>. {describeItemError(pending?.error ?? null)}</>}
                {queuedState === 'failed' && <>. {describeItemError(pending?.error ?? null)}</>}
              </p>
              <div className="queued__actions">
                {queuedState === 'failed' && onRetryPending && (
                  <button type="button" className="btn" onClick={onRetryPending}>
                    Reintentar
                  </button>
                )}
                {canDiscardPending && (queuedState === 'rejected' || queuedState === 'failed') && (
                  <button type="button" className="btn" onClick={onDiscardPending}>
                    Descartar cambio
                  </button>
                )}
              </div>
              {queuedState === 'needs-confirmation' && pending?.alerta && saved && !dirty && (
                <RangeBar alerta={pending.alerta} value={saved.valor} />
              )}
              {(queuedState === 'rejected' || queuedState === 'failed') && pending?.error && (
                <p className="queued__detail">
                  Detalle del servidor:{' '}
                  {pending.error.fields.length > 0
                    ? pending.error.fields.map((f) => `${f.field}: ${f.message}`).join('; ')
                    : pending.error.message}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="options">
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={oferta}
              disabled={readOnly}
              onChange={(e) => {
                setOferta(e.target.checked);
                setStatus(null);
                emitDraft({ valor, oferta: e.target.checked, observacion });
              }}
            />
            <span>Precio en oferta</span>
          </label>

          <div className={`obs${readOnly && !observacion.trim() ? ' obs--empty' : ''}`}>
            {readOnly && !observacion.trim() ? (
              <p>Sin observación</p>
            ) : (
            <button
              type="button"
              className="btn btn--quiet obs__toggle"
              aria-expanded={obsOpen}
              aria-controls={obsId}
              onClick={() => setObsOpen((v) => !v)}
            >
              <IconNote size={20} />
              {observacion.trim() ? 'Observación' : 'Agregar observación'}
            </button>
            )}
            {obsOpen && (
              <div className="field" id={obsId}>
                <label className="visually-hidden" htmlFor={`${obsId}-t`}>
                  Observación sobre {producto.nombre}
                </label>
                <textarea
                  id={`${obsId}-t`}
                  className="input"
                  maxLength={500}
                  value={observacion}
                  readOnly={readOnly}
                  onChange={(e) => {
                    setObservacion(e.target.value);
                    setStatus(null);
                    emitDraft({ valor, oferta, observacion: e.target.value });
                  }}
                />
                <span className="field__hint num">{observacion.length} de 500</span>
              </div>
            )}
          </div>
        </div>

        {photoSlot && (
          <div className="photos-section">
            <h3 className="label">Fotos</h3>
            {photoSlot}
          </div>
        )}
      </div>

      {(!readOnly || blockReason === 'not-started') && (
        <div className="actionbar">
          <div className="actionbar__info">
            <span className="actionbar__status" role="status" aria-live="polite">
              {status && (
                <span key={status} className="saved">
                  <IconCheck size={20} /> {status}
                </span>
              )}
            </span>
            {readOnly && blockReason === 'not-started' && (
              <p className="actionbar__reason">Inicie la visita para cargar precios en este comercio.</p>
            )}
            {!readOnly && offline && (
              <p className="actionbar__reason">
                Sin conexión: el precio se guarda en este dispositivo y se enviará al recuperar la conexión.
              </p>
            )}
            {!readOnly && !offline && dirty && !status && <p className="actionbar__reason">Cambios sin guardar</p>}
          </div>
          {readOnly ? (
            <button
              type="button"
              className="btn btn--primary btn--large"
              disabled={offline || startingVisit || !onStartVisit}
              onClick={onStartVisit}
            >
              <IconPlay size={20} />
              Iniciar visita
            </button>
          ) : (
            <div className="actionbar__buttons">
              {((saved && onDelete) || canDiscardPending) && (
                <Menu
                  label="Más acciones"
                  placement="up"
                  trigger={<IconMore size={22} />}
                  items={[
                    ...(canDiscardPending
                      ? [
                          {
                            id: 'discard',
                            label: 'Descartar cambio pendiente',
                            detail: pending?.updatesExisting
                              ? 'Vuelve al precio que ya está en el servidor'
                              : 'Quita el precio y las fotos que esperan para enviarse',
                            danger: true,
                            onSelect: () => setAskDiscard(true),
                          },
                        ]
                      : []),
                    ...(saved && onDelete && !saved.id.startsWith('pending:')
                      ? [
                          {
                            id: 'delete',
                            label: 'Eliminar precio',
                            detail: 'Quita el precio y sus fotos',
                            danger: true,
                            disabled: offline || saving,
                            onSelect: () => setAskDelete(true),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
              <button
                type="button"
                className="btn btn--large"
                disabled={!canSave}
                onClick={() => void submit({ advance: false })}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              {confirmQueued ? (
                <button type="button" className="btn btn--primary btn--large" onClick={onConfirmPending}>
                  Confirmar precio
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary btn--large"
                  disabled={!canAdvance}
                  onClick={() => void submit({ advance: true })}
                >
                  {unchanged ? 'Siguiente' : 'Guardar y siguiente'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {confirm && (
        <Dialog
          title="Precio fuera de lo habitual"
          onClose={() => {
            setConfirm(null);
            setFocusField((n) => n + 1);
          }}
          actions={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setConfirm(null);
                  setFocusField((n) => n + 1);
                }}
              >
                Corregir
              </button>
              <button
                type="button"
                className="btn btn--primary"
                data-autofocus
                onClick={() => void submit({ advance: confirm.advance, confirmarDesvio: true })}
              >
                Confirmar precio
              </button>
            </>
          }
        >
          <p>
            Usted ingresó <strong className="num">{formatMoney(confirm.valor)}</strong> para {producto.nombre}.
          </p>
          <RangeBar alerta={confirm.alerta} value={confirm.valor} />
          <p>Corrija el precio si se equivocó. Si es correcto, confírmelo y adjunte una foto.</p>
        </Dialog>
      )}

      {askDiscard && (
        <Dialog
          title="Descartar cambio pendiente"
          onClose={() => setAskDiscard(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setAskDiscard(false)} data-autofocus>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--danger-solid"
                onClick={() => {
                  setAskDiscard(false);
                  onDiscardPending?.();
                }}
              >
                <IconTrash size={20} /> Descartar cambio
              </button>
            </>
          }
        >
          <p>
            {pending?.updatesExisting
              ? `Se descartará el cambio de ${producto.nombre} que todavía no se envió.`
              : `Se descartará el precio de ${producto.nombre} y sus fotos que todavía no se enviaron.`}{' '}
            Esta acción no se puede deshacer.
          </p>
        </Dialog>
      )}

      {askDelete && (
        <Dialog
          title="Eliminar precio"
          onClose={() => setAskDelete(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setAskDelete(false)} data-autofocus>
                Cancelar
              </button>
              <button type="button" className="btn btn--danger-solid" onClick={() => void doDelete()}>
                <IconTrash size={20} /> Eliminar precio
              </button>
            </>
          }
        >
          <p>Se eliminará el precio de {producto.nombre} y sus fotos. Esta acción no se puede deshacer.</p>
        </Dialog>
      )}
    </div>
  );
}
