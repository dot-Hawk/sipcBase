import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '@/features/gestion/testUtils';
import { api } from '@/shared/api/endpoints';
import { ApiError } from '@/shared/api/errors';
import type { Role } from '@/shared/api/types';
import { comercio, imputacion, relativo, run, variedad } from './testFixtures';

const auth: { role: Role } = { role: 'DIRECCION' };
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 't', user: { id: 'u-me', nombre: 'Elena', apellido: 'Vega', role: auth.role } } }),
}));
const saveBlob = vi.fn();
vi.mock('@/shared/lib/download', () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

import { CalculosPage } from './CalculosPage';
import { POLL } from './queries';

const renderDetail = (id = 'c1', search = '') =>
  renderScreen(
    <Routes>
      <Route path="/gestion/calculos/*" element={<CalculosPage />} />
    </Routes>,
    { route: `/gestion/calculos/${id}${search}` },
  );
const here = () => screen.getByTestId('location').textContent ?? '';

beforeEach(() => {
  auth.role = 'DIRECCION';
  POLL.ms = 20;
  vi.spyOn(api, 'getCalculo').mockResolvedValue(run());
  vi.spyOn(api, 'listCanasta').mockResolvedValue([variedad('1111101', 'Pan francés'), variedad('1141101', 'Leche entera')]);
  vi.spyOn(api, 'listComercios').mockResolvedValue([comercio('com-1', 'Almacén Uno')]);
  vi.spyOn(api, 'listCalculoRelativos').mockResolvedValue([
    relativo('1111101', '2026-02', 1.0234),
    relativo('1111101', '2026-03', null, { nSuper: 0, nTrad: 0 }),
    relativo('1141101', '2026-02', 0.9876),
  ]);
  vi.spyOn(api, 'listCalculoImputaciones').mockResolvedValue({ items: [imputacion('i1'), imputacion('i2', { grupo: null })], total: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  saveBlob.mockReset();
  POLL.ms = 2000;
});

describe('running run', () => {
  it('announces the state, polls, and shows the result once COMPLETADO without polling further', async () => {
    const spy = vi.mocked(api.getCalculo);
    spy.mockResolvedValueOnce(run({ estado: 'EJECUTANDO', resumen: null }));
    renderDetail();
    expect(await screen.findByRole('status', { name: /ejecución/i })).toHaveTextContent(/en ejecución/i);
    expect(screen.queryByRole('button', { name: /descargar resultados/i })).toBeNull();
    expect(await screen.findByText('Completado')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /resultados.*xlsx/i })).toBeInTheDocument();
    const calls = spy.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(spy.mock.calls.length).toBe(calls);
  });
});

describe('failed run', () => {
  it('shows the error in an alert and offers neither results nor tables', async () => {
    vi.mocked(api.getCalculo).mockResolvedValue(run({ estado: 'FALLIDO', error: 'engine exploded', resumen: null }));
    renderDetail();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no terminó/i);
    expect(alert).toHaveTextContent('engine exploded');
    expect(screen.getByText('Fallido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resultados/i })).toBeNull();
    expect(api.listCalculoRelativos).not.toHaveBeenCalled();
    expect(api.listCalculoImputaciones).not.toHaveBeenCalled();
  });
});

describe('completed run', () => {
  it('shows the parameters and the summary figures, and does not promise a final index', async () => {
    renderDetail();
    expect(await screen.findByRole('heading', { level: 1, name: /2026-01 a 2026-03/ })).toBeInTheDocument();
    const resumen = screen.getByRole('region', { name: /resumen/i });
    expect(within(resumen).getByText('Observaciones').nextSibling).toHaveTextContent('1.200');
    expect(within(resumen).getByText('Variedades').nextSibling).toHaveTextContent('80');
    expect(within(resumen).getByText('Informantes').nextSibling).toHaveTextContent('40');
    expect(within(resumen).getByText('Imputaciones').nextSibling).toHaveTextContent('15');
    expect(within(resumen).getByText('Sin imputar').nextSibling).toHaveTextContent('0');
    expect(screen.getByText(/no calcula un índice final/i)).toBeInTheDocument();
    expect(screen.getByText('motor-1.4.0')).toBeInTheDocument();
  });

  it('lists the unimputed cases and says when the list is cut at 200', async () => {
    vi.mocked(api.getCalculo).mockResolvedValue(
      run({
        resumen: {
          observaciones: 10, variedades: 2, informantes: 2, imputaciones: 0, sinImputar: 350,
          sinImputarDetalle: [{ variedad: '1111101', comercio: 'com-1', mes: '2026-02' }],
        },
      }),
    );
    renderDetail();
    const t = await screen.findByRole('table', { name: /sin imputar/i });
    expect(await within(t).findByText('Pan francés')).toBeInTheDocument();
    expect(await within(t).findByText('Almacén Uno')).toBeInTheDocument();
    expect(screen.getByText(/se muestran 1 de 350/i)).toBeInTheDocument();
  });

  it('downloads the results in each format, also for a read-only role', async () => {
    const blob = new Blob(['x']);
    const dl = vi.spyOn(api, 'downloadCalculoResultados').mockResolvedValue(blob);
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: /resultados.*xlsx/i }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'calculo_2026-01_2026-03.xlsx'));
    await userEvent.click(screen.getByRole('button', { name: /resultados.*csv/i }));
    await waitFor(() => expect(dl).toHaveBeenCalledWith('c1', 'csv'));
    expect(saveBlob).toHaveBeenLastCalledWith(blob, 'calculo_2026-01_2026-03.csv');
  });

  it('explains a failed download without leaking the server text', async () => {
    vi.spyOn(api, 'downloadCalculoResultados').mockRejectedValue(new ApiError({ status: 409, message: 'Calculo is not COMPLETADO' }));
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: /resultados.*xlsx/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/todavía no está completado/i);
    expect(alert).not.toHaveTextContent('Calculo is not');
  });

  it('shows the relatives with names, a dash with accessible text for "no data", and the counts', async () => {
    renderDetail();
    const t = await screen.findByRole('table', { name: /relativos por variedad/i });
    const rows = within(t).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText('Pan francés')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('1111101')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('1,0234')).toBeInTheDocument();
    const empty = rows[2]!;
    expect(within(empty).getByText('—')).toHaveAttribute('aria-hidden', 'true');
    expect(within(empty).getByText(/sin dato/i)).toHaveClass('visually-hidden');
  });

  it('filters the relatives by variedad and month through the URL and the request', async () => {
    renderDetail();
    await screen.findByRole('table', { name: /relativos por variedad/i });
    const mes = screen.getByLabelText('Mes');
    expect(within(mes).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos', '2026-01', '2026-02', '2026-03']);
    await userEvent.selectOptions(mes, '2026-02');
    await waitFor(() => expect(here()).toContain('mes=2026-02'));
    await waitFor(() => expect(api.listCalculoRelativos).toHaveBeenCalledWith('c1', { mes: '2026-02' }));
    await userEvent.type(screen.getByLabelText('Variedad (código de 7 dígitos)'), '1111101');
    await waitFor(() => expect(api.listCalculoRelativos).toHaveBeenCalledWith('c1', { variedad: '1111101', mes: '2026-02' }));
  });

  it('does not query with a malformed variedad code and says what is expected', async () => {
    renderDetail('c1', '?variedad=12');
    await screen.findByRole('table', { name: /relativos por variedad/i });
    expect(screen.getByText(/7 dígitos/i, { selector: '.field__error' })).toBeInTheDocument();
    expect(api.listCalculoRelativos).toHaveBeenCalledWith('c1', {});
  });

  it('says so when the filters match no relative', async () => {
    vi.mocked(api.listCalculoRelativos).mockResolvedValue([]);
    renderDetail('c1', '?mes=2026-02');
    expect(await screen.findByRole('heading', { name: /ningún relativo coincide/i })).toBeInTheDocument();
  });

  it('pages the imputations through the URL, with names and prices', async () => {
    vi.mocked(api.listCalculoImputaciones).mockResolvedValue({
      items: Array.from({ length: 50 }, (_, i) => imputacion(`i${i}`)),
      total: null,
    });
    renderDetail();
    const t = await screen.findByRole('table', { name: /imputaciones/i });
    expect(within(t).getAllByText('Almacén Uno')).not.toHaveLength(0);
    expect(api.listCalculoImputaciones).toHaveBeenCalledWith('c1', { page: 1, limit: 50 });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(here()).toContain('page=2'));
    await waitFor(() => expect(api.listCalculoImputaciones).toHaveBeenCalledWith('c1', { page: 2, limit: 50 }));
  });

  it('shows "Sin imputaciones" when there are none', async () => {
    vi.mocked(api.listCalculoImputaciones).mockResolvedValue({ items: [], total: null });
    renderDetail();
    expect(await screen.findByRole('heading', { name: /sin imputaciones/i })).toBeInTheDocument();
  });
});

describe('missing run', () => {
  it.each([404, 400])('answers %s with a plain message and a way back', async (status) => {
    vi.mocked(api.getCalculo).mockRejectedValue(new ApiError({ status, message: 'x' }));
    renderDetail('nope');
    expect(await screen.findByRole('heading', { name: /no se encontró el cálculo/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver a cálculos/i })).toHaveAttribute('href', '/gestion/calculos');
  });
  it('other errors offer retry', async () => {
    vi.mocked(api.getCalculo).mockRejectedValue(new ApiError({ status: 500, message: 'x' }));
    renderDetail();
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
