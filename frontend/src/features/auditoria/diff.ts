import { isKnownRole, roleLabel } from '@/app/roles';
import type { AccionAuditoria, AuditoriaPrecio, PrecioSnapshot } from '@/shared/api/types';
import { formatMoney } from '@/shared/lib/money';

export const ACCION_LABEL: Record<AccionAuditoria, string> = {
  CREACION: 'Carga',
  MODIFICACION: 'Corrección',
  ELIMINACION: 'Eliminación',
  ADJUNTO_AGREGADO: 'Foto agregada',
  ADJUNTO_ELIMINADO: 'Foto eliminada',
};

export const ACCIONES: readonly AccionAuditoria[] = [
  'CREACION',
  'MODIFICACION',
  'ELIMINACION',
  'ADJUNTO_AGREGADO',
  'ADJUNTO_ELIMINADO',
];

/** One row of the readable diff. `null` on a side = that side does not exist (creation or removal). */
export interface ChangeLine {
  label: string;
  before: string | null;
  after: string | null;
}

const NO_OBS = 'Sin observación';
const yesNo = (v: boolean) => (v ? 'Sí' : 'No');
const obs = (v: string | null) => (v && v.trim() !== '' ? v : NO_OBS);

/** Field-level diff of two snapshots (either may be null for a creation or a removal). */
export function diffSnapshots(a: PrecioSnapshot | null, b: PrecioSnapshot | null): ChangeLine[] {
  const lines: ChangeLine[] = [];
  const ref = (a ?? b) as PrecioSnapshot;
  const both = a !== null && b !== null;
  const side = (s: PrecioSnapshot | null, pick: (x: PrecioSnapshot) => string) => (s ? pick(s) : null);

  const fields: { label: string; pick: (x: PrecioSnapshot) => string; raw: (x: PrecioSnapshot) => unknown; always: boolean }[] = [
    { label: 'Valor', pick: (x) => formatMoney(x.valor), raw: (x) => x.valor, always: true },
    { label: 'Oferta', pick: (x) => yesNo(x.oferta), raw: (x) => x.oferta, always: true },
    { label: 'Observación', pick: (x) => obs(x.observacion), raw: (x) => x.observacion ?? null, always: false },
  ];
  for (const f of fields) {
    if (both) {
      if (f.raw(a) !== f.raw(b)) lines.push({ label: f.label, before: f.pick(a), after: f.pick(b) });
    } else if (f.always || (f.raw(ref) !== null && f.raw(ref) !== '')) {
      lines.push({ label: f.label, before: side(a, f.pick), after: side(b, f.pick) });
    }
  }
  return lines;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Readable diff of one audit row: only what changed on a correction, the recorded values on the others. */
export function describeChange(e: AuditoriaPrecio): ChangeLine[] {
  if (e.accion === 'ADJUNTO_AGREGADO' || e.accion === 'ADJUNTO_ELIMINADO') {
    if (!e.detalle) return [{ label: 'Cambio', before: null, after: 'Sin detalle registrado' }];
    const text = `${e.detalle.mime}, ${formatBytes(e.detalle.bytes)}`;
    return [
      e.accion === 'ADJUNTO_AGREGADO'
        ? { label: 'Foto', before: null, after: text }
        : { label: 'Foto', before: text, after: null },
    ];
  }
  if (!e.anterior && !e.posterior) return [{ label: 'Cambio', before: null, after: 'Sin detalle registrado' }];
  const lines = diffSnapshots(e.anterior, e.posterior);
  if (lines.length === 0) return [{ label: 'Cambio', before: null, after: 'Sin cambios en los datos del precio' }];
  return lines;
}

export interface ActorLabel {
  /** Null when the name cannot be resolved (only a COORDINADOR can read the users list). */
  name: string | null;
  role: string;
}

export function actorLabel(e: AuditoriaPrecio, names: ReadonlyMap<string, string>, selfId: string | null): ActorLabel {
  const role = isKnownRole(e.rol) ? roleLabel(e.rol) : e.rol;
  if (selfId !== null && e.usuario === selfId) return { name: 'Usted', role };
  return { name: names.get(e.usuario) ?? null, role };
}
