import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApiAuth } from './client';
import { api } from './endpoints';
import { ApiError } from './errors';

function stub(status: number, body?: unknown) {
  const fn = vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  configureApiAuth({ getToken: () => null, onUnauthorized: () => undefined });
});

describe('api.me', () => {
  it('GETs /api/auth/me with the bearer token', async () => {
    configureApiAuth({ getToken: () => 'tok', onUnauthorized: () => undefined });
    const fn = stub(200, { id: 'u1', role: 'ENCUESTADOR' });
    const res = await api.me();
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/me');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(res).toMatchObject({ id: 'u1' });
  });
  it('calls the unauthorized hook on 401', async () => {
    const onUnauthorized = vi.fn();
    configureApiAuth({ getToken: () => 't', onUnauthorized });
    stub(401, { message: 'Invalid or expired token' });
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalled();
  });
});

describe('api.changePassword', () => {
  it('POSTs the expected body and resolves on 204', async () => {
    const fn = stub(204);
    await expect(api.changePassword('old-pass', 'new-password')).resolves.toBeUndefined();
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/password');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'old-pass', newPassword: 'new-password' });
  });
  it('surfaces a 400 message shape as ApiError', async () => {
    stub(400, { message: 'The current password is not correct' });
    const err = await api.changePassword('x', 'long-enough').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).errors).toEqual([]);
  });
});

describe('api.getPrecioAnterior', () => {
  const q = { relevamiento: 'r1', comercio: 'c1', producto: 'p1' };
  it('GETs /api/precios/anterior with the three filters', async () => {
    const fn = stub(200, { valor: 1500, periodo: '2026-09', oferta: true });
    const res = await api.getPrecioAnterior(q);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/precios/anterior?relevamiento=r1&comercio=c1&producto=p1');
    expect(init.method).toBe('GET');
    expect(res).toEqual({ valor: 1500, periodo: '2026-09', oferta: true });
  });
  it('resolves null on 204 (no previous price)', async () => {
    stub(204);
    await expect(api.getPrecioAnterior(q)).resolves.toBeNull();
  });
  it('rejects with ApiError on 404 (comercio not assigned)', async () => {
    stub(404, { message: 'Asignacion not found' });
    const err = await api.getPrecioAnterior(q).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
  it('surfaces 400 validation errors', async () => {
    stub(400, { errors: [{ field: 'producto', message: 'producto is required' }] });
    const err = await api.getPrecioAnterior({ ...q, producto: '' }).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).errors).toEqual([{ field: 'producto', message: 'producto is required' }]);
  });
});

describe('management endpoints', () => {
  function call(): [string, RequestInit] {
    return (vi.mocked(globalThis.fetch).mock.calls[0] as unknown) as [string, RequestInit];
  }

  it('lists users with filters and 1-based pagination', async () => {
    stub(200, []);
    await api.listUsers({ role: 'ENCUESTADOR', estado: 'ACTIVO', page: 2, limit: 50 });
    expect(call()[0]).toBe('/api/users?role=ENCUESTADOR&estado=ACTIVO&page=2&limit=50');
  });

  it('creates a user with POST', async () => {
    stub(201, { id: 'u1' });
    const body = { nombre: 'A', apellido: 'B', dni: '1', legajo: 'L', email: 'a@b.c', password: 'password1', role: 'ANALISTA' as const };
    await api.createUser(body);
    expect(call()[0]).toBe('/api/users');
    expect(call()[1].method).toBe('POST');
    expect(JSON.parse(String(call()[1].body))).toEqual(body);
  });

  it('PATCHes a user and its estado', async () => {
    stub(200, { id: 'u1' });
    await api.updateUser('u1', { nombre: 'Z' });
    expect(call()[0]).toBe('/api/users/u1');
    expect(call()[1].method).toBe('PATCH');
    vi.unstubAllGlobals();
    stub(200, { id: 'u1' });
    await api.setUserEstado('u1', 'LICENCIA');
    expect(call()[0]).toBe('/api/users/u1/estado');
    expect(JSON.parse(String(call()[1].body))).toEqual({ estado: 'LICENCIA' });
  });

  it('resets a password with PUT and resolves on 204', async () => {
    stub(204);
    await expect(api.resetUserPassword('u1', 'new-password')).resolves.toBeUndefined();
    expect(call()[0]).toBe('/api/users/u1/password');
    expect(call()[1].method).toBe('PUT');
    expect(JSON.parse(String(call()[1].body))).toEqual({ password: 'new-password' });
  });

  it('creates and closes a relevamiento', async () => {
    stub(201, { id: 'r1' });
    const body = { periodo: '2026-11', frecuencia: 'MENSUAL' as const, fechaInicio: '2026-11-01T00:00:00.000Z', fechaLimite: '2026-11-30T00:00:00.000Z' };
    await api.createRelevamiento(body);
    expect(call()[0]).toBe('/api/relevamientos');
    expect(call()[1].method).toBe('POST');
    vi.unstubAllGlobals();
    stub(200, { id: 'r1' });
    await api.closeRelevamiento('r1');
    expect(call()[0]).toBe('/api/relevamientos/r1/cerrar');
    expect(call()[1].method).toBe('PATCH');
  });

  it('filters, creates and reassigns asignaciones', async () => {
    stub(200, []);
    await api.listAsignaciones({ relevamiento: 'r1', estado: 'PENDIENTE' });
    expect(call()[0]).toBe('/api/asignaciones?relevamiento=r1&estado=PENDIENTE');
    vi.unstubAllGlobals();
    stub(201, { id: 'a1' });
    await api.createAsignacion({ relevamiento: 'r1', encuestador: 'e1', comercio: 'c1' });
    expect(call()[0]).toBe('/api/asignaciones');
    expect(call()[1].method).toBe('POST');
    vi.unstubAllGlobals();
    stub(200, { id: 'a1' });
    await api.reassignAsignacion('a1', 'e2');
    expect(call()[0]).toBe('/api/asignaciones/a1/encuestador');
    expect(call()[1].method).toBe('PATCH');
    expect(JSON.parse(String(call()[1].body))).toEqual({ encuestador: 'e2' });
  });
});

describe('paged list endpoints', () => {
  function stubList(items: unknown[], headers: Record<string, string> = {}) {
    const fn = vi.fn(async () => new Response(JSON.stringify(items), { status: 200, headers }));
    vi.stubGlobal('fetch', fn);
    return fn;
  }
  it('listUsersPage returns the body and the X-Total-Count', async () => {
    const fn = stubList([{ id: 'u1' }], { 'X-Total-Count': '73' });
    const res = await api.listUsersPage({ page: 2, limit: 50 });
    expect(res).toEqual({ items: [{ id: 'u1' }], total: 73 });
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe('/api/users?page=2&limit=50');
  });
  it('total is null when the header is absent (older backend)', async () => {
    stubList([{ id: 'a1' }]);
    expect(await api.listAsignacionesPage({})).toEqual({ items: [{ id: 'a1' }], total: null });
    stubList([]);
    expect(await api.listRelevamientosPage()).toEqual({ items: [], total: null });
  });
  it('the plain list endpoints still return a bare array', async () => {
    stubList([{ id: 'a1' }], { 'X-Total-Count': '1' });
    expect(await api.listAsignaciones()).toEqual([{ id: 'a1' }]);
    expect(await api.listUsers()).toEqual([{ id: 'a1' }]);
    expect(await api.listRelevamientos()).toEqual([{ id: 'a1' }]);
  });
  it('page errors still throw ApiError with the stable code', async () => {
    stub(409, { message: 'x', code: 'USER_DUPLICATE', errors: [] });
    await expect(api.listUsersPage()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('catalogue endpoints', () => {
  function stubJson(status: number, body: unknown) {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fn);
    return fn;
  }
  const call = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0] as unknown as [string, RequestInit];

  it('lists comercios with the filters the backend exposes (zona, tipo, estado)', async () => {
    const fn = stubJson(200, []);
    await api.listComercios({ estado: 'INACTIVO', tipo: 'ALMACEN', zona: 'Centro' });
    expect(call(fn)[0]).toBe('/api/comercios?estado=INACTIVO&tipo=ALMACEN&zona=Centro');
  });
  it('keeps listComercios() without filters for the lookups', async () => {
    const fn = stubJson(200, []);
    await api.listComercios();
    expect(call(fn)[0]).toBe('/api/comercios');
  });
  it('creates, updates and changes the estado of a comercio', async () => {
    let fn = stubJson(201, { id: 'c1' });
    await api.createComercio({ nombre: 'A', direccion: 'B', zona: 'C', tipo: 'OTRO' });
    expect([call(fn)[0], call(fn)[1].method]).toEqual(['/api/comercios', 'POST']);
    fn = stubJson(200, { id: 'c1' });
    await api.updateComercio('c1', { zona: 'Norte' });
    expect([call(fn)[0], call(fn)[1].method, call(fn)[1].body]).toEqual(['/api/comercios/c1', 'PATCH', '{"zona":"Norte"}']);
    fn = stubJson(200, { id: 'c1' });
    await api.setComercioEstado('c1', 'INACTIVO');
    expect([call(fn)[0], call(fn)[1].body]).toEqual(['/api/comercios/c1/estado', '{"estado":"INACTIVO"}']);
    fn = stubJson(200, { id: 'c1' });
    await api.getComercio('c1');
    expect(call(fn)[0]).toBe('/api/comercios/c1');
  });
  it('lists productos for management without forcing estado, and keeps the surveyor list ACTIVO', async () => {
    let fn = stubJson(200, []);
    await api.listProductosGestion({ categoria: 'Almacén', unidad: 'KG', codigoVariedad: '1112101' });
    expect(call(fn)[0]).toBe('/api/productos?categoria=Almac%C3%A9n&unidad=KG&codigoVariedad=1112101');
    fn = stubJson(200, []);
    await api.listProductos();
    expect(call(fn)[0]).toBe('/api/productos?estado=ACTIVO');
  });
  it('creates, updates and changes the estado of a producto', async () => {
    let fn = stubJson(201, { id: 'p1' });
    await api.createProducto({ nombre: 'A', categoria: 'B', unidad: 'KG', cantidadReferencia: 1, codigoVariedad: '1111101' });
    expect([call(fn)[0], call(fn)[1].method]).toEqual(['/api/productos', 'POST']);
    fn = stubJson(200, { id: 'p1' });
    await api.updateProducto('p1', { marca: 'X' });
    expect([call(fn)[0], call(fn)[1].method]).toEqual(['/api/productos/p1', 'PATCH']);
    fn = stubJson(200, { id: 'p1' });
    await api.setProductoEstado('p1', 'INACTIVO');
    expect(call(fn)[0]).toBe('/api/productos/p1/estado');
  });
  it('lists the canasta with its filters and reads one node', async () => {
    let fn = stubJson(200, []);
    await api.listCanasta({ nivel: 6, estado: 'ACTIVO', categoria: 'NUCLEO', padre: '11111' });
    expect(call(fn)[0]).toBe('/api/canasta?nivel=6&estado=ACTIVO&categoria=NUCLEO&padre=11111');
    fn = stubJson(200, { codigo: '1111101' });
    await api.getCanastaNodo('1111101');
    expect(call(fn)[0]).toBe('/api/canasta/1111101');
  });
  it('adds a variedad and removes it logically through the estado', async () => {
    let fn = stubJson(201, { codigo: '1111103' });
    await api.createVariedad({ codigo: '1111103', nombre: 'X', padre: '11111', categoria: 'NUCLEO' });
    expect([call(fn)[0], call(fn)[1].method]).toEqual(['/api/canasta', 'POST']);
    fn = stubJson(200, { codigo: '1111103' });
    await api.setVariedadEstado('1111103', 'INACTIVO');
    expect([call(fn)[0], call(fn)[1].method, call(fn)[1].body]).toEqual([
      '/api/canasta/1111103/estado',
      'PATCH',
      '{"estado":"INACTIVO"}',
    ]);
  });
});

describe('price review and audit endpoints', () => {
  function stubHeaders(body: unknown, headers: Record<string, string> = {}) {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers }));
    vi.stubGlobal('fetch', fn);
    return fn;
  }
  const call = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0] as unknown as [string, RequestInit];

  it('lists precios with every real filter and returns the rows with a null total when the header is absent', async () => {
    const fn = stubHeaders([{ id: 'p1' }]);
    const page = await api.listPreciosPage({
      relevamiento: 'r1',
      comercio: 'c1',
      producto: 'pr1',
      encuestador: 'e1',
      oferta: false,
      conAlerta: true,
      page: 2,
      limit: 25,
    });
    expect(call(fn)[0]).toBe(
      '/api/precios?relevamiento=r1&comercio=c1&producto=pr1&encuestador=e1&oferta=false&conAlerta=true&page=2&limit=25',
    );
    expect(page).toEqual({ items: [{ id: 'p1' }], total: null });
  });

  it('sends oferta=true, omits oferta when undefined and never sends conAlerta=false', async () => {
    let fn = stubHeaders([]);
    await api.listPreciosPage({ oferta: true, conAlerta: false });
    expect(call(fn)[0]).toBe('/api/precios?oferta=true');
    fn = stubHeaders([]);
    await api.listPreciosPage({});
    expect(call(fn)[0]).toBe('/api/precios');
  });

  it('reads X-Total-Count when the backend sends it', async () => {
    stubHeaders([{ id: 'p1' }], { 'X-Total-Count': '41' });
    await expect(api.listPreciosPage({ limit: 25 })).resolves.toEqual({ items: [{ id: 'p1' }], total: 41 });
  });

  it('reads one precio', async () => {
    const fn = stubHeaders({ id: 'p1' });
    await api.getPrecio('p1');
    expect(call(fn)[0]).toBe('/api/precios/p1');
  });

  it('corrects a precio with only the fields sent, including a null observacion to clear it', async () => {
    const fn = stubHeaders({ id: 'p1' });
    await api.updatePrecio('p1', { valor: 1500, observacion: null, confirmarDesvio: true });
    const [url, init] = call(fn);
    expect([url, init.method]).toEqual(['/api/precios/p1', 'PATCH']);
    expect(JSON.parse(String(init.body))).toEqual({ valor: 1500, observacion: null, confirmarDesvio: true });
  });

  it('lists the audit trail with its four filters plus paging', async () => {
    const fn = stubHeaders([{ id: 'a1' }], { 'X-Total-Count': '9' });
    const page = await api.listAuditoriaPrecios({ precio: 'p1', usuario: 'u1', relevamiento: 'r1', accion: 'MODIFICACION', page: 3, limit: 25 });
    expect(call(fn)[0]).toBe('/api/auditoria/precios?precio=p1&usuario=u1&relevamiento=r1&accion=MODIFICACION&page=3&limit=25');
    expect(page.total).toBe(9);
  });
});

describe('api.cancelAsignacion', () => {
  it('PATCHes /asignaciones/:id/cancelar without a body', async () => {
    const fn = stub(200, { id: 'a1', estado: 'CANCELADA' });
    const res = await api.cancelAsignacion('a1');
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/asignaciones/a1/cancelar');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBeUndefined();
    expect(res.estado).toBe('CANCELADA');
  });
});

describe('calculos endpoints', () => {
  const CALC = { id: 'c1', estado: 'EJECUTANDO' };
  it('createCalculo POSTs the body and returns the 202 run', async () => {
    const fn = stub(202, CALC);
    const body = { mesBase: '2026-01', mesObjetivo: '2026-06', excluirOfertas: true };
    await expect(api.createCalculo(body)).resolves.toMatchObject({ id: 'c1' });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/calculos');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(body);
  });
  it('listCalculos reads a bare array, with no total, and sends page/limit', async () => {
    const fn = stub(200, [CALC]);
    const res = await api.listCalculos({ page: 2, limit: 20 });
    expect(res).toEqual({ items: [CALC], total: null });
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe('/api/calculos?page=2&limit=20');
  });
  it('getCalculo GETs one run', async () => {
    const fn = stub(200, CALC);
    await api.getCalculo('abc');
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe('/api/calculos/abc');
  });
  it('listCalculoRelativos sends the filters and drops empty ones', async () => {
    const fn = stub(200, []);
    await api.listCalculoRelativos('abc', { variedad: '1111101', mes: '' });
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe('/api/calculos/abc/relativos?variedad=1111101');
  });
  it('listCalculoImputaciones is paged without a total', async () => {
    const fn = stub(200, [{ id: 'i1' }]);
    const res = await api.listCalculoImputaciones('abc', { page: 3, limit: 50 });
    expect(res.total).toBeNull();
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe('/api/calculos/abc/imputaciones?page=3&limit=50');
  });
  it('downloadCalculoResultados returns the file as a Blob', async () => {
    const fn = vi.fn(async () => new Response('a,b', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    vi.stubGlobal('fetch', fn);
    const blob = await api.downloadCalculoResultados('abc', 'csv');
    expect(blob).toMatchObject({ size: 3, type: 'text/csv' });
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe('/api/calculos/abc/resultados?formato=csv');
  });
  it('downloadCalculoExportacion sends the range, the offers flag and the format', async () => {
    const fn = vi.fn(async () => new Response('x', { status: 200 }));
    vi.stubGlobal('fetch', fn);
    await api.downloadCalculoExportacion({ mesBase: '2026-01', mesObjetivo: '2026-03', excluirOfertas: false, formato: 'xlsx' });
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(
      '/api/calculos/exportacion?mesBase=2026-01&mesObjetivo=2026-03&excluirOfertas=false&formato=xlsx',
    );
  });
  it('a 409 download keeps the status and the message (no code)', async () => {
    stub(409, { message: 'No hay precios cargados en el rango indicado' });
    const err = await api.downloadCalculoExportacion({ mesBase: '2026-01', mesObjetivo: '2026-03' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBeNull();
    expect((err as ApiError).message).toMatch(/No hay precios/);
  });
});
