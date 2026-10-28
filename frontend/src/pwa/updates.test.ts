import { describe, expect, it, vi } from 'vitest';
import { createUpdateController } from './updates';

type L = () => void;

function fakeWorker(state = 'installing') {
  const listeners: Record<string, L[]> = {};
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (t: string, fn: L) => void (listeners[t] ??= []).push(fn),
    emit: (t: string) => (listeners[t] ?? []).forEach((fn) => fn()),
  };
}

function fakeEnv({ controlled = true, waiting = null as ReturnType<typeof fakeWorker> | null } = {}) {
  const regListeners: Record<string, L[]> = {};
  const reg = {
    waiting,
    installing: null as ReturnType<typeof fakeWorker> | null,
    update: vi.fn(async () => undefined),
    addEventListener: (t: string, fn: L) => void (regListeners[t] ??= []).push(fn),
  };
  const cListeners: Record<string, L[]> = {};
  const container = {
    controller: controlled ? {} : null,
    register: vi.fn(async () => reg),
    addEventListener: (t: string, fn: L) => void (cListeners[t] ??= []).push(fn),
  };
  const reload = vi.fn();
  return {
    reg,
    container,
    reload,
    updatefound: () => (regListeners.updatefound ?? []).forEach((fn) => fn()),
    controllerchange: () => (cListeners.controllerchange ?? []).forEach((fn) => fn()),
  };
}

describe('update controller', () => {
  it('registers the worker at /sw.js', async () => {
    const env = fakeEnv();
    await createUpdateController({ container: env.container as never, reload: env.reload }).start();
    expect(env.container.register).toHaveBeenCalledWith('/sw.js');
  });

  it('reports an update when a new worker finishes installing under a controlled page', async () => {
    const env = fakeEnv();
    const c = createUpdateController({ container: env.container as never, reload: env.reload });
    await c.start();
    expect(c.getSnapshot()).toBe(false);
    const w = fakeWorker();
    env.reg.installing = w;
    env.updatefound();
    w.state = 'installed';
    w.emit('statechange');
    expect(c.getSnapshot()).toBe(true);
  });

  it('does not announce the very first install (no previous controller)', async () => {
    const env = fakeEnv({ controlled: false });
    const c = createUpdateController({ container: env.container as never, reload: env.reload });
    await c.start();
    const w = fakeWorker();
    env.reg.installing = w;
    env.updatefound();
    w.state = 'installed';
    w.emit('statechange');
    expect(c.getSnapshot()).toBe(false);
  });

  it('picks up a worker that was already waiting on start', async () => {
    const env = fakeEnv({ waiting: fakeWorker('installed') });
    const c = createUpdateController({ container: env.container as never, reload: env.reload });
    await c.start();
    expect(c.getSnapshot()).toBe(true);
  });

  it('apply() asks the waiting worker to take over and reloads exactly once on controllerchange', async () => {
    const waiting = fakeWorker('installed');
    const env = fakeEnv({ waiting });
    const c = createUpdateController({ container: env.container as never, reload: env.reload });
    await c.start();
    c.apply();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(env.reload).not.toHaveBeenCalled();
    env.controllerchange();
    env.controllerchange();
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on a controllerchange nobody asked for (first claim)', async () => {
    const env = fakeEnv({ controlled: false });
    await createUpdateController({ container: env.container as never, reload: env.reload }).start();
    env.controllerchange();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('checkForUpdate asks the registration to look for a newer worker and swallows failures', async () => {
    const env = fakeEnv();
    const c = createUpdateController({ container: env.container as never, reload: env.reload });
    await c.start();
    await c.checkForUpdate();
    expect(env.reg.update).toHaveBeenCalled();
    env.reg.update.mockRejectedValue(new Error('offline'));
    await expect(c.checkForUpdate()).resolves.toBeUndefined();
  });

  it('notifies subscribers', async () => {
    const waiting = fakeWorker('installed');
    const env = fakeEnv();
    const c = createUpdateController({ container: env.container as never, reload: env.reload });
    await c.start();
    const spy = vi.fn();
    c.subscribe(spy);
    env.reg.waiting = waiting;
    const w = fakeWorker();
    env.reg.installing = w;
    env.updatefound();
    w.state = 'installed';
    w.emit('statechange');
    expect(spy).toHaveBeenCalled();
  });
});
