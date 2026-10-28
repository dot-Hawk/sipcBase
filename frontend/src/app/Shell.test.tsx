import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const controller = {
  ready: false,
  listeners: new Set<() => void>(),
  apply: vi.fn(),
};
vi.mock('@/pwa/updates', () => ({
  getUpdateController: () => ({
    subscribe: (l: () => void) => {
      controller.listeners.add(l);
      return () => controller.listeners.delete(l);
    },
    getSnapshot: () => controller.ready,
    apply: controller.apply,
  }),
}));

import { ApiError } from '@/shared/api/errors';
import { createOutbox, type Outbox } from '@/features/outbox/engine';
import { OutboxContextProvider } from '@/features/outbox/OutboxProvider';
import { createMemoryStore } from '@/features/outbox/store';
import { Shell } from './Shell';

function mount(outbox: Outbox | null = null) {
  return render(
    <OutboxContextProvider outbox={outbox}>
      <MemoryRouter>
        <Shell />
      </MemoryRouter>
    </OutboxContextProvider>,
  );
}

afterEach(() => {
  controller.ready = false;
  controller.apply.mockClear();
  vi.restoreAllMocks();
});

describe('Shell offline banner', () => {
  it('is absent online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mount();
    expect(screen.queryByText(/Sin conexión\./)).not.toBeInTheDocument();
  });

  it('says work is kept on the device and sent when the connection returns', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mount();
    const banner = screen.getByText(/Sin conexión\./).closest('[role="status"]') as HTMLElement;
    expect(banner).toHaveTextContent(/precios y fotos/i);
    expect(banner).toHaveTextContent(/se guardan en este dispositivo/i);
    expect(banner).toHaveTextContent(/se enviarán al recuperar la conexión/i);
    expect(banner).not.toHaveTextContent(/borrador/i);
  });
});

async function outboxWith(...prices: { producto: string; status?: 'rejected' | 'needs-confirmation' }[]) {
  const store = createMemoryStore();
  const savePrice = vi.fn(async (input: { producto: string }) => {
    const hit = prices.find((p) => p.producto === input.producto);
    if (hit?.status === 'rejected') throw new ApiError({ status: 400, message: 'bad' });
    if (hit?.status === 'needs-confirmation') {
      return { kind: 'needs-confirmation' as const, alerta: { media: 1, desvio: 1, n: 3, limiteInferior: 0, limiteSuperior: 2 } };
    }
    throw new ApiError({ status: 0, message: 'net' });
  });
  const outbox = createOutbox({
    store, userId: 'u1', savePrice: savePrice as never, uploadPhoto: vi.fn(), listAdjuntos: vi.fn(),
    findPrecio: vi.fn(), hash: async () => 'h', now: () => 1, isOnline: () => true,
  });
  await outbox.load();
  for (const p of prices) {
    await outbox.enqueuePrice({
      asignacionId: 'a1', relevamiento: 'r', comercio: 'c', producto: p.producto, valor: 1, oferta: false,
      observacion: '', precio: null,
    });
  }
  return { outbox, savePrice };
}

describe('Shell outbox chip', () => {
  it('is absent when nothing is queued', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mount();
    expect(screen.queryByText(/sin enviar/i)).not.toBeInTheDocument();
  });

  it('counts what is waiting and offers Reintentar when online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { outbox, savePrice } = await outboxWith({ producto: 'p1' }, { producto: 'p2' });
    mount(outbox);
    expect(screen.getByText('2 cambios sin enviar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(savePrice).toHaveBeenCalled();
  });

  it('says how many need the surveyor and uses the attention tone', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { outbox } = await outboxWith({ producto: 'p1', status: 'needs-confirmation' }, { producto: 'p2', status: 'rejected' });
    await outbox.flush();
    mount(outbox);
    const chip = screen.getByText(/2 requieren su atención/i);
    expect(chip.closest('.chip')).toHaveClass('chip--attn');
  });

  it('offline: no retry button, the banner already explains', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { outbox } = await outboxWith({ producto: 'p1' });
    mount(outbox);
    expect(screen.getByText('1 cambio sin enviar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});

describe('Shell update prompt', () => {
  it('offers the update only when a new version is waiting and applies it on request', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mount();
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument();
    controller.ready = true;
    act(() => controller.listeners.forEach((l) => l()));
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(controller.apply).toHaveBeenCalled();
  });
});
