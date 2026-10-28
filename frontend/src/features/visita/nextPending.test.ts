import { describe, expect, it } from 'vitest';
import { nextPendingId } from './nextPending';

const ids = ['a', 'b', 'c', 'd'];

describe('nextPendingId', () => {
  it('returns the next product after the current one that has no price', () => {
    expect(nextPendingId(ids, new Set(['b']), 'a')).toBe('c');
  });
  it('wraps around to earlier pending products', () => {
    expect(nextPendingId(ids, new Set(['d']), 'c')).toBe('a');
  });
  it('never returns the current product, even if it is not priced yet', () => {
    expect(nextPendingId(ids, new Set(['a', 'c', 'd']), 'b')).toBeNull();
  });
  it('returns null when everything has a price', () => {
    expect(nextPendingId(ids, new Set(ids), 'a')).toBeNull();
  });
  it('starts from the top when nothing is selected or the id is unknown', () => {
    expect(nextPendingId(ids, new Set(['a']), null)).toBe('b');
    expect(nextPendingId(ids, new Set(), 'zzz')).toBe('a');
  });
  it('handles an empty list', () => {
    expect(nextPendingId([], new Set(), null)).toBeNull();
  });
});
