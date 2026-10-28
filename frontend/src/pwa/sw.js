/*
 * SIPC service worker (plain JS, no dependencies).
 *
 * Built by scripts/swPlugin.ts, which prepends `self.__SIPC_PRECACHE__ = { revision, urls }`.
 *
 * Strategy
 * - install: precache the app shell, lazy route chunks, fonts and icons (all-or-nothing).
 * - fetch:   navigations get the cached /index.html (SPA); precached assets are cache-first.
 *            Everything else, and ALWAYS `/api/*` and any non-GET, goes straight to the network:
 *            the worker never stores API responses, tokens or uploads.
 * - update:  a new worker waits; the page asks the user, then posts SKIP_WAITING. No automatic
 *            takeover, so a surveyor typing a price is never swapped under their feet.
 * - activate: claim clients and delete shell caches of other revisions.
 */
const { revision, urls } = self.__SIPC_PRECACHE__;
const PREFIX = 'sipc-shell-';
const CACHE = PREFIX + revision;
const SHELL = '/index.html';
const PRECACHED = new Set(urls);

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
      await cache.put(url, response);
    }),
  );
}

async function cleanup() {
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
  await self.clients.claim();
}

async function fromCache(key, request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(key)) || fetch(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanup());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fromCache(SHELL, request));
    return;
  }
  if (PRECACHED.has(url.pathname)) {
    event.respondWith(fromCache(url.pathname, request));
  }
});
