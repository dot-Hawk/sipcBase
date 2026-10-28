import { beforeEach, describe, expect, it, vi } from 'vitest';
import swSource from './sw.js?raw';

type Handler = (event: unknown) => void;

interface Harness {
  handlers: Record<string, Handler>;
  caches: Map<string, Map<string, string>>;
  network: ReturnType<typeof vi.fn>;
  skipWaiting: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
}

function boot(urls: string[], revision = 'r1', existing: Record<string, Record<string, string>> = {}): Harness {
  const store = new Map<string, Map<string, string>>(
    Object.entries(existing).map(([k, v]) => [k, new Map(Object.entries(v))]),
  );
  const cachesApi = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name) as Map<string, string>;
      return {
        put: async (key: string, res: { body: string }) => void m.set(key, res.body),
        match: async (key: string) => (m.has(key) ? { body: m.get(key) } : undefined),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const handlers: Record<string, Handler> = {};
  const network = vi.fn(async (req: { url: string }) => ({ ok: true, body: `net:${new URL(req.url, 'https://app.test').pathname}` }));
  const skipWaiting = vi.fn();
  const claim = vi.fn(async () => undefined);
  const fakeSelf = {
    __SIPC_PRECACHE__: { revision, urls },
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
    skipWaiting,
    clients: { claim },
  };
  class FakeRequest {
    url: string;
    constructor(url: string) {
      this.url = new URL(url, 'https://app.test').href;
    }
  }
  new Function('self', 'caches', 'fetch', 'Request', swSource)(fakeSelf, cachesApi, network, FakeRequest);
  return { handlers, caches: store, network, skipWaiting, claim };
}

function lifecycle(h: Harness, type: 'install' | 'activate') {
  let p: Promise<unknown> = Promise.resolve();
  h.handlers[type]?.({ waitUntil: (x: Promise<unknown>) => (p = x) });
  return p;
}

function fetchEvent(h: Harness, url: string, init: { method?: string; mode?: string } = {}) {
  let response: Promise<unknown> | undefined;
  h.handlers.fetch?.({
    request: { url: `https://app.test${url}`, method: init.method ?? 'GET', mode: init.mode ?? 'cors' },
    respondWith: (p: Promise<unknown>) => (response = p),
  });
  return response;
}

let h: Harness;
beforeEach(() => {
  h = boot(['/index.html', '/assets/app.js']);
});

describe('service worker', () => {
  it('precaches every listed URL on install and fails the install when one fails', async () => {
    await lifecycle(h, 'install');
    expect([...(h.caches.get('sipc-shell-r1') as Map<string, string>).keys()].sort()).toEqual([
      '/assets/app.js',
      '/index.html',
    ]);

    const bad = boot(['/index.html']);
    bad.network.mockResolvedValue({ ok: false, status: 500, body: '' });
    await expect(lifecycle(bad, 'install')).rejects.toThrow(/precache/);
  });

  it('serves the cached shell for any navigation, even for unknown SPA routes', async () => {
    await lifecycle(h, 'install');
    h.network.mockClear();
    const res = (await fetchEvent(h, '/visita/abc', { mode: 'navigate' })) as { body: string };
    expect(res.body).toBe('net:/index.html'); // body stored at install time
    expect(h.network).not.toHaveBeenCalled();
  });

  it('serves precached assets cache-first and ignores unknown same-origin files', async () => {
    await lifecycle(h, 'install');
    h.network.mockClear();
    expect(await fetchEvent(h, '/assets/app.js')).toBeDefined();
    expect(h.network).not.toHaveBeenCalled();
    expect(fetchEvent(h, '/something-else.json')).toBeUndefined();
  });

  it('never intercepts /api requests, mutations or cross-origin requests', async () => {
    await lifecycle(h, 'install');
    expect(fetchEvent(h, '/api/precios')).toBeUndefined();
    expect(fetchEvent(h, '/api/auth/me', { mode: 'navigate' })).toBeUndefined();
    expect(fetchEvent(h, '/assets/app.js', { method: 'POST' })).toBeUndefined();
    let intercepted = false;
    h.handlers.fetch?.({
      request: { url: 'https://cdn.example/x.js', method: 'GET', mode: 'cors' },
      respondWith: () => (intercepted = true),
    });
    expect(intercepted).toBe(false);
  });

  it('does not take over on install, only when told (prompted update)', async () => {
    await lifecycle(h, 'install');
    expect(h.skipWaiting).not.toHaveBeenCalled();
    h.handlers.message?.({ data: { type: 'SKIP_WAITING' } });
    expect(h.skipWaiting).toHaveBeenCalledTimes(1);
    h.handlers.message?.({ data: { type: 'OTHER' } });
    expect(h.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('on activate drops other shell revisions, keeps unrelated caches and claims clients', async () => {
    const n = boot(['/index.html'], 'r2', { 'sipc-shell-r1': { '/index.html': 'old' }, other: { x: 'y' } });
    await lifecycle(n, 'install');
    await lifecycle(n, 'activate');
    expect([...n.caches.keys()].sort()).toEqual(['other', 'sipc-shell-r2']);
    expect(n.claim).toHaveBeenCalled();
  });
});
