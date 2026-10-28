import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { isEncuestador } from '@/features/auth/session';
import { savePrice } from '@/features/visita/savePrice';
import { api } from '@/shared/api/endpoints';
import { keys, upsertPrecioInCache } from '@/shared/api/queries';
import { createOutbox, type Outbox, type OutboxChannel, type OutboxDeps, type OutboxSnapshot } from './engine';
import { createIdbStore, hasIndexedDb } from './idbStore';
import { createMemoryStore, createResilientStore } from './store';
import { countItems, type OutboxCounts } from './types';

const OutboxContext = createContext<Outbox | null>(null);

const EMPTY: OutboxSnapshot = { items: [], flushing: false, paused: null, loaded: false };
const noopSubscribe = () => () => undefined;

/** Test seam and the real provider's inner half: exposes an already built outbox. */
export function OutboxContextProvider({ outbox, children }: { outbox: Outbox | null; children: ReactNode }) {
  return <OutboxContext.Provider value={outbox}>{children}</OutboxContext.Provider>;
}

export const useOutbox = (): Outbox | null => useContext(OutboxContext);

export function useOutboxSnapshot(): OutboxSnapshot {
  const outbox = useOutbox();
  return useSyncExternalStore(
    outbox ? outbox.subscribe : noopSubscribe,
    outbox ? outbox.getSnapshot : () => EMPTY,
    () => EMPTY,
  );
}

export function useOutboxCounts(): OutboxCounts {
  const { items } = useOutboxSnapshot();
  return useMemo(() => countItems(items), [items]);
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function createChannel(): OutboxChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  const bc = new BroadcastChannel('sipc-outbox');
  return {
    post: () => bc.postMessage('changed'),
    onMessage: (cb) => {
      const handler = () => cb();
      bc.addEventListener('message', handler);
      return () => bc.removeEventListener('message', handler);
    },
  };
}

function withWebLock(): OutboxDeps['withLock'] {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return undefined;
  return (fn) =>
    locks.request('sipc-outbox-flush', { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
}

/**
 * Owns the outbox of the signed-in user: persistent store, flush triggers (start, `online`, retry
 * timer) and the cache updates after a send. A forced sign-out (401, expiry) keeps the stored
 * items for the same user's next sign-in; only an explicit discard or another user clears them.
 */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Offline work (prices, photos) is a surveyor-only concern: other roles never get an outbox,
  // so nothing is queued, flushed or deleted on their behalf (a surveyor's unsent items survive).
  const userId = session && isEncuestador(session.user) ? session.user.id : null;
  const [outbox, setOutbox] = useState<Outbox | null>(null);

  useEffect(() => {
    if (userId === null) {
      setOutbox(null);
      return undefined;
    }
    const engine = createOutbox({
      store: hasIndexedDb() ? createResilientStore(createIdbStore(), createMemoryStore()) : createMemoryStore(),
      userId,
      savePrice: (input) =>
        savePrice(
          {
            createPrecio: api.createPrecio,
            updatePrecio: api.updatePrecio,
            findExisting: async (ctx) => (await api.listPrecios({ ...ctx, limit: 1 }))[0] ?? null,
          },
          input,
        ),
      uploadPhoto: api.uploadAdjunto,
      listAdjuntos: api.listAdjuntos,
      findPrecio: async (ctx) => (await api.listPrecios({ ...ctx, limit: 1 }))[0] ?? null,
      hash: sha256Hex,
      now: () => Date.now(),
      isOnline: () => navigator.onLine,
      withLock: withWebLock(),
      channel: createChannel(),
      onPriceSaved: (precio) => upsertPrecioInCache(queryClient, precio),
      onPhotoUploaded: (precioId) => void queryClient.invalidateQueries({ queryKey: keys.adjuntos(precioId) }),
    });
    let cancelled = false;
    const onOnline = () => void engine.flush();
    void engine.load().then(() => {
      if (cancelled) return;
      setOutbox(engine);
      void engine.flush();
    });
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      engine.dispose();
    };
  }, [userId, queryClient]);

  return <OutboxContext.Provider value={outbox}>{children}</OutboxContext.Provider>;
}
