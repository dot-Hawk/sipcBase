import type { OutboxItem } from './types';

/** Persistence port of the outbox. IndexedDB in the app, memory in tests. */
export interface OutboxStore {
  getAll(): Promise<OutboxItem[]>;
  get(id: string): Promise<OutboxItem | undefined>;
  put(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export function createMemoryStore(initial: OutboxItem[] = []): OutboxStore {
  const map = new Map(initial.map((i) => [i.id, i] as const));
  return {
    getAll: async () => [...map.values()].map((i) => ({ ...i })),
    get: async (id) => {
      const it = map.get(id);
      return it ? { ...it } : undefined;
    },
    put: async (item) => {
      map.set(item.id, { ...item });
    },
    remove: async (id) => {
      map.delete(id);
    },
    clear: async () => {
      map.clear();
    },
  };
}

/**
 * Uses `primary` until it fails once (IndexedDB blocked or unavailable), then keeps working in
 * memory so the surveyor can still queue during this session. `onDegrade` lets the UI say that
 * the queue no longer survives a reload.
 */
export function createResilientStore(primary: OutboxStore, fallback: OutboxStore, onDegrade?: () => void): OutboxStore {
  let degraded = false;
  const run = async <T>(op: (s: OutboxStore) => Promise<T>): Promise<T> => {
    if (!degraded) {
      try {
        return await op(primary);
      } catch {
        degraded = true;
        onDegrade?.();
      }
    }
    return op(fallback);
  };
  return {
    getAll: () => run((s) => s.getAll()),
    get: (id) => run((s) => s.get(id)),
    put: (item) => run((s) => s.put(item)),
    remove: (id) => run((s) => s.remove(id)),
    clear: () => run((s) => s.clear()),
  };
}
