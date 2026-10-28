/**
 * UI hint only. The authoritative atypical-price judgement is the server's
 * 409 `requiereConfirmacion` response; this threshold just draws the surveyor's
 * attention to a large change before saving.
 */
export const ATENCION_THRESHOLD = 0.2;

export type VariationLevel = 'none' | 'stable' | 'attention';

/** Relative change (0.33 = +33%) or null when it cannot be computed. */
export function computeVariation(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null) return null;
  if (!(previous > 0) || !Number.isFinite(current)) return null;
  return (current - previous) / previous;
}

export function classifyVariation(variation: number | null): VariationLevel {
  if (variation === null) return 'none';
  return Math.abs(variation) >= ATENCION_THRESHOLD ? 'attention' : 'stable';
}

/** Beyond this the exact figure carries no information and would overflow the chip. */
const MAX_SHOWN_PCT = 999;

export function formatVariation(variation: number): string {
  const pct = Math.round(variation * 100);
  if (pct > MAX_SHOWN_PCT) return `> +${MAX_SHOWN_PCT}%`;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct)}%`;
}
