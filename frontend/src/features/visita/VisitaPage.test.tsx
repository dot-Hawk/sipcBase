import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  listAsignaciones: vi.fn(),
  listRelevamientos: vi.fn(),
  listComercios: vi.fn(),
  listProductos: vi.fn(),
  listPrecios: vi.fn(),
  getPrecioAnterior: vi.fn(),
  createPrecio: vi.fn(),
  updatePrecio: vi.fn(),
  deletePrecio: vi.fn(),
  listAdjuntos: vi.fn(),
  uploadAdjunto: vi.fn(),
  downloadAdjunto: vi.fn(),
  deleteAdjunto: vi.fn(),
  updateAsignacionEstado: vi.fn(),
}));
vi.mock('@/shared/api/endpoints', () => ({ api: apiMock, fetchAllPrecios: (q: object) => apiMock.listPrecios(q) }));

import { createOutbox, type Outbox } from '@/features/outbox/engine';
import { OutboxContextProvider } from '@/features/outbox/OutboxProvider';
import { createMemoryStore } from '@/features/outbox/store';
import { ApiError } from '@/shared/api/errors';
import type { Precio } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Toast';
import { VisitaPage } from './VisitaPage';

const alerta = { media: 100, desvio: 5, n: 4, limiteInferior: 85, limiteSuperior: 115 };
const prod = (n: number, nombre: string) => ({
  id: `p${n}`, nombre, categoria: 'Almacén', unidad: 'KG', cantidadReferencia: 1, marca: null,
  codigoVariedad: `100${n}`, estado: 'ACTIVO', createdAt: '', updatedAt: '',
});
const precio = (producto: string, valor: number): Precio => ({
  id: `srv-${producto}`, relevamiento: 'r1', producto, comercio: 'c1', encuestador: 'u1', valor, oferta: false,
  fechaRelevamiento: '', observacion: null, alerta: null, createdAt: '', updatedAt: '',
});

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  Object.values(apiMock).forEach((m) => m.mockReset());
  apiMock.listAsignaciones.mockResolvedValue([
    { id: 'a1', relevamiento: 'r1', encuestador: 'u1', comercio: 'c1', estado: 'EN_CURSO', createdAt: '', updatedAt: '' },
  ]);
  apiMock.listRelevamientos.mockResolvedValue([
    { id: 'r1', periodo: '2026-10', frecuencia: 'MENSUAL', fechaInicio: '2026-10-01', fechaLimite: '2026-10-30', estado: 'ABIERTO', createdAt: '', updatedAt: '' },
  ]);
  apiMock.listComercios.mockResolvedValue([
    { id: 'c1', nombre: 'Almacén Don Julio', direccion: 'Belgrano 1', zona: 'Centro', tipo: 'ALMACEN', estado: 'ACTIVO', createdAt: '', updatedAt: '' },
  ]);
  apiMock.listProductos.mockResolvedValue([prod(1, 'Arroz'), prod(2, 'Azúcar')]);
  apiMock.listPrecios.mockResolvedValue([]);
  apiMock.getPrecioAnterior.mockResolvedValue(null);
  apiMock.listAdjuntos.mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

async function mount(outbox: Outbox) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OutboxContextProvider outbox={outbox}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/visita/a1']}>
            <Routes>
              <Route path="visita/:asignacionId" element={<VisitaPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </OutboxContextProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: 'Almacén Don Julio' });
}

async function makeOutbox(over: Parameters<typeof createOutbox>[0] extends infer D ? Partial<D> : never = {}) {
  const outbox = createOutbox({
    store: createMemoryStore(), userId: 'u1',
    savePrice: async () => {
      throw new ApiError({ status: 0, message: 'net' });
    },
    uploadPhoto: vi.fn(), listAdjuntos: async () => [], findPrecio: async () => null,
    hash: async () => 'h', now: () => Date.now(), isOnline: () => online,
    ...over,
  } as Parameters<typeof createOutbox>[0]);
  await outbox.load();
  return outbox;
}

const field = () => screen.getByLabelText(/precio actual/i);

describe('VisitaPage offline outbox', () => {
  it('offline: saves into the outbox, shows the value, marks the row and counts it as priced', async () => {
    online = false;
    const outbox = await makeOutbox();
    await mount(outbox);
    const u = userEvent.setup();
    await u.type(field(), '1500');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(outbox.getSnapshot().items).toHaveLength(1));
    expect(apiMock.createPrecio).not.toHaveBeenCalled();
    expect(outbox.getSnapshot().items[0]).toMatchObject({ kind: 'price', producto: 'p1', valor: 1500 });
    const row = screen.getByRole('button', { name: /Arroz/ });
    expect(within(row).getByText('Pendiente de envío')).toBeInTheDocument();
    expect(within(row).getByText(/1\.500,00/)).toBeInTheDocument();
    expect(screen.getByText(/1 de 2/)).toBeInTheDocument();
  });

  it('online: a network error mid-save queues the value instead of showing an error', async () => {
    const outbox = await makeOutbox();
    apiMock.createPrecio.mockRejectedValue(new ApiError({ status: 0, message: 'net' }));
    await mount(outbox);
    const u = userEvent.setup();
    await u.type(field(), '900');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(outbox.getSnapshot().items).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('online: a normal save still goes straight to the server and surfaces errors immediately', async () => {
    const outbox = await makeOutbox();
    apiMock.createPrecio.mockRejectedValue(new ApiError({ status: 400, message: 'bad' }));
    await mount(outbox);
    const u = userEvent.setup();
    await u.type(field(), '900');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/datos no válidos/i);
    expect(outbox.getSnapshot().items).toHaveLength(0);
  });

  it('online: the atypical 409 keeps its confirmation dialog', async () => {
    const outbox = await makeOutbox();
    apiMock.createPrecio.mockRejectedValueOnce(
      new ApiError({ status: 409, message: 'x', requiereConfirmacion: true, alerta }),
    );
    await mount(outbox);
    const u = userEvent.setup();
    await u.type(field(), '900');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('dialog', { name: /fuera de lo habitual/i })).toBeInTheDocument();
    expect(outbox.getSnapshot().items).toHaveLength(0);
  });

  it('an online save replaces the queued value of that product', async () => {
    const outbox = await makeOutbox();
    await outbox.enqueuePrice({
      asignacionId: 'a1', relevamiento: 'r1', comercio: 'c1', producto: 'p1', valor: 100, oferta: false,
      observacion: '', precio: null,
    });
    apiMock.createPrecio.mockResolvedValue(precio('p1', 777));
    await mount(outbox);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /Arroz/ }));
    await u.clear(field());
    await u.type(field(), '777');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(outbox.getSnapshot().items).toHaveLength(0));
  });

  it('finishing the visit is blocked while its work is still unsent', async () => {
    const outbox = await makeOutbox();
    await outbox.enqueuePrice({
      asignacionId: 'a1', relevamiento: 'r1', comercio: 'c1', producto: 'p1', valor: 100, oferta: false,
      observacion: '', precio: null,
    });
    await mount(outbox);
    await userEvent.click(screen.getAllByRole('button', { name: /Finalizar visita/ })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Finalizar visita' });
    expect(within(dialog).getByText(/sin enviar de esta visita/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Finalizar visita' })).toBeDisabled();
  });
});
