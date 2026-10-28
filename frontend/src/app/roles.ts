import type { Role } from '@/shared/api/types';

/** Single source of truth for what each role sees. Pure data and functions, no React. */

export const KNOWN_ROLES: readonly Role[] = ['ENCUESTADOR', 'COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'];
export const GESTION_ROLES: readonly Role[] = ['COORDINADOR', 'SUPERVISOR', 'ANALISTA', 'DIRECCION', 'AUDITOR'];

export type Section =
  | 'relevamientos'
  | 'asignaciones'
  | 'usuarios'
  | 'catalogo'
  | 'precios'
  | 'calculos'
  | 'auditoria'
  | 'cuenta';

/** Sections that appear in the navigation (everything but the account page). */
export type NavSection = Exclude<Section, 'cuenta'>;
export type NavIcon = NavSection;

export const FORBIDDEN_PATH = '/gestion/403';
export const GESTION_BASE = '/gestion';

export interface SectionMeta {
  label: string;
  /** One sentence on what the section will do; shown on the "Próximamente" placeholder of a section that is not built. */
  description: string;
}

export const SECTION_META: Record<NavSection, SectionMeta> = {
  relevamientos: {
    label: 'Relevamientos',
    description: 'Abrirá y cerrará los períodos de relevamiento y mostrará el avance de cada uno.',
  },
  asignaciones: {
    label: 'Asignaciones',
    description: 'Permitirá asignar comercios a los encuestadores de cada relevamiento y seguir su estado.',
  },
  usuarios: {
    label: 'Usuarios',
    description: 'Permitirá dar de alta, habilitar y asignar roles a las personas que usan el sistema.',
  },
  catalogo: {
    label: 'Catálogo',
    description: 'Permite mantener los comercios, los productos y la canasta que se relevan.',
  },
  precios: {
    label: 'Precios',
    description: 'Permite revisar los precios relevados, ver sus alertas y corregirlos mientras el relevamiento está abierto.',
  },
  calculos: {
    label: 'Cálculos',
    description: 'Permite calcular los relativos de precios por variedad entre dos meses, revisar las imputaciones y descargar los resultados.',
  },
  auditoria: {
    label: 'Auditoría',
    description: 'Muestra el registro de cambios de los precios: quién modificó qué y cuándo.',
  },
};

export const NAV_SECTIONS = Object.keys(SECTION_META) as NavSection[];

const NAV: Record<Role, readonly NavSection[]> = {
  ENCUESTADOR: [],
  COORDINADOR: ['relevamientos', 'asignaciones', 'usuarios', 'catalogo', 'auditoria'],
  SUPERVISOR: ['precios', 'auditoria'],
  ANALISTA: ['precios', 'auditoria'],
  DIRECCION: ['calculos', 'auditoria'],
  // Runs and exports the calculations; the backend gives it nothing else.
  AUDITOR: ['calculos'],
};

// The audit trail has no write endpoint at all, so it is read-only for everyone who can reach it.
const READ_ONLY: Partial<Record<Role, readonly NavSection[]>> = {
  COORDINADOR: ['auditoria'],
  SUPERVISOR: ['auditoria'],
  ANALISTA: ['auditoria'],
  DIRECCION: ['calculos', 'auditoria'],
};

const ROLE_LABEL: Record<Role, string> = {
  ENCUESTADOR: 'Encuestador',
  COORDINADOR: 'Coordinador',
  SUPERVISOR: 'Supervisor',
  ANALISTA: 'Analista',
  DIRECCION: 'Dirección',
  AUDITOR: 'Auditor',
};

export function isKnownRole(value: unknown): value is Role {
  return typeof value === 'string' && (KNOWN_ROLES as readonly string[]).includes(value);
}

export function hasGestion(role: Role): boolean {
  return role !== 'ENCUESTADOR';
}

export function sectionPath(section: Section): string {
  return `${GESTION_BASE}/${section}`;
}

export function roleLabel(role: Role): string {
  return ROLE_LABEL[role];
}

export function landingFor(role: Role): string {
  const first = NAV[role][0];
  return first ? sectionPath(first) : '/';
}

export interface NavItem {
  section: NavSection;
  label: string;
  path: string;
}

export function navFor(role: Role): NavItem[] {
  return NAV[role].map((section) => ({ section, label: SECTION_META[section].label, path: sectionPath(section) }));
}

export function canAccess(role: Role, section: Section): boolean {
  if (!hasGestion(role)) return false;
  if (section === 'cuenta') return true;
  return NAV[role].includes(section);
}

export function isReadOnly(role: Role, section: NavSection): boolean {
  return READ_ONLY[role]?.includes(section) ?? false;
}

export function isNavSection(value: string): value is NavSection {
  return Object.prototype.hasOwnProperty.call(SECTION_META, value);
}
