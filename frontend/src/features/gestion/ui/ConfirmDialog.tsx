import type { ReactNode } from 'react';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import './gestion-ui.css';

interface Props {
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  confirmLabel: string;
  /** Label of the button that leaves without acting; defaults to "Cancelar". */
  dismissLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  /** Result of a failed attempt, announced as an alert. */
  error?: string | null;
  /** When set, the action cannot be confirmed and this says why (for example: offline). */
  blockedReason?: string | null;
  /** The action is not applicable yet (for example: nothing changed). */
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation that states the consequences. Cancel takes the initial focus: the safe default. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  dismissLabel = 'Cancelar',
  tone = 'primary',
  busy = false,
  error,
  blockedReason,
  disabled = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog
      title={title}
      onClose={busy ? () => undefined : onCancel}
      actions={
        <>
          <button type="button" className="btn btn--quiet" data-autofocus disabled={busy} onClick={onCancel}>
            {dismissLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn--danger-solid' : 'btn--primary'}`}
            disabled={busy || disabled || Boolean(blockedReason)}
            onClick={onConfirm}
          >
            {busy ? 'Guardando…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm">{children}</div>
      {blockedReason && <p className="field__hint">{blockedReason}</p>}
      {error && (
        <div className="notice notice--danger" role="alert">
          <IconAlert size={20} />
          <span>{error}</span>
        </div>
      )}
    </Dialog>
  );
}
