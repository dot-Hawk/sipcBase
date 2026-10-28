import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, setOnline } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { CanastaNodo, Producto } from '@/shared/api/types';
import { ProductosPage } from './ProductosPage';

const prod = (id: string, nombre: string, over: Partial<Producto> = {}): Producto => ({
  id, nombre, categoria: 'Almacén', unidad: 'KG', cantidadReferencia: 1, marca: 'Gallo', codigoVariedad: '1112101',
  estado: 'ACTIVO', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', ...over,
});
const LIST = [
  prod('p1', 'Arroz largo fino'),
  prod('p2', 'Leche entera', { categoria: 'Lácteos', unidad: 'LT', marca: null, codigoVariedad: '1141101', cantidadReferencia: 1.5 }),
  prod('p3', 'Producto viejo', { estado: 'INACTIVO', codigoVariedad: '1141102' }),
];
const vari = (codigo: string, nombre: string, estado: CanastaNodo['estado'] = 'ACTIVO'): CanastaNodo => ({
  codigo, nombre, nivel: 6, padre: codigo.slice(0, 5), ponderador: 0.01, derivado: false, estado, categoria: 'NUCLEO',
  codigoVariedad12: null, tratamientoEspecial: false, createdAt: '', updatedAt: '',
});
const VARIEDADES = [vari('1112101', 'Arroz largo fino'), vari('1141101', 'Leche entera larga vida'), vari('1141102', 'Leche descremada', 'INACTIVO')];

beforeEach(() => {
  setOnline(true);
  vi.spyOn(api, 'listProductosGestion').mockResolvedValue(LIST);
  vi.spyOn(api, 'listCanasta').mockResolvedValue(VARIEDADES);
});
afterEach(() => vi.restoreAllMocks());

const table = () => screen.findByRole('table', { name: /productos/i });
const rowOf = async (name: string) => {
  const t = await table();
  return within(t).getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.includes(name)) as HTMLElement;
};

describe('ProductosPage list', () => {
  it('shows presentation, variedad name and estado', async () => {
    renderScreen(<ProductosPage />);
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    const row = await rowOf('Leche entera');
    expect(within(row).getByText('1,5 L')).toBeInTheDocument();
    expect(await within(row).findByText('Leche entera larga vida')).toBeInTheDocument();
    expect(within(row).getByText('1141101')).toBeInTheDocument();
    expect(within(await rowOf('Producto viejo')).getByText('Inactivo')).toBeInTheDocument();
    expect(api.listCanasta).toHaveBeenCalledWith({ nivel: 6 });
  });

  it('filters by estado, categoría and unidad on the server', async () => {
    renderScreen(<ProductosPage />);
    await table();
    const filters = screen.getByRole('search', { name: /filtrar productos/i });
    await userEvent.selectOptions(within(filters).getByLabelText('Estado'), 'ACTIVO');
    await userEvent.selectOptions(within(filters).getByLabelText('Unidad'), 'LT');
    await waitFor(() => expect(api.listProductosGestion).toHaveBeenLastCalledWith({ estado: 'ACTIVO', unidad: 'LT' }));
    await userEvent.selectOptions(within(filters).getByLabelText('Categoría'), 'Lácteos');
    await waitFor(() =>
      expect(api.listProductosGestion).toHaveBeenLastCalledWith({ estado: 'ACTIVO', unidad: 'LT', categoria: 'Lácteos' }),
    );
  });

  it('searches nombre and marca on the client', async () => {
    renderScreen(<ProductosPage />);
    await table();
    await userEvent.type(screen.getByLabelText('Buscar'), 'gallo');
    expect(screen.getByText('2 productos')).toBeInTheDocument();
  });

  it('shows empty and error states', async () => {
    vi.mocked(api.listProductosGestion).mockResolvedValueOnce([]);
    renderScreen(<ProductosPage />);
    expect(await screen.findByRole('heading', { name: /todavía no hay productos/i })).toBeInTheDocument();
  });
  it('shows an error with retry', async () => {
    vi.mocked(api.listProductosGestion).mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<ProductosPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await table();
  });
});

describe('create producto', () => {
  async function fill(dlg: HTMLElement) {
    await userEvent.type(within(dlg).getByLabelText('Nombre'), ' Fideos moñitos ');
    await userEvent.type(within(dlg).getByLabelText('Marca (opcional)'), 'Marolio');
    await userEvent.type(within(dlg).getByLabelText('Categoría'), 'Almacén');
    await userEvent.selectOptions(within(dlg).getByLabelText('Unidad'), 'G');
    await userEvent.type(within(dlg).getByLabelText('Cantidad de referencia'), '500');
    await userEvent.type(within(dlg).getByLabelText('Variedad de la canasta'), '1112101');
  }
  async function open() {
    renderScreen(<ProductosPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nuevo producto/i }));
    return screen.getByRole('dialog', { name: /nuevo producto/i });
  }

  it('validates, resolves the variedad name and creates', async () => {
    const create = vi.spyOn(api, 'createProducto').mockResolvedValue(LIST[0]!);
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear producto' }));
    expect(within(dlg).getByText('Ingrese el nombre.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await fill(dlg);
    expect(await within(dlg).findByText(/arroz largo fino · núcleo/i)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear producto' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        nombre: 'Fideos moñitos', categoria: 'Almacén', unidad: 'G', cantidadReferencia: 500, marca: 'Marolio', codigoVariedad: '1112101',
      }),
    );
  });

  it('shows the duplicate 409 (no code) as a form message and keeps the dialog', async () => {
    vi.spyOn(api, 'createProducto').mockRejectedValue(new ApiError({ status: 409, message: 'A producto with the same ...' }));
    const dlg = await open();
    await fill(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear producto' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent(/mismo nombre, marca, unidad y cantidad/i);
  });

  it('puts the 400 about an inactive variedad on that field', async () => {
    vi.spyOn(api, 'createProducto').mockRejectedValue(
      new ApiError({ status: 400, message: 'codigoVariedad must be an existing active variedad of the canasta' }),
    );
    const dlg = await open();
    await fill(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear producto' }));
    expect(await within(dlg).findByText(/variedad activa/i)).toBeInTheDocument();
  });
});

describe('edit and estado', () => {
  it('edits and sends only the change', async () => {
    const update = vi.spyOn(api, 'updateProducto').mockResolvedValue(LIST[0]!);
    renderScreen(<ProductosPage />);
    const row = await rowOf('Arroz largo fino');
    await userEvent.click(within(row).getByRole('button', { name: /editar/i }));
    const dlg = screen.getByRole('dialog', { name: /editar producto/i });
    const marca = within(dlg).getByLabelText('Marca (opcional)');
    await userEvent.clear(marca);
    await userEvent.type(marca, 'Otra');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('p1', { marca: 'Otra' }));
  });

  it('warns the marca cannot be cleared', async () => {
    renderScreen(<ProductosPage />);
    const row = await rowOf('Arroz largo fino');
    await userEvent.click(within(row).getByRole('button', { name: /editar/i }));
    const dlg = screen.getByRole('dialog');
    await userEvent.clear(within(dlg).getByLabelText('Marca (opcional)'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dlg).findByText(/no se puede quitar la marca/i)).toBeInTheDocument();
  });

  it('states what deactivating does and applies it', async () => {
    const set = vi.spyOn(api, 'setProductoEstado').mockResolvedValue({ ...LIST[0]!, estado: 'INACTIVO' });
    renderScreen(<ProductosPage />);
    const row = await rowOf('Arroz largo fino');
    await userEvent.click(within(row).getByRole('button', { name: /más acciones/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /desactivar/i }));
    const dlg = screen.getByRole('dialog', { name: /desactivar arroz largo fino/i });
    expect(within(dlg).getByText(/dejan de poder cargar precios/i)).toBeInTheDocument();
    expect(within(dlg).getByText(/precios ya cargados se conservan/i)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Desactivar producto' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('p1', 'INACTIVO'));
  });

  it('shows the detail from GET /productos/:id', async () => {
    vi.spyOn(api, 'getProducto').mockResolvedValue(LIST[0]!);
    renderScreen(<ProductosPage />);
    const row = await rowOf('Arroz largo fino');
    await userEvent.click(within(row).getByRole('button', { name: /más acciones/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /ver detalle/i }));
    expect(api.getProducto).toHaveBeenCalledWith('p1');
    expect(within(screen.getByRole('dialog')).getByText('Gallo')).toBeInTheDocument();
  });

  it('disables writes offline with the reason', async () => {
    setOnline(false);
    renderScreen(<ProductosPage />);
    await table();
    expect(screen.getByRole('button', { name: /nuevo producto/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión\. esta acción necesita conexión/i)).toBeInTheDocument();
  });
});
