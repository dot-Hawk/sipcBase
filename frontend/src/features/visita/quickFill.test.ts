import { describe, expect, it } from 'vitest';
import { applyPercent, quickFillOptions } from './quickFill';

describe('applyPercent', () => {
  it('rounds to two decimals', () => {
    expect(applyPercent(999.99, 5)).toBe(1049.99);
    expect(applyPercent(18400, -5)).toBe(17480);
    expect(applyPercent(333.33, 5)).toBe(350);
  });
  it('never goes below one cent', () => {
    expect(applyPercent(0.01, -5)).toBe(0.01);
  });
});

describe('quickFillOptions', () => {
  it('builds the three chips from the previous price', () => {
    expect(quickFillOptions(1000)).toEqual([
      { id: 'same', label: 'Igual al anterior', valor: 1000 },
      { id: 'up', label: '+5%', valor: 1050 },
      { id: 'down', label: '−5%', valor: 950 },
    ]);
  });
  it('is empty without a previous price', () => {
    expect(quickFillOptions(null)).toEqual([]);
  });
});
