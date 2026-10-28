import { describe, expect, it } from 'vitest';
import { formatDateTime } from './dates';

describe('formatDateTime', () => {
  it('formats in es-AR with date and time', () => {
    const out = formatDateTime('2026-10-01T15:30:00.000Z');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
    expect(out).toMatch(/oct/i);
  });
  it('falls back for null and invalid input', () => {
    expect(formatDateTime(null)).toBe('Sin registro');
    expect(formatDateTime('nope')).toBe('Sin registro');
  });
});
