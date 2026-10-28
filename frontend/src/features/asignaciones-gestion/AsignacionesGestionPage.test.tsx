import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, setOnline } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { Asignacion, Comercio, ManagedUser, Relevamiento } from '@/shared/api/types';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u-me', nombre: 'Carlos', apellido: 'Méndez', role: 'COORDINADOR' } } }),
}));

import { AsignacionesGestionPage } from './AsignacionesGestionPage';

const rel = (id: string, periodo: string, estado: Relevamiento['estado']): Relevamiento => ({
  id, periodo, estado, frecuencia: 'MENSUAL', fechaInicio: '2026-10-01T00:00:00.000Z', fechaLimite: '2026-10-30T00:00:00.000Z', createdAt: '', updatedAt: '',
});
const com = (id: string, nombre: string, estado: Comercio['estado'] = 'ACTIVO'): Comercio => ({
  id, nombre, direccion: 'x', zona: 'Centro', tipo: 'ALMACEN', estado, createdAt: '', updatedAt: '',
});
const enc = (id: string, nombre: string, estado: ManagedUser['estado'] = 'ACTIVO'): ManagedUser => ({
  id, nombre, apellido: 'Test', dni: id, legajo: id, email: `${id}@x.y`, role: 'ENCUESTADOR', estado,
});
const asig = (id: string, relevamiento: string, comercio: string, estado: Asignacion['estado'], encuestador = 'e1'): Asignacion => ({
  id, relevamiento, comercio, estado, encuestador, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z',
});

beforeEach(() => {
  setOnline(true);
  vi.spyOn(api, 'listRelevamientosPage').mockResolvedValue({ items: [rel('r2', '2026-10', 'ABIERTO'), rel('r1', '2026-09', 'CERRADO')], total: null });
  vi.spyOn(api, 'listComercios').mockResolvedValue([com('c1', 'Almacén Uno'), com('c2', 'Verdulería Dos'), com('c3', 'Kiosco Tres'), com('c4', 'Cerrado SA', 'INACTIVO')]);
  vi.spyOn(api, 'listUsersPage').mockResolvedValue({ items: [enc('e1', 'Ana'), enc('e2', 'Beto'), enc('e3', 'Cris', 'INACTIVO')], total: null });
  vi.spyOn(api, 'listAsignacionesPage').mockResolvedValue({ items: [
    asig('a1', 'r2', 'c1', 'PENDIENTE'),
    asig('a2', 'r2', 'c2', 'EN_CURSO', 'e2'),
    asig('a3', 'r1', 'c1', 'COMPLETADA'),
  ], total: null });
});
afterEach(() => vi.restoreAllMocks());

const table = () => screen.findByRole('table', { name: /asignaciones/i });

describe('AsignacionesGestionPage list', () => {
  it('shows names instead of ids, estado and only the reassign action of pending rows', async () => {
    renderScreen(<AsignacionesGestionPage />);
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    const t = await table();
    const rows = within(t).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText('Almacén Uno')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Ana Test')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Pendiente')).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: /reasignar/i })).toBeInTheDocument();
    expect(within(rows[2]!).queryByRole('button', { name: /reasignar/i })).toBeNull();
    expect(within(rows[3]!).queryByRole('button')).toBeNull();
  });

  it('filters on the server by relevamiento, encuestador, comercio and estado', async () => {
    renderScreen(<AsignacionesGestionPage />);
    await table();
    const filters = screen.getByRole('search', { name: /filtrar asignaciones/i });
    await userEvent.selectOptions(within(filters).getByLabelText('Relevamiento'), 'r2');
    await userEvent.selectOptions(within(filters).getByLabelText('Estado'), 'PENDIENTE');
    await waitFor(() => expect(api.listAsignacionesPage).toHaveBeenLastCalledWith({ relevamiento: 'r2', estado: 'PENDIENTE' }));
    await userEvent.selectOptions(within(filters).getByLabelText('Encuestador'), 'e1');
    await userEvent.selectOptions(within(filters).getByLabelText('Comercio'), 'c1');
    await waitFor(() =>
      expect(api.listAsignacionesPage).toHaveBeenLastCalledWith({ relevamiento: 'r2', estado: 'PENDIENTE', encuestador: 'e1', comercio: 'c1' }),
    );
  });

  it('distinguishes "nothing yet" from "no match for the filters"', async () => {
    vi.mocked(api.listAsignacionesPage).mockResolvedValue({ items: [], total: null });
    renderScreen(<AsignacionesGestionPage />);
    expect(await screen.findByRole('heading', { name: /todavía no hay asignaciones/i })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'COMPLETADA');
    expect(await screen.findByRole('heading', { name: /ninguna asignación coincide/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /quitar filtros/i }));
    expect(await screen.findByRole('heading', { name: /todavía no hay asignaciones/i })).toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    vi.mocked(api.listAsignacionesPage).mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<AsignacionesGestionPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await table();
  });
});

describe('create asignacion', () => {
  async function openForm() {
    renderScreen(<AsignacionesGestionPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nueva asignación/i }));
    return screen.getByRole('dialog', { name: /nueva asignación/i });
  }

  it('offers only open relevamientos, active encuestadores and active comercios', async () => {
    const dialog = await openForm();
    const options = (label: string) =>
      within(within(dialog).getByLabelText(label)).getAllByRole('option').map((o) => o.textContent);
    expect(options('Relevamiento')).toEqual(['Elija un relevamiento', '2026-10']);
    expect(options('Encuestador')).toEqual(['Elija un encuestador', 'Ana Test', 'Beto Test']);
    expect(options('Comercio')).toEqual(['Elija un comercio', 'Almacén Uno (Centro)', 'Kiosco Tres (Centro)', 'Verdulería Dos (Centro)']);
  });

  it('marks comercios already taken in the chosen relevamiento', async () => {
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText('Relevamiento'), 'r2');
    const taken = within(dialog).getByRole('option', { name: /Almacén Uno.*ya asignado/i });
    expect(taken).toBeDisabled();
    expect(within(dialog).getByRole('option', { name: /Kiosco Tres/ })).toBeEnabled();
  });

  it('creates, closes and refreshes', async () => {
    const create = vi.spyOn(api, 'createAsignacion').mockResolvedValue(asig('a9', 'r2', 'c3', 'PENDIENTE'));
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText('Relevamiento'), 'r2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Encuestador'), 'e2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Comercio'), 'c3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear asignación' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ relevamiento: 'r2', encuestador: 'e2', comercio: 'c3' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/asignación creada/i)).toBeInTheDocument();
  });

  it('requires the three choices before calling the API', async () => {
    const create = vi.spyOn(api, 'createAsignacion');
    const dialog = await openForm();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear asignación' }));
    expect(create).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Relevamiento')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Encuestador')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Comercio')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a server 409 duplicate on the comercio field', async () => {
    vi.spyOn(api, 'createAsignacion').mockRejectedValue(new ApiError({ status: 409, message: 'This comercio is already assigned in this relevamiento' }));
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText('Relevamiento'), 'r2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Encuestador'), 'e2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Comercio'), 'c3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear asignación' }));
    expect(await within(dialog).findByText(/ya está asignado/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Comercio')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('create asignacion, stable codes', () => {
  async function fillAndSubmit() {
    renderScreen(<AsignacionesGestionPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nueva asignación/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Relevamiento'), 'r2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Encuestador'), 'e2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Comercio'), 'c3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear asignación' }));
    return dialog;
  }

  it('RELEVAMIENTO_NOT_ABIERTO marks the relevamiento field, whatever the message says', async () => {
    vi.spyOn(api, 'createAsignacion').mockRejectedValue(
      new ApiError({ status: 409, message: 'texto cambiado por el servidor', code: 'RELEVAMIENTO_NOT_ABIERTO' }),
    );
    const dialog = await fillAndSubmit();
    expect(await within(dialog).findByText(/ya no está abierto/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Relevamiento')).toHaveAttribute('aria-invalid', 'true');
  });

  it('an unknown code shows the generic conflict message and keeps the dialog open', async () => {
    vi.spyOn(api, 'createAsignacion').mockRejectedValue(new ApiError({ status: 409, message: 'x', code: 'FUTURE_CODE' }));
    const dialog = await fillAndSubmit();
    expect(await within(dialog).findByText(/entra en conflicto/i)).toBeInTheDocument();
  });
});

describe('reassign asignacion', () => {
  async function askToReassign() {
    renderScreen(<AsignacionesGestionPage />);
    const t = await table();
    await userEvent.click(within(t).getByRole('button', { name: /reasignar/i }));
    return screen.getByRole('dialog', { name: /reasignar/i });
  }

  it('excludes the current encuestador, states the effect and reassigns on confirm', async () => {
    const reassign = vi.spyOn(api, 'reassignAsignacion').mockResolvedValue(asig('a1', 'r2', 'c1', 'PENDIENTE', 'e2'));
    const dialog = await askToReassign();
    const options = within(within(dialog).getByLabelText('Nuevo encuestador')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Elija un encuestador', 'Beto Test']);
    await userEvent.selectOptions(within(dialog).getByLabelText('Nuevo encuestador'), 'e2');
    expect(within(dialog).getByText(/Ana Test dejará de ver esta visita/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reasignar visita' }));
    await waitFor(() => expect(reassign).toHaveBeenCalledWith('a1', 'e2'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the dialog and explains a 409 (no longer pending)', async () => {
    vi.spyOn(api, 'reassignAsignacion').mockRejectedValue(new ApiError({ status: 409, message: 'Only a PENDIENTE asignacion can be reassigned' }));
    const dialog = await askToReassign();
    await userEvent.selectOptions(within(dialog).getByLabelText('Nuevo encuestador'), 'e2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reasignar visita' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya no está pendiente/i);
  });

  it('needs a choice', async () => {
    const reassign = vi.spyOn(api, 'reassignAsignacion');
    const dialog = await askToReassign();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reasignar visita' }));
    expect(reassign).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Nuevo encuestador')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('offline', () => {
  it('disables create, reassign and cancel with the reason', async () => {
    setOnline(false);
    renderScreen(<AsignacionesGestionPage />);
    const t = await table();
    expect(screen.getByRole('button', { name: /nueva asignación/i })).toBeDisabled();
    expect(within(t).getByRole('button', { name: /reasignar/i })).toBeDisabled();
    for (const b of within(t).getAllByRole('button', { name: /cancelar asignación/i })) expect(b).toBeDisabled();
    expect(screen.getByText(/sin conexión\. esta acción necesita conexión/i)).toBeInTheDocument();
  });
});

describe('cancel asignacion', () => {
  beforeEach(() => {
    vi.mocked(api.listAsignacionesPage).mockResolvedValue({ items: [
      asig('a1', 'r2', 'c1', 'PENDIENTE'),
      asig('a2', 'r2', 'c2', 'EN_CURSO', 'e2'),
      asig('a3', 'r1', 'c1', 'COMPLETADA'),
      asig('a4', 'r2', 'c3', 'CANCELADA'),
      asig('a5', 'r1', 'c2', 'PENDIENTE'),
    ], total: null });
  });

  async function askToCancel(name: RegExp) {
    renderScreen(<AsignacionesGestionPage />);
    const t = await table();
    const enabled = within(t).getAllByRole('button', { name }).filter((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled).toHaveLength(1);
    await userEvent.click(enabled[0]!);
    return screen.getByRole('dialog', { name: /cancelar asignación/i });
  }

  it('offers cancel only for PENDIENTE and EN_CURSO, disabled with the reason when the relevamiento is closed', async () => {
    renderScreen(<AsignacionesGestionPage />);
    const t = await table();
    const buttons = within(t).getAllByRole('button', { name: /cancelar asignación/i });
    expect(buttons).toHaveLength(3);
    const rows = within(t).getAllByRole('row');
    const a5 = rows[5]!;
    expect(within(a5).getByRole('button', { name: /cancelar asignación/i })).toBeDisabled();
    expect(within(a5).getByText(/relevamiento ya está cerrado/i)).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: /cancelar asignación/i })).toBeEnabled();
    expect(within(rows[3]!).queryByRole('button')).toBeNull();
    expect(within(rows[4]!).queryByRole('button')).toBeNull();
  });

  it('shows a CANCELADA row with a chip that carries text, not only color, and no actions', async () => {
    renderScreen(<AsignacionesGestionPage />);
    const rows = within(await table()).getAllByRole('row');
    expect(within(rows[4]!).getByText('Cancelada')).toBeInTheDocument();
    expect(within(rows[4]!).queryByRole('button')).toBeNull();
  });

  it('offers CANCELADA in the estado filter and filters on the server', async () => {
    renderScreen(<AsignacionesGestionPage />);
    await table();
    const filters = screen.getByRole('search', { name: /filtrar asignaciones/i });
    await userEvent.selectOptions(within(filters).getByLabelText('Estado'), 'CANCELADA');
    await waitFor(() => expect(api.listAsignacionesPage).toHaveBeenLastCalledWith({ estado: 'CANCELADA' }));
  });

  it('states the consequences and does nothing until confirmed', async () => {
    const cancel = vi.spyOn(api, 'cancelAsignacion');
    const dialog = await askToCancel(/cancelar asignación.*almacén uno/i);
    expect(within(dialog).getByText(/precios que ya cargó se conservan/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ana Test dejará de ver esta visita/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/podrá asignarse de nuevo/i)).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('warns that an EN_CURSO visit may already have prices', async () => {
    const dialog = await askToCancel(/cancelar asignación.*verdulería dos/i);
    expect(within(dialog).getByText(/ya está en curso/i)).toBeInTheDocument();
  });

  it('cancels on confirm, closes and refreshes', async () => {
    const cancel = vi.spyOn(api, 'cancelAsignacion').mockResolvedValue(asig('a1', 'r2', 'c1', 'CANCELADA'));
    const dialog = await askToCancel(/cancelar asignación.*almacén uno/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar asignación' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/visita cancelada/i)).toBeInTheDocument();
    expect(api.listAsignacionesPage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['ASIGNACION_NOT_CANCELABLE', /completada o cancelada/i],
    ['RELEVAMIENTO_NOT_ABIERTO', /ya no está abierto/i],
    ['ASIGNACION_CONCURRENT_MODIFICATION', /otra persona/i],
  ])('maps the 409 code %s inside the dialog', async (code, copy) => {
    vi.spyOn(api, 'cancelAsignacion').mockRejectedValue(new ApiError({ status: 409, message: 'texto del servidor', code }));
    const dialog = await askToCancel(/cancelar asignación.*almacén uno/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar asignación' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(copy);
  });

  it('keeps working against a backend that answers a 409 without code', async () => {
    vi.spyOn(api, 'cancelAsignacion').mockRejectedValue(new ApiError({ status: 409, message: 'A COMPLETADA asignacion cannot be cancelled' }));
    const dialog = await askToCancel(/cancelar asignación.*almacén uno/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar asignación' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/completada o cancelada/i);
  });

  it('explains a 404', async () => {
    vi.spyOn(api, 'cancelAsignacion').mockRejectedValue(new ApiError({ status: 404, message: 'Asignacion not found' }));
    const dialog = await askToCancel(/cancelar asignación.*almacén uno/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar asignación' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya no existe/i);
  });

  it('a cancelled comercio is not shown as already assigned in the create form', async () => {
    renderScreen(<AsignacionesGestionPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nueva asignación/i }));
    const dialog = screen.getByRole('dialog', { name: /nueva asignación/i });
    await userEvent.selectOptions(within(dialog).getByLabelText('Relevamiento'), 'r2');
    expect(within(dialog).getByRole('option', { name: /Kiosco Tres/ })).toBeEnabled();
    expect(within(dialog).getByRole('option', { name: /Almacén Uno.*ya asignado/i })).toBeDisabled();
  });
});
