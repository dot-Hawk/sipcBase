const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const PATTERN = /^(\d{4})-(\d{2})(?:-Q([12]))?$/;

function parse(periodo: string): { year: string; month: number; quincena: 1 | 2 | null } | null {
  const m = PATTERN.exec(periodo);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year: m[1] as string, month, quincena: m[3] ? (Number(m[3]) as 1 | 2) : null };
}

/** "2026-10" becomes "Octubre 2026"; "2026-10-Q1" becomes "Primera quincena de octubre 2026". */
export function humanizePeriodo(periodo: string): string {
  const p = parse(periodo);
  if (!p) return periodo;
  const month = MONTHS[p.month] as string;
  if (p.quincena === null) return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${p.year}`;
  return `${p.quincena === 1 ? 'Primera' : 'Segunda'} quincena de ${month} ${p.year}`;
}

/** Compact label for chart axes: "ago" or "ago 2Q". */
export function shortPeriodo(periodo: string): string {
  const p = parse(periodo);
  if (!p) return periodo;
  const month = SHORT[p.month] as string;
  return p.quincena === null ? month : `${month} ${p.quincena}Q`;
}
