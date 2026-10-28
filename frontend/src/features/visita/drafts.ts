export interface Draft {
  valor: string;
  oferta: boolean;
  observacion: string;
}
export type DraftMap = Record<string, Draft>;

const key = (asignacionId: string) => `sipc.drafts.${asignacionId}`;

export function loadDrafts(asignacionId: string): DraftMap {
  try {
    const raw = localStorage.getItem(key(asignacionId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as DraftMap) : {};
  } catch {
    return {};
  }
}

function write(asignacionId: string, map: DraftMap): void {
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(key(asignacionId));
    else localStorage.setItem(key(asignacionId), JSON.stringify(map));
  } catch {
    /* storage unavailable: drafts are a convenience only */
  }
}

export function saveDraft(asignacionId: string, productoId: string, draft: Draft): void {
  write(asignacionId, { ...loadDrafts(asignacionId), [productoId]: draft });
}

export function clearDraft(asignacionId: string, productoId: string): void {
  const { [productoId]: _removed, ...rest } = loadDrafts(asignacionId);
  write(asignacionId, rest);
}
