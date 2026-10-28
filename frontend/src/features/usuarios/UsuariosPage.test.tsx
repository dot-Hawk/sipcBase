import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, setOnline } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { ManagedUser, Role } from '@/shared/api/types';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u-me', nombre: 'Carlos', apellido: 'Méndez', role: 'COORDINADOR' } } }),
}));

import { UsuariosPage } from './UsuariosPage';

const user = (id: string, nombre: string, apellido: string, role: Role, estado: ManagedUser['estado'] = 'ACTIVO'): ManagedUser => ({
  id, nombre, apellido, role, estado, dni: `dni-${id}`, legajo: `leg-${id}`, email: `${nombre.toLowerCase()}@sipc.test`, ultimoAcceso: '2026-10-14T10:00:00.000Z',
});

const LIST = [
  user('u-me', 'Carlos', 'Méndez', 'COORDINADOR'),
  user('e1', 'Ana', 'Paz', 'ENCUESTADOR'),
  user('s1', 'Laura', 'Ríos', 'SUPERVISOR', 'LICENCIA'),
];

beforeEach(() => {
  setOnline(true);
  vi.spyOn(api, 'listUsersPage').mockResolvedValue({ items: LIST, total: null });
  vi.spyOn(api, 'listAsignacionesPage').mockResolvedValue({ items: [], total: null });
});
afterEach(() => vi.restoreAllMocks());

const table = () => screen.findByRole('table', { name: /usuarios/i });
const rowOf = async (name: string) => {
  const t = await table();
  return within(t)
    .getAllByRole('row')
    .find((r) => r.querySelector('td')?.textContent?.includes(name)) as HTMLElement;
};

describe('UsuariosPage list', () => {
  it('shows loading, then people with role and estado', async () => {
    renderScreen(<UsuariosPage />);
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    const row = await rowOf('Ana Paz');
    expect(within(row).getByText('Encuestador')).toBeInTheDocument();
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    expect(within(row).getByText(/dni-e1/)).toBeInTheDocument();
    const lic = await rowOf('Laura Ríos');
    expect(within(lic).getByText('Licencia')).toBeInTheDocument();
  });

  it('requests page 1 with the API page size and no total', async () => {
    renderScreen(<UsuariosPage />);
    await table();
    expect(api.listUsersPage).toHaveBeenCalledWith({ page: 1, limit: 50 });
    // A single short page shows no pager at all.
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });

  it('paginates when a full page comes back', async () => {
    const full = Array.from({ length: 50 }, (_, i) => user(`x${i}`, `N${i}`, `A${i}`, 'ANALISTA'));
    vi.mocked(api.listUsersPage).mockResolvedValueOnce({ items: full, total: null });
    renderScreen(<UsuariosPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(api.listUsersPage).toHaveBeenLastCalledWith({ page: 2, limit: 50 }));
    expect(await screen.findByText('Página 2')).toBeInTheDocument();
  });

  it('uses X-Total-Count: "Mostrando X–Y de N" and no next page at the end', async () => {
    const full = Array.from({ length: 50 }, (_, i) => user(`x${i}`, `N${i}`, `A${i}`, 'ANALISTA'));
    vi.mocked(api.listUsersPage).mockResolvedValue({ items: full, total: 100 });
    renderScreen(<UsuariosPage />);
    await table();
    expect(screen.getByText('Mostrando 1–50 de 100')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 51–100 de 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('filters by role and estado and goes back to page 1', async () => {
    renderScreen(<UsuariosPage />);
    await table();
    const filters = screen.getByRole('search', { name: /filtrar usuarios/i });
    await userEvent.selectOptions(within(filters).getByLabelText('Rol'), 'ENCUESTADOR');
    await userEvent.selectOptions(within(filters).getByLabelText('Estado'), 'LICENCIA');
    await waitFor(() =>
      expect(api.listUsersPage).toHaveBeenLastCalledWith({ role: 'ENCUESTADOR', estado: 'LICENCIA', page: 1, limit: 50 }),
    );
  });

  it('shows the empty state, and a different one under filters', async () => {
    vi.mocked(api.listUsersPage).mockResolvedValue({ items: [], total: null });
    renderScreen(<UsuariosPage />);
    expect(await screen.findByRole('heading', { name: /todavía no hay usuarios/i })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'DIRECCION');
    expect(await screen.findByRole('heading', { name: /ningún usuario coincide/i })).toBeInTheDocument();
  });

  it('offers AUDITOR in the role filter and filters by it', async () => {
    renderScreen(<UsuariosPage />);
    await table();
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'AUDITOR');
    await waitFor(() => expect(api.listUsersPage).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'AUDITOR' })));
  });

  it('shows an error with retry', async () => {
    vi.mocked(api.listUsersPage).mockRejectedValueOnce(new ApiError({ status: 500, message: 'x' }));
    renderScreen(<UsuariosPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await table();
  });

  it('explains a 403 from the API instead of showing a table', async () => {
    vi.mocked(api.listUsersPage).mockRejectedValue(new ApiError({ status: 403, message: 'no' }));
    renderScreen(<UsuariosPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/permiso/i);
  });
});

describe('create user', () => {
  async function openForm() {
    renderScreen(<UsuariosPage />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: /nuevo usuario/i }));
    return screen.getByRole('dialog', { name: /nuevo usuario/i });
  }
  it('offers Auditor as a role of the new user', async () => {
    const dialog = await openForm();
    expect(within(dialog).getByRole('option', { name: 'Auditor' })).toHaveValue('AUDITOR');
  });
  async function fill(dialog: HTMLElement) {
    const u = userEvent.setup();
    await u.type(within(dialog).getByLabelText('Nombre'), 'Juana');
    await u.type(within(dialog).getByLabelText('Apellido'), 'Lopez');
    await u.type(within(dialog).getByLabelText('DNI'), '30999888');
    await u.type(within(dialog).getByLabelText('Legajo'), 'ENC-77');
    await u.type(within(dialog).getByLabelText('Correo'), 'Juana@SIPC.test');
    await u.selectOptions(within(dialog).getByLabelText('Rol'), 'ANALISTA');
    await u.type(within(dialog).getByLabelText('Contraseña inicial'), 'password-1');
  }

  it('creates the user and refreshes the list', async () => {
    const create = vi.spyOn(api, 'createUser').mockResolvedValue(user('n1', 'Juana', 'Lopez', 'ANALISTA'));
    const dialog = await openForm();
    await fill(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        nombre: 'Juana', apellido: 'Lopez', dni: '30999888', legajo: 'ENC-77', email: 'Juana@SIPC.test', role: 'ANALISTA', password: 'password-1',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/usuario juana lopez creado/i)).toBeInTheDocument();
    expect(api.listUsersPage).toHaveBeenCalledTimes(2);
  });

  it('validates on the client before calling the API', async () => {
    const create = vi.spyOn(api, 'createUser');
    const dialog = await openForm();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect(create).not.toHaveBeenCalled();
    for (const l of ['Nombre', 'Apellido', 'DNI', 'Legajo', 'Correo', 'Contraseña inicial']) {
      expect(within(dialog).getByLabelText(l)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(within(dialog).getByLabelText('Nombre')).toHaveFocus();
  });

  it('maps server field errors inline', async () => {
    vi.spyOn(api, 'createUser').mockRejectedValue(
      new ApiError({ status: 400, message: 'x', errors: [{ field: 'email', message: 'email must be a valid email address' }] }),
    );
    const dialog = await openForm();
    await fill(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByText(/correo válido/i)).toBeInTheDocument();
  });

  it('says that dni, legajo or correo is taken on a 409', async () => {
    vi.spyOn(api, 'createUser').mockRejectedValue(new ApiError({ status: 409, message: 'dup' }));
    const dialog = await openForm();
    await fill(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/DNI, el legajo o el correo/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('USER_DUPLICATE: puts the collided dni and email on their own fields', async () => {
    vi.spyOn(api, 'createUser').mockRejectedValue(
      new ApiError({
        status: 409,
        message: 'A user with this dni, legajo or email already exists',
        code: 'USER_DUPLICATE',
        errors: [
          { field: 'dni', message: 'A user with this dni already exists' },
          { field: 'email', message: 'A user with this email already exists' },
        ],
      }),
    );
    const dialog = await openForm();
    await fill(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect(await within(dialog).findByText('Ya existe un usuario con este DNI.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('DNI')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText(/correo/i)).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Legajo')).not.toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('USER_DUPLICATE: with an empty errors[] names the three fields at form level', async () => {
    vi.spyOn(api, 'createUser').mockRejectedValue(
      new ApiError({ status: 409, message: 'dup', code: 'USER_DUPLICATE', errors: [] }),
    );
    const dialog = await openForm();
    await fill(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/DNI, el legajo o el correo/i);
  });
});

describe('edit user', () => {
  async function openEdit(name: string) {
    const row = await rowOf(name);
    await userEvent.click(within(row).getByRole('button', { name: /editar/i }));
    return screen.getByRole('dialog', { name: /editar usuario/i });
  }

  it('prefills, and sends only the changed fields', async () => {
    const update = vi.spyOn(api, 'updateUser').mockResolvedValue(LIST[1]!);
    renderScreen(<UsuariosPage />);
    const dialog = await openEdit('Ana Paz');
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Ana');
    expect(within(dialog).queryByLabelText(/contraseña/i)).toBeNull();
    await userEvent.clear(within(dialog).getByLabelText('Legajo'));
    await userEvent.type(within(dialog).getByLabelText('Legajo'), 'NUEVO-1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('e1', { legajo: 'NUEVO-1' }));
  });

  it('closes without a request when nothing changed', async () => {
    const update = vi.spyOn(api, 'updateUser');
    renderScreen(<UsuariosPage />);
    const dialog = await openEdit('Ana Paz');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(update).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not let a coordinator change their own role', async () => {
    renderScreen(<UsuariosPage />);
    const dialog = await openEdit('Carlos Méndez');
    expect(within(dialog).getByLabelText('Rol')).toBeDisabled();
    expect(within(dialog).getByText(/no puede cambiar su propio rol/i)).toBeInTheDocument();
  });

  it('shows a 409 duplicate', async () => {
    vi.spyOn(api, 'updateUser').mockRejectedValue(new ApiError({ status: 409, message: 'dup' }));
    renderScreen(<UsuariosPage />);
    const dialog = await openEdit('Ana Paz');
    await userEvent.clear(within(dialog).getByLabelText('DNI'));
    await userEvent.type(within(dialog).getByLabelText('DNI'), '1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/DNI, el legajo o el correo/i);
  });
});

describe('change estado', () => {
  async function openEstado(name: string) {
    const row = await rowOf(name);
    await userEvent.click(within(row).getByRole('button', { name: /más acciones/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /cambiar estado/i }));
    return screen.getByRole('dialog', { name: /cambiar estado/i });
  }

  it('states the consequences of deactivating and applies on confirm', async () => {
    const setEstado = vi.spyOn(api, 'setUserEstado').mockResolvedValue({ ...LIST[1]!, estado: 'INACTIVO' });
    renderScreen(<UsuariosPage />);
    const dialog = await openEstado('Ana Paz');
    expect(within(dialog).getByRole('button', { name: 'Aplicar estado' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('radio', { name: /inactivo/i }));
    expect(within(dialog).getByText(/no podrá ingresar/i)).toBeInTheDocument();
    expect(setEstado).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar estado' }));
    await waitFor(() => expect(setEstado).toHaveBeenCalledWith('e1', 'INACTIVO'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('warns about unfinished visits of an encuestador', async () => {
    vi.mocked(api.listAsignacionesPage).mockResolvedValue({ items: [
      { id: 'a', relevamiento: 'r', comercio: 'c', encuestador: 'e1', estado: 'PENDIENTE', createdAt: '', updatedAt: '' },
      { id: 'b', relevamiento: 'r', comercio: 'd', encuestador: 'e1', estado: 'EN_CURSO', createdAt: '', updatedAt: '' },
    ], total: null });
    renderScreen(<UsuariosPage />);
    const dialog = await openEstado('Ana Paz');
    await userEvent.click(within(dialog).getByRole('radio', { name: /licencia/i }));
    expect(await within(dialog).findByText(/1 visita pendiente y 1 en curso/i)).toBeInTheDocument();
  });

  it('is not available on your own account', async () => {
    renderScreen(<UsuariosPage />);
    const row = await rowOf('Carlos Méndez');
    await userEvent.click(within(row).getByRole('button', { name: /más acciones/i }));
    expect(screen.getByRole('menuitem', { name: /cambiar estado/i })).toBeDisabled();
    expect(screen.getByText(/no puede cambiar su propio estado/i)).toBeInTheDocument();
  });

  it('explains a 403 on the dialog', async () => {
    vi.spyOn(api, 'setUserEstado').mockRejectedValue(new ApiError({ status: 403, message: 'self' }));
    renderScreen(<UsuariosPage />);
    const dialog = await openEstado('Ana Paz');
    await userEvent.click(within(dialog).getByRole('radio', { name: /inactivo/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar estado' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/permiso/i);
  });
});

describe('reset password', () => {
  async function openReset(name: string) {
    const row = await rowOf(name);
    await userEvent.click(within(row).getByRole('button', { name: /más acciones/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /restablecer contraseña/i }));
    return screen.getByRole('dialog', { name: /restablecer contraseña/i });
  }

  it('states what happens, validates, and sends only the password', async () => {
    const reset = vi.spyOn(api, 'resetUserPassword').mockResolvedValue(undefined);
    renderScreen(<UsuariosPage />);
    const dialog = await openReset('Ana Paz');
    expect(within(dialog).getByText(/dejará de funcionar/i)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Nueva contraseña'), 'short');
    await userEvent.type(within(dialog).getByLabelText('Repetir contraseña'), 'other');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restablecer contraseña' }));
    expect(reset).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Nueva contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Repetir contraseña')).toHaveAttribute('aria-invalid', 'true');

    await userEvent.clear(within(dialog).getByLabelText('Nueva contraseña'));
    await userEvent.clear(within(dialog).getByLabelText('Repetir contraseña'));
    await userEvent.type(within(dialog).getByLabelText('Nueva contraseña'), 'brand-new-pass');
    await userEvent.type(within(dialog).getByLabelText('Repetir contraseña'), 'brand-new-pass');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restablecer contraseña' }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith('e1', 'brand-new-pass'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/contraseña de ana paz restablecida/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('brand-new-pass');
  });

  it('masks the fields and can reveal them', async () => {
    renderScreen(<UsuariosPage />);
    const dialog = await openReset('Ana Paz');
    const field = within(dialog).getByLabelText('Nueva contraseña');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'new-password');
    await userEvent.click(within(dialog).getByRole('button', { name: /mostrar contraseñas/i }));
    expect(field).toHaveAttribute('type', 'text');
  });

  it('maps a server 400 to the password field and a 404 to the dialog', async () => {
    vi.spyOn(api, 'resetUserPassword').mockRejectedValueOnce(
      new ApiError({ status: 400, message: 'x', errors: [{ field: 'password', message: 'too short' }] }),
    );
    renderScreen(<UsuariosPage />);
    const dialog = await openReset('Ana Paz');
    await userEvent.type(within(dialog).getByLabelText('Nueva contraseña'), 'brand-new-pass');
    await userEvent.type(within(dialog).getByLabelText('Repetir contraseña'), 'brand-new-pass');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restablecer contraseña' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Nueva contraseña')).toHaveAttribute('aria-invalid', 'true'));

    vi.spyOn(api, 'resetUserPassword').mockRejectedValueOnce(new ApiError({ status: 404, message: 'nf' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restablecer contraseña' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya no existe/i);
  });
});

describe('offline', () => {
  it('disables every write with the reason', async () => {
    setOnline(false);
    renderScreen(<UsuariosPage />);
    const row = await rowOf('Ana Paz');
    expect(screen.getByRole('button', { name: /nuevo usuario/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: /editar/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: /más acciones/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión\. esta acción necesita conexión/i)).toBeInTheDocument();
  });
});
