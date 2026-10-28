export type PlazoTone = 'ok' | 'attention' | 'muted';

export interface Plazo {
  text: string;
  tone: PlazoTone;
  /** Whole calendar days until the deadline; negative once it has passed. */
  daysLeft: number | null;
}

const DAY = 86_400_000;
const ATTENTION_DAYS = 3;

/**
 * Days remaining until `fechaLimite` (a calendar date stored as UTC midnight),
 * counted against the device's calendar day.
 */
export function plazoLabel(fechaLimite: string, now: Date = new Date()): Plazo {
  const limit = new Date(fechaLimite);
  if (Number.isNaN(limit.getTime())) return { text: 'Sin fecha límite', tone: 'muted', daysLeft: null };
  const limitDay = Date.UTC(limit.getUTCFullYear(), limit.getUTCMonth(), limit.getUTCDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((limitDay - today) / DAY);
  if (daysLeft < 0) return { text: 'Cerró', tone: 'muted', daysLeft };
  if (daysLeft === 0) return { text: 'Vence hoy', tone: 'attention', daysLeft };
  const text = daysLeft === 1 ? 'Queda 1 día' : `Quedan ${daysLeft} días`;
  return { text, tone: daysLeft <= ATTENTION_DAYS ? 'attention' : 'ok', daysLeft };
}
