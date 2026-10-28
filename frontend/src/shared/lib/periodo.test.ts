import { describe, expect, it } from 'vitest';
import { humanizePeriodo, shortPeriodo } from './periodo';

describe('humanizePeriodo', () => {
  it('humanizes monthly periods', () => {
    expect(humanizePeriodo('2026-10')).toBe('Octubre 2026');
    expect(humanizePeriodo('2026-01')).toBe('Enero 2026');
  });
  it('humanizes fortnights', () => {
    expect(humanizePeriodo('2026-10-Q1')).toBe('Primera quincena de octubre 2026');
    expect(humanizePeriodo('2026-03-Q2')).toBe('Segunda quincena de marzo 2026');
  });
  it('returns unknown shapes untouched', () => {
    expect(humanizePeriodo('2026-13')).toBe('2026-13');
    expect(humanizePeriodo('otoño')).toBe('otoño');
  });
});

describe('shortPeriodo', () => {
  it('gives a compact axis label', () => {
    expect(shortPeriodo('2026-08')).toBe('ago');
    expect(shortPeriodo('2026-08-Q2')).toBe('ago 2Q');
    expect(shortPeriodo('raro')).toBe('raro');
  });
});
