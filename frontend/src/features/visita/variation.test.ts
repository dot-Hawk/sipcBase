import { describe, expect, it } from 'vitest';
import { ATENCION_THRESHOLD, classifyVariation, computeVariation, formatVariation } from './variation';

describe('computeVariation', () => {
  it('returns relative change versus previous', () => {
    expect(computeVariation(100, 133)).toBeCloseTo(0.33, 5);
    expect(computeVariation(100, 80)).toBeCloseTo(-0.2, 5);
  });
  it('returns null without a usable previous or current price', () => {
    expect(computeVariation(null, 10)).toBeNull();
    expect(computeVariation(0, 10)).toBeNull();
    expect(computeVariation(10, null)).toBeNull();
  });
});

describe('classifyVariation', () => {
  it('is none when unknown', () => {
    expect(classifyVariation(null)).toBe('none');
  });
  it('is stable below the threshold', () => {
    expect(classifyVariation(0.05)).toBe('stable');
    expect(classifyVariation(-0.19)).toBe('stable');
  });
  it('is attention at or above the threshold in either direction', () => {
    expect(classifyVariation(ATENCION_THRESHOLD)).toBe('attention');
    expect(classifyVariation(-0.33)).toBe('attention');
  });
});

describe('formatVariation', () => {
  it('formats signed percentages', () => {
    expect(formatVariation(0.33)).toBe('+33%');
    expect(formatVariation(-0.2)).toBe('−20%');
  });
  it('caps absurd increases so the chip never overflows', () => {
    expect(formatVariation(104025.61)).toBe('> +999%');
  });
});
