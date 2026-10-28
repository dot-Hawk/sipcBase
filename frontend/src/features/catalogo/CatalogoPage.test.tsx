import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints';
import { ToastProvider } from '@/shared/ui/Toast';
import { setOnline } from '@/features/gestion/testUtils';
import { CatalogoPage } from './CatalogoPage';

function Where() {
  const l = useLocation();
  return <output aria-label="ubicación">{l.pathname + l.search}</output>;
}
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/gestion/catalogo/*" element={<CatalogoPage />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setOnline(true);
  vi.spyOn(api, 'listComercios').mockResolvedValue([]);
  vi.spyOn(api, 'listProductosGestion').mockResolvedValue([]);
  vi.spyOn(api, 'listCanasta').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe('CatalogoPage', () => {
  it('redirects the bare path to comercios', async () => {
    renderAt('/gestion/catalogo');
    expect(await screen.findByRole('heading', { level: 1, name: 'Comercios' })).toBeInTheDocument();
    expect(screen.getByLabelText('ubicación')).toHaveTextContent('/gestion/catalogo/comercios');
  });

  it.each([
    ['/gestion/catalogo/productos', 'Productos'],
    ['/gestion/catalogo/canasta', 'Canasta'],
  ])('deep link %s opens its tab', async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: title })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates between tabs with links (back and reload keep the tab)', async () => {
    renderAt('/gestion/catalogo/comercios');
    await userEvent.click(await screen.findByRole('link', { name: 'Productos' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Productos' })).toBeInTheDocument();
    expect(screen.getByLabelText('ubicación')).toHaveTextContent('/gestion/catalogo/productos');
  });

  it('sends an unknown tab back to comercios', async () => {
    renderAt('/gestion/catalogo/zzz');
    expect(await screen.findByRole('heading', { level: 1, name: 'Comercios' })).toBeInTheDocument();
  });

  it('keeps the filters in the URL', async () => {
    renderAt('/gestion/catalogo/comercios?estado=INACTIVO');
    await screen.findByRole('heading', { level: 1, name: 'Comercios' });
    expect(api.listComercios).toHaveBeenCalledWith({ estado: 'INACTIVO' });
    expect(screen.getByLabelText('Estado')).toHaveValue('INACTIVO');
  });
});
