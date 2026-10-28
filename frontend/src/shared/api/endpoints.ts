import { request, requestPage } from './client';
import type {
  Adjunto,
  AuditoriaPrecio,
  AuditoriaQuery,
  Asignacion,
  Calculo,
  CalculoExportacionQuery,
  CalculoImputacion,
  CalculoRelativo,
  CalculoRelativosQuery,
  CalculosQuery,
  CreateCalculoInput,
  FormatoArchivo,
  AsignacionEstado,
  AsignacionesQuery,
  CanastaNodo,
  CanastaQuery,
  CatalogEstado,
  Comercio,
  ComerciosQuery,
  CreateComercioInput,
  CreateProductoInput,
  CreateVariedadInput,
  CreateAsignacionInput,
  CreatePrecioInput,
  CreateRelevamientoInput,
  CreateUserInput,
  LoginResponse,
  ManagedUser,
  MeResponse,
  Precio,
  PrecioAnterior,
  PrecioAnteriorQuery,
  PreciosGestionQuery,
  PreciosQuery,
  Producto,
  ProductosQuery,
  Relevamiento,
  UpdateComercioInput,
  UpdatePrecioInput,
  UpdateProductoInput,
  UpdateUserInput,
  UserEstado,
  UsersQuery,
} from './types';

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      json: { email, password },
      skipUnauthorizedHandler: true,
    }),

  me: () => request<MeResponse>('/auth/me'),
  /** 204 on success; 400 `{message}` = wrong current password, 400 `{errors}` = validation. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/auth/password', { method: 'POST', json: { currentPassword, newPassword }, as: 'none' }),

  /** The surveyor gets only their own; a COORDINADOR gets all, filterable. Paginated only when page/limit is sent. */
  listAsignaciones: (q: AsignacionesQuery = {}) => request<Asignacion[]>('/asignaciones', { query: { ...q } }),
  /** Same list with `X-Total-Count`. Without page/limit the backend returns every row. */
  listAsignacionesPage: (q: AsignacionesQuery = {}) => requestPage<Asignacion>('/asignaciones', { query: { ...q } }),
  getAsignacion: (id: string) => request<Asignacion>(`/asignaciones/${id}`),
  updateAsignacionEstado: (id: string, estado: AsignacionEstado) =>
    request<Asignacion>(`/asignaciones/${id}/estado`, { method: 'PATCH', json: { estado } }),

  createAsignacion: (input: CreateAsignacionInput) =>
    request<Asignacion>('/asignaciones', { method: 'POST', json: input }),
  /** Only a PENDIENTE asignacion can be reassigned (409 otherwise). */
  cancelAsignacion: (id: string) => request<Asignacion>(`/asignaciones/${id}/cancelar`, { method: 'PATCH' }),

  reassignAsignacion: (id: string, encuestador: string) =>
    request<Asignacion>(`/asignaciones/${id}/encuestador`, { method: 'PATCH', json: { encuestador } }),

  createRelevamiento: (input: CreateRelevamientoInput) =>
    request<Relevamiento>('/relevamientos', { method: 'POST', json: input }),
  closeRelevamiento: (id: string) => request<Relevamiento>(`/relevamientos/${id}/cerrar`, { method: 'PATCH' }),

  /** COORDINADOR only. Plain array; the total travels in `X-Total-Count` (see `listUsersPage`). */
  listUsers: (q: UsersQuery = {}) => request<ManagedUser[]>('/users', { query: { ...q } }),
  listUsersPage: (q: UsersQuery = {}) => requestPage<ManagedUser>('/users', { query: { ...q } }),
  createUser: (input: CreateUserInput) => request<ManagedUser>('/users', { method: 'POST', json: input }),
  updateUser: (id: string, input: UpdateUserInput) =>
    request<ManagedUser>(`/users/${id}`, { method: 'PATCH', json: input }),
  setUserEstado: (id: string, estado: UserEstado) =>
    request<ManagedUser>(`/users/${id}/estado`, { method: 'PATCH', json: { estado } }),
  /** 204. The server is the authority on the password rules (min 8 characters). */
  resetUserPassword: (id: string, password: string) =>
    request<void>(`/users/${id}/password`, { method: 'PUT', json: { password }, as: 'none' }),

  listRelevamientos: () => request<Relevamiento[]>('/relevamientos'),
  listRelevamientosPage: () => requestPage<Relevamiento>('/relevamientos'),
  /** Any role. Plain array ordered by nombre; the backend has no page, total or text search. */
  listComercios: (q: ComerciosQuery = {}) => request<Comercio[]>('/comercios', { query: { ...q } }),
  getComercio: (id: string) => request<Comercio>(`/comercios/${id}`),
  /** COORDINADOR only. Created ACTIVO. */
  createComercio: (input: CreateComercioInput) => request<Comercio>('/comercios', { method: 'POST', json: input }),
  updateComercio: (id: string, input: UpdateComercioInput) =>
    request<Comercio>(`/comercios/${id}`, { method: 'PATCH', json: input }),
  setComercioEstado: (id: string, estado: CatalogEstado) =>
    request<Comercio>(`/comercios/${id}/estado`, { method: 'PATCH', json: { estado } }),

  /** Surveyor lookup: only ACTIVO productos. */
  listProductos: () => request<Producto[]>('/productos', { query: { estado: 'ACTIVO' } }),
  /** Management list: every estado unless filtered. Plain array ordered by nombre, no total. */
  listProductosGestion: (q: ProductosQuery = {}) => request<Producto[]>('/productos', { query: { ...q } }),
  getProducto: (id: string) => request<Producto>(`/productos/${id}`),
  createProducto: (input: CreateProductoInput) => request<Producto>('/productos', { method: 'POST', json: input }),
  updateProducto: (id: string, input: UpdateProductoInput) =>
    request<Producto>(`/productos/${id}`, { method: 'PATCH', json: input }),
  setProductoEstado: (id: string, estado: CatalogEstado) =>
    request<Producto>(`/productos/${id}/estado`, { method: 'PATCH', json: { estado } }),

  /** Any role. Plain array ordered by codigo, no page, no total. nivel=6 lists the variedades (677 rows today). */
  listCanasta: (q: CanastaQuery = {}) => request<CanastaNodo[]>('/canasta', { query: { ...q } }),
  getCanastaNodo: (codigo: string) => request<CanastaNodo>(`/canasta/${codigo}`),
  /** COORDINADOR only. Adds a nivel 6 node under an ACTIVO producto. 409 when the codigo exists. */
  createVariedad: (input: CreateVariedadInput) => request<CanastaNodo>('/canasta', { method: 'POST', json: input }),
  /** COORDINADOR only, nivel 6 only (404 otherwise). INACTIVO is the logical removal; ACTIVO brings it back. */
  setVariedadEstado: (codigo: string, estado: CatalogEstado) =>
    request<CanastaNodo>(`/canasta/${codigo}/estado`, { method: 'PATCH', json: { estado } }),

  listPrecios: (q: PreciosQuery = {}) =>
    request<Precio[]>('/precios', {
      query: { ...q, oferta: q.oferta ? 'true' : undefined, conAlerta: q.conAlerta ? 'true' : undefined },
    }),
  /**
   * Review list for any non-surveyor role: every price, filtered on the server, newest first. The
   * backend sends no `X-Total-Count` here today (the total is `null`); `oferta: false` is "without offer".
   */
  listPreciosPage: (q: PreciosGestionQuery = {}) =>
    requestPage<Precio>('/precios', {
      query: {
        relevamiento: q.relevamiento,
        comercio: q.comercio,
        producto: q.producto,
        encuestador: q.encuestador,
        oferta: q.oferta,
        conAlerta: q.conAlerta ? true : undefined,
        page: q.page,
        limit: q.limit,
      },
    }),
  getPrecio: (id: string) => request<Precio>(`/precios/${id}`),
  /** AUDITOR, DIRECCION. Newest first; no total from the backend today. */
  listAuditoriaPrecios: (q: AuditoriaQuery = {}) =>
    requestPage<AuditoriaPrecio>('/auditoria/precios', {
      query: { precio: q.precio, usuario: q.usuario, relevamiento: q.relevamiento, accion: q.accion, page: q.page, limit: q.limit },
    }),
  /** 200 with the price, 204 (no body) when there is none: resolved as `null`. 404 = comercio not assigned. */
  getPrecioAnterior: async (q: PrecioAnteriorQuery): Promise<PrecioAnterior | null> =>
    (await request<PrecioAnterior | undefined>('/precios/anterior', { query: { ...q } })) ?? null,
  createPrecio: (input: CreatePrecioInput) => request<Precio>('/precios', { method: 'POST', json: input }),
  updatePrecio: (id: string, input: UpdatePrecioInput) =>
    request<Precio>(`/precios/${id}`, { method: 'PATCH', json: input }),
  deletePrecio: (id: string) => request<void>(`/precios/${id}`, { method: 'DELETE', as: 'none' }),

  listAdjuntos: (precioId: string) => request<Adjunto[]>(`/precios/${precioId}/adjuntos`),
  uploadAdjunto: (precioId: string, blob: Blob) =>
    request<Adjunto>(`/precios/${precioId}/adjuntos`, {
      method: 'POST',
      raw: { body: blob, contentType: blob.type || 'application/octet-stream' },
    }),
  downloadAdjunto: (precioId: string, adjuntoId: string, signal?: AbortSignal) =>
    request<Blob>(`/precios/${precioId}/adjuntos/${adjuntoId}`, { as: 'blob', signal }),
  deleteAdjunto: (precioId: string, adjuntoId: string) =>
    request<void>(`/precios/${precioId}/adjuntos/${adjuntoId}`, { method: 'DELETE', as: 'none' }),

  /** AUDITOR only. Async: answers 202 with the run in EJECUTANDO; poll `getCalculo`. 409s carry only `{message}`. */
  createCalculo: (input: CreateCalculoInput) => request<Calculo>('/calculos', { method: 'POST', json: input }),
  /** Newest first, a bare array: no `X-Total-Count`, so `total` is null (limit <= 200, default 50). */
  listCalculos: (q: CalculosQuery = {}) => requestPage<Calculo>('/calculos', { query: { page: q.page, limit: q.limit } }),
  getCalculo: (id: string) => request<Calculo>(`/calculos/${id}`),
  /** Not paginated. `valor` is null when no shop had a price in both months. */
  listCalculoRelativos: (id: string, q: CalculoRelativosQuery = {}) =>
    request<CalculoRelativo[]>(`/calculos/${id}/relativos`, { query: { variedad: q.variedad, mes: q.mes } }),
  listCalculoImputaciones: (id: string, q: CalculosQuery = {}) =>
    requestPage<CalculoImputacion>(`/calculos/${id}/imputaciones`, { query: { page: q.page, limit: q.limit } }),
  /** File of a COMPLETADO run (409 otherwise). */
  downloadCalculoResultados: (id: string, formato: FormatoArchivo, signal?: AbortSignal) =>
    request<Blob>(`/calculos/${id}/resultados`, { query: { formato }, as: 'blob', signal }),
  /** AUDITOR only. The engine input for a range, without running it. Same 409s as `createCalculo`. */
  downloadCalculoExportacion: (q: CalculoExportacionQuery, signal?: AbortSignal) =>
    request<Blob>('/calculos/exportacion', {
      query: {
        mesBase: q.mesBase,
        mesObjetivo: q.mesObjetivo,
        excluirOfertas: q.excluirOfertas === undefined ? undefined : String(q.excluirOfertas),
        formato: q.formato,
      },
      as: 'blob',
      signal,
    }),
};

export const PRECIOS_PAGE_SIZE = 50;

/** Reads every page of the caller's precios (the API has no total). */
export async function fetchAllPrecios(
  query: Omit<PreciosQuery, 'page' | 'limit'> = {},
  maxPages = 25,
): Promise<Precio[]> {
  const limit = 200;
  const out: Precio[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await api.listPrecios({ ...query, page, limit });
    out.push(...chunk);
    if (chunk.length < limit) break;
  }
  return out;
}
