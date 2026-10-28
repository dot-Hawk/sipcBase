import { describe, expect, it } from 'vitest';
import type { Precio, Relevamiento } from '@/shared/api/types';
import { findPrevious, resolvePrevious, type PreviousPrice } from './previous';

const rel = (id: string, periodo: string, fechaInicio: string): Relevamiento => ({
  id, periodo, fechaInicio, fechaLimite: fechaInicio, frecuencia: 'MENSUAL', estado: 'CERRADO',
  createdAt: '', updatedAt: '',
});
const precio = (relevamiento: string, producto: string, comercio: string, valor: number, oferta = false): Precio => ({
  id: `${relevamiento}-${producto}-${comercio}`, relevamiento, producto, comercio, encuestador: 'e', valor,
  oferta, fechaRelevamiento: '', observacion: null, alerta: null, createdAt: '', updatedAt: '',
});

const rels = [
  rel('r1', '2026-06', '2026-06-01'),
  rel('r2', '2026-07', '2026-07-01'),
  rel('r3', '2026-08', '2026-08-01'),
];

describe('findPrevious', () => {
  it('picks the most recent earlier relevamiento at the same comercio', () => {
    const precios = [precio('r1', 'p', 'c', 100), precio('r2', 'p', 'c', 120), precio('r3', 'p', 'c', 999)];
    const prev = findPrevious({ precios, relevamientos: rels, current: rels[2]!, comercio: 'c', producto: 'p' });
    expect(prev).toEqual({ valor: 120, periodo: '2026-07', oferta: false });
  });
  it('ignores other comercios, other productos and later relevamientos', () => {
    const precios = [precio('r1', 'p', 'other', 50), precio('r1', 'q', 'c', 60), precio('r3', 'p', 'c', 70)];
    expect(findPrevious({ precios, relevamientos: rels, current: rels[1]!, comercio: 'c', producto: 'p' })).toBeNull();
  });
  it('keeps the offer flag so the UI can say so', () => {
    const precios = [precio('r1', 'p', 'c', 80, true)];
    expect(findPrevious({ precios, relevamientos: rels, current: rels[1]!, comercio: 'c', producto: 'p' })?.oferta).toBe(true);
  });
  it('returns null with no history', () => {
    expect(findPrevious({ precios: [], relevamientos: rels, current: rels[2]!, comercio: 'c', producto: 'p' })).toBeNull();
  });
});

describe('resolvePrevious', () => {
  const own: PreviousPrice = { valor: 100, periodo: '2026-07', oferta: false };
  const anyone: PreviousPrice = { valor: 90, periodo: '2026-08', oferta: true };
  it('uses the endpoint answer when there is one', () => {
    expect(resolvePrevious({ status: 'success', data: anyone }, own)).toEqual(anyone);
  });
  it('treats a 204 (null) as no previous price, not as a reason to use the own price', () => {
    expect(resolvePrevious({ status: 'success', data: null }, own)).toBeNull();
  });
  it('falls back to the own price while loading and on error', () => {
    expect(resolvePrevious({ status: 'pending', data: undefined }, own)).toEqual(own);
    expect(resolvePrevious({ status: 'error', data: undefined }, own)).toEqual(own);
  });
  it('falls back to the own price when there is no remote query', () => {
    expect(resolvePrevious(null, own)).toEqual(own);
  });
});
