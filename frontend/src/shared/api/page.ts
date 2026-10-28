/** A list plus the server's total (`X-Total-Count`); `total` is null when the header is absent. */
export interface Paged<T> {
  items: T[];
  total: number | null;
}

/** Non-negative integer or null: an absent or malformed header never breaks the screen. */
export function parseTotalCount(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

interface PageShape {
  page: number;
  pageSize: number;
  /** Rows in the current page. */
  count: number;
}

/** With a total: is there a row beyond this page. Without: a full page may have another. */
export function hasNextPage(p: PageShape & { total: number | null }): boolean {
  return p.total !== null ? p.page * p.pageSize < p.total : p.count === p.pageSize;
}

/** 1-based inclusive range of the rows shown, or null for an empty page. */
export function pageRange(p: PageShape): { from: number; to: number } | null {
  if (p.count === 0) return null;
  const from = (p.page - 1) * p.pageSize + 1;
  return { from, to: from + p.count - 1 };
}

/** "1 asignación" / "12 asignaciones". */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
