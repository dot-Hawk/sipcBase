import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { AuditoriaPrecio, Comercio, ManagedUser, PrecioSnapshot, Producto, Relevamiento, Role } from '@/shared/api/types';
import { formatMoney } from '@/shared/lib/money';

const auth: { role: Role } = { role: 'DIRECCION' };
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u-me', nombre: 'Elena', apellido: 'Vega', role: auth.role } } }),
}));

import { AuditoriaPage } from './AuditoriaPage';

const money = (n: number) => formatMoney(n).replace(/\s/g, ' ');
const rel = (id: string, periodo: string, estado: Relevamiento['estado']): Relevamiento => ({
  id, periodo, estado, frecuencia: 'MENSUAL', fechaInicio: '2026-10-01T00:00:00.000Z', fechaLimite: '2026-10-30T00:00:00.000Z', createdAt: '', updatedAt: '',
});
const com = (id: string, nombre: string): Comercio => ({
  id, nombre, direccion: 'x', zona: 'Centro', tipo: 'ALMACEN', estado: 'ACTIVO', createdAt: '', updatedAt: '',
});
const prod = (id: string, nombre: string): Producto => ({
  id, nombre, marca: null, categoria: 'Almacén', unidad: 'KG', cantidadReferencia: 1, codigoVariedad: '1111101', estado: 'ACTIVO', createdAt: '', updatedAt: '',
});
const user = (id: string, nombre: string, role: Role): ManagedUser =>
  ({ id, nombre, apellido: 'Test', role, estado: 'ACTIVO' }) as ManagedUser;
const snap = (over: Partial<PrecioSnapshot> = {}): PrecioSnapshot => ({
  valor: 1000, oferta: false, observacion: null, fechaRelevamiento: '2026-10-08T12:00:00.000Z', ...over,
});
const row = (over: Partial<AuditoriaPrecio> & { id: string }): AuditoriaPrecio => ({
  precio: 'p1', relevamiento: 'r1', comercio: 'c1', producto: 'pr1', accion: 'MODIFICACION', usuario: 's1', rol: 'SUPERVISOR',
  anterior: snap(), posterior: snap({ valor: 1250 }), detalle: null, createdAt: '2026-10-09T10:00:00.000Z', ...over,
});
const ROWS: AuditoriaPrecio[] = [
  row({ id: 'a1' }),
  row({ id: 'a2', accion: 'CREACION', usuario: 'e1', rol: 'ENCUESTADOR', anterior: null, posterior: snap(), createdAt: '2026-10-08T12:00:00.000Z' }),
  row({ id: 'a3', accion: 'ELIMINACION', precio: 'p9', producto: 'pr2', usuario: 'u-me', rol: 'DIRECCION', anterior: snap({ valor: 700 }), posterior: null }),
  row({ id: 'a4', accion: 'ADJUNTO_AGREGADO', anterior: null, posterior: null, detalle: { adjunto: 'x', mime: 'image/jpeg', bytes: 204800, sha256: 'z' } }),
];

const searchOf = () => screen.getByTestId('location').textContent ?? '';
const table = () => screen.findByRole('table', { name: /registro de cambios/i });

beforeEach(() => {
  auth.role = 'DIRECCION';
  vi.spyOn(api, 'listRelevamientosPage').mockResolvedValue({ items: [rel('r1', '2026-10', 'ABIERTO'), rel('r0', '2026-09', 'CERRADO')], total: null });
  vi.spyOn(api, 'listComercios').mockResolvedValue([com('c1', 'Almacén Uno')]);
  vi.spyOn(api, 'listProductosGestion').mockResolvedValue([prod('pr1', 'Leche entera'), prod('pr2', 'Fideos tallarines')]);
  vi.spyOn(api, 'listUsersPage').mockResolvedValue({
    items: [user('s1', 'Laura', 'SUPERVISOR'), user('e1', 'Juan', 'ENCUESTADOR')],
    total: null,
  });
  vi.spyOn(api, 'listAuditoriaPrecios').mockResolvedValue({ items: ROWS, total: null });
});
afterEach(() => vi.restoreAllMocks());

describe('trail', () => {
  it('lists every event with a readable before/after, the actor and the read-only mark', async () => {
    renderScreen(<AuditoriaPage />);
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    const t = await table();
    expect(screen.getByText('Solo lectura')).toBeInTheDocument();
    const rows = within(t).getAllByRole('row');
    expect(rows).toHaveLength(5);
    const first = rows[1]!;
    expect(within(first).getByText('Corrección')).toBeInTheDocument();
    expect(within(first).getByText('Leche entera')).toBeInTheDocument();
    expect(within(first).getByText(money(1000))).toBeInTheDocument();
    expect(within(first).getByText(money(1250))).toBeInTheDocument();
    expect(within(first).getByText(/antes/i)).toBeInTheDocument();
    expect(within(first).getByText(/ahora/i)).toBeInTheDocument();
    expect(within(first).getByText(/supervisor/i)).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Carga')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Eliminación')).toBeInTheDocument();
    expect(within(rows[4]!).getByText(/image\/jpeg, 200 KB/)).toBeInTheDocument();
  });

  it('resolves actor names only when the role can list users (DIRECCION shows the role and "Usted")', async () => {
    renderScreen(<AuditoriaPage />);
    const t = await table();
    expect(api.listUsersPage).not.toHaveBeenCalled();
    expect(within(t).queryByText('Laura Test')).toBeNull();
    expect(within(within(t).getAllByRole('row')[3]!).getByText('Usted')).toBeInTheDocument();
  });

  it('shows names to a COORDINADOR', async () => {
    auth.role = 'COORDINADOR';
    renderScreen(<AuditoriaPage />);
    const t = await table();
    expect((await within(t).findAllByText('Laura Test')).length).toBeGreaterThan(0);
    expect(within(t).getByText('Juan Test')).toBeInTheDocument();
  });

  it('keeps describing an event whose price was deleted (names come from the row ids)', async () => {
    renderScreen(<AuditoriaPage />);
    const t = await table();
    expect(within(within(t).getAllByRole('row')[3]!).getByText('Fideos tallarines')).toBeInTheDocument();
  });

  it('unknown ids degrade to a neutral label instead of breaking the row', async () => {
    vi.mocked(api.listAuditoriaPrecios).mockResolvedValue({ items: [row({ id: 'z', producto: 'nope', comercio: 'nope', relevamiento: 'nope' })], total: null });
    renderScreen(<AuditoriaPage />);
    const t = await table();
    expect(within(t).getByText('Producto desconocido')).toBeInTheDocument();
  });

  it.each(['COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION'] as const)('%s has no write action', async (role) => {
    auth.role = role;
    renderScreen(<AuditoriaPage />);
    const t = await table();
    expect(within(t).queryByRole('button', { name: /corregir|editar|eliminar|revertir|deshacer/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /corregir|editar|eliminar|revertir|deshacer/i })).toBeNull();
  });
});

describe('states', () => {
  it('shows an error and retries', async () => {
    vi.mocked(api.listAuditoriaPrecios).mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<AuditoriaPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await table();
  });

  it('distinguishes an empty trail from filters without matches', async () => {
    vi.mocked(api.listAuditoriaPrecios).mockResolvedValue({ items: [], total: null });
    renderScreen(<AuditoriaPage />);
    expect(await screen.findByRole('heading', { name: /todavía no hay cambios registrados/i })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Acción'), 'ELIMINACION');
    expect(await screen.findByRole('heading', { name: /ningún cambio coincide/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /quitar filtros/i }));
    expect(searchOf()).toBe('/');
  });
});

describe('filters in the URL', () => {
  it('sends relevamiento and accion to the server', async () => {
    renderScreen(<AuditoriaPage />);
    await table();
    await userEvent.selectOptions(screen.getByLabelText('Relevamiento'), 'r1');
    await userEvent.selectOptions(screen.getByLabelText('Acción'), 'MODIFICACION');
    await waitFor(() =>
      expect(api.listAuditoriaPrecios).toHaveBeenLastCalledWith({ relevamiento: 'r1', accion: 'MODIFICACION', page: 1, limit: 25 }),
    );
    expect(Object.fromEntries(new URLSearchParams(searchOf().split('?')[1]))).toEqual({ relevamiento: 'r1', accion: 'MODIFICACION' });
  });

  it('restores the view from the URL', async () => {
    renderScreen(<AuditoriaPage />, { route: '/?accion=CREACION&relevamiento=r0&page=2' });
    await table();
    expect(api.listAuditoriaPrecios).toHaveBeenLastCalledWith({ accion: 'CREACION', relevamiento: 'r0', page: 2, limit: 25 });
    expect(screen.getByLabelText('Acción')).toHaveValue('CREACION');
  });

  it('a COORDINADOR can filter by any user', async () => {
    auth.role = 'COORDINADOR';
    renderScreen(<AuditoriaPage />);
    await table();
    await userEvent.selectOptions(await screen.findByLabelText('Usuario'), 's1');
    await waitFor(() => expect(api.listAuditoriaPrecios).toHaveBeenLastCalledWith(expect.objectContaining({ usuario: 's1' })));
  });

  it('the other roles get "Solo mis cambios" instead of a user list', async () => {
    auth.role = 'SUPERVISOR';
    renderScreen(<AuditoriaPage />);
    await table();
    expect(screen.queryByLabelText('Usuario')).toBeNull();
    await userEvent.click(screen.getByRole('switch', { name: /solo mis cambios/i }));
    await waitFor(() => expect(api.listAuditoriaPrecios).toHaveBeenLastCalledWith(expect.objectContaining({ usuario: 'u-me' })));
    expect(searchOf()).toContain('usuario=u-me');
  });

  it('shows the history of one price when linked from the price detail, and lets you leave it', async () => {
    renderScreen(<AuditoriaPage />, { route: '/?precio=p1' });
    await table();
    expect(api.listAuditoriaPrecios).toHaveBeenLastCalledWith(expect.objectContaining({ precio: 'p1' }));
    expect(screen.getByText(/historial de un solo precio/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ver todos los cambios/i }));
    expect(searchOf()).toBe('/');
  });

  it('narrows to one price from a row', async () => {
    renderScreen(<AuditoriaPage />);
    const t = await table();
    await userEvent.click(within(within(t).getAllByRole('row')[1]!).getByRole('button', { name: /historial de este precio/i }));
    expect(searchOf()).toContain('precio=p1');
  });
});

describe('pagination', () => {
  const full = Array.from({ length: 25 }, (_, i) => row({ id: `a${i}` }));

  it('pages through the URL and keeps "Siguiente" while the page is full', async () => {
    vi.mocked(api.listAuditoriaPrecios).mockResolvedValue({ items: full, total: null });
    renderScreen(<AuditoriaPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    await waitFor(() => expect(api.listAuditoriaPrecios).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    expect(searchOf()).toContain('page=2');
  });

  it('an empty page beyond the end offers the way back', async () => {
    vi.mocked(api.listAuditoriaPrecios).mockResolvedValue({ items: [], total: null });
    renderScreen(<AuditoriaPage />, { route: '/?page=2' });
    expect(await screen.findByRole('heading', { name: /no hay más resultados/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /volver a la página anterior/i }));
    expect(searchOf()).toBe('/');
  });
});
