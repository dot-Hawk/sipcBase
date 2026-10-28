import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/shared/api/types';

vi.mock('@/shared/api/endpoints', () => ({
  api: { me: () => new Promise(() => undefined), login: vi.fn(), changePassword: vi.fn() },
}));
vi.mock('@/features/asignaciones/VisitasPage', () => ({ VisitasPage: () => <h1>Visitas del encuestador</h1> }));
vi.mock('@/features/visita/VisitaPage', () => ({ VisitaPage: () => <h1>Visita</h1> }));
vi.mock('@/features/precios/PreciosPage', () => ({ PreciosPage: () => <h1>Precios del encuestador</h1> }));
vi.mock('@/features/cuenta/CuentaPage', () => ({ CuentaPage: () => <h1>Cuenta</h1> }));
vi.mock('@/features/relevamientos/RelevamientosPage', () => ({ RelevamientosPage: () => <h1>Relevamientos</h1> }));
vi.mock('@/features/asignaciones-gestion/AsignacionesGestionPage', () => ({
  AsignacionesGestionPage: () => <h1>Asignaciones</h1>,
}));
vi.mock('@/features/usuarios/UsuariosPage', () => ({ UsuariosPage: () => <h1>Usuarios</h1> }));
vi.mock('@/features/catalogo/CatalogoPage', () => ({ CatalogoPage: () => <h1>Catálogo</h1> }));
vi.mock('@/features/precios-gestion/PreciosGestionPage', () => ({ PreciosGestionPage: () => <h1>Precios</h1> }));
vi.mock('@/features/calculos/CalculosPage', () => ({ CalculosPage: () => <h1>Cálculos</h1> }));
vi.mock('@/features/auditoria/AuditoriaPage', () => ({ AuditoriaPage: () => <h1>Auditoría</h1> }));
vi.mock('@/pwa/updates', () => ({
  getUpdateController: () => ({ subscribe: () => () => undefined, getSnapshot: () => false, apply: vi.fn() }),
}));

import { App } from './App';

function jwt(exp: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ exp })}.sig`;
}

function signIn(role: Role | null, path: string) {
  localStorage.clear();
  if (role) {
    localStorage.setItem(
      'sipc.session',
      JSON.stringify({
        token: jwt(Math.floor(Date.now() / 1000) + 3600),
        user: { id: 'u1', nombre: 'Ana', apellido: 'Paz', role },
      }),
    );
  }
  window.history.pushState({}, '', path);
  return render(<App />);
}

const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });

beforeEach(() => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true));

describe('encuestador routes are unchanged', () => {
  it.each([
    ['/', 'Visitas del encuestador'],
    ['/visita/abc', 'Visita'],
    ['/precios', 'Precios del encuestador'],
    ['/cuenta', 'Cuenta'],
  ])('serves %s', async (path, title) => {
    signIn('ENCUESTADOR', path);
    expect(await heading(title)).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
  });

  it('has no management shell', async () => {
    signIn('ENCUESTADOR', '/');
    await heading('Visitas del encuestador');
    expect(screen.queryByRole('link', { name: /mi cuenta/i })).not.toBeInTheDocument();
  });

  it('redirects /gestion/* back to /', async () => {
    signIn('ENCUESTADOR', '/gestion/usuarios');
    await heading('Visitas del encuestador');
    expect(window.location.pathname).toBe('/');
  });

  it('sends unknown paths to /', async () => {
    signIn('ENCUESTADOR', '/nada/por/aqui');
    await heading('Visitas del encuestador');
    expect(window.location.pathname).toBe('/');
  });
});

describe.each([
  ['COORDINADOR', '/gestion/relevamientos', 'Relevamientos', '/gestion/precios'],
  ['SUPERVISOR', '/gestion/precios', 'Precios', '/gestion/usuarios'],
  ['ANALISTA', '/gestion/precios', 'Precios', '/gestion/relevamientos'],
  ['DIRECCION', '/gestion/calculos', 'Cálculos', '/gestion/precios'],
  ['AUDITOR', '/gestion/calculos', 'Cálculos', '/gestion/auditoria'],
] as const)('%s', (role, landing, title, forbidden) => {
  it('lands on its landing from /', async () => {
    signIn(role, '/');
    expect(await heading(title)).toBeInTheDocument();
    expect(window.location.pathname).toBe(landing);
  });

  it('is redirected away from surveyor routes', async () => {
    signIn(role, '/precios');
    await heading(title);
    expect(window.location.pathname).toBe(landing);
  });

  it('gets 403 on a section it may not see, without rendering it', async () => {
    signIn(role, forbidden);
    expect(await heading(/no tiene acceso/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/gestion/403');
    expect(screen.queryByText('Próximamente')).not.toBeInTheDocument();
  });

  it('sends unknown paths to its landing', async () => {
    signIn(role, '/gestion/zzz');
    await heading(title);
    expect(window.location.pathname).toBe(landing);
  });

  it('can open its account page', async () => {
    signIn(role, '/gestion/cuenta');
    expect(await heading('Cuenta')).toBeInTheDocument();
  });
});

describe('management screens of the COORDINADOR', () => {
  it.each([
    ['/gestion/relevamientos', 'Relevamientos'],
    ['/gestion/asignaciones', 'Asignaciones'],
    ['/gestion/usuarios', 'Usuarios'],
  ])('serves %s', async (path, title) => {
    signIn('COORDINADOR', path);
    expect(await heading(title)).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
    expect(screen.queryByText('Próximamente')).not.toBeInTheDocument();
  });

  it.each(['SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'] as const)('%s gets 403 on all three, rendering none', async (role) => {
    for (const path of ['/gestion/relevamientos', '/gestion/asignaciones', '/gestion/usuarios']) {
      const view = signIn(role, path);
      expect(await heading(/no tiene acceso/i)).toBeInTheDocument();
      expect(window.location.pathname).toBe('/gestion/403');
      expect(screen.queryByRole('heading', { level: 1, name: /^(Relevamientos|Asignaciones|Usuarios)$/ })).toBeNull();
      view.unmount();
    }
  });

  it('serves the catalogue under /gestion/catalogo and its sub-routes', async () => {
    for (const path of ['/gestion/catalogo', '/gestion/catalogo/productos', '/gestion/catalogo/canasta']) {
      const view = signIn('COORDINADOR', path);
      expect(await heading('Catálogo')).toBeInTheDocument();
      expect(window.location.pathname).toBe(path);
      expect(screen.queryByText('Próximamente')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it.each(['SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'] as const)('%s gets 403 on every catalogue URL', async (role) => {
    for (const path of ['/gestion/catalogo', '/gestion/catalogo/comercios', '/gestion/catalogo/canasta']) {
      const view = signIn(role, path);
      expect(await heading(/no tiene acceso/i)).toBeInTheDocument();
      expect(window.location.pathname).toBe('/gestion/403');
      expect(screen.queryByRole('heading', { level: 1, name: 'Catálogo' })).toBeNull();
      view.unmount();
    }
  });

  it.each(['AUDITOR', 'DIRECCION'] as const)(
    '%s reaches a calculation detail under /gestion/calculos/:id',
    async (role) => {
      signIn(role, '/gestion/calculos/abc');
      expect(await heading('Cálculos')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/gestion/calculos/abc');
    },
  );

  it.each(['COORDINADOR', 'SUPERVISOR', 'ANALISTA'] as const)('keeps %s out of calculations, even by URL', async (role) => {
    signIn(role, '/gestion/calculos/abc');
    expect(await heading(/no tiene acceso/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/gestion/403');
  });

  it('keeps the surveyor out of them', async () => {
    signIn('ENCUESTADOR', '/gestion/asignaciones');
    await heading('Visitas del encuestador');
    expect(window.location.pathname).toBe('/');
  });
});

describe('anonymous', () => {
  it('goes to login from a management URL', async () => {
    signIn(null, '/gestion/usuarios');
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });
});

describe('price review and audit screens', () => {
  it.each(['SUPERVISOR', 'ANALISTA'] as const)('%s serves /gestion/precios', async (role) => {
    signIn(role, '/gestion/precios');
    expect(await heading('Precios')).toBeInTheDocument();
    expect(screen.queryByText('Próximamente')).not.toBeInTheDocument();
  });

  it.each(['COORDINADOR', 'DIRECCION', 'AUDITOR'] as const)('%s gets 403 on /gestion/precios, rendering nothing', async (role) => {
    signIn(role, '/gestion/precios');
    expect(await heading(/no tiene acceso/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/gestion/403');
    expect(screen.queryByRole('heading', { level: 1, name: 'Precios' })).toBeNull();
  });

  it.each(['COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION'] as const)('%s serves /gestion/auditoria', async (role) => {
    signIn(role, '/gestion/auditoria');
    expect(await heading('Auditoría')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/gestion/auditoria');
  });

  it('keeps AUDITOR out of /gestion/auditoria', async () => {
    signIn('AUDITOR', '/gestion/auditoria');
    expect(await heading(/no tiene acceso/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/gestion/403');
  });

  it.each(['/gestion/precios', '/gestion/auditoria'])('the surveyor never reaches %s', async (path) => {
    signIn('ENCUESTADOR', path);
    await heading('Visitas del encuestador');
    expect(window.location.pathname).toBe('/');
  });
});
