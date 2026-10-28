import type { Precio, Relevamiento } from '@/shared/api/types';

export interface PreviousPrice {
  valor: number;
  periodo: string;
  oferta: boolean;
}

interface Args {
  precios: readonly Precio[];
  relevamientos: readonly Relevamiento[];
  current: Pick<Relevamiento, 'id' | 'fechaInicio'>;
  comercio: string;
  producto: string;
}

type RemoteState = { status: 'pending' | 'error'; data: undefined } | { status: 'success'; data: PreviousPrice | null };

/**
 * The editor's "Anterior": the endpoint's answer (previous price from anyone) wins. A 204 means
 * there is none. While loading, offline or on any failure it degrades to the own-price derivation.
 */
export function resolvePrevious(remote: RemoteState | null, own: PreviousPrice | null): PreviousPrice | null {
  if (remote?.status === 'success') return remote.data;
  return own;
}

/**
 * Own-price fallback, used while /precios/anterior is loading or unavailable. Derived from the
 * surveyor's own precios at the same comercio, joined to relevamientos by fechaInicio.
 */
export function findPrevious({ precios, relevamientos, current, comercio, producto }: Args): PreviousPrice | null {
  const byId = new Map(relevamientos.map((r) => [r.id, r]));
  const currentStart = Date.parse(current.fechaInicio);
  let best: { precio: Precio; start: number; periodo: string } | null = null;

  for (const p of precios) {
    if (p.comercio !== comercio || p.producto !== producto || p.relevamiento === current.id) continue;
    const rel = byId.get(p.relevamiento);
    if (!rel) continue;
    const start = Date.parse(rel.fechaInicio);
    if (!(start < currentStart)) continue;
    if (!best || start > best.start) best = { precio: p, start, periodo: rel.periodo };
  }
  return best ? { valor: best.precio.valor, periodo: best.periodo, oferta: best.precio.oferta } : null;
}
