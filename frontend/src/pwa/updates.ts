/**
 * Registration + "new version available" state for the service worker.
 *
 * Update policy: prompt, never swap silently. A new worker installs in the background and
 * waits; the shell shows "Actualizar", which posts SKIP_WAITING and reloads once the new worker
 * controls the page. Drafts are persisted on every keystroke, so the reload loses nothing.
 */
export interface UpdateController {
  start: () => Promise<void>;
  apply: () => void;
  checkForUpdate: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
}

interface Deps {
  container: ServiceWorkerContainer;
  reload: () => void;
}

export function createUpdateController({ container, reload }: Deps): UpdateController {
  let registration: ServiceWorkerRegistration | null = null;
  let ready = false;
  let applying = false;
  const listeners = new Set<() => void>();

  const setReady = (next: boolean) => {
    if (ready === next) return;
    ready = next;
    listeners.forEach((l) => l());
  };

  function watch(worker: ServiceWorker) {
    worker.addEventListener('statechange', () => {
      // Without a controller this is the first install: nothing is stale yet.
      if (worker.state === 'installed' && container.controller) setReady(true);
    });
  }

  return {
    async start() {
      container.addEventListener('controllerchange', () => {
        if (applying) reload();
        applying = false; // reload exactly once
      });
      registration = await container.register('/sw.js');
      if (registration.waiting && container.controller) setReady(true);
      registration.addEventListener('updatefound', () => {
        if (registration?.installing) watch(registration.installing);
      });
    },
    apply() {
      const waiting = registration?.waiting;
      if (!waiting) return;
      applying = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    async checkForUpdate() {
      try {
        await registration?.update();
      } catch {
        /* offline or server down: try again on the next wake-up */
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => ready,
  };
}

let singleton: UpdateController | null = null;
const idle: UpdateController = {
  start: async () => undefined,
  apply: () => undefined,
  checkForUpdate: async () => undefined,
  subscribe: () => () => undefined,
  getSnapshot: () => false,
};

/** The app-wide controller; an inert one when service workers are unavailable or in development. */
export function getUpdateController(): UpdateController {
  return singleton ?? idle;
}

/** Called once from main.tsx, production builds only. */
export function registerServiceWorker(): void {
  if (singleton || !('serviceWorker' in navigator)) return;
  singleton = createUpdateController({
    container: navigator.serviceWorker,
    reload: () => window.location.reload(),
  });
  const controller = singleton;
  const start = () => {
    void controller.start().then(() => {
      const wake = () => void controller.checkForUpdate();
      window.addEventListener('online', wake);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') wake();
      });
    });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
