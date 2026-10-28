import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const changePassword = vi.fn();
vi.mock('@/shared/api/endpoints', () => ({
  api: { me: vi.fn().mockResolvedValue(null), login: vi.fn(), changePassword: (...a: unknown[]) => changePassword(...a) },
}));

import { AuthProvider } from '@/features/auth/AuthProvider';
import { createOutbox, type Outbox } from '@/features/outbox/engine';
import { OutboxContextProvider } from '@/features/outbox/OutboxProvider';
import { createMemoryStore } from '@/features/outbox/store';
import { ToastProvider } from '@/shared/ui/Toast';
import { CuentaPage } from './CuentaPage';

function jwt(exp: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ exp })}.sig`;
}

beforeEach(() => {
  changePassword.mockReset().mockResolvedValue(undefined);
  localStorage.setItem(
    'sipc.session',
    JSON.stringify({
      token: jwt(Math.floor(Date.now() / 1000) + 3600),
      user: {
        id: 'u1', nombre: 'Ana', apellido: 'Paz', role: 'ENCUESTADOR', legajo: 'DEV-1',
        email: 'ana@sipc.local', ultimoAcceso: '2026-10-01T15:30:00.000Z',
      },
    }),
  );
});

function mount(outbox: Outbox | null = null) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <OutboxContextProvider outbox={outbox}>
          <ToastProvider>
            <MemoryRouter>
              <CuentaPage />
            </MemoryRouter>
          </ToastProvider>
        </OutboxContextProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('CuentaPage', () => {
  it('names the institution next to the official logo, without a badge', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <OutboxContextProvider outbox={null}>
            <ToastProvider>
              <MemoryRouter>
                <CuentaPage />
              </MemoryRouter>
            </ToastProvider>
          </OutboxContextProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Dirección de Estadística y Censos – Formosa')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dirección de Estadística, Censos y Documentación' })).toBeInTheDocument();
    expect(container.querySelector('.cuenta__org-badge')).toBeNull();
  });

  it('shows legajo, email and last access', () => {
    mount();
    expect(screen.getByText('DEV-1')).toBeInTheDocument();
    expect(screen.getByText('ana@sipc.local')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('changes the password and shows the success toast', async () => {
    mount();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await u.type(screen.getByLabelText('Contraseña actual'), 'old-password');
    await u.type(screen.getByLabelText('Nueva contraseña'), 'new-password');
    await u.type(screen.getByLabelText('Repetir nueva contraseña'), 'new-password');
    await u.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Contraseña actualizada')).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith('old-password', 'new-password');
    // session stays: logout button still there
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('asks for confirmation before closing the session', async () => {
    mount();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cerrar sesión' });
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(dialog).not.toBeInTheDocument();
    expect(localStorage.getItem('sipc.session')).not.toBeNull();
    await u.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Cerrar sesión' })).getByRole('button', {
      name: 'Cerrar sesión',
    });
    await u.click(confirm);
    expect(localStorage.getItem('sipc.session')).toBeNull();
  });
});

async function queued(): Promise<Outbox> {
  const outbox = createOutbox({
    store: createMemoryStore(), userId: 'u1', savePrice: vi.fn(), uploadPhoto: vi.fn(), listAdjuntos: vi.fn(),
    findPrecio: vi.fn(), hash: async () => 'h', now: () => 1, isOnline: () => false,
  });
  await outbox.load();
  await outbox.enqueuePrice({
    asignacionId: 'a', relevamiento: 'r', comercio: 'c', producto: 'p1', valor: 1, oferta: false, observacion: '', precio: null,
  });
  await outbox.enqueuePhoto({ asignacionId: 'a', relevamiento: 'r', comercio: 'c', producto: 'p1', blob: new Blob(['x']), precioId: null });
  return outbox;
}

describe('CuentaPage logout with unsent work', () => {
  it('warns that unsent prices and photos will be lost and lets the surveyor keep working', async () => {
    mount(await queued());
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/1 precio y 1 foto/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/se perderán/i)).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(localStorage.getItem('sipc.session')).not.toBeNull();
  });

  it('discards the outbox only when the surveyor explicitly confirms', async () => {
    const outbox = await queued();
    mount(outbox);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Descartar y cerrar sesión' }));
    expect(outbox.getSnapshot().items).toHaveLength(0);
    expect(localStorage.getItem('sipc.session')).toBeNull();
  });

  it('keeps the original wording when nothing is queued', async () => {
    mount();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/se conservan/i);
  });
});

describe('CuentaPage for management roles', () => {
  beforeEach(() => {
    const s = JSON.parse(localStorage.getItem('sipc.session') as string);
    s.user.role = 'COORDINADOR';
    localStorage.setItem('sipc.session', JSON.stringify(s));
  });

  it('shows the real role instead of "Encuestador"', () => {
    mount();
    expect(screen.getByText('Coordinador')).toBeInTheDocument();
    expect(screen.queryByText('Encuestador')).not.toBeInTheDocument();
  });

  it('points the account shortcut at /gestion/cuenta', () => {
    mount();
    expect(screen.getByRole('link', { name: /cuenta de Ana Paz/i })).toHaveAttribute('href', '/gestion/cuenta');
  });

  it('logs out without the surveyor-only wording about unsaved prices', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/precios sin guardar/i)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/ingresar de nuevo/i)).toBeInTheDocument();
  });
});
