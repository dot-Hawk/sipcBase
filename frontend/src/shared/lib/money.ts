const NBSP = ' ';

/**
 * Parses a price typed by a surveyor. Accepts es-AR ("1.234,50"), plain dot
 * decimals ("1234.5") and plain comma decimals ("1234,5"). A single dot followed
 * by exactly three digits ("18.400") is read as a thousands separator.
 * Returns null for empty, non-numeric, zero or negative input.
 */
export function parseMoney(input: string): number | null {
  const text = input.replace(/[$\s ]/g, '');
  if (!text || !/^[0-9.,]+$/.test(text)) return null;

  let normalized: string;
  const hasDot = text.includes('.');
  const hasComma = text.includes(',');

  if (hasDot && hasComma) {
    if (text.indexOf(',') !== text.lastIndexOf(',')) return null;
    if (text.lastIndexOf('.') > text.indexOf(',')) return null;
    if (!/^\d{1,3}(\.\d{3})*,\d+$/.test(text)) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    if (!/^\d+,\d+$/.test(text)) return null;
    normalized = text.replace(',', '.');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) normalized = text.replace(/\./g, '');
    else if (/^\d+\.\d+$/.test(text)) normalized = text;
    else return null;
  } else {
    normalized = text;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? rounded : null;
}

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const plain = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value: number, opts: { symbol?: boolean } = {}): string {
  if (opts.symbol === false) return plain.format(value);
  return currency.format(value).replace(/\s/g, NBSP);
}

/** Value as editable text for an input ("1234,5"). */
export function toInputText(value: number): string {
  return String(value).replace('.', ',');
}
