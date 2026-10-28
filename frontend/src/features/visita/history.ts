import type { Precio, Relevamiento } from '@/shared/api/types';

export interface SeriesPoint {
  periodo: string;
  valor: number;
  oferta: boolean;
}

interface Args {
  precios: readonly Precio[];
  relevamientos: readonly Relevamiento[];
  current: Pick<Relevamiento, 'id' | 'fechaInicio'>;
  comercio: string;
  producto: string;
  max?: number;
}

export const SERIES_MAX = 6;

/**
 * The surveyor's own earlier prices for one producto at one comercio, joined to
 * relevamientos by fechaInicio. Oldest first; the current relevamiento is excluded.
 */
export function buildPriceSeries({
  precios,
  relevamientos,
  current,
  comercio,
  producto,
  max = SERIES_MAX,
}: Args): SeriesPoint[] {
  const byId = new Map(relevamientos.map((r) => [r.id, r]));
  const currentStart = Date.parse(current.fechaInicio);
  const points: { start: number; point: SeriesPoint }[] = [];

  for (const p of precios) {
    if (p.comercio !== comercio || p.producto !== producto || p.relevamiento === current.id) continue;
    const rel = byId.get(p.relevamiento);
    if (!rel) continue;
    const start = Date.parse(rel.fechaInicio);
    if (!(start < currentStart)) continue;
    points.push({ start, point: { periodo: rel.periodo, valor: p.valor, oferta: p.oferta } });
  }

  points.sort((a, b) => a.start - b.start);
  return points.slice(-max).map((x) => x.point);
}
