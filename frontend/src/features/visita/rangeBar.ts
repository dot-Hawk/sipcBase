export interface RangeBarInput {
  limiteInferior: number;
  limiteSuperior: number;
  media: number;
  value: number | null;
}

export interface RangeBarGeometry {
  /** All positions are fractions of the track width, 0 to 1. */
  bandStart: number;
  bandEnd: number;
  mediaPos: number;
  valuePos: number | null;
  /** Set when the value falls beyond the visible track and its marker was clamped to the edge. */
  overflow: 'low' | 'high' | null;
  outOfRange: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The expected band sits in the middle half of the track; the outer quarters
 * leave room to show how far an atypical value is from it.
 */
export function computeRangeBar({ limiteInferior, limiteSuperior, media, value }: RangeBarInput): RangeBarGeometry {
  let lo = limiteInferior;
  let hi = limiteSuperior;
  if (!(hi - lo > 0)) {
    const width = Math.max(Math.abs(media) * 0.1, 1);
    lo = media - width / 2;
    hi = media + width / 2;
  }
  const pad = (hi - lo) / 2;
  const min = lo - pad;
  const span = hi + pad - min;
  const pos = (n: number) => (n - min) / span;

  const raw = value === null ? null : pos(value);
  return {
    bandStart: pos(lo),
    bandEnd: pos(hi),
    mediaPos: clamp01(pos(media)),
    valuePos: raw === null ? null : clamp01(raw),
    overflow: raw === null ? null : raw < 0 ? 'low' : raw > 1 ? 'high' : null,
    outOfRange: value !== null && (value < limiteInferior || value > limiteSuperior),
  };
}
