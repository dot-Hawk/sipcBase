import type { AsignacionEstado, Relevamiento } from '@/shared/api/types';

export interface Progress {
  priced: number;
  total: number;
  pct: number;
}

export function aggregateProgress(items: readonly { priced: number; total: number }[]): Progress {
  let priced = 0;
  let total = 0;
  for (const i of items) {
    priced += Math.min(i.priced, i.total);
    total += i.total;
  }
  return { priced, total, pct: total > 0 ? Math.round((priced / total) * 100) : 0 };
}

export function countByEstado(items: readonly { estado: AsignacionEstado }[]): Record<AsignacionEstado, number> {
  const out: Record<AsignacionEstado, number> = { PENDIENTE: 0, EN_CURSO: 0, COMPLETADA: 0, CANCELADA: 0 };
  for (const i of items) out[i.estado] += 1;
  return out;
}

const ORDER: Record<AsignacionEstado, number> = { EN_CURSO: 0, PENDIENTE: 1, COMPLETADA: 2, CANCELADA: 3 };

/** Visit in progress first, then those still to start, then finished ones, cancelled last. Stable. */
export function sortVisitas<T extends { estado: AsignacionEstado }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => ORDER[a.item.estado] - ORDER[b.item.estado] || a.index - b.index)
    .map((x) => x.item);
}

type Rel = Pick<Relevamiento, 'id' | 'estado' | 'fechaInicio'>;

/** The relevamiento the summary describes: newest open one, else the newest of all. */
export function pickPrimaryRelevamiento<T extends Rel>(relevamientos: readonly T[]): T | null {
  const newest = (list: readonly T[]) =>
    [...list].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))[0] ?? null;
  return newest(relevamientos.filter((r) => r.estado === 'ABIERTO')) ?? newest(relevamientos);
}

export interface VisitaGroup<T extends { rel: Rel | null }> {
  id: string;
  rel: T['rel'];
  items: T[];
}

/** Groups visitas by relevamiento: open ones first, newest first inside each kind. */
export function groupVisitas<T extends { rel: Rel | null }>(
  visitas: readonly T[],
  keyOf?: (v: T) => string,
): VisitaGroup<T>[] {
  const map = new Map<string, VisitaGroup<T>>();
  for (const v of visitas) {
    const id = keyOf ? keyOf(v) : (v.rel?.id ?? 'sin-relevamiento');
    const g: VisitaGroup<T> = map.get(id) ?? { id, rel: v.rel, items: [] as T[] };
    g.items.push(v);
    map.set(id, g);
  }
  return [...map.values()].sort((a, b) => {
    const ao = a.rel?.estado === 'ABIERTO' ? 0 : 1;
    const bo = b.rel?.estado === 'ABIERTO' ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return (b.rel?.fechaInicio ?? '').localeCompare(a.rel?.fechaInicio ?? '');
  });
}
