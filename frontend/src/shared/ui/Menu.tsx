import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import '@/shared/styles/ui.css';

export interface MenuItem {
  id: string;
  label: string;
  detail?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface Props {
  /** Accessible name of the trigger. */
  label: string;
  trigger: ReactNode;
  items: readonly MenuItem[];
  placement?: 'down' | 'up';
  triggerClassName?: string;
  disabled?: boolean;
}

/** Small popup menu: Escape and outside press close it, arrows move between items. */
export function Menu({ label, trigger, items, placement = 'down', triggerClassName = 'icon-btn', disabled }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const first = root.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
    function onDown(e: MouseEvent | TouchEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
      list[next]?.focus();
    }
  }

  return (
    <div className="menu" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div id={panelId} role="menu" aria-label={label} className={`menu__panel menu__panel--${placement}`}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.detail && <small>{item.detail}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
