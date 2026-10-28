import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@/shared/api/types';

const auth: { role: Role | null } = { role: 'COORDINADOR' };
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    session: auth.role ? { token: 't', user: { id: 'u', nombre: 'A', apellido: 'B', role: auth.role } } : null,
  }),
}));

import { RequireRole } from './RequireRole';

function mount(role: Role | null, guard: React.ReactNode, at = '/x') {
  auth.role = role;
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/x" element={guard} />
        <Route path="/" element={<p>surveyor home</p>} />
        <Route path="/login" element={<p>login</p>} />
        <Route path="/gestion/403" element={<p>forbidden</p>} />
        <Route path="/gestion/precios" element={<p>precios landing</p>} />
        <Route path="/gestion/relevamientos" element={<p>relevamientos landing</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireRole by roles', () => {
  it('renders the children when the role is listed', () => {
    mount('ENCUESTADOR', <RequireRole roles={['ENCUESTADOR']}>secret</RequireRole>);
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
  it('sends an unlisted role to its own landing', () => {
    mount('COORDINADOR', <RequireRole roles={['ENCUESTADOR']}>secret</RequireRole>);
    expect(screen.getByText('relevamientos landing')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
  it('sends the surveyor home from a management guard', () => {
    mount('ENCUESTADOR', <RequireRole roles={['COORDINADOR', 'SUPERVISOR']}>secret</RequireRole>);
    expect(screen.getByText('surveyor home')).toBeInTheDocument();
  });
  it('sends anonymous users to login', () => {
    mount(null, <RequireRole roles={['ENCUESTADOR']}>secret</RequireRole>);
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});

describe('RequireRole by section', () => {
  it('renders when the role can access the section', () => {
    mount('SUPERVISOR', <RequireRole section="precios">precios</RequireRole>);
    expect(screen.getByText('precios')).toBeInTheDocument();
  });
  it('sends a management role to the 403 page otherwise', () => {
    mount('SUPERVISOR', <RequireRole section="usuarios">usuarios</RequireRole>);
    expect(screen.getByText('forbidden')).toBeInTheDocument();
  });
  it('sends the surveyor home, not to the management 403', () => {
    mount('ENCUESTADOR', <RequireRole section="precios">precios</RequireRole>);
    expect(screen.getByText('surveyor home')).toBeInTheDocument();
  });
});
