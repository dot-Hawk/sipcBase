import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { ItemStatus } from '@/features/outbox/types';
import type { Precio, Producto } from '@/shared/api/types';
import type { SavePriceResult } from './savePrice';
import { VisitaWorkspace, type WorkspaceProps } from './VisitaWorkspace';

const mk = (n: number, nombre: string, categoria = 'Almacén'): Producto => ({
  id: `p${n}`, nombre, categoria, unidad: 'KG', cantidadReferencia: 1, marca: null, codigoVariedad: `100${n}`,
  estado: 'ACTIVO', createdAt: '', updatedAt: '',
});
const productos = [mk(1, 'Arroz'), mk(2, 'Azúcar'), mk(3, 'Harina'), mk(4, 'Leche', 'Lácteos')];
const precio = (producto: string, valor: number, over: Partial<Precio> = {}): Precio => ({
  id: `pr-${producto}`, relevamiento: 'r', producto, comercio: 'c', encuestador: 'e', valor, oferta: false,
  fechaRelevamiento: '', observacion: null, alerta: null, createdAt: '', updatedAt: '', ...over,
});
const alerta = { media: 100, desvio: 5, n: 3, limiteInferior: 90, limiteSuperior: 110 };

function Harness(props: Partial<WorkspaceProps> & { initial?: Precio[]; onSave?: WorkspaceProps['onSave'] }) {
  const [saved, setSaved] = useState(() => new Map((props.initial ?? []).map((p) => [p.producto, p])));
  const onSave: WorkspaceProps['onSave'] =
    props.onSave ??
    (async (id, input) => {
      const p = precio(id, input.valor);
      setSaved((m) => new Map(m).set(id, p));
      return { kind: 'saved', precio: p } satisfies SavePriceResult;
    });
  return (
    <VisitaWorkspace
      visitaId="a1"
      productos={productos}
      saved={saved}
      previousFor={() => null}
      seriesFor={() => []}
      editable
      blockReason={null}
      offline={false}
      wide
      initialDrafts={{}}
      onDraftChange={() => undefined}
      onDelete={async () => undefined}
      photoSlotFor={() => null}
      onStartVisit={() => undefined}
      onFinishVisit={() => undefined}
      {...props}
      onSave={onSave}
    />
  );
}

const field = () => screen.getByLabelText(/precio actual/i);

describe('VisitaWorkspace', () => {
  it('opens the first pending producto in the editor', () => {
    render(<Harness initial={[precio('p1', 100)]} />);
    expect(screen.getByRole('heading', { name: 'Azúcar', level: 2 })).toBeInTheDocument();
  });

  it('Guardar y siguiente saves, selects the next pending producto and focuses its price field', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[precio('p2', 50)]} />);
    // Arroz is the first pending producto.
    expect(screen.getByRole('heading', { name: 'Arroz', level: 2 })).toBeInTheDocument();
    await user.type(field(), '100');
    await user.click(screen.getByRole('button', { name: 'Guardar y siguiente' }));
    // Azúcar already has a price, so the next pending one is Harina.
    expect(await screen.findByRole('heading', { name: 'Harina', level: 2 })).toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('');
  });

  it('shows the finished state when no producto is left without a price', async () => {
    const user = userEvent.setup();
    const onFinishVisit = vi.fn();
    render(
      <Harness
        onFinishVisit={onFinishVisit}
        initial={[precio('p1', 1), precio('p2', 1), precio('p4', 1)]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Harina', level: 2 })).toBeInTheDocument();
    await user.type(field(), '100');
    await user.click(screen.getByRole('button', { name: 'Guardar y siguiente' }));
    expect(await screen.findByText('Todos los productos tienen precio')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finalizar visita' }));
    expect(onFinishVisit).toHaveBeenCalled();
  });

  it('filters with the segmented control and shows counts', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[precio('p1', 100), precio('p2', 100, { alerta })]} />);
    const group = screen.getByRole('group', { name: 'Filtrar productos' });
    expect(within(group).getByRole('button', { name: /Todos\s*4/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Pendientes\s*2/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Con alerta\s*1/ })).toBeInTheDocument();

    const list = screen.getByRole('region', { name: 'Productos' });
    await user.click(within(group).getByRole('button', { name: /Con alerta/ }));
    expect(within(list).getAllByRole('button', { name: /Azúcar/ })).toHaveLength(1);
    expect(within(list).queryByRole('button', { name: /Arroz/ })).not.toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: /Pendientes/ }));
    expect(within(list).getByRole('button', { name: /Harina/ })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /Azúcar/ })).not.toBeInTheDocument();
  });

  it('searches by name', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar producto' }), 'lech');
    const list = screen.getByRole('region', { name: 'Productos' });
    expect(within(list).getByRole('button', { name: /Leche/ })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /Arroz/ })).not.toBeInTheDocument();
  });

  it('renders the editor read-only for a finished visit', () => {
    render(<Harness editable={false} blockReason="completed" initial={[precio('p1', 100)]} />);
    expect(field()).toHaveAttribute('readonly');
    expect(screen.getByText(/La visita está finalizada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar y siguiente' })).not.toBeInTheDocument();
  });

  it('never calls a cancelled visit "cerrado" and offers no way to save', () => {
    render(<Harness editable={false} blockReason="cancelled" initial={[precio('p1', 100)]} />);
    expect(field()).toHaveAttribute('readonly');
    expect(screen.getByText(/La visita fue cancelada/)).toBeInTheDocument();
    expect(screen.queryByText(/relevamiento está cerrado/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar y siguiente' })).not.toBeInTheDocument();
  });

  it('confirms an atypical price in a sheet that includes the range bar, then advances', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'needs-confirmation', alerta })
      .mockResolvedValueOnce({ kind: 'saved', precio: precio('p1', 500, { alerta }) });
    render(<Harness onSave={onSave} />);
    await user.type(field(), '500');
    await user.click(screen.getByRole('button', { name: 'Guardar y siguiente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Precio fuera de lo habitual' });
    expect(within(dialog).getByText(/Esperado entre/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar precio' }));
    expect(await screen.findByRole('heading', { name: 'Azúcar', level: 2 })).toBeInTheDocument();
  });

  it('opens the editor as a sheet with previous and next arrows on narrow screens', async () => {
    const user = userEvent.setup();
    render(<Harness wide={false} />);
    expect(screen.queryByLabelText(/precio actual/i)).not.toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Productos' });
    await user.click(within(list).getByRole('button', { name: /Azúcar/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Azúcar' });
    expect(within(sheet).getByLabelText(/precio actual/i)).toHaveFocus();
    await user.click(within(sheet).getByRole('button', { name: 'Producto siguiente' }));
    expect(await screen.findByRole('dialog', { name: 'Harina' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('previous price from the endpoint', () => {
    const source = { relevamiento: 'r', comercio: 'c' };
    const mountRemote = () =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <Harness previousSource={source} previousFor={() => ({ valor: 111, periodo: '2026-07', oferta: false })} />
        </QueryClientProvider>,
      );

    it('queries only the selected producto and shows the offer warning', async () => {
      const spy = vi
        .spyOn(api, 'getPrecioAnterior')
        .mockResolvedValue({ valor: 222, periodo: '2026-08', oferta: true });
      mountRemote();
      expect(await screen.findByText(/222,00/)).toBeInTheDocument();
      expect(screen.getByRole('note', { name: /anterior en oferta/i })).toBeInTheDocument();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ ...source, producto: 'p1' });
      spy.mockRestore();
    });

    it('shows "Sin precio anterior" on 204', async () => {
      const spy = vi.spyOn(api, 'getPrecioAnterior').mockResolvedValue(null);
      mountRemote();
      expect(await screen.findByText(/sin precio anterior/i)).toBeInTheDocument();
      spy.mockRestore();
    });

    it('degrades to the own price on 404 without an error', async () => {
      const spy = vi.spyOn(api, 'getPrecioAnterior').mockRejectedValue(new ApiError({ status: 404, message: 'x' }));
      mountRemote();
      expect(await screen.findByText(/111,00/)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      spy.mockRestore();
    });
  });
});

describe('VisitaWorkspace queued state', () => {
  const pend = (price: ItemStatus | null, over = {}) => ({
    price, priceItemId: 'price:a1:p1', alerta: null, error: null, updatesExisting: false, photos: 0, ...over,
  });

  it('labels each row with its outbox state, as text and not only colour', () => {
    render(
      <Harness
        initial={[precio('p1', 100), precio('p2', 50, { alerta }), precio('p3', 70), precio('p4', 30)]}
        pending={
          new Map([
            ['p1', pend('pending')],
            ['p2', pend('needs-confirmation', { alerta })],
            ['p3', pend('rejected')],
            ['p4', pend('sending')],
          ])
        }
      />,
    );
    const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
    expect(within(row('Arroz')).getByText('Pendiente de envío')).toBeInTheDocument();
    expect(within(row('Azúcar')).getByText('Requiere confirmación')).toBeInTheDocument();
    expect(within(row('Harina')).getByText('Rechazado')).toBeInTheDocument();
    expect(within(row('Leche')).getByText('Enviando')).toBeInTheDocument();
  });

  it('shows queued photos on a row that has no queued price', () => {
    render(<Harness initial={[precio('p1', 100)]} pending={new Map([['p1', { ...pend('pending'), price: null, priceItemId: null, photos: 2 }]])} />);
    expect(within(screen.getByRole('button', { name: /Arroz/ })).getByText(/2 fotos por enviar/)).toBeInTheDocument();
  });

  it('routes confirm, retry and discard of the selected product', async () => {
    const onConfirmPending = vi.fn();
    render(
      <Harness
        initial={[precio('p1', 100, { alerta })]}
        initialSelectedId="p1"
        pending={new Map([['p1', pend('needs-confirmation', { alerta })]])}
        onConfirmPending={onConfirmPending}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar precio' }));
    expect(onConfirmPending).toHaveBeenCalledWith('p1');
  });
});
