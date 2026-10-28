import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Visita } from './useVisitas';

const state: { visitas: Visita[]; loading: boolean } = { visitas: [], loading: false };
vi.mock('./useVisitas', () => ({
  useVisitas: () => ({
    visitas: state.visitas,
    loading: state.loading,
    error: null,
    refetchAll: vi.fn(),
    preciosLoading: false,
  }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { nombre: 'Juan', apellido: 'Pérez' } } }),
}));

import { VisitasPage } from './VisitasPage';

const rel = (id: string, periodo: string, estado: 'ABIERTO' | 'CERRADO', fechaInicio: string, fechaLimite: string) => ({
  id, periodo, frecuencia: 'MENSUAL' as const, fechaInicio, fechaLimite, estado, createdAt: '', updatedAt: '',
});
const com = (id: string, nombre: string, tipo: 'SUPERMERCADO' | 'ALMACEN' | 'VERDULERIA' = 'ALMACEN') => ({
  id, nombre, direccion: 'Belgrano 1220', zona: 'Centro', tipo, estado: 'ACTIVO' as const, createdAt: '', updatedAt: '',
});
const visita = (
  id: string,
  estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADA',
  comercio: ReturnType<typeof com>,
  relevamiento: ReturnType<typeof rel>,
  priced: number,
  total = 10,
): Visita => ({
  asignacion: { id, relevamiento: relevamiento.id, encuestador: 'e', comercio: comercio.id, estado, createdAt: '', updatedAt: '' },
  relevamiento,
  comercio,
  priced,
  total,
});

const open = rel('r2', '2026-10', 'ABIERTO', '2026-10-01T00:00:00.000Z', '2099-10-30T00:00:00.000Z');
const closed = rel('r1', '2026-09', 'CERRADO', '2026-09-01T00:00:00.000Z', '2026-09-28T00:00:00.000Z');

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <VisitasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.loading = false;
  state.visitas = [
    visita('a1', 'PENDIENTE', com('c1', 'Almacén Don Julio'), open, 0),
    visita('a2', 'EN_CURSO', com('c2', 'Supermercado Sol', 'SUPERMERCADO'), open, 4),
    visita('a3', 'COMPLETADA', com('c3', 'Verdulería La Esquina', 'VERDULERIA'), open, 10),
    visita('a4', 'COMPLETADA', com('c4', 'Almacén Vieja'), closed, 10),
  ];
});

describe('VisitasPage', () => {
  it('summarises the open relevamiento with its humanized period and progress', () => {
    mount();
    const band = screen.getByRole('region', { name: 'Resumen del relevamiento' });
    expect(within(band).getByRole('heading', { name: 'Octubre 2026' })).toBeInTheDocument();
    expect(within(band).getByText(/Quedan \d+ días/)).toBeInTheDocument();
    // 14 of 30 priced in the open relevamiento
    expect(within(band).getByRole('img', { name: '14 de 30 precios cargados' })).toBeInTheDocument();
  });

  it('puts the visit in progress first with a Continuar affordance', () => {
    mount();
    const links = screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/visita/'));
    expect(links[0]).toHaveTextContent('Supermercado Sol');
    expect(links[0]).toHaveTextContent('Continuar');
    expect(within(links[1] as HTMLElement).getByText('Iniciar')).toBeInTheDocument();
  });

  it('groups by relevamiento when there is more than one and mutes the closed one', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Septiembre 2026' })).toBeInTheDocument();
    expect(screen.getByText('Cerrado, solo consulta')).toBeInTheDocument();
  });

  it('filters by estado from the band', async () => {
    mount();
    const filter = screen.getByRole('group', { name: 'Filtrar visitas por estado' });
    await userEvent.click(within(filter).getByRole('button', { name: /Completadas/ }));
    expect(screen.queryByText('Supermercado Sol')).not.toBeInTheDocument();
    expect(screen.getByText('Verdulería La Esquina')).toBeInTheDocument();
  });

  it('offers a way out of an empty filter', async () => {
    state.visitas = [visita('a1', 'PENDIENTE', com('c1', 'Almacén Don Julio'), open, 0)];
    mount();
    await userEvent.click(screen.getByRole('button', { name: /En curso/ }));
    expect(screen.getByText('No hay visitas con este estado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver todas las visitas' }));
    expect(screen.getByText('Almacén Don Julio')).toBeInTheDocument();
  });

  it('explains that nothing is stored yet instead of a skeleton forever when offline without data', () => {
    state.visitas = [];
    state.loading = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mount();
    expect(screen.getByRole('heading', { name: 'Sin datos en este dispositivo' })).toBeInTheDocument();
    expect(screen.getByText(/conéctese a internet/i)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('keeps the skeleton while loading online', () => {
    state.visitas = [];
    state.loading = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mount();
    expect(screen.queryByRole('heading', { name: 'Sin datos en este dispositivo' })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
