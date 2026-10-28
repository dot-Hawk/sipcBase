// Domain types mirror docs/api-contract-encuestador.md exactly.
export type Role = 'ENCUESTADOR' | 'SUPERVISOR' | 'ANALISTA' | 'COORDINADOR' | 'DIRECCION' | 'AUDITOR';

export interface User {
  id: string;
  nombre: string;
  apellido: string;
  role: Role;
  /** The fields below only exist after `/auth/me` has refreshed the stored user. */
  dni?: string | null;
  legajo?: string | null;
  email?: string | null;
  estado?: string;
  ultimoAcceso?: string | null;
}

/** GET /auth/me. */
export interface MeResponse extends User {
  dni: string | null;
  legajo: string | null;
  email: string | null;
  estado: string;
  ultimoAcceso: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export type Frecuencia = 'QUINCENAL' | 'MENSUAL';
export type RelevamientoEstado = 'ABIERTO' | 'CERRADO';

export interface Relevamiento {
  id: string;
  periodo: string;
  frecuencia: Frecuencia;
  fechaInicio: string;
  fechaLimite: string;
  estado: RelevamientoEstado;
  createdAt: string;
  updatedAt: string;
}

export type ComercioTipo =
  | 'SUPERMERCADO'
  | 'ALMACEN'
  | 'VERDULERIA'
  | 'CARNICERIA'
  | 'FARMACIA'
  | 'OTRO';

export type CatalogEstado = 'ACTIVO' | 'INACTIVO';

export interface Comercio {
  id: string;
  nombre: string;
  direccion: string;
  zona: string;
  tipo: ComercioTipo;
  estado: 'ACTIVO' | 'INACTIVO';
  createdAt: string;
  updatedAt: string;
}

export type Unidad = 'KG' | 'G' | 'LT' | 'ML' | 'UNIDAD';

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  unidad: Unidad;
  cantidadReferencia: number;
  marca: string | null;
  codigoVariedad: string;
  estado: 'ACTIVO' | 'INACTIVO';
  createdAt: string;
  updatedAt: string;
}

/** CANCELADA is terminal and reached only through the coordinator's cancellation; an ENCUESTADOR never receives it. */
export type AsignacionEstado = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADA' | 'CANCELADA';

export interface Asignacion {
  id: string;
  relevamiento: string;
  encuestador: string;
  comercio: string;
  estado: AsignacionEstado;
  createdAt: string;
  updatedAt: string;
}

/** Current rule: variation against the previous price, judged with the percentiles of the whole variedad. */
export interface AlertaPercentil {
  metodo: 'PERCENTIL_VARIACION';
  variedad: string;
  precioAnterior: number;
  /** New price over the previous one (1.5 = +50%). */
  variacion: number;
  /** Percentiles (0-100) that delimit the usual variation. */
  percentilInferior: number;
  percentilSuperior: number;
  /** Bounds of the usual variation (0.9 = −10%). */
  limiteInferior: number;
  limiteSuperior: number;
  /** The same bounds as prices, for the UI. */
  rangoPrecio: { min: number; max: number };
  /** Variations the percentiles come from. */
  n: number;
}

/** Previous rule (mean and deviation of the producto in its commerce). Old rows keep it: it has no `metodo`. */
export interface AlertaHistorica {
  media: number;
  desvio: number;
  n: number;
  limiteInferior: number;
  limiteSuperior: number;
}

export type Alerta = AlertaPercentil | AlertaHistorica;

export interface Precio {
  id: string;
  relevamiento: string;
  producto: string;
  comercio: string;
  encuestador: string;
  valor: number;
  oferta: boolean;
  fechaRelevamiento: string;
  observacion: string | null;
  alerta: Alerta | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /precios/anterior`: latest price of the producto at the comercio, from anyone. */
export interface PrecioAnterior {
  valor: number;
  periodo: string;
  oferta: boolean;
}

export interface PrecioAnteriorQuery {
  relevamiento: string;
  comercio: string;
  producto: string;
}

export interface CreatePrecioInput {
  relevamiento: string;
  comercio: string;
  producto: string;
  valor: number;
  oferta?: boolean;
  observacion?: string;
  /** ISO; not in the future, not before the relevamiento start. Defaults to the server time. */
  fechaRelevamiento?: string;
  confirmarDesvio?: boolean;
}

export interface UpdatePrecioInput {
  valor?: number;
  oferta?: boolean;
  /** A string sets it; `null` (or blank) clears it on the server. */
  observacion?: string | null;
  confirmarDesvio?: boolean;
}

export interface Adjunto {
  id: string;
  precio: string;
  mime: string;
  bytes: number;
  sha256: string;
  subidoPor: string;
  createdAt: string;
}

export interface PreciosQuery {
  relevamiento?: string;
  comercio?: string;
  producto?: string;
  oferta?: boolean;
  conAlerta?: boolean;
  page?: number;
  limit?: number;
}

// ---- Management (COORDINADOR) screens. See docs/api-contract-gestion.md.

export type UserEstado = 'ACTIVO' | 'INACTIVO' | 'LICENCIA';

/** A row of GET /users. `ultimoAcceso` is absent from the POST /users response. */
export interface ManagedUser {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  legajo: string;
  email: string;
  role: Role;
  estado: UserEstado;
  ultimoAcceso?: string | null;
}

export interface UsersQuery {
  role?: Role;
  estado?: UserEstado;
  /** 1-based. The API returns no total. */
  page?: number;
  /** 1..200, default 50. */
  limit?: number;
}

export interface CreateUserInput {
  nombre: string;
  apellido: string;
  dni: string;
  legajo: string;
  email: string;
  password: string;
  role: Role;
}

/** PATCH /users/:id: at least one field. Sending `role` for your own id is a 403 even if unchanged. */
export type UpdateUserInput = Partial<Omit<CreateUserInput, 'password'>>;

export interface CreateRelevamientoInput {
  periodo: string;
  frecuencia: Frecuencia;
  /** ISO 8601, `YYYY-MM-DD` or a full timestamp; both required, limit strictly after start (400 otherwise). */
  fechaInicio: string;
  fechaLimite: string;
}

export interface AsignacionesQuery {
  relevamiento?: string;
  encuestador?: string;
  comercio?: string;
  estado?: AsignacionEstado;
  /** Optional: without page/limit the backend returns every row. */
  page?: number;
  limit?: number;
}

export interface CreateAsignacionInput {
  relevamiento: string;
  encuestador: string;
  comercio: string;
}

export interface ComerciosQuery {
  /** Exact match (case sensitive) on the zone text. */
  zona?: string;
  tipo?: ComercioTipo;
  estado?: CatalogEstado;
}

export interface CreateComercioInput {
  nombre: string;
  direccion: string;
  zona: string;
  tipo: ComercioTipo;
}
export type UpdateComercioInput = Partial<CreateComercioInput>;

export interface ProductosQuery {
  categoria?: string;
  unidad?: Unidad;
  estado?: CatalogEstado;
  codigoVariedad?: string;
}

export interface CreateProductoInput {
  nombre: string;
  categoria: string;
  unidad: Unidad;
  cantidadReferencia: number;
  /** Optional on create. The API cannot clear it afterwards (null is rejected). */
  marca?: string;
  codigoVariedad: string;
}
export type UpdateProductoInput = Partial<CreateProductoInput>;

export type CanastaCategoria = 'NUCLEO' | 'ESTACIONAL' | 'REGULADO';

/** A node of the basket tree: nivel 0 (general) to 6 (variedad, the priced level). */
export interface CanastaNodo {
  codigo: string;
  nombre: string;
  nivel: number;
  padre: string | null;
  ponderador: number;
  /** Rebuilt from its variedades because the official spreadsheets have no row for it. */
  derivado: boolean;
  estado: CatalogEstado;
  /** Only variedades carry these three. */
  categoria: CanastaCategoria | null;
  codigoVariedad12: string | null;
  tratamientoEspecial: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanastaQuery {
  nivel?: number;
  padre?: string;
  categoria?: CanastaCategoria;
  estado?: CatalogEstado;
}

export interface CreateVariedadInput {
  /** 7 digits. */
  codigo: string;
  nombre: string;
  /** 5 digit codigo of an ACTIVO producto node. */
  padre: string;
  categoria: CanastaCategoria;
  ponderador?: number;
  codigoVariedad12?: string;
  tratamientoEspecial?: boolean;
}

// ---- Price review and audit trail (SUPERVISOR / ANALISTA / audit readers). See docs/api-contract-gestion.md.

/** Filters of `GET /precios` as the review screen uses them. `oferta: false` means "without offer". */
export interface PreciosGestionQuery {
  relevamiento?: string;
  comercio?: string;
  producto?: string;
  /** The API accepts it for every non-surveyor role, but only a COORDINADOR can list encuestadores. */
  encuestador?: string;
  oferta?: boolean;
  /** The API only accepts `true`. */
  conAlerta?: boolean;
  page?: number;
  limit?: number;
}

export type AccionAuditoria = 'CREACION' | 'MODIFICACION' | 'ELIMINACION' | 'ADJUNTO_AGREGADO' | 'ADJUNTO_ELIMINADO';

/** What `precio_auditoria` keeps of a price before and after an event. */
export interface PrecioSnapshot {
  valor: number;
  oferta: boolean;
  observacion: string | null;
  fechaRelevamiento: string;
}

export interface AdjuntoDetalle {
  adjunto: string;
  mime: string;
  bytes: number;
  sha256: string;
}

/** A row of `GET /auditoria/precios`: ids only, no names. */
export interface AuditoriaPrecio {
  id: string;
  precio: string;
  relevamiento: string;
  comercio: string;
  producto: string;
  accion: AccionAuditoria;
  usuario: string;
  /** The role of the actor when it happened (free text on the server). */
  rol: string;
  anterior: PrecioSnapshot | null;
  posterior: PrecioSnapshot | null;
  detalle: AdjuntoDetalle | null;
  createdAt: string;
}

export interface AuditoriaQuery {
  precio?: string;
  usuario?: string;
  relevamiento?: string;
  accion?: AccionAuditoria;
  page?: number;
  limit?: number;
}

// ---- Cálculos (relativos por variedad + imputaciones). See docs/api-contract-gestion.md.

export type EstadoCalculo = 'EJECUTANDO' | 'COMPLETADO' | 'FALLIDO';
export type FormatoArchivo = 'xlsx' | 'csv';

export interface ParametrosCalculo {
  /** Integer 0-12 (default 2). */
  esperarMeses: number;
  /** >= 0 (default 0.25). */
  pesoSuper: number;
  /** >= 0 (default 0.75). */
  pesoTrad: number;
  /** Default true. */
  omitirGruposCompletos: boolean;
}

export interface SinImputarDetalle {
  variedad: string;
  comercio: string;
  mes: string;
}

export interface ResumenCalculo {
  observaciones: number;
  variedades: number;
  informantes: number;
  imputaciones: number;
  sinImputar: number;
  /** At most 200 rows, even when `sinImputar` is larger. */
  sinImputarDetalle?: SinImputarDetalle[];
}

export interface Calculo {
  id: string;
  /** `AAAA-MM`. */
  mesBase: string;
  mesObjetivo: string;
  excluirOfertas: boolean;
  parametros: ParametrosCalculo;
  motorVersion: string;
  entradaHash: string;
  estado: EstadoCalculo;
  /** Only meaningful when `estado` is FALLIDO. */
  error: string | null;
  /** User id; names are resolvable only by a COORDINADOR. */
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
  /** Not guaranteed while the run is EJECUTANDO or FALLIDO. */
  resumen?: ResumenCalculo | null;
}

export interface CreateCalculoInput {
  mesBase: string;
  mesObjetivo: string;
  excluirOfertas?: boolean;
  parametros?: ParametrosCalculo;
}

export interface CalculosQuery {
  page?: number;
  limit?: number;
}

export interface CalculoRelativo {
  calculo: string;
  /** 7 digits. */
  variedad: string;
  mes: string;
  /** null = no shop had a price in both months. */
  valor: number | null;
  nSuper: number;
  nTrad: number;
}

export interface CalculoRelativosQuery {
  variedad?: string;
  mes?: string;
}

export interface CalculoImputacion {
  id: string;
  calculo: string;
  variedad: string;
  comercio: string;
  mes: string;
  precio: number;
  nivel: string | number;
  grupo: string | number | null;
  factor: number | null;
}

export interface CalculoExportacionQuery {
  mesBase: string;
  mesObjetivo: string;
  excluirOfertas?: boolean;
  formato?: FormatoArchivo;
}
