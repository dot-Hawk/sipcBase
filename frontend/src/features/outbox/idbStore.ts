import type { OutboxStore } from './store';
import type { OutboxItem } from './types';

const DB_NAME = 'sipc-outbox';
const STORE = 'items';
const VERSION = 1;

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, VERSION);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('IndexedDB unavailable'));
    open.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Durable outbox storage. Photo blobs are kept as Blobs (structured clone), prices as plain
 * records. Every call opens against one shared connection promise; a failure to open rejects the
 * calls so the caller can surface "this device cannot queue" instead of silently dropping data.
 */
export function createIdbStore(): OutboxStore {
  let db: Promise<IDBDatabase> | null = null;
  const conn = () => {
    db ??= openDb().catch((e: unknown) => {
      db = null;
      throw e;
    });
    return db;
  };
  const tx = async (mode: IDBTransactionMode) => (await conn()).transaction(STORE, mode).objectStore(STORE);
  const done = (t: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
    });

  return {
    async getAll() {
      return (await wrap((await tx('readonly')).getAll())) as OutboxItem[];
    },
    async get(id) {
      return (await wrap((await tx('readonly')).get(id))) as OutboxItem | undefined;
    },
    async put(item) {
      const store = await tx('readwrite');
      store.put(item);
      await done(store.transaction);
    },
    async remove(id) {
      const store = await tx('readwrite');
      store.delete(id);
      await done(store.transaction);
    },
    async clear() {
      const store = await tx('readwrite');
      store.clear();
      await done(store.transaction);
    },
  };
}

/** Wipes the database without needing a running outbox (logout, login as another user). */
export async function wipeIdbOutbox(): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    await createIdbStore().clear();
  } catch {
    /* nothing stored or storage unavailable */
  }
}

/** Number of stored items per user, for the login screen. */
export async function peekIdbOutbox(): Promise<{ userId: string; count: number } | null> {
  if (!hasIndexedDb()) return null;
  try {
    const items = await createIdbStore().getAll();
    if (items.length === 0) return null;
    return { userId: items[0]!.userId, count: items.length };
  } catch {
    return null;
  }
}
