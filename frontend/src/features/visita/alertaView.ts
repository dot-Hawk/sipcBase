import type { Alerta, AlertaPercentil } from '@/shared/api/types';

export function esAlertaPercentil(alerta: Alerta): alerta is AlertaPercentil {
  return 'metodo' in alerta;
}

/** What the screens need from an alert, whichever rule produced it. Prices are in the money of the producto. */
export type AlertaView =
  | {
      /** Legacy alert: the mean and usual range of the producto in its commerce. */
      kind: 'historial';
      min: number;
      max: number;
      /** The mean of the history. */
      reference: number;
      n: number;
    }
  | {
      /** Percentile alert: the previous price and the usual variation of the whole variedad. */
      kind: 'variedad';
      min: number;
      max: number;
      /** The previous price. */
      reference: number;
      n: number;
      /** Usual variation as a fraction (0.1 = +10%), negative below the previous price. */
      usualMin: number;
      usualMax: number;
    };

export function describeAlerta(alerta: Alerta): AlertaView {
  if (esAlertaPercentil(alerta)) {
    return {
      kind: 'variedad',
      min: alerta.rangoPrecio.min,
      max: alerta.rangoPrecio.max,
      reference: alerta.precioAnterior,
      n: alerta.n,
      usualMin: alerta.limiteInferior - 1,
      usualMax: alerta.limiteSuperior - 1,
    };
  }
  return { kind: 'historial', min: alerta.limiteInferior, max: alerta.limiteSuperior, reference: alerta.media, n: alerta.n };
}
