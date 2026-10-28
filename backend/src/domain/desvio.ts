// A price is judged by how much it changed against the previous price of the same producto in the same
// commerce, compared with how much the prices of its whole variedad usually change. The result is a
// warning for the surveyor, never a rejection: prices do change, and the person on site knows.

// Alert built by the current rule.
export interface AlertaPercentil {
  metodo: "PERCENTIL_VARIACION";
  variedad: string;
  precioAnterior: number;
  // New price over the previous one.
  variacion: number;
  // Percentiles (0-100) that delimit the usual range of the variedad.
  percentilInferior: number;
  percentilSuperior: number;
  // Bounds of the usual variation, after applying the minimum tolerance.
  limiteInferior: number;
  limiteSuperior: number;
  // The same bounds as prices (bounds times the previous price), to show the surveyor.
  rangoPrecio: { min: number; max: number };
  // Number of historical variations the percentiles come from.
  n: number;
}

// Alert of the previous rule (mean and standard deviation of the producto at the commerce). Rows saved
// with it are not migrated, so it is still read; it has no `metodo`.
export interface AlertaLegacy {
  media: number;
  desvio: number;
  n: number;
  limiteInferior: number;
  limiteSuperior: number;
}

export type Alerta = AlertaPercentil | AlertaLegacy;

export function esAlertaPercentil(alerta: Alerta): alerta is AlertaPercentil {
  return "metodo" in alerta;
}

export interface OpcionesDesvio {
  // Percentiles (0-100) of the variations of the variedad that delimit the usual range.
  percentilInferior?: number;
  percentilSuperior?: number;
  // Fewer variations than this are not enough to judge.
  muestraMinima?: number;
  // The usual range is never narrower than 1 ± this fraction, so a flat history (every variation
  // close to 1) does not turn every small change into an alarm.
  toleranciaMinima?: number;
}

export const PERCENTIL_INFERIOR = 5;
export const PERCENTIL_SUPERIOR = 95;
export const MUESTRA_MINIMA = 20;
export const TOLERANCIA_MINIMA = 0.1;

// Percentile `p` (0-100) with linear interpolation between the closest ranks (type 7: the usual
// spreadsheet PERCENTILE). Null for an empty list. The input is not modified.
export function percentil(valores: readonly number[], p: number): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const posicion = (p / 100) * (ordenados.length - 1);
  const abajo = Math.floor(posicion);
  const arriba = Math.ceil(posicion);
  const inferior = ordenados[abajo] as number;
  const superior = ordenados[arriba] as number;
  return inferior + (superior - inferior) * (posicion - abajo);
}

export interface EntradaVariacion {
  variedad: string;
  // Latest non-promotional price of the producto in the commerce before this relevamiento.
  precioAnterior: number | null;
  valor: number;
  // Historical variations (price over previous price) of the whole variedad.
  variaciones: readonly number[];
}

// Promotional prices are not judged: the caller does not ask for them.
export function evaluarVariacion(
  { variedad, precioAnterior, valor, variaciones }: EntradaVariacion,
  opciones: OpcionesDesvio = {},
): AlertaPercentil | null {
  const {
    percentilInferior = PERCENTIL_INFERIOR,
    percentilSuperior = PERCENTIL_SUPERIOR,
    muestraMinima = MUESTRA_MINIMA,
    toleranciaMinima = TOLERANCIA_MINIMA,
  } = opciones;

  if (precioAnterior === null || precioAnterior <= 0) return null;
  const n = variaciones.length;
  if (n < muestraMinima) return null;

  const bajo = percentil(variaciones, percentilInferior);
  const alto = percentil(variaciones, percentilSuperior);
  if (bajo === null || alto === null) return null;

  const limiteInferior = Math.min(bajo, 1 - toleranciaMinima);
  const limiteSuperior = Math.max(alto, 1 + toleranciaMinima);

  const variacion = valor / precioAnterior;
  if (variacion >= limiteInferior && variacion <= limiteSuperior) return null;

  return {
    metodo: "PERCENTIL_VARIACION",
    variedad,
    precioAnterior,
    variacion,
    percentilInferior,
    percentilSuperior,
    limiteInferior,
    limiteSuperior,
    rangoPrecio: { min: limiteInferior * precioAnterior, max: limiteSuperior * precioAnterior },
    n,
  };
}
