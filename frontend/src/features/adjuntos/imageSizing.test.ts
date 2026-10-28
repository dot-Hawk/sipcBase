import { describe, expect, it } from 'vitest';
import { MAX_DIMENSION, computeTargetSize, nextQuality } from './imageSizing';

describe('computeTargetSize', () => {
  it('keeps small images', () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('scales the long side down to the max, keeping ratio', () => {
    expect(computeTargetSize(4000, 3000)).toEqual({ width: MAX_DIMENSION, height: 1200 });
    expect(computeTargetSize(3000, 4000)).toEqual({ width: 1200, height: MAX_DIMENSION });
  });
  it('never returns zero', () => {
    const s = computeTargetSize(10000, 1);
    expect(s.width).toBe(MAX_DIMENSION);
    expect(s.height).toBe(1);
  });
  it('guards invalid input', () => {
    expect(() => computeTargetSize(0, 10)).toThrow();
  });
});

describe('nextQuality', () => {
  it('lowers quality until the floor then gives up', () => {
    let q: number | null = 0.8;
    const seen: number[] = [];
    while (q !== null) {
      seen.push(q);
      q = nextQuality(q);
    }
    expect(seen[0]).toBe(0.8);
    expect(seen.length).toBeGreaterThan(1);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0.4);
  });
});
