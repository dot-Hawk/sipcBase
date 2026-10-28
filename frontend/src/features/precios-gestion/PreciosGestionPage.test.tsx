import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, setOnline } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { Alerta, Comercio, ManagedUser, Precio, Producto, Relevamiento, Role } from '@/shared/api/types';
import { formatMoney } from '@/shared/lib/money';

/** Testing Library collapses the NBSP of the currency format in the DOM text; do the same to the expectation. */
const money = (n: number) => formatMoney(n).replace(/\s/g, ' ');

const auth: { role: Role } = { role: 'SUPERVISOR' };
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u-me', nombre: 'Laura', apellido: 'Ríos', role: auth.role } } }),
}));

import { PreciosGestionPage } from './PreciosGestionPage';

const rel = (id: string, periodo: string, estado: Relevamiento['estado']): Relevamiento => ({
  id, periodo, estado, frecuencia: 'MENSUAL', fechaInicio: '2026-10-01T00:00:00.000Z', fechaLimite: '2026-10-30T00:00:00.000Z', createdAt: '', updatedAt: '',
});
const com = (id: string, nombre: string): Comercio => ({
  id, nombre, direccion: 'x', zona: 'Centro', tipo: 'ALMACEN', estado: 'ACTIVO', createdAt: '', updatedAt: '',
});
const prod = (id: string, nombre: string, marca: string | null = null): Producto => ({
  id, nombre, marca, categoria: 'Almacén', unidad: 'KG', cantidadReferencia: 1, codigoVariedad: '1111101', estado: 'ACTIVO', createdAt: '', updatedAt: '',
});
const alerta: Alerta = { media: 1000, desvio: 20, n: 4, limiteInferior: 900, limiteSuperior: 1100 };
const precio = (over: Partial<Precio> & { id: string }): Precio => ({
  relevamiento: 'r1', producto: 'pr1', comercio: 'c1', encuestador: 'e1', valor: 1000, oferta: false,
  fechaRelevamiento: '2026-10-08T12:00:00.000Z', observacion: null, alerta: null,
  createdAt: '2026-10-08T12:00:00.000Z', updatedAt: '2026-10-08T12:00:00.000Z', ...over,
});
const P1 = precio({ id: 'p1', valor: 1500, alerta, observacion: 'Sin stock de la marca habitual' });
const P2 = precio({ id: 'p2', relevamiento: 'r0', comercio: 'c2', producto: 'pr2', oferta: true, valor: 900 });
const P3 = precio({ id: 'p3', comercio: 'c2', producto: 'pr3', valor: 1000 });

const searchOf = () => screen.getByTestId('location').textContent ?? '';
const table = () => screen.findByRole('table', { name: /precios relevados/i });
const rowOf = (t: HTMLElement, text: RegExp | string) => {
  const row = within(t).getAllByRole('row').find((r) => within(r).queryAllByText(text).length > 0);
  if (!row) throw new Error(`no row with ${String(text)}`);
  return row;
};

beforeEach(() => {
  auth.role = 'SUPERVISOR';
  setOnline(true);
  vi.spyOn(api, 'listRelevamientosPage').mockResolvedValue({ items: [rel('r1', '2026-10', 'ABIERTO'), rel('r0', '2026-09', 'CERRADO')], total: null });
  vi.spyOn(api, 'listComercios').mockResolvedValue([com('c1', 'Almacén Uno'), com('c2', 'Verdulería Dos')]);
  vi.spyOn(api, 'listProductosGestion').mockResolvedValue([prod('pr1', 'Leche entera', 'La Serenísima'), prod('pr2', 'Fideos tallarines'), prod('pr3', 'Aceite de girasol')]);
  vi.spyOn(api, 'listUsersPage').mockResolvedValue({
    items: [{ id: 'e1', nombre: 'Juan', apellido: 'Pérez', role: 'ENCUESTADOR', estado: 'ACTIVO' } as ManagedUser],
    total: null,
  });
  vi.spyOn(api, 'listPreciosPage').mockResolvedValue({ items: [P1, P2, P3], total: null });
});
afterEach(() => vi.restoreAllMocks());

describe('list', () => {
  it('shows names instead of ids, alert and offer marks with text, and the closed relevamiento', async () => {
    renderScreen(<PreciosGestionPage />);
    expect(screen.getByRole('status', { name: /cargando precios/i })).toBeInTheDocument();
    const t = await table();
    expect(within(t).getAllByRole('row')).toHaveLength(4);
    const r1 = rowOf(t, 'Leche entera');
    expect(within(r1).getAllByText(/Almacén Uno/).length).toBeGreaterThan(0);
    expect(within(r1).getByText(money(1500))).toBeInTheDocument();
    expect(within(r1).getByText(/atípico/i)).toBeInTheDocument();
    expect(within(r1).getByText(/\+50%/)).toBeInTheDocument();
    const r2 = rowOf(t, /Fideos tallarines/);
    expect(within(t).getAllByText(/en oferta/i).length).toBeGreaterThan(0);
    expect(within(r2).getByText(/2026-09/)).toBeInTheDocument();
    expect(within(t).getAllByText(/cerrado/i).length).toBeGreaterThan(0);
  });

  it('asks the server for the first page of 25', async () => {
    renderScreen(<PreciosGestionPage />);
    await table();
    expect(api.listPreciosPage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 25 }));
  });

  it('shows the encuestador as an id when names cannot be resolved (SUPERVISOR cannot list users)', async () => {
    renderScreen(<PreciosGestionPage />);
    await table();
    expect(api.listUsersPage).not.toHaveBeenCalled();
    expect(screen.getAllByText(/encuestador #e1/i).length).toBeGreaterThan(0);
  });

  it('shows an error and retries', async () => {
    vi.mocked(api.listPreciosPage).mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<PreciosGestionPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await table();
  });

  it('distinguishes "nothing yet" from "no match for the filters"', async () => {
    vi.mocked(api.listPreciosPage).mockResolvedValue({ items: [], total: null });
    renderScreen(<PreciosGestionPage />);
    expect(await screen.findByRole('heading', { name: /todavía no hay precios/i })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Relevamiento'), 'r1');
    expect(await screen.findByRole('heading', { name: /ningún precio coincide/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /quitar filtros/i }));
    expect(await screen.findByRole('heading', { name: /todavía no hay precios/i })).toBeInTheDocument();
    expect(searchOf()).toBe('/');
  });
});

describe('filters in the URL', () => {
  it('sends each filter to the server and keeps it in the URL', async () => {
    renderScreen(<PreciosGestionPage />);
    await table();
    const filters = screen.getByRole('search', { name: /filtrar precios/i });
    await userEvent.selectOptions(within(filters).getByLabelText('Relevamiento'), 'r1');
    await userEvent.selectOptions(within(filters).getByLabelText('Comercio'), 'c2');
    await userEvent.selectOptions(within(filters).getByLabelText('Producto'), 'pr2');
    await userEvent.selectOptions(within(filters).getByLabelText('Oferta'), 'false');
    await userEvent.click(within(filters).getByRole('switch', { name: /solo con alerta/i }));
    await waitFor(() =>
      expect(api.listPreciosPage).toHaveBeenLastCalledWith({
        relevamiento: 'r1', comercio: 'c2', producto: 'pr2', oferta: false, conAlerta: true, page: 1, limit: 25,
      }),
    );
    const params = new URLSearchParams(searchOf().split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({ relevamiento: 'r1', comercio: 'c2', producto: 'pr2', oferta: 'false', conAlerta: 'true' });
  });

  it('restores the view from the URL on load', async () => {
    renderScreen(<PreciosGestionPage />, { route: '/?relevamiento=r1&oferta=true&conAlerta=true&page=2' });
    await table();
    expect(api.listPreciosPage).toHaveBeenLastCalledWith({ relevamiento: 'r1', oferta: true, conAlerta: true, page: 2, limit: 25 });
    expect(screen.getByLabelText('Relevamiento')).toHaveValue('r1');
    expect(screen.getByLabelText('Oferta')).toHaveValue('true');
    expect(screen.getByRole('switch', { name: /solo con alerta/i })).toBeChecked();
  });

  it('does not offer the encuestador filter to a role that cannot list encuestadores', async () => {
    renderScreen(<PreciosGestionPage />);
    await table();
    expect(screen.queryByLabelText('Encuestador')).toBeNull();
  });

  it('offers it when the role can (COORDINADOR) and sends it', async () => {
    auth.role = 'COORDINADOR';
    renderScreen(<PreciosGestionPage />);
    await table();
    await userEvent.selectOptions(await screen.findByLabelText('Encuestador'), 'e1');
    await waitFor(() => expect(api.listPreciosPage).toHaveBeenLastCalledWith(expect.objectContaining({ encuestador: 'e1' })));
  });
});

describe('pagination', () => {
  const full = Array.from({ length: 25 }, (_, i) => precio({ id: `p${i}`, valor: 1000 + i }));

  it('moves page by page through the URL', async () => {
    vi.mocked(api.listPreciosPage).mockResolvedValue({ items: full, total: null });
    renderScreen(<PreciosGestionPage />);
    await table();
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    await waitFor(() => expect(api.listPreciosPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    expect(searchOf()).toContain('page=2');
    expect(screen.getByText('Página 2')).toBeInTheDocument();
  });

  it('shows "Mostrando X–Y de N" when the backend sends the total', async () => {
    vi.mocked(api.listPreciosPage).mockResolvedValue({ items: full, total: 60 });
    renderScreen(<PreciosGestionPage />, { route: '/?page=2' });
    await table();
    expect(screen.getByText('Mostrando 26–50 de 60')).toBeInTheDocument();
  });

  it('disables "Siguiente" on a short page', async () => {
    renderScreen(<PreciosGestionPage />);
    await table();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('an empty page beyond the end offers the way back', async () => {
    vi.mocked(api.listPreciosPage).mockResolvedValue({ items: [], total: null });
    renderScreen(<PreciosGestionPage />, { route: '/?page=3' });
    expect(await screen.findByRole('heading', { name: /no hay más resultados/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /volver a la página anterior/i }));
    expect(searchOf()).toContain('page=2');
  });
});

describe('detail', () => {
  it('shows the full price, the alert range and a link to its history', async () => {
    renderScreen(<PreciosGestionPage />);
    const t = await table();
    await userEvent.click(within(rowOf(t, 'Leche entera')).getByRole('button', { name: /ver detalle/i }));
    const dialog = screen.getByRole('dialog', { name: /detalle del precio/i });
    expect(within(dialog).getByText('Sin stock de la marca habitual')).toBeInTheDocument();
    expect(within(dialog).getByText(/esperado entre/i)).toHaveTextContent(money(900));
    expect(within(dialog).getByRole('link', { name: /historial de cambios/i })).toHaveAttribute('href', '/gestion/auditoria?precio=p1');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('correction', () => {
  async function openCorrection(text: RegExp | string = 'Leche entera') {
    renderScreen(<PreciosGestionPage />);
    const t = await table();
    await userEvent.click(within(rowOf(t, text)).getByRole('button', { name: /corregir/i }));
    return screen.getByRole('dialog', { name: /corregir precio/i });
  }
  async function review(dialog: HTMLElement, valor: string) {
    const input = within(dialog).getByLabelText('Valor');
    await userEvent.clear(input);
    await userEvent.type(input, valor);
    await userEvent.click(within(dialog).getByRole('button', { name: /revisar corrección/i }));
  }

  it('asks for a change, shows before and after, and only sends the server what changed', async () => {
    const update = vi.spyOn(api, 'updatePrecio').mockResolvedValue({ ...P1, valor: 1100, alerta: null });
    const dialog = await openCorrection();
    await userEvent.click(within(dialog).getByRole('button', { name: /revisar corrección/i }));
    expect(within(dialog).getByText(/cambie al menos un dato/i)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    await review(dialog, '1.100,00');
    const confirm = screen.getByRole('dialog', { name: /confirmar corrección/i });
    expect(within(confirm).getByText(money(1500))).toBeInTheDocument();
    expect(within(confirm).getByText(money(1100))).toBeInTheDocument();
    expect(within(confirm).getByText(/queda registrad/i)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    const before = vi.mocked(api.listPreciosPage).mock.calls.length;
    await userEvent.click(within(confirm).getByRole('button', { name: /confirmar corrección/i }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('p1', { valor: 1100 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/precio corregido/i)).toBeInTheDocument();
    // Not optimistic: the new list comes from the server, and the audit trail is refreshed too.
    await waitFor(() => expect(vi.mocked(api.listPreciosPage).mock.calls.length).toBeGreaterThan(before));
  });

  it('maps a 400 on valor back onto the field', async () => {
    vi.spyOn(api, 'updatePrecio').mockRejectedValue(
      new ApiError({ status: 400, message: 'x', errors: [{ field: 'valor', message: 'valor must be a number greater than 0' }] }),
    );
    const dialog = await openCorrection();
    await review(dialog, '1200');
    await userEvent.click(screen.getByRole('button', { name: /confirmar corrección/i }));
    const edit = await screen.findByRole('dialog', { name: /corregir precio/i });
    expect(within(edit).getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true');
    expect(within(edit).getByText(/mayor a 0/i)).toBeInTheDocument();
  });

  it('asks for a second confirmation when the new value is atypical, then resends with confirmarDesvio', async () => {
    const update = vi
      .spyOn(api, 'updatePrecio')
      .mockRejectedValueOnce(new ApiError({ status: 409, message: 'x', requiereConfirmacion: true, alerta }))
      .mockResolvedValueOnce({ ...P3, valor: 5000, alerta });
    const dialog = await openCorrection('Aceite de girasol');
    await review(dialog, '5000');
    await userEvent.click(screen.getByRole('button', { name: /confirmar corrección/i }));
    const warn = await screen.findByRole('dialog', { name: /se aleja de lo habitual/i });
    expect(within(warn).getByText(/esperado entre/i)).toBeInTheDocument();
    await userEvent.click(within(warn).getByRole('button', { name: /confirmar de todos modos/i }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('p3', { valor: 5000, confirmarDesvio: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the previous price and the usual variation of the variedad for a percentile alert', async () => {
    const percentil: Alerta = {
      metodo: 'PERCENTIL_VARIACION',
      variedad: '1111101',
      precioAnterior: 1000,
      variacion: 5,
      percentilInferior: 5,
      percentilSuperior: 95,
      limiteInferior: 0.9,
      limiteSuperior: 1.1,
      rangoPrecio: { min: 900, max: 1100 },
      n: 80,
    };
    vi.spyOn(api, 'updatePrecio').mockRejectedValueOnce(
      new ApiError({ status: 409, message: 'x', requiereConfirmacion: true, alerta: percentil }),
    );
    const dialog = await openCorrection('Aceite de girasol');
    await review(dialog, '5000');
    await userEvent.click(screen.getByRole('button', { name: /confirmar corrección/i }));
    const warn = await screen.findByRole('dialog', { name: /se aleja de lo habitual/i });
    expect(within(warn).getByText(/lo habitual para esta variedad/i)).toBeInTheDocument();
    expect(within(warn).getByText(/precio anterior/i)).toBeInTheDocument();
    expect(within(warn).getByText(/80 variaciones/i)).toBeInTheDocument();
  });

  it('turning the offer on or editing the observation is sent as such', async () => {
    const update = vi.spyOn(api, 'updatePrecio').mockResolvedValue(P1);
    const dialog = await openCorrection();
    await userEvent.click(within(dialog).getByRole('switch', { name: /oferta/i }));
    const obs = within(dialog).getByLabelText(/observación/i);
    await userEvent.clear(obs);
    await userEvent.click(within(dialog).getByRole('button', { name: /revisar corrección/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirmar corrección/i }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('p1', { oferta: true, observacion: null }));
  });

  it('explains a relevamiento closed in the meantime (409 without code) and stops there', async () => {
    vi.spyOn(api, 'updatePrecio').mockRejectedValue(new ApiError({ status: 409, message: 'Relevamiento is not ABIERTO' }));
    const dialog = await openCorrection();
    await review(dialog, '1200');
    await userEvent.click(screen.getByRole('button', { name: /confirmar corrección/i }));
    const confirm = await screen.findByRole('dialog', { name: /no se pudo corregir el precio/i });
    expect(await within(confirm).findByRole('alert')).toHaveTextContent(/relevamiento está cerrado/i);
    expect(within(confirm).queryByRole('button', { name: /^confirmar corrección$/i })).toBeNull();
  });

  it('reads the stable code of a closed relevamiento regardless of the message', async () => {
    vi.spyOn(api, 'updatePrecio').mockRejectedValue(new ApiError({ status: 409, message: 'texto nuevo', code: 'RELEVAMIENTO_NOT_ABIERTO' }));
    const dialog = await openCorrection();
    await review(dialog, '1200');
    await userEvent.click(screen.getByRole('button', { name: /confirmar corrección/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/relevamiento está cerrado/i);
  });

  it('explains a price that vanished (404)', async () => {
    vi.spyOn(api, 'updatePrecio').mockRejectedValue(new ApiError({ status: 404, message: 'Precio not found' }));
    const dialog = await openCorrection();
    await review(dialog, '1200');
    await userEvent.click(screen.getByRole('button', { name: /confirmar corrección/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ya no existe/i);
  });

  it('does not offer a correction on a closed relevamiento, and says why', async () => {
    renderScreen(<PreciosGestionPage />);
    const t = await table();
    const btn = within(rowOf(t, /Fideos tallarines/)).getByRole('button', { name: /corregir/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription(/relevamiento está cerrado/i);
  });

  it('is disabled offline with the reason, and nothing is queued', async () => {
    setOnline(false);
    renderScreen(<PreciosGestionPage />);
    const t = await table();
    const btn = within(rowOf(t, 'Leche entera')).getByRole('button', { name: /corregir/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/sin conexión\. esta acción necesita conexión/i)).toBeInTheDocument();
  });

  it.each(['COORDINADOR', 'DIRECCION'] as const)('%s sees no correction action at all', async (role) => {
    auth.role = role;
    renderScreen(<PreciosGestionPage />);
    const t = await table();
    expect(within(t).queryByRole('button', { name: /corregir/i })).toBeNull();
    await userEvent.click(within(rowOf(t, 'Leche entera')).getByRole('button', { name: /ver detalle/i }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /corregir/i })).toBeNull();
  });

  it('can be started from the detail and returns focus there when cancelled', async () => {
    renderScreen(<PreciosGestionPage />);
    const t = await table();
    await userEvent.click(within(rowOf(t, 'Leche entera')).getByRole('button', { name: /ver detalle/i }));
    await userEvent.click(within(screen.getByRole('dialog', { name: /detalle/i })).getByRole('button', { name: /corregir precio/i }));
    const edit = screen.getByRole('dialog', { name: /corregir precio/i });
    await userEvent.click(within(edit).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('dialog', { name: /detalle del precio/i })).toBeInTheDocument();
  });
});
