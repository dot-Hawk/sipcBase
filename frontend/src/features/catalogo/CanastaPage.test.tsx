import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, setOnline } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { CanastaNodo, Producto } from '@/shared/api/types';
import { CanastaPage } from './CanastaPage';

const node = (codigo: string, nombre: string, nivel: number, over: Partial<CanastaNodo> = {}): CanastaNodo => ({
  codigo, nombre, nivel, padre: codigo.slice(0, 5), ponderador: 0.0123, derivado: false, estado: 'ACTIVO',
  categoria: nivel === 6 ? 'NUCLEO' : null, codigoVariedad12: nivel === 6 ? `A${codigo}` : null,
  tratamientoEspecial: nivel === 6 ? false : null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', ...over,
});
const VARIEDADES = [
  node('1111101', 'Pan francés', 6),
  node('1141101', 'Leche entera larga vida', 6, { categoria: 'REGULADO' }),
  node('1141102', 'Leche descremada', 6, { estado: 'INACTIVO', categoria: 'REGULADO' }),
];
const PRODUCTOS_NODO = [node('11111', 'Pan', 5), node('11411', 'Leche entera', 5)];
const uses = (id: string): Producto => ({
  id, nombre: 'Leche entera 1 L', categoria: 'Lácteos', unidad: 'LT', cantidadReferencia: 1, marca: null,
  codigoVariedad: '1141101', estado: 'ACTIVO', createdAt: '', updatedAt: '',
});

beforeEach(() => {
  setOnline(true);
  vi.spyOn(api, 'listCanasta').mockImplementation(async (q) => (q?.nivel === 5 ? PRODUCTOS_NODO : VARIEDADES));
  vi.spyOn(api, 'listProductosGestion').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

const table = () => screen.findByRole('table', { name: /canasta/i });
const rowOf = async (name: string) => {
  const t = await table();
  return within(t).getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.includes(name)) as HTMLElement;
};

describe('CanastaPage list', () => {
  it('shows variedad, producto, categoría and estado', async () => {
    renderScreen(<CanastaPage />);
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    const row = await rowOf('Leche entera larga vida');
    expect(within(row).getByText('1141101')).toBeInTheDocument();
    expect(await within(row).findByText('Leche entera')).toBeInTheDocument();
    expect(within(row).getByText('Regulado')).toBeInTheDocument();
    expect(within(await rowOf('Leche descremada')).getByText('Inactivo')).toBeInTheDocument();
    expect(api.listCanasta).toHaveBeenCalledWith({ nivel: 6 });
  });

  it('filters by estado and categoría on the server', async () => {
    renderScreen(<CanastaPage />);
    await table();
    const filters = screen.getByRole('search', { name: /filtrar la canasta/i });
    await userEvent.selectOptions(within(filters).getByLabelText('Estado'), 'INACTIVO');
    await waitFor(() => expect(api.listCanasta).toHaveBeenCalledWith({ nivel: 6, estado: 'INACTIVO' }));
    await userEvent.selectOptions(within(filters).getByLabelText('Categoría'), 'REGULADO');
    await waitFor(() => expect(api.listCanasta).toHaveBeenCalledWith({ nivel: 6, estado: 'INACTIVO', categoria: 'REGULADO' }));
  });

  it('searches by name, code or producto on the client', async () => {
    renderScreen(<CanastaPage />);
    await table();
    await userEvent.type(screen.getByLabelText('Buscar'), '11111');
    expect(screen.getByText('1 variedad')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    vi.mocked(api.listCanasta).mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<CanastaPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('add variedad', () => {
  async function open() {
    renderScreen(<CanastaPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /agregar variedad/i }));
    return screen.getByRole('dialog', { name: /agregar variedad/i });
  }
  async function fill(dlg: HTMLElement) {
    await userEvent.type(within(dlg).getByLabelText('Código (7 dígitos)'), '1111103');
    await userEvent.type(within(dlg).getByLabelText('Nombre'), ' Pan lactal ');
    await userEvent.type(within(dlg).getByLabelText('Producto (5 dígitos)'), '11111');
    await userEvent.selectOptions(within(dlg).getByLabelText('Categoría'), 'ESTACIONAL');
  }

  it('validates, resolves the producto name and posts', async () => {
    const create = vi.spyOn(api, 'createVariedad').mockResolvedValue(node('1111103', 'Pan lactal', 6));
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Agregar variedad' }));
    expect(within(dlg).getByText('El código tiene 7 dígitos.')).toBeInTheDocument();
    await fill(dlg);
    await waitFor(() => expect(within(dlg).getByLabelText('Producto (5 dígitos)')).toHaveAccessibleDescription(/^Pan/));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Agregar variedad' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ codigo: '1111103', nombre: 'Pan lactal', padre: '11111', categoria: 'ESTACIONAL' }),
    );
  });

  it('puts a duplicate codigo 409 on the codigo field', async () => {
    vi.spyOn(api, 'createVariedad').mockRejectedValue(new ApiError({ status: 409, message: 'A node with this codigo already exists' }));
    const dlg = await open();
    await fill(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Agregar variedad' }));
    expect(await within(dlg).findByText(/ya existe un nodo/i)).toBeInTheDocument();
  });

  it('puts the 400 about padre on the producto field', async () => {
    vi.spyOn(api, 'createVariedad').mockRejectedValue(new ApiError({ status: 400, message: 'padre must be an existing active producto' }));
    const dlg = await open();
    await fill(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Agregar variedad' }));
    expect(await within(dlg).findByText(/producto activo/i)).toBeInTheDocument();
  });
});

describe('logical removal', () => {
  async function pick(name: string, item: RegExp) {
    const row = await rowOf(name);
    await userEvent.click(within(row).getByRole('button', { name: /más acciones/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: item }));
  }

  it('explains it is a logical removal and warns about the productos that use it', async () => {
    vi.mocked(api.listProductosGestion).mockResolvedValue([uses('p1'), uses('p2')]);
    const set = vi.spyOn(api, 'setVariedadEstado').mockResolvedValue(node('1141101', 'x', 6, { estado: 'INACTIVO' }));
    renderScreen(<CanastaPage />);
    await pick('Leche entera larga vida', /quitar de la canasta/i);
    const dlg = screen.getByRole('dialog', { name: /quitar leche entera larga vida/i });
    expect(within(dlg).getByText(/no se borra/i)).toBeInTheDocument();
    expect(await within(dlg).findByText(/2 productos la usan/i)).toBeInTheDocument();
    expect(api.listProductosGestion).toHaveBeenCalledWith({ codigoVariedad: '1141101' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Quitar de la canasta' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('1141101', 'INACTIVO'));
  });

  it('brings an inactive variedad back', async () => {
    const set = vi.spyOn(api, 'setVariedadEstado').mockResolvedValue(node('1141102', 'x', 6));
    renderScreen(<CanastaPage />);
    await pick('Leche descremada', /reincorporar/i);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reincorporar a la canasta' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('1141102', 'ACTIVO'));
  });

  it('shows a 404 as a dialog error', async () => {
    vi.spyOn(api, 'setVariedadEstado').mockRejectedValue(new ApiError({ status: 404, message: 'Variedad not found' }));
    renderScreen(<CanastaPage />);
    await pick('Pan francés', /quitar de la canasta/i);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar de la canasta' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/ya no existe/i);
  });
});

describe('detail and offline', () => {
  it('reads GET /canasta/:codigo and lists the productos that use the variedad', async () => {
    vi.spyOn(api, 'getCanastaNodo').mockResolvedValue(VARIEDADES[1]!);
    vi.mocked(api.listProductosGestion).mockResolvedValue([uses('p1')]);
    renderScreen(<CanastaPage />);
    const row = await rowOf('Leche entera larga vida');
    await userEvent.click(within(row).getByRole('button', { name: /ver detalle/i }));
    const dlg = screen.getByRole('dialog', { name: /leche entera larga vida/i });
    expect(api.getCanastaNodo).toHaveBeenCalledWith('1141101');
    expect(within(dlg).getByText('A1141101')).toBeInTheDocument();
    expect(await within(dlg).findByText('Leche entera 1 L')).toBeInTheDocument();
  });

  it('disables writes offline with the reason', async () => {
    setOnline(false);
    renderScreen(<CanastaPage />);
    await table();
    expect(screen.getByRole('button', { name: /agregar variedad/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión\. esta acción necesita conexión/i)).toBeInTheDocument();
  });
});
