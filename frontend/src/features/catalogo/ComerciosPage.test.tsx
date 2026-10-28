import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, setOnline } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { Asignacion, Comercio } from '@/shared/api/types';
import { ComerciosPage } from './ComerciosPage';

const com = (id: string, nombre: string, zona: string, tipo: Comercio['tipo'] = 'ALMACEN', estado: Comercio['estado'] = 'ACTIVO'): Comercio => ({
  id, nombre, direccion: `Calle ${id} 100`, zona, tipo, estado, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
});
const LIST = [
  com('c1', 'Almacén Don Julio', 'Centro'),
  com('c2', 'Verdulería La Esquina', 'Villa del Carmen', 'VERDULERIA'),
  com('c3', 'Almacén Cerrado', 'Centro', 'ALMACEN', 'INACTIVO'),
];
const asig = (id: string, estado: Asignacion['estado']): Asignacion => ({
  id, relevamiento: 'r', encuestador: 'e', comercio: 'c1', estado, createdAt: '', updatedAt: '',
});

beforeEach(() => {
  setOnline(true);
  vi.spyOn(api, 'listComercios').mockResolvedValue(LIST);
  vi.spyOn(api, 'listAsignacionesPage').mockResolvedValue({ items: [], total: 0 });
});
afterEach(() => vi.restoreAllMocks());

const table = () => screen.findByRole('table', { name: /comercios/i });
const rowOf = async (name: string) => {
  const t = await table();
  return within(t).getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.includes(name)) as HTMLElement;
};

describe('ComerciosPage list', () => {
  it('shows loading, then the comercios with tipo, zona and estado', async () => {
    renderScreen(<ComerciosPage />);
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    const row = await rowOf('Almacén Don Julio');
    expect(within(row).getByText('Centro')).toBeInTheDocument();
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    expect(within(await rowOf('Almacén Cerrado')).getByText('Inactivo')).toBeInTheDocument();
  });

  it('shows the total and sends only filters the backend exposes', async () => {
    renderScreen(<ComerciosPage />);
    await table();
    expect(screen.getByText('3 comercios')).toBeInTheDocument();
    const filters = screen.getByRole('search', { name: /filtrar comercios/i });
    await userEvent.selectOptions(within(filters).getByLabelText('Estado'), 'INACTIVO');
    await waitFor(() => expect(api.listComercios).toHaveBeenLastCalledWith({ estado: 'INACTIVO' }));
    await userEvent.selectOptions(within(filters).getByLabelText('Tipo'), 'ALMACEN');
    await waitFor(() => expect(api.listComercios).toHaveBeenLastCalledWith({ estado: 'INACTIVO', tipo: 'ALMACEN' }));
  });

  it('searches nombre, dirección and zona on the client, ignoring accents', async () => {
    renderScreen(<ComerciosPage />);
    await table();
    await userEvent.type(screen.getByLabelText('Buscar'), 'villa');
    expect(screen.queryAllByText('Almacén Don Julio')).toHaveLength(0);
    expect(screen.getAllByText('Verdulería La Esquina').length).toBeGreaterThan(0);
    expect(screen.getByText('1 comercio')).toBeInTheDocument();
  });

  it('shows the empty state, and a different one under filters', async () => {
    vi.mocked(api.listComercios).mockResolvedValue([]);
    renderScreen(<ComerciosPage />);
    expect(await screen.findByRole('heading', { name: /todavía no hay comercios/i })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar'), 'zzz');
    expect(await screen.findByRole('heading', { name: /ningún comercio coincide/i })).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    vi.mocked(api.listComercios).mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<ComerciosPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await table();
  });

  it('pages on the client with "Mostrando X–Y de N"', async () => {
    const many = Array.from({ length: 30 }, (_, i) => com(`m${i}`, `Comercio ${String(i).padStart(2, '0')}`, 'Norte'));
    vi.mocked(api.listComercios).mockResolvedValue(many);
    renderScreen(<ComerciosPage />);
    await table();
    expect(screen.getByText('Mostrando 1–25 de 30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 26–30 de 30')).toBeInTheDocument();
  });
});

describe('create and edit comercio', () => {
  it('validates, creates and closes', async () => {
    const create = vi.spyOn(api, 'createComercio').mockResolvedValue(com('n', 'Nuevo', 'Sur'));
    renderScreen(<ComerciosPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nuevo comercio/i }));
    const dlg = screen.getByRole('dialog', { name: /nuevo comercio/i });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear comercio' }));
    expect(within(dlg).getByText('Ingrese el nombre.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await userEvent.type(within(dlg).getByLabelText('Nombre'), ' Kiosco Sur ');
    await userEvent.type(within(dlg).getByLabelText('Dirección'), 'Sarmiento 10');
    await userEvent.type(within(dlg).getByLabelText('Zona'), 'Sur');
    await userEvent.selectOptions(within(dlg).getByLabelText('Tipo'), 'OTRO');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear comercio' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ nombre: 'Kiosco Sur', direccion: 'Sarmiento 10', zona: 'Sur', tipo: 'OTRO' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('maps a 400 errors[] onto the fields', async () => {
    vi.spyOn(api, 'createComercio').mockRejectedValue(
      new ApiError({ status: 400, message: 'x', errors: [{ field: 'zona', message: 'zona must be a non-empty string' }] }),
    );
    renderScreen(<ComerciosPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nuevo comercio/i }));
    const dlg = screen.getByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'A');
    await userEvent.type(within(dlg).getByLabelText('Dirección'), 'B');
    await userEvent.type(within(dlg).getByLabelText('Zona'), 'C');
    await userEvent.selectOptions(within(dlg).getByLabelText('Tipo'), 'OTRO');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear comercio' }));
    expect(await within(dlg).findByText('Ingrese la zona.')).toBeInTheDocument();
  });

  it('edits and sends only the changed field', async () => {
    const update = vi.spyOn(api, 'updateComercio').mockResolvedValue(LIST[0]!);
    renderScreen(<ComerciosPage />);
    const row = await rowOf('Almacén Don Julio');
    await userEvent.click(within(row).getByRole('button', { name: /editar/i }));
    const dlg = screen.getByRole('dialog', { name: /editar comercio/i });
    const zona = within(dlg).getByLabelText('Zona');
    await userEvent.clear(zona);
    await userEvent.type(zona, 'Norte');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', { zona: 'Norte' }));
  });
});

describe('estado of a comercio', () => {
  async function openEstado(name: string) {
    const row = await rowOf(name);
    await userEvent.click(within(row).getByRole('button', { name: /más acciones/i }));
    return row;
  }

  it('does not warn about cancelled visits when deactivating', async () => {
    vi.mocked(api.listAsignacionesPage).mockResolvedValue({ items: [asig('a1', 'CANCELADA')], total: 1 });
    renderScreen(<ComerciosPage />);
    await openEstado('Almacén Don Julio');
    await userEvent.click(screen.getByRole('menuitem', { name: /desactivar/i }));
    const dlg = screen.getByRole('dialog', { name: /desactivar almacén don julio/i });
    await waitFor(() => expect(api.listAsignacionesPage).toHaveBeenCalled());
    expect(within(dlg).queryByText(/visita pendiente|visitas pendientes/i)).toBeNull();
  });

  it('states the consequences with the open visits and deactivates', async () => {
    vi.mocked(api.listAsignacionesPage).mockResolvedValue({ items: [asig('a1', 'PENDIENTE'), asig('a2', 'EN_CURSO')], total: 2 });
    const set = vi.spyOn(api, 'setComercioEstado').mockResolvedValue({ ...LIST[0]!, estado: 'INACTIVO' });
    renderScreen(<ComerciosPage />);
    await openEstado('Almacén Don Julio');
    await userEvent.click(screen.getByRole('menuitem', { name: /desactivar/i }));
    const dlg = screen.getByRole('dialog', { name: /desactivar almacén don julio/i });
    expect(await within(dlg).findByText(/1 visita pendiente y 1 en curso/i)).toBeInTheDocument();
    expect(within(dlg).getByText(/no se podrá asignar a nuevos relevamientos/i)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Desactivar comercio' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('c1', 'INACTIVO'));
  });

  it('reactivates an inactive comercio', async () => {
    const set = vi.spyOn(api, 'setComercioEstado').mockResolvedValue({ ...LIST[2]!, estado: 'ACTIVO' });
    renderScreen(<ComerciosPage />);
    await openEstado('Almacén Cerrado');
    await userEvent.click(screen.getByRole('menuitem', { name: /reactivar/i }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivar comercio' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('c3', 'ACTIVO'));
  });

  it('shows the detail the API returns', async () => {
    vi.spyOn(api, 'getComercio').mockResolvedValue(LIST[0]!);
    renderScreen(<ComerciosPage />);
    await openEstado('Almacén Don Julio');
    await userEvent.click(screen.getByRole('menuitem', { name: /ver detalle/i }));
    const dlg = screen.getByRole('dialog', { name: /almacén don julio/i });
    expect(within(dlg).getByText('Calle c1 100')).toBeInTheDocument();
    expect(api.getComercio).toHaveBeenCalledWith('c1');
  });
});

describe('offline', () => {
  it('disables every write with the reason and queues nothing', async () => {
    setOnline(false);
    renderScreen(<ComerciosPage />);
    const row = await rowOf('Almacén Don Julio');
    expect(screen.getByRole('button', { name: /nuevo comercio/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: /editar/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión\. esta acción necesita conexión/i)).toBeInTheDocument();
  });
});
