import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/shared/lib/money';
import type { AuditoriaPrecio, PrecioSnapshot } from '@/shared/api/types';
import { ACCION_LABEL, actorLabel, describeChange } from './diff';

const snap = (over: Partial<PrecioSnapshot> = {}): PrecioSnapshot => ({
  valor: 1000,
  oferta: false,
  observacion: null,
  fechaRelevamiento: '2026-10-08T12:00:00.000Z',
  ...over,
});
const entry = (over: Partial<AuditoriaPrecio>): AuditoriaPrecio => ({
  id: 'a1',
  precio: 'p1',
  relevamiento: 'r1',
  comercio: 'c1',
  producto: 'pr1',
  accion: 'MODIFICACION',
  usuario: 'u1',
  rol: 'SUPERVISOR',
  anterior: snap(),
  posterior: snap(),
  detalle: null,
  createdAt: '2026-10-09T10:00:00.000Z',
  ...over,
});

describe('describeChange', () => {
  it('lists only the fields that changed in a MODIFICACION', () => {
    const lines = describeChange(entry({ posterior: snap({ valor: 1250.5, oferta: true, observacion: 'Cartel de oferta' }) }));
    expect(lines).toEqual([
      { label: 'Valor', before: formatMoney(1000), after: formatMoney(1250.5) },
      { label: 'Oferta', before: 'No', after: 'Sí' },
      { label: 'Observación', before: 'Sin observación', after: 'Cartel de oferta' },
    ]);
  });
  it('shows a cleared observacion as such', () => {
    const lines = describeChange(entry({ anterior: snap({ observacion: 'Vencido' }), posterior: snap({ observacion: null }) }));
    expect(lines).toEqual([{ label: 'Observación', before: 'Vencido', after: 'Sin observación' }]);
  });
  it('says so when a MODIFICACION changed nothing visible', () => {
    expect(describeChange(entry({}))).toEqual([{ label: 'Cambio', before: null, after: 'Sin cambios en los datos del precio' }]);
  });
  it('describes a CREACION by its recorded values', () => {
    const lines = describeChange(entry({ accion: 'CREACION', anterior: null, posterior: snap({ valor: 900, oferta: true }) }));
    expect(lines).toEqual([
      { label: 'Valor', before: null, after: formatMoney(900) },
      { label: 'Oferta', before: null, after: 'Sí' },
    ]);
  });
  it('describes an ELIMINACION by what was removed', () => {
    const lines = describeChange(entry({ accion: 'ELIMINACION', anterior: snap({ valor: 700 }), posterior: null }));
    expect(lines).toEqual([
      { label: 'Valor', before: formatMoney(700), after: null },
      { label: 'Oferta', before: 'No', after: null },
    ]);
  });
  it('describes an attachment event from its detalle', () => {
    const lines = describeChange(
      entry({ accion: 'ADJUNTO_AGREGADO', anterior: null, posterior: null, detalle: { adjunto: 'x', mime: 'image/jpeg', bytes: 204800, sha256: 'abc' } }),
    );
    expect(lines).toEqual([{ label: 'Foto', before: null, after: 'image/jpeg, 200 KB' }]);
  });
  it('survives a row with no snapshots at all', () => {
    expect(describeChange(entry({ accion: 'ADJUNTO_ELIMINADO', anterior: null, posterior: null, detalle: null }))).toEqual([
      { label: 'Cambio', before: null, after: 'Sin detalle registrado' },
    ]);
  });
});

describe('labels', () => {
  it('names every action in Spanish', () => {
    expect(ACCION_LABEL.MODIFICACION).toBe('Corrección');
    expect(Object.keys(ACCION_LABEL)).toHaveLength(5);
  });
  it('names the actor by user when known, "Usted" for the signed-in user, and by role otherwise', () => {
    const known = new Map([['u1', 'Laura Ríos']]);
    expect(actorLabel(entry({}), known, 'zz')).toEqual({ name: 'Laura Ríos', role: 'Supervisor' });
    expect(actorLabel(entry({}), new Map(), 'u1')).toEqual({ name: 'Usted', role: 'Supervisor' });
    expect(actorLabel(entry({ rol: 'ENCUESTADOR' }), new Map(), 'zz')).toEqual({ name: null, role: 'Encuestador' });
    expect(actorLabel(entry({ rol: 'RAREZA' }), new Map(), 'zz')).toEqual({ name: null, role: 'RAREZA' });
  });
});
