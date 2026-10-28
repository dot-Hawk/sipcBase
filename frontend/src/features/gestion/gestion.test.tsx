import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@/shared/api/types';

const auth: { role: Role } = { role: 'DIRECCION' };
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u', nombre: 'A', apellido: 'B', role: auth.role } } }),
}));

import { ComingSoonPage } from './ComingSoonPage';
import { ForbiddenPage } from './ForbiddenPage';

describe('ForbiddenPage', () => {
  it('explains the lack of access and links to the role landing', () => {
    auth.role = 'SUPERVISOR';
    render(
      <MemoryRouter>
        <ForbiddenPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: /no tiene acceso/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/gestion/precios');
  });
});

describe('ComingSoonPage', () => {
  it('says what the section will do', () => {
    auth.role = 'COORDINADOR';
    render(<ComingSoonPage section="usuarios" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByText('Próximamente')).toBeInTheDocument();
    expect(screen.getByText(/dar de alta/i)).toBeInTheDocument();
    expect(screen.queryByText(/solo lectura/i)).not.toBeInTheDocument();
  });
  it('flags read-only sections', () => {
    auth.role = 'DIRECCION';
    render(<ComingSoonPage section="auditoria" />);
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument();
  });
});
