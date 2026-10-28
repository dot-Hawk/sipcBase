import type { ReactNode } from 'react';
import './gestion-ui.css';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-aligned, no wrapping: for dates and row actions. */
  align?: 'end';
  /** The identifying cell: bold, and the title of the stacked card at tablet width. */
  primary?: boolean;
  /** Short values (dates, chips, roles) that should not wrap inside the cell. */
  nowrap?: boolean;
}

interface Props<T> {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
}

/**
 * Semantic table. When its container is at least 680px wide it is a dense grid; below, each row
 * becomes a stacked card where every cell shows its header through `data-label`. The breakpoint is
 * the container, not the viewport: the sidebar takes 264px of a 1024px screen.
 */
export function DataTable<T>({ caption, columns, rows, rowKey }: Props<T>) {
  return (
    <div className="dtable-wrap">
      <div className="dtable-panel">
      <table className="dtable">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'end' ? 'dtable__end' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.header}
                  className={[
                    c.align === 'end' ? 'dtable__end' : '',
                    c.primary ? 'dtable__primary' : '',
                    c.nowrap ? 'dtable__nowrap' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="dtable__cell">{c.cell(row)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
