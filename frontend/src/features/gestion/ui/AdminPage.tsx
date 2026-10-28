import type { ReactNode } from 'react';
import './gestion-ui.css';

interface Props {
  title: string;
  /** Small label above the title. */
  eyebrow?: string;
  description: string;
  /** Primary action of the screen (aligned to the end). */
  action?: ReactNode;
  children: ReactNode;
}

export function AdminPage({ title, eyebrow = 'Gestión', description, action, children }: Props) {
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

/** Filters row: labelled controls, wraps on narrow widths. */
export function FilterBar({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  return (
    <form className={`filters ${className}`.trim()} role="search" aria-label={label} onSubmit={(e) => e.preventDefault()}>
      {children}
    </form>
  );
}
