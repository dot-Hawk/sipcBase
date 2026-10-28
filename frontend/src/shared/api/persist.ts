import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from '@tanstack/react-query';

/**
 * Offline read cache: a small, per-user snapshot of the visit data in `localStorage`.
 *
 * - Only the list reads the surveyor needs to work an existing visit are stored (never photos,
 *   previous-price answers, tokens or credentials; the token already lives in `sipc.session`).
 * - The snapshot is bound to the user id, expires, and is removed on logout / login / user change.
 * - It is a convenience: any failure (quota, private mode, corrupt JSON) degrades to "no snapshot".
 */
export const PERSIST_KEY = 'sipc.queryCache';
const VERSION = 1;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 1000;
const WHITELIST = new Set(['asignaciones', 'relevamientos', 'comercios', 'productos', 'precios']);

interface Envelope {
  v: number;
  userId: string;
  savedAt: number;
  state: DehydratedState;
}

function shouldPersist(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === 'string' && WHITELIST.has(root) && query.state.status === 'success';
}

export function clearPersistedQueryCache(): void {
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

function read(): Envelope | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const e = parsed as Partial<Envelope>;
    if (e.v !== VERSION || typeof e.userId !== 'string' || typeof e.savedAt !== 'number' || !e.state) return null;
    return e as Envelope;
  } catch {
    return null;
  }
}

/** Hydrates the client from the snapshot when it belongs to `userId` and is fresh enough. */
export function restoreQueryCache(queryClient: QueryClient, userId: string, nowMs: number): boolean {
  const envelope = read();
  if (!envelope) {
    if (localStorage.getItem(PERSIST_KEY) !== null) clearPersistedQueryCache(); // unreadable leftovers
    return false;
  }
  if (envelope.userId !== userId || nowMs - envelope.savedAt > MAX_AGE_MS || nowMs < envelope.savedAt) {
    clearPersistedQueryCache();
    return false;
  }
  try {
    hydrate(queryClient, envelope.state);
    return true;
  } catch {
    clearPersistedQueryCache();
    return false;
  }
}

/** Debounced write of the whitelisted cache while `getUserId()` is non-null. Returns the stop function. */
export function startQueryCachePersistence(queryClient: QueryClient, getUserId: () => string | null): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const userId = getUserId();
    if (userId === null) return;
    try {
      const state = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersist });
      const envelope: Envelope = { v: VERSION, userId, savedAt: Date.now(), state };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(envelope));
    } catch {
      /* quota or serialization failure: keep working without a snapshot */
    }
  };

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (timer === null) timer = setTimeout(flush, DEBOUNCE_MS);
  });

  return () => {
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
