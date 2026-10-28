import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import type { Alerta, Precio } from '@/shared/api/types';
import { savePrice, type SavePriceDeps } from './savePrice';

const alerta: Alerta = { media: 100, desvio: 5, n: 4, limiteInferior: 85, limiteSuperior: 115 };
const precio = (over: Partial<Precio> = {}): Precio => ({
  id: 'p1', relevamiento: 'r', producto: 'prod', comercio: 'c', encuestador: 'e', valor: 10,
  oferta: false, fechaRelevamiento: '2026-01-01', observacion: null, alerta: null,
  createdAt: '', updatedAt: '', ...over,
});
const ctx = { relevamiento: 'r', comercio: 'c', producto: 'prod' };

function deps(over: Partial<SavePriceDeps> = {}): SavePriceDeps {
  return {
    createPrecio: vi.fn(async () => precio()),
    updatePrecio: vi.fn(async () => precio()),
    findExisting: vi.fn(async () => precio({ valor: 10 })),
    ...over,
  };
}

describe('savePrice', () => {
  it('creates when there is no existing precio', async () => {
    const d = deps();
    const r = await savePrice(d, { ...ctx, existingId: null, valor: 10, oferta: false });
    expect(d.createPrecio).toHaveBeenCalledWith({ ...ctx, valor: 10, oferta: false });
    expect(r).toEqual({ kind: 'saved', precio: precio() });
  });

  it('sends the capture date on create only', async () => {
    const d = deps();
    const fechaRelevamiento = '2026-10-10T09:00:00.000Z';
    await savePrice(d, { ...ctx, existingId: null, valor: 10, oferta: false, fechaRelevamiento });
    expect(d.createPrecio).toHaveBeenCalledWith({ ...ctx, valor: 10, oferta: false, fechaRelevamiento });
    await savePrice(d, { ...ctx, existingId: 'p1', valor: 11, oferta: false, fechaRelevamiento });
    expect(d.updatePrecio).toHaveBeenCalledWith('p1', { valor: 11, oferta: false });
  });

  it('patches when an existing precio id is known', async () => {
    const d = deps();
    await savePrice(d, { ...ctx, existingId: 'p1', valor: 12, oferta: true, observacion: 'ok' });
    expect(d.updatePrecio).toHaveBeenCalledWith('p1', { valor: 12, oferta: true, observacion: 'ok' });
    expect(d.createPrecio).not.toHaveBeenCalled();
  });

  it('omits empty observacion on create', async () => {
    const d = deps();
    await savePrice(d, { ...ctx, existingId: null, valor: 10, oferta: false, observacion: '  ' });
    expect(d.createPrecio).toHaveBeenCalledWith({ ...ctx, valor: 10, oferta: false });
  });

  it('returns needs-confirmation on the atypical 409', async () => {
    const d = deps({
      createPrecio: vi.fn(async () => {
        throw new ApiError({ status: 409, message: 'x', requiereConfirmacion: true, alerta });
      }),
    });
    const r = await savePrice(d, { ...ctx, existingId: null, valor: 200, oferta: false });
    expect(r).toEqual({ kind: 'needs-confirmation', alerta });
  });

  it('resends with confirmarDesvio when confirmed', async () => {
    const d = deps();
    await savePrice(d, { ...ctx, existingId: null, valor: 200, oferta: false, confirmarDesvio: true });
    expect(d.createPrecio).toHaveBeenCalledWith({ ...ctx, valor: 200, oferta: false, confirmarDesvio: true });
  });

  it('recovers from a duplicate 409 by refetching', async () => {
    const existing = precio({ id: 'p9', valor: 10 });
    const d = deps({
      createPrecio: vi.fn(async () => {
        throw new ApiError({ status: 409, message: 'duplicate' });
      }),
      findExisting: vi.fn(async () => existing),
    });
    const r = await savePrice(d, { ...ctx, existingId: null, valor: 10, oferta: false });
    expect(r).toEqual({ kind: 'duplicate-recovered', precio: existing });
  });

  it('rethrows other errors', async () => {
    const err = new ApiError({ status: 403, message: 'no' });
    const d = deps({ createPrecio: vi.fn(async () => { throw err; }) });
    await expect(savePrice(d, { ...ctx, existingId: null, valor: 1, oferta: false })).rejects.toBe(err);
  });

  it('rethrows the 409 when duplicate recovery finds nothing', async () => {
    const err = new ApiError({ status: 409, message: 'duplicate' });
    const d = deps({
      createPrecio: vi.fn(async () => { throw err; }),
      findExisting: vi.fn(async () => null),
    });
    await expect(savePrice(d, { ...ctx, existingId: null, valor: 1, oferta: false })).rejects.toBe(err);
  });

  describe('PATCH sends only changed fields', () => {
    const previous = precio({ id: 'p1', valor: 10, oferta: false, observacion: 'vieja' });
    const base = { ...ctx, existingId: 'p1', previous };

    it('only observacion', async () => {
      const d = deps();
      await savePrice(d, { ...base, valor: 10, oferta: false, observacion: 'nueva' });
      expect(d.updatePrecio).toHaveBeenCalledWith('p1', { observacion: 'nueva' });
    });

    it('only valor', async () => {
      const d = deps();
      await savePrice(d, { ...base, valor: 12, oferta: false, observacion: 'vieja' });
      expect(d.updatePrecio).toHaveBeenCalledWith('p1', { valor: 12 });
    });

    it('only oferta', async () => {
      const d = deps();
      await savePrice(d, { ...base, valor: 10, oferta: true, observacion: 'vieja' });
      expect(d.updatePrecio).toHaveBeenCalledWith('p1', { oferta: true });
    });

    it('valor and oferta', async () => {
      const d = deps();
      await savePrice(d, { ...base, valor: 12, oferta: true, observacion: 'vieja' });
      expect(d.updatePrecio).toHaveBeenCalledWith('p1', { valor: 12, oferta: true });
    });

    it('clears observacion with an empty string', async () => {
      const d = deps();
      await savePrice(d, { ...base, valor: 10, oferta: false, observacion: '  ' });
      expect(d.updatePrecio).toHaveBeenCalledWith('p1', { observacion: '' });
    });

    it('adds confirmarDesvio when confirming a changed valor', async () => {
      const d = deps();
      await savePrice(d, { ...base, valor: 200, oferta: false, observacion: 'vieja', confirmarDesvio: true });
      expect(d.updatePrecio).toHaveBeenCalledWith('p1', { valor: 200, confirmarDesvio: true });
    });

    it('sends no request when nothing changed even if confirmarDesvio is set', async () => {
      const d = deps();
      const r = await savePrice(d, { ...base, valor: 10, oferta: false, observacion: 'vieja', confirmarDesvio: true });
      expect(d.updatePrecio).not.toHaveBeenCalled();
      expect(r).toEqual({ kind: 'unchanged', precio: previous });
    });

    it('sends only { observacion: "" } when the observation is cleared (no confirmarDesvio)', async () => {
      const d = deps();
      await savePrice(d, { ...base, valor: 10, oferta: false, observacion: '   ' });
      expect(d.updatePrecio).toHaveBeenCalledWith('p1', { observacion: '' });
    });

    it('does not call the API when nothing changed', async () => {
      const d = deps();
      const r = await savePrice(d, { ...base, valor: 10, oferta: false, observacion: 'vieja' });
      expect(d.updatePrecio).not.toHaveBeenCalled();
      expect(r).toEqual({ kind: 'unchanged', precio: previous });
    });
  });
});
