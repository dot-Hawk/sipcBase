import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, setOnline } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { ManagedUser, Role } from '@/shared/api/types';
import { run } from './testFixtures';

const auth: { role: Role } = { role: 'AUDITOR' };
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u-me', nombre: 'Elena', apellido: 'Vega', role: auth.role } } }),
}));

import { CalculosPage } from './CalculosPage';

const user = (id: string, nombre: string): ManagedUser => ({ id, nombre, apellido: 'Test', role: 'ANALISTA', estado: 'ACTIVO' }) as ManagedUser;

const renderList = (route = '/gestion/calculos') =>
  renderScreen(
    <Routes>
      <Route path="/gestion/calculos/*" element={<CalculosPage />} />
    </Routes>,
    { route },
  );
const here = () => screen.getByTestId('location').textContent ?? '';

beforeEach(() => {
  auth.role = 'AUDITOR';
  setOnline(true);
  vi.spyOn(api, 'listCalculos').mockResolvedValue({
    items: [
      run({ id: 'c1', estado: 'COMPLETADO' }),
      run({ id: 'c2', estado: 'FALLIDO', error: 'boom', mesBase: '2025-10', mesObjetivo: '2025-12', excluirOfertas: true, creadoPor: 'u-ana' }),
      run({ id: 'c3', estado: 'EJECUTANDO', mesBase: '2026-02', mesObjetivo: '2026-02', resumen: null }),
    ],
    total: null,
  });
  vi.spyOn(api, 'listUsersPage').mockResolvedValue({ items: [user('u-ana', 'Ana')], total: null });
});
afterEach(() => vi.restoreAllMocks());

const table = () => screen.findByRole('table', { name: /cálculos realizados/i });

describe('runs list', () => {
  it('shows each run with a text state, its range, date and a link to the detail', async () => {
    renderList();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    const t = await table();
    const rows = within(t).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText('Completado')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('2026-01 a 2026-03')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Fallido')).toBeInTheDocument();
    expect(within(rows[2]!).getByText(/sin ofertas/i)).toBeInTheDocument();
    expect(within(rows[3]!).getByText('En ejecución')).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('link', { name: /ver detalle/i })).toHaveAttribute('href', '/gestion/calculos/c1');
  });

  it('names the creator only when the role can list users, otherwise shows a short id', async () => {
    auth.role = 'COORDINADOR';
    renderList();
    const t = await table();
    expect(await within(t).findAllByText(/Ana Test/)).not.toHaveLength(0);
    expect(api.listUsersPage).toHaveBeenCalled();
  });
  it('does not ask for users with another role', async () => {
    renderList();
    const t = await table();
    expect(within(t).getAllByText(/Usuario #u-ana/i)).not.toHaveLength(0);
    expect(api.listUsersPage).not.toHaveBeenCalled();
  });

  it('pages 20 at a time through the URL, and says "Página N" because there is no total', async () => {
    vi.mocked(api.listCalculos).mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => run({ id: `r${i}` })), total: null });
    renderList();
    await table();
    expect(api.listCalculos).toHaveBeenCalledWith({ page: 1, limit: 20 });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(here()).toContain('page=2'));
    await waitFor(() => expect(api.listCalculos).toHaveBeenCalledWith({ page: 2, limit: 20 }));
  });

  it('shows an empty state and an error with retry', async () => {
    vi.mocked(api.listCalculos).mockResolvedValueOnce({ items: [], total: null });
    const view = renderList();
    expect(await screen.findByRole('heading', { name: /todavía no hay cálculos/i })).toBeInTheDocument();
    view.unmount();
    vi.mocked(api.listCalculos).mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent(/servidor/i);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('read-only roles', () => {
  it.each(['DIRECCION'] as const)('%s sees the list but no write control', async (role) => {
    auth.role = role;
    renderList();
    await table();
    expect(screen.getByText('Solo lectura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nuevo cálculo/i })).toBeNull();
  });
});

describe('new calculation', () => {
  const open = async () => {
    renderList();
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nuevo cálculo/i }));
    return screen.getByRole('dialog', { name: /nuevo cálculo/i });
  };
  const fill = async (dlg: HTMLElement, base: string, objetivo: string) => {
    await userEvent.type(within(dlg).getByLabelText('Mes base'), base);
    await userEvent.type(within(dlg).getByLabelText('Mes objetivo'), objetivo);
  };

  it('validates before sending and focuses the first problem', async () => {
    const create = vi.spyOn(api, 'createCalculo');
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: /iniciar cálculo/i }));
    expect(within(dlg).getByText('Indique el mes base.')).toBeInTheDocument();
    expect(within(dlg).getByLabelText('Mes base')).toHaveFocus();
    expect(create).not.toHaveBeenCalled();
    await fill(dlg, '2026-05', '2026-01');
    await userEvent.click(within(dlg).getByRole('button', { name: /iniciar cálculo/i }));
    expect(await within(dlg).findByText(/igual o posterior/i, { selector: '.field__error' })).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps the advanced parameters closed by default and validates their ranges', async () => {
    const dlg = await open();
    const details = within(dlg).getByText('Parámetros avanzados').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await userEvent.click(within(dlg).getByText('Parámetros avanzados'));
    expect(details.open).toBe(true);
    await fill(dlg, '2026-01', '2026-03');
    const meses = within(dlg).getByLabelText('Meses de espera');
    expect(meses).toHaveValue('2');
    await userEvent.clear(meses);
    await userEvent.type(meses, '13');
    await userEvent.click(within(dlg).getByRole('button', { name: /iniciar cálculo/i }));
    expect(await within(dlg).findByText(/entre 0 y 12/i, { selector: '.field__error' })).toBeInTheDocument();
  });

  it('starts the run, then opens its detail', async () => {
    const create = vi.spyOn(api, 'createCalculo').mockResolvedValue(run({ id: 'new-1', estado: 'EJECUTANDO' }));
    const dlg = await open();
    await fill(dlg, '2026-01', '2026-03');
    await userEvent.click(within(dlg).getByRole('switch', { name: /excluir precios en oferta/i }));
    await userEvent.click(within(dlg).getByRole('button', { name: /iniciar cálculo/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ mesBase: '2026-01', mesObjetivo: '2026-03', excluirOfertas: true }));
    await waitFor(() => expect(here()).toBe('/gestion/calculos/new-1'));
  });

  it.each([
    ['No hay relevamientos para el mes 2026-03', /no hay relevamientos para el mes 2026-03/i],
    ['Hay relevamientos abiertos: 2026-02', /abiertos \(2026-02\)/i],
    ['No hay precios cargados en el rango indicado', /no hay precios cargados/i],
    ['Ya hay un cálculo en ejecución: espere a que termine', /ya hay un cálculo en ejecución/i],
  ])('explains the 409 "%s" in Spanish and keeps the form', async (message, expected) => {
    vi.spyOn(api, 'createCalculo').mockRejectedValue(new ApiError({ status: 409, message }));
    const dlg = await open();
    await fill(dlg, '2026-01', '2026-03');
    await userEvent.click(within(dlg).getByRole('button', { name: /iniciar cálculo/i }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent(expected);
    expect(screen.getByRole('dialog', { name: /nuevo cálculo/i })).toBeInTheDocument();
    expect(within(dlg).getByLabelText('Mes base')).toHaveValue('2026-01');
  });

  it('puts a server 400 on the field', async () => {
    vi.spyOn(api, 'createCalculo').mockRejectedValue(
      new ApiError({ status: 400, message: 'x', errors: [{ field: 'mesObjetivo', message: 'range too long' }] }),
    );
    const dlg = await open();
    await fill(dlg, '2026-01', '2026-03');
    await userEvent.click(within(dlg).getByRole('button', { name: /iniciar cálculo/i }));
    expect(await within(dlg).findByText(/36 meses/, { selector: '.field__error' })).toBeInTheDocument();
  });

  it('downloads the engine input for the typed range, after validating it', async () => {
    const dl = vi.spyOn(api, 'downloadCalculoExportacion').mockResolvedValue(new Blob(['x']));
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: /datos de entrada.*xlsx/i }));
    expect(dl).not.toHaveBeenCalled();
    expect(within(dlg).getByText('Indique el mes base.')).toBeInTheDocument();
    await fill(dlg, '2026-01', '2026-03');
    await userEvent.click(within(dlg).getByRole('switch', { name: /excluir precios en oferta/i }));
    await userEvent.click(within(dlg).getByRole('button', { name: /datos de entrada.*csv/i }));
    await waitFor(() =>
      expect(dl).toHaveBeenCalledWith({ mesBase: '2026-01', mesObjetivo: '2026-03', excluirOfertas: true, formato: 'csv' }),
    );
  });

  it('disables starting while offline and says why', async () => {
    setOnline(false);
    renderList();
    await table();
    expect(screen.getByRole('button', { name: /nuevo cálculo/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});
