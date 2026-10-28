import { describe, expect, it } from 'vitest';
import { computeRangeBar } from './rangeBar';

const alerta = { limiteInferior: 100, limiteSuperior: 200, media: 150 };

describe('computeRangeBar', () => {
  it('places the expected band in the middle of the track', () => {
    const r = computeRangeBar({ ...alerta, value: 150 });
    expect(r.bandStart).toBeCloseTo(0.25);
    expect(r.bandEnd).toBeCloseTo(0.75);
    expect(r.mediaPos).toBeCloseTo(0.5);
    expect(r.valuePos).toBeCloseTo(0.5);
    expect(r.overflow).toBeNull();
    expect(r.outOfRange).toBe(false);
  });
  it('marks a value inside the band as in range', () => {
    expect(computeRangeBar({ ...alerta, value: 199 }).outOfRange).toBe(false);
  });
  it('marks values beyond the band as out of range without overflow while visible', () => {
    const r = computeRangeBar({ ...alerta, value: 230 });
    expect(r.outOfRange).toBe(true);
    expect(r.overflow).toBeNull();
    expect(r.valuePos).toBeGreaterThan(0.75);
  });
  it('clamps and flags overflow above the track', () => {
    const r = computeRangeBar({ ...alerta, value: 900 });
    expect(r.valuePos).toBe(1);
    expect(r.overflow).toBe('high');
    expect(r.outOfRange).toBe(true);
  });
  it('clamps and flags overflow below the track', () => {
    const r = computeRangeBar({ ...alerta, value: 1 });
    expect(r.valuePos).toBe(0);
    expect(r.overflow).toBe('low');
  });
  it('handles a degenerate band', () => {
    const r = computeRangeBar({ limiteInferior: 100, limiteSuperior: 100, media: 100, value: 100 });
    expect(r.bandStart).toBeLessThan(r.bandEnd);
    expect(r.valuePos).toBeGreaterThan(0);
    expect(r.valuePos).toBeLessThan(1);
  });
  it('has no value marker when the value is missing', () => {
    expect(computeRangeBar({ ...alerta, value: null }).valuePos).toBeNull();
  });
});
