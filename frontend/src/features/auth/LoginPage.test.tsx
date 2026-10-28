import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const peek = vi.fn();
vi.mock('@/features/outbox/idbStore', () => ({
  peekIdbOutbox: () => peek(),
  hasIndexedDb: () => false,
  wipeIdbOutbox: vi.fn(),
  createIdbStore: vi.fn(),
}));
vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ session: null, login: vi.fn(), notice: null }),
}));

import { LoginPage } from './LoginPage';

beforeEach(() => peek.mockReset());

describe('LoginPage unsent work notice', () => {
  it('tells the surveyor that unsent work is waiting and which account can send it', async () => {
    peek.mockResolvedValue({ userId: 'u1', count: 3 });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    const note = await screen.findByText(/3 cambios sin enviar/i);
    expect(note.closest('[role="status"]')).toHaveTextContent(/misma cuenta/i);
    expect(note.closest('[role="status"]')).toHaveTextContent(/otra cuenta.*descartan/i);
  });

  it('shows nothing when there is no unsent work', async () => {
    peek.mockResolvedValue(null);
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await Promise.resolve();
    expect(screen.queryByText(/sin enviar/i)).not.toBeInTheDocument();
  });
});

describe('LoginPage branding', () => {
  it('shows the institutional logo once, without a decorative badge', async () => {
    peek.mockResolvedValue(null);
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await Promise.resolve();
    expect(screen.getAllByRole('img', { name: 'Dirección de Estadística, Censos y Documentación' })).toHaveLength(1);
    expect(document.querySelector('.login__badge')).toBeNull();
    expect(document.body).not.toHaveTextContent(/documentaci[oó]n/i);
  });

  it('shows the institutional slogan, not a field-work one', async () => {
    peek.mockResolvedValue(null);
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await Promise.resolve();
    expect(screen.getByText('Precios reales, datos confiables.')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/desde el campo/i);
  });

  it('names the product SIPC, without a mobile-only label', async () => {
    peek.mockResolvedValue(null);
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await Promise.resolve();
    expect(screen.getByText('SIPC')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/m[oó]vil/i);
  });
});
