import { hasNextPage, pageRange } from '@/shared/api/page';
import { IconChevronLeft, IconChevronRight } from '@/shared/icons';
import './gestion-ui.css';

interface Props {
  page: number;
  pageSize: number;
  /** Rows in the current page. */
  count: number;
  /** `X-Total-Count`; null when the backend does not send it (then a full page may have another). */
  total: number | null;
  onPage: (page: number) => void;
  busy?: boolean;
  /** Accessible name of the landmark; give each pager its own when a screen has several. */
  label?: string;
}

export function Pagination({ page, pageSize, count, total, onPage, busy = false, label: navLabel = 'Paginación' }: Props) {
  const range = pageRange({ page, pageSize, count });
  const hasNext = hasNextPage({ page, pageSize, count, total });
  // Without the total the old label stays: only "Página N".
  const label = range && total !== null ? `Mostrando ${range.from}–${range.to} de ${total}` : `Página ${page}`;
  return (
    <nav className="pager" aria-label={navLabel}>
      <button type="button" className="btn" disabled={page <= 1 || busy} onClick={() => onPage(page - 1)}>
        <IconChevronLeft size={20} />
        Anterior
      </button>
      <span aria-live="polite">{label}</span>
      <button type="button" className="btn" disabled={!hasNext || busy} onClick={() => onPage(page + 1)}>
        Siguiente
        <IconChevronRight size={20} />
      </button>
    </nav>
  );
}
