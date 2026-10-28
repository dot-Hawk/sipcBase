import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '@/shared/icons';
import '@/shared/styles/ui.css';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Footer buttons. Omit when the content brings its own action bar. */
  actions?: ReactNode;
  /** Near-full-height sheet that holds a whole workspace instead of a short message. */
  tall?: boolean;
  /** Extra header controls next to the close button (for example previous and next). */
  headerExtra?: ReactNode;
  /** Optional smaller line under the title. */
  description?: ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Open dialogs, topmost last. Only the topmost one reacts to the keyboard. */
const stack: symbol[] = [];

/** Sheet with focus trap, Escape to close and focus restore. Mount it only while open. */
export function Dialog({ title, onClose, children, actions, tall, headerExtra, description }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Captured during the first render, before any child effect can move focus.
  const [previous] = useState(() => document.activeElement as HTMLElement | null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const me = Symbol('dialog');
    stack.push(me);
    const node = ref.current;
    // Content may have placed focus already (for example the price field); keep it.
    if (!node?.contains(document.activeElement)) {
      const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node)?.focus();
    }

    function onKey(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const a = items[0] as HTMLElement;
      const z = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (!node.contains(active)) {
        e.preventDefault();
        a.focus();
      } else if (e.shiftKey && active === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && active === z) {
        e.preventDefault();
        a.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`dialog${tall ? ' dialog--tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="dialog__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId}>{title}</h2>
            {description}
          </div>
          {headerExtra}
          {tall && (
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
              <IconClose size={24} />
            </button>
          )}
        </div>
        <div className="dialog__body">{children}</div>
        {actions && <div className="dialog__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
