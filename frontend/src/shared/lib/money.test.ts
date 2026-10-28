import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from './money';

describe('parseMoney', () => {
  it('accepts es-AR thousands + decimal comma', () => {
    expect(parseMoney('1.234,50')).toBe(1234.5);
  });
  it('accepts plain dot decimal', () => {
    expect(parseMoney('1234.5')).toBe(1234.5);
  });
  it('accepts plain comma decimal', () => {
    expect(parseMoney('1234,5')).toBe(1234.5);
  });
  it('accepts integers and thousands-only grouping', () => {
    expect(parseMoney('18400')).toBe(18400);
    expect(parseMoney('18.400')).toBe(18400);
    expect(parseMoney('1.234.567')).toBe(1234567);
  });
  it('trims whitespace and currency sign', () => {
    expect(parseMoney(' $ 1.500 ')).toBe(1500);
  });
  it('rejects zero, negatives, NaN and empty input', () => {
    expect(parseMoney('0')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('1,2,3')).toBeNull();
    expect(parseMoney('12..5')).toBeNull();
  });
  it('rounds to 2 decimals', () => {
    expect(parseMoney('10,999')).toBe(11);
  });
});

describe('formatMoney', () => {
  it('formats with es-AR grouping and two decimals', () => {
    expect(formatMoney(1234.5)).toBe('$ 1.234,50');
  });
  it('formats plain numbers without symbol', () => {
    expect(formatMoney(18400, { symbol: false })).toBe('18.400,00');
  });
  it('formats a number as editable input text', () => {
    expect(toInputText(1234.5)).toBe('1234,5');
  });
});
import { toInputText } from './money';
