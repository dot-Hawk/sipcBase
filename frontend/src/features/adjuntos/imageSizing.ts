export const MAX_DIMENSION = 1600;
export const START_QUALITY = 0.8;
export const MIN_QUALITY = 0.4;
/** Server limit is 5 MB; keep a margin. */
export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

export function computeTargetSize(width: number, height: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error('Invalid image dimensions');
  const long = Math.max(width, height);
  if (long <= MAX_DIMENSION) return { width: Math.round(width), height: Math.round(height) };
  const scale = MAX_DIMENSION / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Next JPEG quality to try, or null when the floor was reached. */
export function nextQuality(current: number): number | null {
  const next = Math.round((current - 0.1) * 100) / 100;
  return next < MIN_QUALITY ? null : next;
}
