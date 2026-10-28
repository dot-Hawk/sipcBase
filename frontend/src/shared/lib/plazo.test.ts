import { describe, expect, it } from 'vitest';
import { plazoLabel } from './plazo';

const now = new Date(2026, 9, 15, 10, 0, 0); // 15 Oct 2026, local time

describe('plazoLabel', () => {
  it('counts the days left', () => {
    expect(plazoLabel('2026-10-27T00:00:00.000Z', now)).toEqual({ text: 'Quedan 12 días', tone: 'ok', daysLeft: 12 });
  });
  it('uses singular for one day', () => {
    expect(plazoLabel('2026-10-16T00:00:00.000Z', now).text).toBe('Queda 1 día');
  });
  it('flags the last day', () => {
    expect(plazoLabel('2026-10-15T00:00:00.000Z', now)).toEqual({ text: 'Vence hoy', tone: 'attention', daysLeft: 0 });
  });
  it('marks a passed deadline as closed', () => {
    expect(plazoLabel('2026-10-01T00:00:00.000Z', now)).toEqual({ text: 'Cerró', tone: 'muted', daysLeft: -14 });
  });
  it('warns when few days are left', () => {
    expect(plazoLabel('2026-10-18T00:00:00.000Z', now).tone).toBe('attention');
  });
  it('survives an invalid date', () => {
    expect(plazoLabel('nope', now).text).toBe('Sin fecha límite');
  });
});
