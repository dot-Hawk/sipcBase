import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERSIST_KEY,
  clearPersistedQueryCache,
  restoreQueryCache,
  startQueryCachePersistence,
} from './persist';

const DAY = 24 * 60 * 60 * 1000;

function client() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('query cache persistence', () => {
  it('writes whitelisted successful queries after a debounce and restores them for the same user', () => {
    const a = client();
    let user: string | null = 'u1';
    const stop = startQueryCachePersistence(a, () => user);
    a.setQueryData(['asignaciones'], [{ id: 'a1' }]);
    a.setQueryData(['precios', 'all', 'c1'], [{ id: 'p1' }]);
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
    vi.advanceTimersByTime(1500);
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull();
    stop();

    const b = client();
    expect(restoreQueryCache(b, 'u1', Date.now())).toBe(true);
    expect(b.getQueryData(['asignaciones'])).toEqual([{ id: 'a1' }]);
    expect(b.getQueryData(['precios', 'all', 'c1'])).toEqual([{ id: 'p1' }]);
  });

  it('never persists queries outside the whitelist (photos metadata, previous price)', () => {
    const a = client();
    const stop = startQueryCachePersistence(a, () => 'u1');
    a.setQueryData(['adjuntos', 'p1'], [{ id: 'x' }]);
    a.setQueryData(['precio-anterior', 'r', 'c', 'p'], { valor: 1 });
    a.setQueryData(['comercios'], [{ id: 'c1' }]);
    vi.advanceTimersByTime(1500);
    stop();
    const raw = localStorage.getItem(PERSIST_KEY) ?? '';
    expect(raw).toContain('comercios');
    expect(raw).not.toContain('adjuntos');
    expect(raw).not.toContain('precio-anterior');
  });

  it('does not restore another user\'s data and removes it', () => {
    const a = client();
    const stop = startQueryCachePersistence(a, () => 'u1');
    a.setQueryData(['asignaciones'], [{ id: 'a1' }]);
    vi.advanceTimersByTime(1500);
    stop();
    const b = client();
    expect(restoreQueryCache(b, 'u2', Date.now())).toBe(false);
    expect(b.getQueryData(['asignaciones'])).toBeUndefined();
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it('drops snapshots older than the max age', () => {
    const a = client();
    const stop = startQueryCachePersistence(a, () => 'u1');
    a.setQueryData(['asignaciones'], [{ id: 'a1' }]);
    vi.advanceTimersByTime(1500);
    stop();
    expect(restoreQueryCache(client(), 'u1', Date.now() + 8 * DAY)).toBe(false);
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it('ignores corrupt or foreign payloads', () => {
    localStorage.setItem(PERSIST_KEY, '{not json');
    expect(restoreQueryCache(client(), 'u1', Date.now())).toBe(false);
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ v: 99, userId: 'u1' }));
    expect(restoreQueryCache(client(), 'u1', Date.now())).toBe(false);
  });

  it('does not write once the session is gone and cancels a pending write', () => {
    const a = client();
    let user: string | null = 'u1';
    const stop = startQueryCachePersistence(a, () => user);
    a.setQueryData(['asignaciones'], [{ id: 'a1' }]);
    user = null; // logout happens before the debounce fires
    vi.advanceTimersByTime(1500);
    stop();
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it('clearPersistedQueryCache removes the snapshot', () => {
    localStorage.setItem(PERSIST_KEY, '{}');
    clearPersistedQueryCache();
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });
});
