import type { ReactNode } from 'react';
import { IconAlert } from '@/shared/icons';
import './gestion-ui.css';

export function LoadingRows({ label }: { label: string }) {
  return (
    <div className="loading" role="status" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="skeleton" style={{ height: 52 }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <section className="state">
      <img className="state__art" src="/brand/state-empty.svg" alt="" aria-hidden="true" width={240} height={160} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </section>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="state" role="alert">
      <span className="state__icon state__icon--danger" aria-hidden="true">
        <IconAlert size={32} />
      </span>
      <p>{message}</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        Reintentar
      </button>
    </section>
  );
}
