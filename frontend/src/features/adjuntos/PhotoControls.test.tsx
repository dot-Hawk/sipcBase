import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { createOutbox, type Outbox } from '@/features/outbox/engine';
import { OutboxContextProvider } from '@/features/outbox/OutboxProvider';
import { createMemoryStore } from '@/features/outbox/store';

const uploadMock = vi.fn();
const prepareMock = vi.fn();
vi.mock('@/shared/api/endpoints', () => ({
  api: {
    listAdjuntos: vi.fn(async () => []),
    uploadAdjunto: (id: string, blob: Blob) => uploadMock(id, blob),
    downloadAdjunto: vi.fn(),
    deleteAdjunto: vi.fn(),
  },
}));
vi.mock('./downscale', () => ({ prepareImage: (f: Blob) => prepareMock(f) }));

import { PhotoControls } from './PhotoControls';

const target = { asignacionId: 'a1', relevamiento: 'r1', comercio: 'c1', producto: 'p1' };
const file = (name: string) => new File([name], `${name}.jpg`, { type: 'image/jpeg' });

async function makeOutbox(online = true): Promise<Outbox> {
  const outbox = createOutbox({
    store: createMemoryStore(), userId: 'u1',
    savePrice: vi.fn(), uploadPhoto: (id, b) => uploadMock(id, b), listAdjuntos: async () => [],
    findPrecio: async () => null, hash: async () => 'h', now: () => Date.now(), isOnline: () => online,
  });
  await outbox.load();
  return outbox;
}

function ui(outbox: Outbox, props: { precioId: string | null; offline: boolean; readOnly?: boolean }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <OutboxContextProvider outbox={outbox}>
        <PhotoControls
          precioId={props.precioId}
          productoNombre="Aceite"
          readOnly={props.readOnly ?? false}
          offline={props.offline}
          target={target}
        />
      </OutboxContextProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  uploadMock.mockReset();
  prepareMock.mockReset();
  prepareMock.mockImplementation(async (f: Blob) => f);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('PhotoControls with the outbox', () => {
  it('offline: the photo is kept in the persistent outbox and the hint says it will be sent on reconnect', async () => {
    const outbox = await makeOutbox(false);
    render(ui(outbox, { precioId: 'pr1', offline: true }));
    await userEvent.upload(screen.getByLabelText('Foto de Aceite'), file('A'));
    expect(await screen.findByAltText('Foto pendiente 1')).toBeInTheDocument();
    expect(screen.getByText(/se enviará al recuperar la conexión/i)).toBeInTheDocument();
    expect(outbox.getSnapshot().items).toMatchObject([{ kind: 'photo', producto: 'p1', precioId: 'pr1' }]);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('online with a saved precio: uploads directly and queues nothing', async () => {
    const outbox = await makeOutbox();
    uploadMock.mockResolvedValue({});
    render(ui(outbox, { precioId: 'pr1', offline: false }));
    await userEvent.upload(screen.getByLabelText('Foto de Aceite'), file('A'));
    await waitFor(() => expect(uploadMock).toHaveBeenCalledWith('pr1', expect.any(Blob)));
    expect(outbox.getSnapshot().items).toHaveLength(0);
  });

  it('a network error mid-upload queues the photo instead of losing it', async () => {
    const outbox = await makeOutbox();
    uploadMock.mockRejectedValue(new ApiError({ status: 0, message: 'Network error' }));
    render(ui(outbox, { precioId: 'pr1', offline: false }));
    await userEvent.upload(screen.getByLabelText('Foto de Aceite'), file('A'));
    expect(await screen.findByAltText('Foto pendiente 1')).toBeInTheDocument();
    expect(outbox.getSnapshot().items).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a server rejection is shown and the photo is not queued', async () => {
    const outbox = await makeOutbox();
    uploadMock.mockRejectedValue(new ApiError({ status: 415, message: 'bad' }));
    render(ui(outbox, { precioId: 'pr1', offline: false }));
    await userEvent.upload(screen.getByLabelText('Foto de Aceite'), file('A'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/formato de la foto/i);
    expect(outbox.getSnapshot().items).toHaveLength(0);
  });

  it('before the precio exists the photo waits in the outbox and says so', async () => {
    const outbox = await makeOutbox();
    render(ui(outbox, { precioId: null, offline: false }));
    await userEvent.upload(screen.getByLabelText('Foto de Aceite'), file('A'));
    expect(await screen.findByAltText('Foto pendiente 1')).toBeInTheDocument();
    expect(screen.getByText(/cuando se guarde el precio/i)).toBeInTheDocument();
    expect(outbox.getSnapshot().items).toMatchObject([{ precioId: null }]);
  });

  it('counts queued photos against the limit of five', async () => {
    const outbox = await makeOutbox(false);
    for (let i = 0; i < 5; i += 1) {
      await outbox.enqueuePhoto({ ...target, blob: new Blob([`${i}`]), precioId: 'pr1' });
    }
    render(ui(outbox, { precioId: 'pr1', offline: true }));
    expect(screen.getByText('5 de 5 fotos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adjuntar foto/i })).toBeDisabled();
  });

  it('shows a queued photo the server refused and lets the surveyor discard it', async () => {
    uploadMock.mockRejectedValue(new ApiError({ status: 415, message: 'bad' }));
    const outbox = await makeOutbox();
    await outbox.enqueuePhoto({ ...target, blob: new Blob(['x']), precioId: 'pr1' });
    await outbox.flush();
    render(ui(outbox, { precioId: 'pr1', offline: false }));
    expect(screen.getByText(/no se pudo enviar esta foto/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar foto' }));
    await waitFor(() => expect(outbox.getSnapshot().items).toHaveLength(0));
  });
});
