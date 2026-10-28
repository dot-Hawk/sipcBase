import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { Asignacion, Relevamiento } from '@/shared/api/types';
import { ME, renderScreen, setOnline } from '@/features/gestion/testUtils';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u-me', nombre: 'Carlos', apellido: 'Méndez', role: 'COORDINADOR' } } }),
}));

import { RelevamientosPage } from './RelevamientosPage';

const rel = (id: string, periodo: string, estado: Relevamiento['estado']): Relevamiento => ({
  id, periodo, estado, frecuencia: 'MENSUAL', fechaInicio: `${periodo}-01T00:00:00.000Z`, fechaLimite: `${periodo}-28T00:00:00.000Z`,
  createdAt: '', updatedAt: '',
});
const asig = (id: string, relevamiento: string, estado: Asignacion['estado']): Asignacion => ({
  id, relevamiento, estado, encuestador: 'e1', comercio: id, createdAt: '', updatedAt: '',
});

const LIST = [rel('r2', '2026-10', 'ABIERTO'), rel('r1', '2026-09', 'CERRADO')];

beforeEach(() => {
  setOnline(true);
  vi.spyOn(api, 'listRelevamientosPage').mockResolvedValue({ items: LIST, total: null });
  vi.spyOn(api, 'listAsignacionesPage').mockResolvedValue({ items: [
    asig('a1', 'r2', 'COMPLETADA'),
    asig('a2', 'r2', 'PENDIENTE'),
    asig('a3', 'r1', 'COMPLETADA'),
  ], total: null });
});
afterEach(() => vi.restoreAllMocks());

async function table() {
  return screen.findByRole('table', { name: /relevamientos/i });
}

describe('RelevamientosPage list', () => {
  it('shows loading and then the relevamientos with estado and avance', async () => {
    renderScreen(<RelevamientosPage />);
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    const t = await table();
    const rows = within(t).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('2026-10')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Abierto')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('1 de 2 completadas')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Cerrado')).toBeInTheDocument();
  });

  it('offers "Cerrar" only on open relevamientos', async () => {
    renderScreen(<RelevamientosPage />);
    const t = await table();
    expect(within(t).getAllByRole('button', { name: /cerrar relevamiento/i })).toHaveLength(1);
  });

  it('shows the empty state with the create action', async () => {
    vi.spyOn(api, 'listRelevamientosPage').mockResolvedValue({ items: [], total: null });
    renderScreen(<RelevamientosPage />);
    expect(await screen.findByRole('heading', { name: /todavía no hay relevamientos/i })).toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    const spy = vi.spyOn(api, 'listRelevamientosPage').mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<RelevamientosPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/servidor/i);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await table();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('keeps the list when the avance request fails', async () => {
    vi.spyOn(api, 'listAsignacionesPage').mockRejectedValue(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<RelevamientosPage />);
    const t = await table();
    expect(within(t).getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('create relevamiento', () => {
  async function openForm() {
    renderScreen(<RelevamientosPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nuevo relevamiento/i }));
    return screen.getByRole('dialog', { name: /nuevo relevamiento/i });
  }

  it('submits the payload, closes and refreshes', async () => {
    const create = vi.spyOn(api, 'createRelevamiento').mockResolvedValue(rel('r3', '2026-11', 'ABIERTO'));
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText('Período'), '2026-11');
    // The dates are suggested from a valid periodo.
    expect(within(dialog).getByLabelText('Fecha de inicio')).toHaveValue('2026-11-01');
    expect(within(dialog).getByLabelText('Fecha límite')).toHaveValue('2026-11-30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear relevamiento' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        periodo: '2026-11',
        frecuencia: 'MENSUAL',
        fechaInicio: '2026-11-01T00:00:00.000Z',
        fechaLimite: '2026-11-30T00:00:00.000Z',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/relevamiento 2026-11 creado/i)).toBeInTheDocument();
    expect(api.listRelevamientosPage).toHaveBeenCalledTimes(2);
  });

  it('flags client-side problems without calling the API', async () => {
    const create = vi.spyOn(api, 'createRelevamiento');
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText('Período'), '2026-13');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear relevamiento' }));
    expect(create).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Período')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Período')).toHaveFocus();
  });

  it('maps a server 400 onto the fields', async () => {
    vi.spyOn(api, 'createRelevamiento').mockRejectedValue(
      new ApiError({ status: 400, message: 'x', errors: [{ field: 'periodo', message: 'periodo does not match' }] }),
    );
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText('Período'), '2026-11');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear relevamiento' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Período')).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByText(/no tiene el formato/i)).toBeInTheDocument();
  });

  it('maps server date errors onto the date fields', async () => {
    vi.spyOn(api, 'createRelevamiento').mockRejectedValue(
      new ApiError({
        status: 400,
        message: 'x',
        errors: [{ field: 'fechaLimite', message: 'fechaLimite must be after fechaInicio' }],
      }),
    );
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText('Período'), '2026-11');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear relevamiento' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Fecha límite')).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByText(/debe ser posterior a la de inicio/i)).toBeInTheDocument();
  });

  it('blocks equal start and limit on the client', async () => {
    const create = vi.spyOn(api, 'createRelevamiento');
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText('Período'), '2026-11');
    const limite = within(dialog).getByLabelText('Fecha límite');
    await userEvent.clear(limite);
    await userEvent.type(limite, '2026-11-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear relevamiento' }));
    expect(create).not.toHaveBeenCalled();
    expect(limite).toHaveAttribute('aria-invalid', 'true');
  });

  it('explains a 409 duplicate on the periodo field', async () => {
    vi.spyOn(api, 'createRelevamiento').mockRejectedValue(new ApiError({ status: 409, message: 'dup' }));
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText('Período'), '2026-11');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear relevamiento' }));
    expect(await within(dialog).findByText(/ya existe un relevamiento/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('cancelled visits and the relevamiento', () => {
  beforeEach(() => {
    vi.mocked(api.listAsignacionesPage).mockResolvedValue({ items: [
      asig('a1', 'r2', 'COMPLETADA'),
      asig('a2', 'r2', 'PENDIENTE'),
      asig('a4', 'r2', 'CANCELADA'),
      asig('a3', 'r1', 'COMPLETADA'),
    ], total: null });
  });

  it('does not count a cancelled visit as expected work in the progress', async () => {
    renderScreen(<RelevamientosPage />);
    const rows = within(await table()).getAllByRole('row');
    expect(within(rows[1]!).getByText('1 de 2 completadas')).toBeInTheDocument();
  });

  it('closing does not call a cancelled visit "sin completar" and says cancelling is no longer possible', async () => {
    renderScreen(<RelevamientosPage />);
    await userEvent.click(within(await table()).getByRole('button', { name: /cerrar relevamiento 2026-10/i }));
    const dialog = screen.getByRole('dialog', { name: /cerrar relevamiento 2026-10/i });
    expect(within(dialog).getByText(/1 asignación sin completar/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/ni cancelarse/i)).toBeInTheDocument();
  });
});

describe('close relevamiento', () => {
  async function askToClose() {
    renderScreen(<RelevamientosPage />);
    const t = await table();
    await userEvent.click(within(t).getByRole('button', { name: /cerrar relevamiento 2026-10/i }));
    return screen.getByRole('dialog', { name: /cerrar relevamiento 2026-10/i });
  }

  it('states the consequences and does nothing until confirmed', async () => {
    const close = vi.spyOn(api, 'closeRelevamiento');
    const dialog = await askToClose();
    expect(within(dialog).getByText(/no se podrá volver a abrir/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 asignación sin completar/i)).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(close).not.toHaveBeenCalled();
  });

  it('closes on confirm and refreshes', async () => {
    const close = vi.spyOn(api, 'closeRelevamiento').mockResolvedValue(rel('r2', '2026-10', 'CERRADO'));
    const dialog = await askToClose();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar relevamiento' }));
    await waitFor(() => expect(close).toHaveBeenCalledWith('r2'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.listRelevamientosPage).toHaveBeenCalledTimes(2);
  });

  it('shows a 409 (already closed) inside the dialog', async () => {
    vi.spyOn(api, 'closeRelevamiento').mockRejectedValue(new ApiError({ status: 409, message: 'closed' }));
    const dialog = await askToClose();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar relevamiento' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya estaba cerrado/i);
  });
});

describe('offline', () => {
  it('disables creating and closing, saying why', async () => {
    setOnline(false);
    renderScreen(<RelevamientosPage />);
    const t = await table();
    expect(screen.getByRole('button', { name: /nuevo relevamiento/i })).toBeDisabled();
    expect(within(t).getByRole('button', { name: /cerrar relevamiento 2026-10/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión\. esta acción necesita conexión/i)).toBeInTheDocument();
  });
});

void ME;
