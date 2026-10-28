import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/shared/api/types';

const controller = { ready: false, listeners: new Set<() => void>(), apply: vi.fn() };
vi.mock('@/pwa/updates', () => ({
  getUpdateController: () => ({
    subscribe: (l: () => void) => {
      controller.listeners.add(l);
      return () => controller.listeners.delete(l);
    },
    getSnapshot: () => controller.ready,
    apply: controller.apply,
  }),
}));

const logout = vi.fn();
const auth: { role: Role } = { role: 'COORDINADOR' };
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    session: { token: 't', user: { id: 'u', nombre: 'Laura', apellido: 'Ríos', role: auth.role } },
    logout,
  }),
}));

import { AdminShell } from './AdminShell';

function mount(role: Role, at = '/gestion/relevamientos') {
  auth.role = role;
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/gestion" element={<AdminShell />}>
          <Route path="relevamientos" element={<h1>Pantalla relevamientos</h1>} />
          <Route path="cuenta" element={<h1>Pantalla cuenta</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  controller.ready = false;
  logout.mockClear();
  vi.restoreAllMocks();
});

describe('AdminShell', () => {
  it('shows the role, the user and only the nav of that role', () => {
    mount('COORDINADOR');
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    const links = within(nav).getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['Relevamientos', 'Asignaciones', 'Usuarios', 'Catálogo', 'Auditoría']);
    expect(screen.getByText('Coordinador')).toBeInTheDocument();
    expect(screen.getByText('Laura Ríos')).toBeInTheDocument();
  });

  it('gives DIRECCION its two sections', () => {
    mount('DIRECCION');
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Cálculos', 'Auditoría']);
  });

  it('gives AUDITOR the calculations only', () => {
    mount('AUDITOR');
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Cálculos']);
    expect(screen.getByText('Auditor')).toBeInTheDocument();
  });

  it('marks the current section and renders the page in <main>', () => {
    mount('COORDINADOR');
    expect(screen.getByRole('link', { name: 'Relevamientos' })).toHaveAttribute('aria-current', 'page');
    expect(within(screen.getByRole('main')).getByText('Pantalla relevamientos')).toBeInTheDocument();
  });

  it('shows the institutional logo in the sidebar without a badge', () => {
    const { container } = mount('COORDINADOR');
    const side = container.querySelector('#admin-sidebar') as HTMLElement;
    expect(within(side).getByRole('img', { name: 'Dirección de Estadística, Censos y Documentación' })).toBeInTheDocument();
    expect(side.querySelector('.admin__badge')).toBeNull();
  });

  it('links to the account page and logs out', async () => {
    mount('ANALISTA');
    expect(screen.getByRole('link', { name: /mi cuenta/i })).toHaveAttribute('href', '/gestion/cuenta');
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    expect(logout).toHaveBeenCalled();
  });

  it('has no outbox chip and says data is not refreshed when offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mount('SUPERVISOR');
    const banner = screen.getByText(/Sin conexión\./).closest('[role="status"]') as HTMLElement;
    expect(banner).not.toHaveTextContent(/precios y fotos/i);
    expect(screen.queryByText(/sin enviar/i)).not.toBeInTheDocument();
  });

  it('offers the update when a new version waits', async () => {
    mount('SUPERVISOR');
    controller.ready = true;
    act(() => controller.listeners.forEach((l) => l()));
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(controller.apply).toHaveBeenCalled();
  });

  it('has a menu toggle that expands the nav for narrow screens', async () => {
    mount('COORDINADOR');
    const toggle = screen.getByRole('button', { name: /menú/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  describe('desktop affordances', () => {
    it('marks the document as the management surface while mounted', () => {
      const view = mount('COORDINADOR');
      expect(document.documentElement.dataset.surface).toBe('admin');
      view.unmount();
      expect(document.documentElement.dataset.surface).toBeUndefined();
    });

    it('offers a skip link that lands on the main content', async () => {
      mount('COORDINADOR');
      const skip = screen.getByRole('link', { name: 'Saltar al contenido' });
      expect(skip).toHaveAttribute('href', '#contenido');
      await userEvent.click(skip);
      expect(screen.getByRole('main')).toHaveFocus();
    });

    it('focuses the first filter field of the screen with the "/" key', async () => {
      auth.role = 'COORDINADOR';
      render(
        <MemoryRouter initialEntries={['/gestion/relevamientos']}>
          <Routes>
            <Route path="/gestion" element={<AdminShell />}>
              <Route
                path="relevamientos"
                element={
                  <form role="search" aria-label="Filtros">
                    <label>
                      Buscar
                      <input />
                    </label>
                  </form>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
      await userEvent.keyboard('/');
      expect(screen.getByLabelText('Buscar')).toHaveFocus();
    });

    it('does not steal "/" while typing in a field', async () => {
      mount('COORDINADOR');
      const field = document.createElement('input');
      document.body.append(field);
      field.focus();
      await userEvent.keyboard('/');
      expect(field).toHaveFocus();
      expect(field.value).toBe('/');
      field.remove();
    });
  });
});
