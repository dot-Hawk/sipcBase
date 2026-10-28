import { describe, expect, it } from 'vitest';
import { countLabel, hasNextPage, pageRange, parseTotalCount } from './page';

describe('parseTotalCount', () => {
  it('reads a non-negative integer', () => {
    expect(parseTotalCount('0')).toBe(0);
    expect(parseTotalCount('137')).toBe(137);
  });
  it('is null when the header is absent or malformed', () => {
    expect(parseTotalCount(null)).toBeNull();
    expect(parseTotalCount('')).toBeNull();
    expect(parseTotalCount('abc')).toBeNull();
    expect(parseTotalCount('-3')).toBeNull();
    expect(parseTotalCount('1.5')).toBeNull();
  });
});

describe('hasNextPage', () => {
  it('uses the real total when present', () => {
    expect(hasNextPage({ page: 1, pageSize: 50, count: 50, total: 120 })).toBe(true);
    expect(hasNextPage({ page: 3, pageSize: 50, count: 20, total: 120 })).toBe(false);
  });
  it('a total that is an exact multiple does not offer an empty next page', () => {
    expect(hasNextPage({ page: 2, pageSize: 50, count: 50, total: 100 })).toBe(false);
  });
  it('falls back to "a full page may have another" without a total', () => {
    expect(hasNextPage({ page: 1, pageSize: 50, count: 50, total: null })).toBe(true);
    expect(hasNextPage({ page: 1, pageSize: 50, count: 12, total: null })).toBe(false);
  });
});

describe('pageRange', () => {
  it('gives the 1-based inclusive range of the rows shown', () => {
    expect(pageRange({ page: 1, pageSize: 50, count: 50 })).toEqual({ from: 1, to: 50 });
    expect(pageRange({ page: 3, pageSize: 50, count: 20 })).toEqual({ from: 101, to: 120 });
  });
  it('is null for an empty page', () => {
    expect(pageRange({ page: 4, pageSize: 50, count: 0 })).toBeNull();
  });
});

describe('countLabel', () => {
  it('pluralises', () => {
    expect(countLabel(1, 'asignación', 'asignaciones')).toBe('1 asignación');
    expect(countLabel(12, 'asignación', 'asignaciones')).toBe('12 asignaciones');
  });
});
