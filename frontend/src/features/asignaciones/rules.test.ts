import { describe, expect, it } from 'vitest';
import { canEditPrices, canFinish, canStart, editBlockReason, withoutCancelled } from './rules';

const open = { estado: 'ABIERTO' as const };
const closed = { estado: 'CERRADO' as const };

describe('assignment rules', () => {
  it('canStart only from PENDIENTE on an open relevamiento', () => {
    expect(canStart({ estado: 'PENDIENTE' }, open)).toBe(true);
    expect(canStart({ estado: 'PENDIENTE' }, closed)).toBe(false);
    expect(canStart({ estado: 'EN_CURSO' }, open)).toBe(false);
  });
  it('canFinish only from EN_CURSO on an open relevamiento', () => {
    expect(canFinish({ estado: 'EN_CURSO' }, open)).toBe(true);
    expect(canFinish({ estado: 'EN_CURSO' }, closed)).toBe(false);
    expect(canFinish({ estado: 'PENDIENTE' }, open)).toBe(false);
  });
  it('canEditPrices needs EN_CURSO and ABIERTO', () => {
    expect(canEditPrices({ estado: 'EN_CURSO' }, open)).toBe(true);
    expect(canEditPrices({ estado: 'COMPLETADA' }, open)).toBe(false);
    expect(canEditPrices({ estado: 'EN_CURSO' }, closed)).toBe(false);
  });
  it('explains why editing is blocked', () => {
    expect(editBlockReason({ estado: 'EN_CURSO' }, open)).toBeNull();
    expect(editBlockReason({ estado: 'PENDIENTE' }, open)).toBe('not-started');
    expect(editBlockReason({ estado: 'COMPLETADA' }, open)).toBe('completed');
    expect(editBlockReason({ estado: 'EN_CURSO' }, closed)).toBe('closed');
  });
});

describe('CANCELADA visits (defensive: the API never sends them to an ENCUESTADOR)', () => {
  const cancelled = { estado: 'CANCELADA' as const };
  it('are never actionable', () => {
    expect(canStart(cancelled, open)).toBe(false);
    expect(canFinish(cancelled, open)).toBe(false);
    expect(canEditPrices(cancelled, open)).toBe(false);
  });
  it('explain the block as cancelled, even on a closed relevamiento', () => {
    expect(editBlockReason(cancelled, open)).toBe('cancelled');
    expect(editBlockReason(cancelled, closed)).toBe('cancelled');
  });
  it('withoutCancelled drops them and keeps the other estados in order', () => {
    const list = [{ estado: 'PENDIENTE' as const }, cancelled, { estado: 'COMPLETADA' as const }];
    expect(withoutCancelled(list)).toEqual([{ estado: 'PENDIENTE' }, { estado: 'COMPLETADA' }]);
  });
});
