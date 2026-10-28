import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncOnlineManager } from './onlineSync';

afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe('syncOnlineManager', () => {
  it('starts TanStack Query as offline when the page cold-starts without a connection', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    onlineManager.setOnline(true); // library default: it never reads navigator.onLine itself
    syncOnlineManager();
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('leaves it online when the browser is online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    syncOnlineManager();
    expect(onlineManager.isOnline()).toBe(true);
  });
});
