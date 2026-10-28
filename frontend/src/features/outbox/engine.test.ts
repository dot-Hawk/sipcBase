import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import type { Alerta, Precio } from '@/shared/api/types';
import { createOutbox, type OutboxDeps } from './engine';
import { createMemoryStore, type OutboxStore } from './store';
import { countItems, priceItemId, type PhotoItem, type PriceItem } from './types';

const alerta: Alerta = { media: 100, desvio: 5, n: 4, limiteInferior: 85, limiteSuperior: 115 };
const precio = (producto: string, valor: number, over: Partial<Precio> = {}): Precio => ({
  id: `pr-${producto}`, relevamiento: 'r1', producto, comercio: 'c1', encuestador: 'u1', valor, oferta: false,
  fechaRelevamiento: '2026-10-10T10:00:00.000Z', observacion: null, alerta: null, createdAt: '', updatedAt: '', ...over,
});
const api = (status: number, message = 'x', extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ status, message, ...extra });

const price = (producto: string, valor: number, over: Record<string, unknown> = {}) => ({
  asignacionId: 'a1', relevamiento: 'r1', comercio: 'c1', producto, valor, oferta: false, observacion: '',
  precio: null as Precio | null, ...over,
});
const photo = (producto: string, text = producto, over: Record<string, unknown> = {}) => ({
  asignacionId: 'a1', relevamiento: 'r1', comercio: 'c1', producto, blob: new Blob([text]), precioId: null as string | null,
  ...over,
});

interface Ctx {
  store: OutboxStore;
  deps: OutboxDeps;
  clock: { t: number };
  online: { v: boolean };
  savePrice: ReturnType<typeof vi.fn>;
  uploadPhoto: ReturnType<typeof vi.fn>;
  listAdjuntos: ReturnType<typeof vi.fn>;
  findPrecio: ReturnType<typeof vi.fn>;
}

function make(over: Partial<OutboxDeps> = {}, store: OutboxStore = createMemoryStore()): Ctx & { outbox: ReturnType<typeof createOutbox> } {
  const clock = { t: 1_700_000_000_000 };
  const online = { v: true };
  const savePrice = vi.fn(async (input: { producto: string; valor: number }) => ({
    kind: 'saved' as const, precio: precio(input.producto, input.valor),
  }));
  const uploadPhoto = vi.fn(async () => ({}));
  const listAdjuntos = vi.fn(async () => [] as { sha256: string }[]);
  const findPrecio = vi.fn(async () => null as Precio | null);
  const deps: OutboxDeps = {
    store,
    userId: 'u1',
    savePrice: savePrice as unknown as OutboxDeps['savePrice'],
    uploadPhoto: uploadPhoto as unknown as OutboxDeps['uploadPhoto'],
    listAdjuntos: listAdjuntos as unknown as OutboxDeps['listAdjuntos'],
    findPrecio: findPrecio as unknown as OutboxDeps['findPrecio'],
    hash: async (b) => `h:${b.size}`,
    now: () => clock.t,
    isOnline: () => online.v,
    ...over,
  };
  return { store, deps, clock, online, savePrice, uploadPhoto, listAdjuntos, findPrecio, outbox: createOutbox(deps) };
}

const items = (o: ReturnType<typeof createOutbox>) => o.getSnapshot().items;
const priceOf = (o: ReturnType<typeof createOutbox>, producto: string) =>
  items(o).find((i) => i.id === priceItemId('a1', producto)) as PriceItem | undefined;

describe('outbox: enqueue, coalescing, persistence', () => {
  let c: ReturnType<typeof make>;
  beforeEach(() => {
    c = make();
  });

  it('persists a queued price in the store (survives a reload) and exposes it', async () => {
    await c.outbox.load();
    await c.outbox.enqueuePrice(price('p1', 100));
    expect((await c.store.getAll()).map((i) => i.id)).toEqual([priceItemId('a1', 'p1')]);
    expect(priceOf(c.outbox, 'p1')).toMatchObject({ valor: 100, status: 'pending', userId: 'u1', precioId: null });

    const reloaded = createOutbox({ ...c.deps });
    await reloaded.load();
    expect(items(reloaded)).toHaveLength(1);
  });

  it('coalesces offline edits of the same product into the latest value and keeps the first position', async () => {
    await c.outbox.load();
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.enqueuePrice(price('p2', 50));
    const firstSeq = priceOf(c.outbox, 'p1')!.seq;
    await c.outbox.enqueuePrice(price('p1', 120, { observacion: 'oferta de góndola' }));

    expect(items(c.outbox)).toHaveLength(2);
    const p1 = priceOf(c.outbox, 'p1')!;
    expect(p1).toMatchObject({ valor: 120, observacion: 'oferta de góndola', rev: 2, seq: firstSeq });
  });

  it('keeps the server snapshot of the first edit as the PATCH baseline', async () => {
    const server = precio('p1', 90);
    await c.outbox.load();
    await c.outbox.enqueuePrice(price('p1', 100, { precio: server }));
    await c.outbox.enqueuePrice(price('p1', 110, { precio: server }));
    expect(priceOf(c.outbox, 'p1')).toMatchObject({ precioId: server.id, precio: server, valor: 110 });
  });

  it('an edit resets a previous confirmation and a rejected state', async () => {
    await c.outbox.load();
    c.savePrice.mockRejectedValueOnce(api(400, 'bad'));
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.flush();
    expect(priceOf(c.outbox, 'p1')!.status).toBe('rejected');
    await c.outbox.enqueuePrice(price('p1', 101));
    expect(priceOf(c.outbox, 'p1')).toMatchObject({ status: 'pending', error: null, confirmed: false, attempts: 0 });
  });

  it('counts items by what the surveyor must look at', async () => {
    await c.outbox.load();
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.enqueuePhoto(photo('p1'));
    c.savePrice.mockRejectedValueOnce(api(400));
    await c.outbox.enqueuePrice(price('p2', 5));
    await c.outbox.flush();
    expect(countItems(items(c.outbox))).toMatchObject({ prices: 1, photos: 1, attention: 1 });
  });
});

describe('outbox: flush', () => {
  it('sends in enqueue order, one at a time, and empties the queue on 200', async () => {
    const c = make();
    await c.outbox.load();
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    c.savePrice.mockImplementation(async (input: { producto: string; valor: number }) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      order.push(input.producto);
      await Promise.resolve();
      running -= 1;
      return { kind: 'saved', precio: precio(input.producto, input.valor) };
    });
    await c.outbox.enqueuePrice(price('p2', 20));
    await c.outbox.enqueuePrice(price('p1', 10));
    await c.outbox.enqueuePrice(price('p3', 30));
    await c.outbox.flush();
    expect(order).toEqual(['p2', 'p1', 'p3']);
    expect(maxRunning).toBe(1);
    expect(items(c.outbox)).toHaveLength(0);
    expect(await c.store.getAll()).toHaveLength(0);
  });

  it('does nothing while offline and sends everything when asked online', async () => {
    const c = make();
    await c.outbox.load();
    c.online.v = false;
    await c.outbox.enqueuePrice(price('p1', 10));
    await c.outbox.flush();
    expect(c.savePrice).not.toHaveBeenCalled();
    c.online.v = true;
    await c.outbox.flush();
    expect(c.savePrice).toHaveBeenCalledTimes(1);
  });

  it('never double-sends: concurrent flushes share one pass', async () => {
    const c = make();
    await c.outbox.load();
    let release!: () => void;
    c.savePrice.mockImplementation(
      (input: { producto: string; valor: number }) =>
        new Promise((resolve) => {
          release = () => resolve({ kind: 'saved', precio: precio(input.producto, input.valor) });
        }),
    );
    await c.outbox.enqueuePrice(price('p1', 10));
    const a = c.outbox.flush();
    const b = c.outbox.flush();
    await vi.waitFor(() => expect(c.savePrice).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([a, b]);
    expect(c.savePrice).toHaveBeenCalledTimes(1);
    expect(items(c.outbox)).toHaveLength(0);
  });

  it('sends the capture date on create and passes the confirmed flag and server baseline', async () => {
    const c = make();
    await c.outbox.load();
    const server = precio('p1', 90);
    await c.outbox.enqueuePrice(price('p1', 100, { precio: server, confirmed: true }));
    await c.outbox.enqueuePrice(price('p2', 5));
    await c.outbox.flush();
    expect(c.savePrice.mock.calls[0]![0]).toMatchObject({
      existingId: server.id, previous: server, confirmarDesvio: true, valor: 100,
    });
    expect(c.savePrice.mock.calls[1]![0]).toMatchObject({ existingId: null, previous: null });
    expect(c.savePrice.mock.calls[1]![0].fechaRelevamiento).toEqual(expect.stringMatching(/^2023-|^20/));
  });

  it('photos wait for their price, then use the created precio id', async () => {
    const c = make();
    await c.outbox.load();
    await c.outbox.enqueuePhoto(photo('p1', 'foto'));
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.flush();
    expect(c.savePrice).toHaveBeenCalledTimes(1);
    expect(c.uploadPhoto).toHaveBeenCalledWith('pr-p1', expect.any(Blob));
    expect(c.savePrice.mock.invocationCallOrder[0]!).toBeLessThan(c.uploadPhoto.mock.invocationCallOrder[0]!);
    expect(items(c.outbox)).toHaveLength(0);
  });

  it('a photo with no queued price resolves the precio from the server, or waits without failing', async () => {
    const c = make();
    await c.outbox.load();
    await c.outbox.enqueuePhoto(photo('p1'));
    await c.outbox.flush();
    expect(c.uploadPhoto).not.toHaveBeenCalled();
    expect(items(c.outbox)[0]).toMatchObject({ status: 'pending', attempts: 0, error: null });

    c.findPrecio.mockResolvedValue(precio('p1', 10));
    await c.outbox.flush();
    expect(c.uploadPhoto).toHaveBeenCalledWith('pr-p1', expect.any(Blob));
    expect(items(c.outbox)).toHaveLength(0);
  });

  it('a rejected price blocks the photos of that product only', async () => {
    const c = make();
    await c.outbox.load();
    c.savePrice.mockRejectedValueOnce(api(400, 'valor must be > 0', { errors: [{ field: 'valor', message: 'bad' }] }));
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.enqueuePhoto(photo('p1'));
    await c.outbox.enqueuePrice(price('p2', 20));
    await c.outbox.enqueuePhoto(photo('p2'));
    await c.outbox.flush();
    expect(c.uploadPhoto).toHaveBeenCalledTimes(1);
    const left = items(c.outbox).map((i) => `${i.kind}:${i.producto}:${i.status}`);
    expect(left).toEqual(['price:p1:rejected', 'photo:p1:pending']);
  });
});

describe('outbox: server answers', () => {
  it('409 atypical: keeps the value, marks it for confirmation and never auto-confirms', async () => {
    const c = make();
    await c.outbox.load();
    c.savePrice.mockResolvedValueOnce({ kind: 'needs-confirmation', alerta });
    await c.outbox.enqueuePrice(price('p1', 300));
    await c.outbox.flush();
    expect(priceOf(c.outbox, 'p1')).toMatchObject({ status: 'needs-confirmation', valor: 300, alerta, confirmed: false });

    c.savePrice.mockClear();
    await c.outbox.flush();
    expect(c.savePrice).not.toHaveBeenCalled();

    await c.outbox.confirm(priceItemId('a1', 'p1'));
    expect(priceOf(c.outbox, 'p1')).toMatchObject({ status: 'pending', confirmed: true });
    await c.outbox.flush();
    expect(c.savePrice.mock.calls[0]![0]).toMatchObject({ confirmarDesvio: true, valor: 300 });
    expect(items(c.outbox)).toHaveLength(0);
  });

  it('400: rejected with the server message and field errors, kept, not retried', async () => {
    const c = make();
    await c.outbox.load();
    c.savePrice.mockRejectedValueOnce(api(400, 'valor must be a number', { errors: [{ field: 'valor', message: 'must be > 0' }] }));
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.flush();
    expect(priceOf(c.outbox, 'p1')).toMatchObject({
      status: 'rejected', valor: 100,
      error: { status: 400, message: 'valor must be a number', fields: [{ field: 'valor', message: 'must be > 0' }] },
    });
    c.savePrice.mockClear();
    await c.outbox.flush();
    await c.outbox.retry();
    expect(c.savePrice).not.toHaveBeenCalled();
    expect(priceOf(c.outbox, 'p1')!.status).toBe('rejected');
  });

  it('401: pauses the queue, keeps every item untouched and reports the ended session', async () => {
    const onSessionEnded = vi.fn();
    const c = make({ onSessionEnded });
    await c.outbox.load();
    c.savePrice.mockRejectedValueOnce(api(401, 'Invalid or expired token'));
    await c.outbox.enqueuePrice(price('p1', 10));
    await c.outbox.enqueuePrice(price('p2', 20));
    await c.outbox.flush();
    expect(c.savePrice).toHaveBeenCalledTimes(1);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(c.outbox.getSnapshot().paused).toBe('session');
    expect(items(c.outbox).map((i) => i.status)).toEqual(['pending', 'pending']);
    expect(priceOf(c.outbox, 'p1')!.attempts).toBe(0);
    await c.outbox.flush();
    expect(c.savePrice).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404, 409])('%i: failed with the reason, kept, retried only by hand', async (status) => {
    const c = make();
    await c.outbox.load();
    c.savePrice.mockRejectedValueOnce(api(status, 'nope'));
    await c.outbox.enqueuePrice(price('p1', 10));
    await c.outbox.flush();
    expect(priceOf(c.outbox, 'p1')).toMatchObject({ status: 'failed', error: { status } });
    c.savePrice.mockClear();
    await c.outbox.flush();
    expect(c.savePrice).not.toHaveBeenCalled();
    await c.outbox.retry();
    expect(c.savePrice).toHaveBeenCalledTimes(1);
    expect(items(c.outbox)).toHaveLength(0);
  });

  it('5xx: stays pending with exponential backoff and is retried later', async () => {
    const c = make();
    await c.outbox.load();
    c.savePrice.mockRejectedValue(api(503, 'down'));
    await c.outbox.enqueuePrice(price('p1', 10));
    await c.outbox.flush();
    const first = priceOf(c.outbox, 'p1')!;
    expect(first).toMatchObject({ status: 'pending', attempts: 1, error: { status: 503 } });
    expect(first.nextAttemptAt).toBeGreaterThan(c.clock.t);

    c.savePrice.mockClear();
    await c.outbox.flush(); // too early
    expect(c.savePrice).not.toHaveBeenCalled();

    c.clock.t = first.nextAttemptAt;
    await c.outbox.flush();
    expect(c.savePrice).toHaveBeenCalledTimes(1);
    const second = priceOf(c.outbox, 'p1')!;
    expect(second.attempts).toBe(2);
    expect(second.nextAttemptAt - c.clock.t).toBeGreaterThan(first.nextAttemptAt - (first.nextAttemptAt - 1) - 1);
  });

  it('network error: stops the pass, keeps every item pending', async () => {
    const c = make();
    await c.outbox.load();
    c.savePrice.mockRejectedValue(api(0, 'Network error'));
    await c.outbox.enqueuePrice(price('p1', 10));
    await c.outbox.enqueuePrice(price('p2', 20));
    await c.outbox.flush();
    expect(c.savePrice).toHaveBeenCalledTimes(1);
    expect(items(c.outbox).map((i) => i.status)).toEqual(['pending', 'pending']);
  });

  it('retry() skips the backoff of pending items', async () => {
    const c = make();
    await c.outbox.load();
    c.savePrice.mockRejectedValueOnce(api(500));
    await c.outbox.enqueuePrice(price('p1', 10));
    await c.outbox.flush();
    await c.outbox.retry();
    expect(items(c.outbox)).toHaveLength(0);
  });

  it('retries once without the capture date when the server says it is in the future', async () => {
    const c = make();
    await c.outbox.load();
    c.savePrice.mockRejectedValueOnce(api(400, 'x', { errors: [{ field: 'fechaRelevamiento', message: 'future' }] }));
    await c.outbox.enqueuePrice(price('p1', 10));
    await c.outbox.flush();
    expect(c.savePrice).toHaveBeenCalledTimes(2);
    expect(c.savePrice.mock.calls[1]![0].fechaRelevamiento).toBeUndefined();
    expect(items(c.outbox)).toHaveLength(0);
  });

  it('photo: 413/415 are rejected, 409 failed, network retried', async () => {
    const c = make();
    await c.outbox.load();
    c.findPrecio.mockResolvedValue(precio('p1', 1));
    c.uploadPhoto.mockRejectedValueOnce(api(415)).mockRejectedValueOnce(api(409)).mockRejectedValueOnce(api(0));
    await c.outbox.enqueuePhoto(photo('p1', 'a'));
    await c.outbox.enqueuePhoto(photo('p1', 'bb'));
    await c.outbox.enqueuePhoto(photo('p1', 'ccc'));
    await c.outbox.flush();
    const statuses = (items(c.outbox) as PhotoItem[]).map((i) => i.status);
    expect(statuses).toEqual(['rejected', 'failed', 'pending']);
  });
});

describe('outbox: replay safety', () => {
  it('after a reload mid-flush the stale "sending" price is resent; a duplicate 409 becomes a PATCH of the queued value', async () => {
    const store = createMemoryStore();
    const first = make({}, store);
    await first.outbox.load();
    first.savePrice.mockImplementation(() => new Promise(() => undefined)); // the page dies here
    await first.outbox.enqueuePrice(price('p1', 100));
    void first.outbox.flush();
    await vi.waitFor(async () => expect((await store.getAll())[0]!.status).toBe('sending'));

    const second = make({}, store);
    await second.outbox.load();
    expect(items(second.outbox)[0]!.status).toBe('sending');
    second.savePrice.mockResolvedValueOnce({ kind: 'saved', precio: precio('p1', 100) });
    await second.outbox.flush();
    expect(second.savePrice).toHaveBeenCalledTimes(1);
    expect(items(second.outbox)).toHaveLength(0);
  });

  it('duplicate-recovered replays as an update so the queued value wins', async () => {
    const c = make();
    await c.outbox.load();
    const existing = precio('p1', 80);
    c.savePrice
      .mockResolvedValueOnce({ kind: 'duplicate-recovered', precio: existing })
      .mockResolvedValueOnce({ kind: 'saved', precio: precio('p1', 100) });
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.flush();
    expect(c.savePrice.mock.calls[1]![0]).toMatchObject({ existingId: existing.id, previous: existing, valor: 100 });
    expect(items(c.outbox)).toHaveLength(0);
  });

  it('a photo that may already be on the server (same sha256) is not uploaded twice', async () => {
    const store = createMemoryStore();
    const first = make({}, store);
    await first.outbox.load();
    first.uploadPhoto.mockImplementation(() => new Promise(() => undefined));
    await first.outbox.enqueuePhoto(photo('p1', 'abcd', { precioId: 'pr-p1' }));
    void first.outbox.flush();
    await vi.waitFor(async () => expect(((await store.getAll())[0] as PhotoItem).maybeSent).toBe(true));

    const second = make({}, store);
    second.listAdjuntos.mockResolvedValue([{ sha256: 'h:4' }]);
    await second.outbox.load();
    await second.outbox.flush();
    expect(second.uploadPhoto).not.toHaveBeenCalled();
    expect(items(second.outbox)).toHaveLength(0);
  });

  it('an edit made while the price is in flight is not lost: the item stays with the new value on top of the result', async () => {
    const c = make();
    await c.outbox.load();
    let release!: (v: unknown) => void;
    c.savePrice.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await c.outbox.enqueuePrice(price('p1', 100));
    const flushing = c.outbox.flush();
    await vi.waitFor(() => expect(c.savePrice).toHaveBeenCalledTimes(1));
    await c.outbox.enqueuePrice(price('p1', 140));
    release({ kind: 'saved', precio: precio('p1', 100) });
    await flushing;
    expect(priceOf(c.outbox, 'p1')).toMatchObject({ valor: 140, status: 'pending', precioId: 'pr-p1', rev: 2 });
    c.savePrice.mockClear();
    await c.outbox.flush();
    expect(c.savePrice.mock.calls[0]![0]).toMatchObject({ existingId: 'pr-p1', valor: 140 });
    expect(items(c.outbox)).toHaveLength(0);
  });
});

describe('outbox: discard and wipe', () => {
  it('discarding a price that was never created also drops its photos', async () => {
    const c = make();
    await c.outbox.load();
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.enqueuePhoto(photo('p1'));
    await c.outbox.enqueuePrice(price('p2', 5));
    await c.outbox.discard(priceItemId('a1', 'p1'));
    expect(items(c.outbox).map((i) => i.producto)).toEqual(['p2']);
  });

  it('discardAll empties the store', async () => {
    const c = make();
    await c.outbox.load();
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.discardAll();
    expect(await c.store.getAll()).toEqual([]);
    expect(items(c.outbox)).toEqual([]);
  });

  it("load() wipes items that belong to another user", async () => {
    const store = createMemoryStore();
    const other = make({ userId: 'u-other' }, store);
    await other.outbox.load();
    await other.outbox.enqueuePrice(price('p1', 100));
    const mine = make({}, store);
    await mine.outbox.load();
    expect(items(mine.outbox)).toEqual([]);
    expect(await store.getAll()).toEqual([]);
  });

  it('an online save supersedes the queued price of that product', async () => {
    const c = make();
    await c.outbox.load();
    await c.outbox.enqueuePrice(price('p1', 100));
    await c.outbox.enqueuePhoto(photo('p1'));
    await c.outbox.supersedePrice('a1', 'p1', 'pr-p1');
    expect(items(c.outbox).map((i) => i.kind)).toEqual(['photo']);
    expect((items(c.outbox)[0] as PhotoItem).precioId).toBe('pr-p1');
  });
});

describe('outbox: notifications', () => {
  it('notifies subscribers and other tabs on every change', async () => {
    const posted = vi.fn();
    const c = make({ channel: { post: posted, onMessage: () => () => undefined } });
    await c.outbox.load();
    const listener = vi.fn();
    c.outbox.subscribe(listener);
    await c.outbox.enqueuePrice(price('p1', 1));
    expect(listener).toHaveBeenCalled();
    expect(posted).toHaveBeenCalled();
  });

  it('reloads when another tab changes the store', async () => {
    let onMessage: () => void = () => undefined;
    const c = make({ channel: { post: () => undefined, onMessage: (cb) => ((onMessage = cb), () => undefined) } });
    await c.outbox.load();
    await c.store.put({
      ...(await (async () => {
        const other = make({}, createMemoryStore());
        await other.outbox.load();
        return other.outbox.enqueuePrice(price('p9', 9));
      })()),
    });
    onMessage();
    await vi.waitFor(() => expect(items(c.outbox)).toHaveLength(1));
  });
});
