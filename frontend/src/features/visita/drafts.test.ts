import { describe, expect, it } from 'vitest';
import { clearDraft, loadDrafts, saveDraft } from './drafts';

describe('drafts', () => {
  it('round-trips per asignacion and product', () => {
    saveDraft('a1', 'p1', { valor: '12,5', oferta: true, observacion: 'x' });
    saveDraft('a1', 'p2', { valor: '3', oferta: false, observacion: '' });
    saveDraft('a2', 'p1', { valor: '99', oferta: false, observacion: '' });
    expect(loadDrafts('a1')).toEqual({
      p1: { valor: '12,5', oferta: true, observacion: 'x' },
      p2: { valor: '3', oferta: false, observacion: '' },
    });
    expect(loadDrafts('a2').p1?.valor).toBe('99');
  });
  it('clears one product', () => {
    saveDraft('a1', 'p1', { valor: '1', oferta: false, observacion: '' });
    clearDraft('a1', 'p1');
    expect(loadDrafts('a1')).toEqual({});
  });
  it('returns empty on corrupt storage', () => {
    localStorage.setItem('sipc.drafts.a1', '{nope');
    expect(loadDrafts('a1')).toEqual({});
  });
});
