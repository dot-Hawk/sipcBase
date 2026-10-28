import { describe, expect, it } from 'vitest';
import type { Alerta, Precio } from '@/shared/api/types';
import { pendingByProducto, withOptimisticPrices } from './view';
import type { OutboxItem, PhotoItem, PriceItem } from './types';

const alerta: Alerta = { media: 100, desvio: 5, n: 4, limiteInferior: 85, limiteSuperior: 115 };
const base = { userId: 'u', asignacionId: 'a1', relevamiento: 'r', comercio: 'c', seq: 1, createdAt: 0, attempts: 0, nextAttemptAt: 0, error: null };
const priceItem = (producto: string, over: Partial<PriceItem> = {}): PriceItem => ({
  ...base, id: `price:a1:${producto}`, kind: 'price', producto, status: 'pending', valor: 10, oferta: false,
  observacion: '', capturedAt: '2026-10-10T10:00:00.000Z', confirmed: false, precioId: null, precio: null, alerta: null,
  rev: 1, omitFecha: false, ...over,
});
const photoItem = (producto: string, over: Partial<PhotoItem> = {}): PhotoItem => ({
  ...base, id: `photo:${producto}:${Math.random()}`, kind: 'photo', producto, status: 'pending', blob: new Blob(['x']),
  precioId: null, maybeSent: false, ...over,
});
const server = (producto: string, valor: number): Precio => ({
  id: `srv-${producto}`, relevamiento: 'r', producto, comercio: 'c', encuestador: 'u', valor, oferta: false,
  fechaRelevamiento: '', observacion: null, alerta: null, createdAt: '', updatedAt: '',
});

describe('pendingByProducto', () => {
  it('summarizes the price state and the photo count per product, only for the given asignacion', () => {
    const items: OutboxItem[] = [
      priceItem('p1', { status: 'needs-confirmation', alerta }),
      photoItem('p1'),
      photoItem('p1'),
      photoItem('p2'),
      priceItem('p9', { asignacionId: 'a2' } as Partial<PriceItem>),
    ];
    const map = pendingByProducto(items, 'a1');
    expect([...map.keys()].sort()).toEqual(['p1', 'p2']);
    expect(map.get('p1')).toMatchObject({ price: 'needs-confirmation', alerta, photos: 2, priceItemId: 'price:a1:p1' });
    expect(map.get('p2')).toMatchObject({ price: null, photos: 1, priceItemId: null });
  });
});

describe('withOptimisticPrices', () => {
  it('shows the queued value over the server one and adds queued-only products', () => {
    const saved = new Map([['p1', server('p1', 90)], ['p3', server('p3', 5)]]);
    const items = [
      priceItem('p1', { valor: 120, precioId: 'srv-p1', precio: server('p1', 90) }),
      priceItem('p2', { valor: 7, observacion: 'nota' }),
    ];
    const merged = withOptimisticPrices(saved, items, 'a1');
    expect(merged.get('p1')).toMatchObject({ id: 'srv-p1', valor: 120 });
    expect(merged.get('p2')).toMatchObject({ valor: 7, observacion: 'nota', id: 'pending:price:a1:p2' });
    expect(merged.get('p3')).toBe(saved.get('p3'));
    expect(saved.get('p1')!.valor).toBe(90); // input untouched
  });

  it('carries the atypical stats only while the item awaits confirmation', () => {
    const merged = withOptimisticPrices(
      new Map(),
      [priceItem('p1', { status: 'needs-confirmation', alerta }), priceItem('p2', { alerta })],
      'a1',
    );
    expect(merged.get('p1')!.alerta).toEqual(alerta);
    expect(merged.get('p2')!.alerta).toBeNull();
  });

  it('returns the same map when nothing is queued', () => {
    const saved = new Map([['p1', server('p1', 90)]]);
    expect(withOptimisticPrices(saved, [photoItem('p1')], 'a1')).toBe(saved);
  });
});
