const fmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fmt.format(d);
}

const dateTimeFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

/** Local-time date and time; `Sin registro` when missing or invalid. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Sin registro';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Sin registro' : dateTimeFmt.format(d);
}
