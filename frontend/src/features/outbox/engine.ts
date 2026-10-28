import { ApiError } from '@/shared/api/errors';
import type { Adjunto, Precio } from '@/shared/api/types';
import type { SavePriceInput, SavePriceResult } from '@/features/visita/savePrice';
import type { OutboxStore } from './store';
import { priceItemId, type ItemError, type OutboxItem, type PhotoItem, type PriceItem } from './types';

/** Cross-tab "something changed" signal (BroadcastChannel in the app). */
export interface OutboxChannel {
  post: () => void;
  /** Returns the unsubscribe function. */
  onMessage: (cb: () => void) => () => void;
}

export interface OutboxDeps {
  store: OutboxStore;
  userId: string;
  savePrice: (input: SavePriceInput) => Promise<SavePriceResult>;
  uploadPhoto: (precioId: string, blob: Blob) => Promise<Adjunto>;
  listAdjuntos: (precioId: string) => Promise<Pick<Adjunto, 'sha256'>[]>;
  /** The precio of a (relevamiento, comercio, producto), or null when none exists on the server. */
  findPrecio: (ctx: { relevamiento: string; comercio: string; producto: string }) => Promise<Precio | null>;
  hash: (blob: Blob) => Promise<string>;
  now: () => number;
  isOnline: () => boolean;
  /**
   * Runs `fn` while holding the cross-tab flush lock; resolves `undefined` without running it when
   * another tab already holds it. Default: no cross-tab lock (the in-tab guard still applies).
   */
  withLock?: (fn: () => Promise<void>) => Promise<unknown>;
  channel?: OutboxChannel;
  onPriceSaved?: (precio: Precio) => void;
  onPhotoUploaded?: (precioId: string) => void;
  onSessionEnded?: () => void;
}

export interface OutboxSnapshot {
  items: readonly OutboxItem[];
  flushing: boolean;
  /** 'session': a 401 stopped the queue; nothing is sent until a new sign-in. */
  paused: 'session' | null;
  loaded: boolean;
}

export interface EnqueuePriceInput {
  asignacionId: string;
  relevamiento: string;
  comercio: string;
  producto: string;
  valor: number;
  oferta: boolean;
  observacion: string;
  /** Server copy being edited, when the precio already exists. */
  precio: Precio | null;
  confirmed?: boolean;
}

export interface EnqueuePhotoInput {
  asignacionId: string;
  relevamiento: string;
  comercio: string;
  producto: string;
  blob: Blob;
  precioId: string | null;
}

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

export function backoffMs(attempts: number, retryAfterSeconds: number | null = null): number {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(attempts - 1, 0), BACKOFF_MAX_MS);
  return retryAfterSeconds !== null ? Math.max(exp, retryAfterSeconds * 1000) : exp;
}

type Outcome = 'continue' | 'stop';

function toItemError(e: ApiError): ItemError {
  return { status: e.status, message: e.message, fields: e.errors };
}

function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createOutbox(deps: OutboxDeps) {
  let snapshot: OutboxSnapshot = { items: [], flushing: false, paused: null, loaded: false };
  const listeners = new Set<() => void>();
  let chain: Promise<unknown> = Promise.resolve();
  let flushPromise: Promise<void> | null = null;
  let flushAgain = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seqCounter = 0;
  let unsubscribeChannel: (() => void) | null = null;

  const mine = (items: OutboxItem[]) => items.filter((i) => i.userId === deps.userId);
  const bySeq = (a: OutboxItem, b: OutboxItem) => a.seq - b.seq || a.createdAt - b.createdAt;

  function publish(patch: Partial<OutboxSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  }

  /** Serializes read-modify-write against the store inside this tab. */
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  }

  async function refresh(announce = false) {
    const all = mine(await deps.store.getAll()).sort(bySeq);
    publish({ items: all });
    if (announce) deps.channel?.post();
  }

  async function write(item: OutboxItem) {
    await deps.store.put(item);
    await refresh(true);
  }

  async function removeIds(ids: string[]) {
    for (const id of ids) await deps.store.remove(id);
    await refresh(true);
  }

  async function load(): Promise<void> {
    await serial(async () => {
      const all = await deps.store.getAll();
      // Anything stored for another user is not ours to keep nor to send.
      for (const it of all) if (it.userId !== deps.userId) await deps.store.remove(it.id);
      const items = all.filter((i) => i.userId === deps.userId).sort(bySeq);
      seqCounter = items.reduce((m, i) => Math.max(m, i.seq), 0);
      publish({ items, loaded: true });
    });
    unsubscribeChannel?.();
    unsubscribeChannel = deps.channel?.onMessage(() => void serial(() => refresh())) ?? null;
  }

  function nextSeq() {
    seqCounter = Math.max(seqCounter + 1, deps.now());
    return seqCounter;
  }

  async function enqueuePrice(input: EnqueuePriceInput): Promise<PriceItem> {
    return serial(async () => {
      const id = priceItemId(input.asignacionId, input.producto);
      const existing = (await deps.store.get(id)) as PriceItem | undefined;
      const precio = input.precio ?? existing?.precio ?? null;
      const item: PriceItem = {
        id,
        kind: 'price',
        userId: deps.userId,
        asignacionId: input.asignacionId,
        relevamiento: input.relevamiento,
        comercio: input.comercio,
        producto: input.producto,
        seq: existing?.seq ?? nextSeq(),
        createdAt: existing?.createdAt ?? deps.now(),
        status: existing?.status === 'sending' ? 'sending' : 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        error: null,
        valor: input.valor,
        oferta: input.oferta,
        observacion: input.observacion,
        capturedAt: new Date(deps.now()).toISOString(),
        confirmed: input.confirmed ?? false,
        precioId: input.precio?.id ?? existing?.precioId ?? null,
        precio,
        alerta: null,
        rev: (existing?.rev ?? 0) + 1,
        omitFecha: existing?.omitFecha ?? false,
      };
      await write(item);
      return item;
    });
  }

  async function enqueuePhoto(input: EnqueuePhotoInput): Promise<PhotoItem> {
    return serial(async () => {
      const item: PhotoItem = {
        id: `photo:${uuid()}`,
        kind: 'photo',
        userId: deps.userId,
        asignacionId: input.asignacionId,
        relevamiento: input.relevamiento,
        comercio: input.comercio,
        producto: input.producto,
        seq: nextSeq(),
        createdAt: deps.now(),
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        error: null,
        blob: input.blob,
        precioId: input.precioId,
        maybeSent: false,
      };
      await write(item);
      return item;
    });
  }

  async function confirm(id: string): Promise<void> {
    await serial(async () => {
      const item = await deps.store.get(id);
      if (!item || item.kind !== 'price') return;
      await write({ ...item, confirmed: true, status: 'pending', attempts: 0, nextAttemptAt: 0, error: null });
    });
  }

  async function discard(id: string): Promise<void> {
    await serial(async () => {
      const item = await deps.store.get(id);
      if (!item) return;
      const ids = [id];
      // Photos that were waiting for a precio that will now never exist have nothing to attach to.
      if (item.kind === 'price' && item.precioId === null) {
        for (const it of await deps.store.getAll()) {
          if (
            it.kind === 'photo' && it.userId === deps.userId && it.asignacionId === item.asignacionId &&
            it.producto === item.producto && it.precioId === null
          ) {
            ids.push(it.id);
          }
        }
      }
      await removeIds(ids);
    });
  }

  async function discardAll(): Promise<void> {
    await serial(async () => {
      await deps.store.clear();
      await refresh(true);
    });
  }

  /** An online save went through: the queued price of that product is obsolete, its photos are not. */
  async function supersedePrice(asignacionId: string, producto: string, precioId: string): Promise<void> {
    await serial(async () => {
      const existing = await deps.store.get(priceItemId(asignacionId, producto));
      if (existing && existing.status !== 'sending') await deps.store.remove(existing.id);
      for (const it of await deps.store.getAll()) {
        if (
          it.kind === 'photo' && it.userId === deps.userId && it.asignacionId === asignacionId &&
          it.producto === producto && it.precioId === null
        ) {
          await deps.store.put({ ...it, precioId });
        }
      }
      await refresh(true);
    });
  }

  // ---- flushing ----

  const hasPriceFor = (items: OutboxItem[], it: OutboxItem) =>
    items.some((p) => p.kind === 'price' && p.asignacionId === it.asignacionId && p.producto === it.producto);

  function isEligible(it: OutboxItem, items: OutboxItem[], now: number): boolean {
    if (it.status !== 'pending' || it.nextAttemptAt > now) return false;
    return it.kind === 'price' || !hasPriceFor(items, it);
  }

  async function failWith(item: OutboxItem, e: unknown): Promise<Outcome> {
    const error = e instanceof ApiError ? e : null;
    const status = error?.status ?? -1;
    const info: ItemError = error ? toItemError(error) : { status: -1, message: String(e), fields: [] };

    if (status === 401) {
      await serial(() => write({ ...item, status: 'pending', error: null }));
      publish({ paused: 'session' });
      deps.onSessionEnded?.();
      return 'stop';
    }
    if (status === 0 || status >= 500 || status === 429) {
      const attempts = item.attempts + 1;
      await serial(() =>
        write({
          ...item, status: 'pending', attempts, error: info,
          nextAttemptAt: deps.now() + backoffMs(attempts, error?.retryAfter ?? null),
        }),
      );
      return status === 0 ? 'stop' : 'continue';
    }
    const content = status === 400 || status === 413 || status === 415 || status === 422;
    await serial(() => write({ ...item, status: content ? 'rejected' : 'failed', error: info }));
    return 'continue';
  }

  async function completePrice(item: PriceItem, precio: Precio): Promise<void> {
    await serial(async () => {
      const fresh = (await deps.store.get(item.id)) as PriceItem | undefined;
      for (const it of await deps.store.getAll()) {
        if (
          it.kind === 'photo' && it.userId === deps.userId && it.asignacionId === item.asignacionId &&
          it.producto === item.producto && it.precioId === null
        ) {
          await deps.store.put({ ...it, precioId: precio.id });
        }
      }
      if (fresh && fresh.rev !== item.rev) {
        // Edited while in flight: the new value goes on top of what the server now holds.
        await deps.store.put({
          ...fresh, status: 'pending', precioId: precio.id, precio, attempts: 0, nextAttemptAt: 0, error: null,
        });
      } else if (fresh) {
        await deps.store.remove(item.id);
      }
      await refresh(true);
    });
    deps.onPriceSaved?.(precio);
  }

  async function sendPrice(start: PriceItem): Promise<Outcome> {
    let item = start;
    await serial(async () => {
      const current = (await deps.store.get(item.id)) as PriceItem | undefined;
      if (current) item = current;
      await write({ ...item, status: 'sending' });
    });
    const run = async (omitFecha: boolean): Promise<SavePriceResult> => {
      const input: SavePriceInput = {
        relevamiento: item.relevamiento,
        comercio: item.comercio,
        producto: item.producto,
        existingId: item.precioId,
        previous: item.precio,
        valor: item.valor,
        oferta: item.oferta,
        observacion: item.observacion,
        ...(item.confirmed ? { confirmarDesvio: true } : {}),
        ...(omitFecha ? {} : { fechaRelevamiento: item.capturedAt }),
      };
      let result = await deps.savePrice(input);
      if (result.kind === 'duplicate-recovered') {
        // Already created (a lost response, another tab): the queued value is still the surveyor's intent.
        result = await deps.savePrice({ ...input, existingId: result.precio.id, previous: result.precio });
      }
      return result;
    };
    try {
      let result: SavePriceResult;
      try {
        result = await run(item.omitFecha);
      } catch (e) {
        const dateRefused =
          e instanceof ApiError && e.status === 400 && e.errors.some((f) => f.field === 'fechaRelevamiento');
        if (!dateRefused || item.omitFecha) throw e;
        item = { ...item, omitFecha: true };
        result = await run(true);
      }
      if (result.kind === 'needs-confirmation') {
        await serial(() =>
          write({ ...item, status: 'needs-confirmation', alerta: result.alerta, error: null, confirmed: false }),
        );
        return 'continue';
      }
      await completePrice(item, result.precio);
      return 'continue';
    } catch (e) {
      return failWith(item, e);
    }
  }

  async function sendPhoto(start: PhotoItem): Promise<Outcome> {
    let item = start;
    let precioId = item.precioId;
    try {
      if (precioId === null) {
        const found = await deps.findPrecio({
          relevamiento: item.relevamiento, comercio: item.comercio, producto: item.producto,
        });
        if (!found) return 'continue'; // the precio does not exist yet: wait, this is not a failure
        precioId = found.id;
        item = { ...item, precioId };
      }
      if (item.maybeSent) {
        const [existing, digest] = await Promise.all([deps.listAdjuntos(precioId), deps.hash(item.blob)]);
        if (existing.some((a) => a.sha256 === digest)) {
          await serial(() => removeIds([item.id]));
          deps.onPhotoUploaded?.(precioId);
          return 'continue';
        }
      }
      await serial(() => write({ ...item, status: 'sending', maybeSent: true }));
      item = { ...item, maybeSent: true };
      await deps.uploadPhoto(precioId, item.blob);
      await serial(() => removeIds([item.id]));
      deps.onPhotoUploaded?.(precioId);
      return 'continue';
    } catch (e) {
      return failWith(item, e);
    }
  }

  async function pass(): Promise<void> {
    // Holding the lock means no other tab is sending: whatever says "sending" is a leftover.
    await serial(async () => {
      for (const it of await deps.store.getAll()) {
        if (it.userId === deps.userId && it.status === 'sending') await deps.store.put({ ...it, status: 'pending' });
      }
      await refresh();
    });
    const attempted = new Set<string>();
    for (;;) {
      if (snapshot.paused !== null || !deps.isOnline()) return;
      const all = mine(await deps.store.getAll()).sort(bySeq);
      const now = deps.now();
      const next = all.find((it) => !attempted.has(it.id) && isEligible(it, all, now));
      if (!next) return;
      attempted.add(next.id);
      const outcome = next.kind === 'price' ? await sendPrice(next) : await sendPhoto(next);
      if (outcome === 'stop') return;
    }
  }

  function scheduleRetry() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const now = deps.now();
    const due = snapshot.items
      .filter((i) => i.status === 'pending' && i.nextAttemptAt > now)
      .map((i) => i.nextAttemptAt);
    if (due.length === 0 || snapshot.paused !== null) return;
    timer = setTimeout(() => void flush(), Math.max(Math.min(...due) - now, 250));
  }

  function flush(): Promise<void> {
    if (flushPromise) {
      flushAgain = true;
      return flushPromise;
    }
    if (!deps.isOnline() || snapshot.paused !== null) return Promise.resolve();
    publish({ flushing: true });
    flushPromise = (async () => {
      try {
        do {
          flushAgain = false;
          const run = () => pass();
          if (deps.withLock) await deps.withLock(run);
          else await run();
        } while (flushAgain);
      } finally {
        flushPromise = null;
        publish({ flushing: false });
        scheduleRetry();
      }
    })();
    return flushPromise;
  }

  /** Manual "Reintentar": clears the wait of pending items and gives failed ones another go. */
  async function retry(): Promise<void> {
    await serial(async () => {
      for (const it of await deps.store.getAll()) {
        if (it.userId !== deps.userId) continue;
        if (it.status === 'failed' || (it.status === 'pending' && it.nextAttemptAt > 0)) {
          await deps.store.put({ ...it, status: 'pending', nextAttemptAt: 0, error: it.status === 'failed' ? null : it.error });
        }
      }
      await refresh(true);
    });
    publish({ paused: null });
    await flush();
  }

  /** A fresh sign-in lifts the pause. */
  function resume() {
    if (snapshot.paused !== null) publish({ paused: null });
  }

  function dispose() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    unsubscribeChannel?.();
    unsubscribeChannel = null;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    load,
    enqueuePrice,
    enqueuePhoto,
    confirm,
    discard,
    discardAll,
    supersedePrice,
    flush,
    retry,
    resume,
    dispose,
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
