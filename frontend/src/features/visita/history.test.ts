import { describe, expect, it } from 'vitest';
import type { Precio, Relevamiento } from '@/shared/api/types';
import { buildPriceSeries } from './history';

const rel = (id: string, periodo: string, fechaInicio: string): Relevamiento => ({
  id, periodo, frecuencia: 'MENSUAL', fechaInicio, fechaLimite: fechaInicio, estado: 'CERRADO', createdAt: '', updatedAt: '',
});
const precio = (relevamiento: string, valor: number, over: Partial<Precio> = {}): Precio => ({
  id: `${relevamiento}-${valor}`, relevamiento, producto: 'p', comercio: 'c', encuestador: 'e', valor, oferta: false,
  fechaRelevamiento: '', observacion: null, alerta: null, createdAt: '', updatedAt: '', ...over,
});

const rels = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => rel(`r${n}`, `2026-0${n}`, `2026-0${n}-01T00:00:00.000Z`));
const base = { relevamientos: rels, current: rels[7]!, comercio: 'c', producto: 'p' };

describe('buildPriceSeries', () => {
  it('orders points oldest to newest and skips the current relevamiento', () => {
    const precios = [precio('r3', 30), precio('r1', 10), precio('r2', 20), precio('r8', 99)];
    const series = buildPriceSeries({ ...base, precios });
    expect(series.map((p) => p.valor)).toEqual([10, 20, 30]);
    expect(series.map((p) => p.periodo)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('keeps only the six most recent points', () => {
    const precios = [1, 2, 3, 4, 5, 6, 7].map((n) => precio(`r${n}`, n * 10));
    const series = buildPriceSeries({ ...base, precios });
    expect(series.map((p) => p.valor)).toEqual([20, 30, 40, 50, 60, 70]);
  });

  it('ignores other comercios, other productos and later relevamientos', () => {
    const precios = [
      precio('r1', 10), precio('r2', 20, { comercio: 'x' }), precio('r3', 30, { producto: 'q' }),
    ];
    const series = buildPriceSeries({ ...base, current: rels[3]!, precios: [...precios, precio('r6', 60)] });
    expect(series.map((p) => p.valor)).toEqual([10]);
  });

  it('keeps the oferta flag and skips unknown relevamientos', () => {
    const series = buildPriceSeries({ ...base, precios: [precio('r1', 10, { oferta: true }), precio('zzz', 5)] });
    expect(series).toEqual([{ periodo: '2026-01', valor: 10, oferta: true }]);
  });
});
