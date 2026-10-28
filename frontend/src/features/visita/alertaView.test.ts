import { describe, expect, it } from 'vitest';
import type { Alerta } from '@/shared/api/types';
import { describeAlerta, esAlertaPercentil } from './alertaView';

const legacy: Alerta = { media: 100, desvio: 5, n: 4, limiteInferior: 85, limiteSuperior: 115 };
const percentil: Alerta = {
  metodo: 'PERCENTIL_VARIACION',
  variedad: '1111101',
  precioAnterior: 1000,
  variacion: 1.5,
  percentilInferior: 5,
  percentilSuperior: 95,
  limiteInferior: 0.9,
  limiteSuperior: 1.1,
  rangoPrecio: { min: 900, max: 1100 },
  n: 120,
};

describe('esAlertaPercentil', () => {
  it('tells the new alert from the legacy one by its method', () => {
    expect(esAlertaPercentil(percentil)).toBe(true);
    expect(esAlertaPercentil(legacy)).toBe(false);
  });
});

describe('describeAlerta', () => {
  it('reads a legacy alert as a price range around the mean', () => {
    expect(describeAlerta(legacy)).toEqual({
      kind: 'historial',
      min: 85,
      max: 115,
      reference: 100,
      n: 4,
    });
  });

  it('reads a percentile alert as the expected price range around the previous price', () => {
    const view = describeAlerta(percentil);
    expect(view).toMatchObject({ kind: 'variedad', min: 900, max: 1100, reference: 1000, n: 120 });
    if (view.kind !== 'variedad') throw new Error('expected a variedad view');
    expect(view.usualMin).toBeCloseTo(-0.1, 9);
    expect(view.usualMax).toBeCloseTo(0.1, 9);
  });
});
