import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_PATH,
  GESTION_ROLES,
  KNOWN_ROLES,
  canAccess,
  hasGestion,
  isKnownRole,
  isReadOnly,
  landingFor,
  navFor,
  roleLabel,
  sectionPath,
} from './roles';

describe('isKnownRole', () => {
  it('accepts the six backend roles only', () => {
    for (const r of KNOWN_ROLES) expect(isKnownRole(r)).toBe(true);
    expect(isKnownRole('AUDITOR')).toBe(true);
    expect(isKnownRole('ADMIN')).toBe(false);
    expect(isKnownRole('encuestador')).toBe(false);
    expect(isKnownRole(undefined)).toBe(false);
  });
});

describe('landingFor', () => {
  it.each([
    ['ENCUESTADOR', '/'],
    ['COORDINADOR', '/gestion/relevamientos'],
    ['SUPERVISOR', '/gestion/precios'],
    ['ANALISTA', '/gestion/precios'],
    ['DIRECCION', '/gestion/calculos'],
    ['AUDITOR', '/gestion/calculos'],
  ] as const)('%s lands on %s', (role, path) => {
    expect(landingFor(role)).toBe(path);
  });
});

describe('navFor', () => {
  const labels = (role: Parameters<typeof navFor>[0]) => navFor(role).map((i) => i.label);
  it('lists the sections of each role in order', () => {
    expect(labels('COORDINADOR')).toEqual(['Relevamientos', 'Asignaciones', 'Usuarios', 'Catálogo', 'Auditoría']);
    expect(canAccess('COORDINADOR', 'calculos')).toBe(false);
    expect(labels('SUPERVISOR')).toEqual(['Precios', 'Auditoría']);
    expect(labels('ANALISTA')).toEqual(['Precios', 'Auditoría']);
    expect(labels('DIRECCION')).toEqual(['Cálculos', 'Auditoría']);
    expect(labels('AUDITOR')).toEqual(['Cálculos']);
  });
  it('has no management nav for the surveyor', () => {
    expect(navFor('ENCUESTADOR')).toEqual([]);
  });
  it('points every item at its /gestion path and the landing is the first item', () => {
    for (const role of GESTION_ROLES) {
      const nav = navFor(role);
      for (const item of nav) expect(item.path).toBe(sectionPath(item.section));
      expect(nav[0]?.path).toBe(landingFor(role));
    }
  });
});

describe('canAccess', () => {
  it('follows the nav of each role', () => {
    expect(canAccess('COORDINADOR', 'usuarios')).toBe(true);
    expect(canAccess('SUPERVISOR', 'usuarios')).toBe(false);
    expect(canAccess('ANALISTA', 'relevamientos')).toBe(false);
    expect(canAccess('DIRECCION', 'precios')).toBe(false);
    expect(canAccess('DIRECCION', 'calculos')).toBe(true);
  });
  it('opens the calculations to AUDITOR and DIRECCION only, and nothing else to AUDITOR', () => {
    for (const role of ['SUPERVISOR', 'ANALISTA', 'COORDINADOR'] as const) expect(canAccess(role, 'calculos')).toBe(false);
    for (const section of ['relevamientos', 'asignaciones', 'usuarios', 'catalogo', 'precios', 'auditoria'] as const) {
      expect(canAccess('AUDITOR', section)).toBe(false);
    }
    expect(canAccess('AUDITOR', 'calculos')).toBe(true);
  });
  it('lets every management role open its account', () => {
    for (const role of GESTION_ROLES) expect(canAccess(role, 'cuenta')).toBe(true);
  });
  it('denies management sections to the surveyor', () => {
    expect(canAccess('ENCUESTADOR', 'cuenta')).toBe(false);
    expect(canAccess('ENCUESTADOR', 'precios')).toBe(false);
  });
});

describe('misc', () => {
  it('knows who has a management area', () => {
    expect(hasGestion('ENCUESTADOR')).toBe(false);
    expect(hasGestion('DIRECCION')).toBe(true);
  });
  it('marks read-only sections', () => {
    expect(isReadOnly('DIRECCION', 'calculos')).toBe(true);
    expect(isReadOnly('DIRECCION', 'auditoria')).toBe(true);
    expect(isReadOnly('AUDITOR', 'calculos')).toBe(false);
    expect(isReadOnly('COORDINADOR', 'usuarios')).toBe(false);
  });
  it('the audit trail is read-only for every role that can reach it', () => {
    for (const role of ['COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION'] as const) {
      expect(isReadOnly(role, 'auditoria')).toBe(true);
    }
  });
  it('only the reviewers write in precios', () => {
    expect(isReadOnly('SUPERVISOR', 'precios')).toBe(false);
    expect(isReadOnly('ANALISTA', 'precios')).toBe(false);
  });
  it('labels roles in Spanish and exposes the 403 path', () => {
    expect(roleLabel('DIRECCION')).toBe('Dirección');
    expect(roleLabel('ENCUESTADOR')).toBe('Encuestador');
    expect(roleLabel('AUDITOR')).toBe('Auditor');
    expect(FORBIDDEN_PATH).toBe('/gestion/403');
  });
});
