#!/usr/bin/env node
/**
 * DEV TOOLING ONLY. Not part of the product and not the real backend.
 *
 * Dependency-free mock of the API surface used by the ENCUESTADOR module
 * (see docs/api-contract-encuestador.md). It exists because the real backend
 * has no demo surveyor. State is in memory and resets when the process restarts.
 *
 *   npm run mock            -> http://localhost:3000
 *   Login: encuestador@sipc.test / sipc12345
 *   Other roles (all sipc12345): coordinador@, supervisor@, analista@, direccion@ sipc.test
 *
 * Management (COORDINADOR) surface: /users, relevamientos create/close, asignaciones create/reassign,
 * following docs/api-contract-gestion.md (read from the real backend). Extra users for pagination:
 * MOCK_EXTRA_USERS=60 npm run mock.
 *
 * Contract switches (mock = backend contract by default):
 *   MOCK_LEGACY_ERRORS=1  behave like a backend that predates the additive contract: no `code` on the
 *                         409s, no X-Total-Count, page/limit ignored on relevamientos/asignaciones,
 *                         POST /users answers without ultimoAcceso. Exercises the UI fallbacks.
 *   MOCK_DUP_NO_DETAIL=1  USER_DUPLICATE answers `errors: []` (the driver gave no detail).
 *
 * Catalogue (COORDINADOR writes; any role reads): /comercios, /productos, /canasta[/:codigo] with the real
 * filters, validators and 409s of the backend (no page, no X-Total-Count, no `code` on those 409s).
 *
 * Price review and audit (SUPERVISOR / ANALISTA / COORDINADOR / DIRECCION), read from the backend source:
 *   GET /precios (every price for non-surveyors; filters relevamiento, comercio, producto, encuestador, oferta,
 *   conAlerta=true, page, limit; NO X-Total-Count), PATCH /precios/:id (ENCUESTADOR owner, SUPERVISOR and ANALISTA
 *   on any price; only while the relevamiento is ABIERTO; the 409 for a closed relevamiento carries no `code`),
 *   GET /auditoria/precios (filters precio, usuario, relevamiento, accion, page, limit; newest first).
 *   MOCK_PRECIOS_TOTAL=1 adds X-Total-Count to both lists, to exercise "Mostrando X-Y de N".
 *
 * Cálculos (/api/calculos; read: SUPERVISOR, ANALISTA, COORDINADOR, DIRECCION; run and exportacion: ANALISTA, COORDINADOR):
 *   POST answers 202 with the run EJECUTANDO, which settles to COMPLETADO after the second GET that touches it (detail or
 *   list). One run at a time (409). Valid demo range: 2026-07 -> 2026-09 (2026-10 is ABIERTO, so it answers the "abiertos"
 *   409; other months answer "no hay relevamientos"). Set parametros.esperarMeses = 12 to make the run FALLIDO; set
 *   omitirGruposCompletos = false to get 250 unimputed cases (the detail is cut at 200). The list and imputaciones carry
 *   no X-Total-Count. The xlsx download is a placeholder file, not a real workbook; csv is real.
 *
 * Outbox demo rules (visit asig-2, EN_CURSO): a value far from the history answers the atypical
 * 409; a value >= 1.000.000 answers 400 (rejected); `POST /__mock/outage {status}` makes every
 * /api request except auth answer that status until `POST /__mock/outage {}` clears it.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
const SECRET = 'mock-secret-not-for-production';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ATTACH = 5;
const MAX_VALOR = 1_000_000; // mock-only: values at or above this are answered 400

const LEGACY = process.env.MOCK_LEGACY_ERRORS === '1';
const DUP_NO_DETAIL = process.env.MOCK_DUP_NO_DETAIL === '1';
const PRECIOS_TOTAL = process.env.MOCK_PRECIOS_TOTAL === '1';

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---------- seed ----------
const USERS = [
  { id: 'u-enc-1', email: 'encuestador@sipc.test', password: 'sipc12345', nombre: 'Juan', apellido: 'Pérez', role: 'ENCUESTADOR', dni: '30111222', legajo: 'ENC-001', estado: 'ACTIVO', ultimoAcceso: null },
  { id: 'u-enc-2', email: 'otro.encuestador@sipc.test', password: 'sipc12345', nombre: 'Marta', apellido: 'Gómez', role: 'ENCUESTADOR', dni: '30333444', legajo: 'ENC-002', estado: 'ACTIVO', ultimoAcceso: null },
  { id: 'u-sup-1', email: 'supervisor@sipc.test', password: 'sipc12345', nombre: 'Laura', apellido: 'Ríos', role: 'SUPERVISOR', dni: '27555666', legajo: 'SUP-001', estado: 'ACTIVO', ultimoAcceso: null },
  { id: 'u-coo-1', email: 'coordinador@sipc.test', password: 'sipc12345', nombre: 'Carlos', apellido: 'Méndez', role: 'COORDINADOR', dni: '26111333', legajo: 'COO-001', estado: 'ACTIVO', ultimoAcceso: null },
  { id: 'u-ana-1', email: 'analista@sipc.test', password: 'sipc12345', nombre: 'Sofía', apellido: 'Luna', role: 'ANALISTA', dni: '31222444', legajo: 'ANA-001', estado: 'ACTIVO', ultimoAcceso: null },
  { id: 'u-dir-1', email: 'direccion@sipc.test', password: 'sipc12345', nombre: 'Elena', apellido: 'Vega', role: 'DIRECCION', dni: '22333555', legajo: 'DIR-001', estado: 'ACTIVO', ultimoAcceso: null },
  { id: 'u-enc-3', email: 'roberto.sosa@sipc.test', password: 'sipc12345', nombre: 'Roberto', apellido: 'Sosa', role: 'ENCUESTADOR', dni: '32444555', legajo: 'ENC-003', estado: 'LICENCIA', ultimoAcceso: '2026-09-20T13:00:00.000Z' },
  { id: 'u-enc-4', email: 'paula.diaz@sipc.test', password: 'sipc12345', nombre: 'Paula', apellido: 'Díaz', role: 'ENCUESTADOR', dni: '33555666', legajo: 'ENC-004', estado: 'INACTIVO', ultimoAcceso: '2026-07-02T09:30:00.000Z' },
  { id: 'u-enc-5', email: 'tomas.ibarra@sipc.test', password: 'sipc12345', nombre: 'Tomás', apellido: 'Ibarra', role: 'ENCUESTADOR', dni: '34666777', legajo: 'ENC-005', estado: 'ACTIVO', ultimoAcceso: '2026-10-13T16:45:00.000Z' },
  { id: 'u-coo-2', email: 'coordinadora.2@sipc.test', password: 'sipc12345', nombre: 'Verónica', apellido: 'Acosta', role: 'COORDINADOR', dni: '25777888', legajo: 'COO-002', estado: 'ACTIVO', ultimoAcceso: '2026-10-12T08:10:00.000Z' },
  { id: 'u-sup-2', email: 'supervisor.2@sipc.test', password: 'sipc12345', nombre: 'Hugo', apellido: 'Benítez', role: 'SUPERVISOR', dni: '28888999', legajo: 'SUP-002', estado: 'INACTIVO', ultimoAcceso: null },
];
for (let i = 0; i < Number(process.env.MOCK_EXTRA_USERS ?? 0); i += 1) {
  USERS.push({
    id: `u-extra-${i}`, email: `extra.${i}@sipc.test`, password: 'sipc12345', nombre: `Extra${i}`, apellido: `Prueba${String(i).padStart(3, '0')}`,
    role: ['ENCUESTADOR', 'ANALISTA', 'SUPERVISOR'][i % 3], dni: String(40000000 + i), legajo: `EXT-${i}`, estado: 'ACTIVO', ultimoAcceso: null,
  });
}

const rel = (id, periodo, fechaInicio, fechaLimite, estado) => ({
  id, periodo, frecuencia: 'MENSUAL', fechaInicio, fechaLimite, estado, createdAt: fechaInicio, updatedAt: fechaInicio,
});
const relevamientos = [
  rel('rel-2026-07', '2026-07', '2026-07-01T00:00:00.000Z', '2026-07-28T00:00:00.000Z', 'CERRADO'),
  rel('rel-2026-08', '2026-08', '2026-08-01T00:00:00.000Z', '2026-08-28T00:00:00.000Z', 'CERRADO'),
  rel('rel-2026-09', '2026-09', '2026-09-01T00:00:00.000Z', '2026-09-28T00:00:00.000Z', 'CERRADO'),
  rel('rel-2026-10', '2026-10', '2026-10-01T00:00:00.000Z', '2026-10-30T00:00:00.000Z', 'ABIERTO'),
];

const com = (id, nombre, direccion, zona, tipo) => ({
  id, nombre, direccion, zona, tipo, estado: 'ACTIVO', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const comercios = [
  com('com-1', 'Supermercado Carrefour Express', 'Av. 25 de Mayo 450', 'Centro', 'SUPERMERCADO'),
  com('com-2', 'Almacén Don Julio', 'Belgrano 1220', 'Barrio Liborsi', 'ALMACEN'),
  com('com-3', 'Verdulería La Esquina', 'Av. Gutnisky 3100', 'Villa del Carmen', 'VERDULERIA'),
  com('com-4', 'Carnicería El Gaucho', 'Moreno 880', 'Centro', 'CARNICERIA'),
  com('com-5', 'Farmacia Del Pueblo', 'España 560', 'Centro', 'FARMACIA'),
  com('com-6', 'Kiosco Los Álamos', 'Pellegrini 95', 'Barrio Liborsi', 'OTRO'),
  { ...com('com-7', 'Almacén Cerrado Definitivo', 'Sarmiento 40', 'Centro', 'ALMACEN'), estado: 'INACTIVO' },
];

const VARIEDAD_OF = {1: '1151101', 2: '1112101', 3: '1171101', 4: '1113101', 5: '1113201', 6: '1141101', 7: '1141201', 8: '1111101', 9: '1121101', 10: '1161101', 11: '5111101', 12: '1172101', 13: '1141102'};
const prod = (n, nombre, categoria, unidad, cantidadReferencia, marca, base, estado = 'ACTIVO') => ({
  id: `prod-${n}`, nombre, categoria, unidad, cantidadReferencia, marca,
  codigoVariedad: VARIEDAD_OF[n], estado, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  _base: base,
});
const productosFull = [
  prod(1, 'Aceite de girasol', 'Almacén', 'LT', 1.5, 'Cocinero', 3200),
  prod(2, 'Arroz largo fino', 'Almacén', 'KG', 1, 'Gallo', 1800),
  prod(3, 'Azúcar refinada', 'Almacén', 'KG', 1, 'Ledesma', 1500),
  prod(4, 'Harina de trigo 000', 'Almacén', 'KG', 1, 'Pureza', 1100),
  prod(5, 'Fideos tallarines', 'Almacén', 'G', 500, 'Matarazzo', 1700),
  prod(6, 'Leche entera larga vida', 'Lácteos', 'LT', 1, 'La Serenísima', 1650),
  prod(7, 'Yogur bebible vainilla', 'Lácteos', 'LT', 1, 'Ser', 2100),
  prod(8, 'Pan francés', 'Panadería', 'KG', 1, null, 2400),
  prod(9, 'Carne picada común', 'Carnes', 'KG', 1, null, 8900),
  prod(10, 'Papa blanca', 'Verduras', 'KG', 1, null, 1300),
  prod(11, 'Detergente lavavajillas', 'Limpieza', 'ML', 750, 'Magistral', 3900),
  prod(12, 'Polvo para gelatina', 'Almacén', 'UNIDAD', 1, 'Arcor', 1500),
  prod(13, 'Producto discontinuado', 'Almacén', 'UNIDAD', 1, null, 999, 'INACTIVO'),
];

// ---------- canasta (nivel 0 general ... 5 producto, 6 variedad) ----------
const nodo = (codigo, nombre, nivel, padre, extra = {}) => ({
  codigo, nombre, nivel, padre, ponderador: 0, derivado: false, estado: 'ACTIVO',
  categoria: null, codigoVariedad12: null, tratamientoEspecial: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
});
const canasta = [
  nodo('0', 'NIVEL GENERAL', 0, null, { ponderador: 1 }),
  nodo('1', 'ALIMENTOS Y BEBIDAS NO ALCOHÓLICAS', 1, '0'),
  nodo('5', 'EQUIPAMIENTO Y MANTENIMIENTO DEL HOGAR', 1, '0'),
  nodo('11', 'Alimentos', 2, '1'),
  nodo('51', 'Bienes para el hogar', 2, '5'),
  nodo('111', 'Pan y cereales', 3, '11'), nodo('112', 'Carnes', 3, '11'), nodo('114', 'Leche, productos lácteos y huevos', 3, '11'),
  nodo('115', 'Aceites y grasas', 3, '11'), nodo('116', 'Verduras', 3, '11'), nodo('117', 'Azúcar y postres', 3, '11'),
  nodo('511', 'Artículos de limpieza', 3, '51'),
  nodo('1111', 'Pan', 4, '111'), nodo('1112', 'Arroz', 4, '111'), nodo('1113', 'Harinas y pastas', 4, '111'),
  nodo('1121', 'Carne vacuna', 4, '112'), nodo('1141', 'Leche', 4, '114'), nodo('1151', 'Aceites', 4, '115'),
  nodo('1161', 'Papas', 4, '116'), nodo('1171', 'Azúcar', 4, '117'), nodo('1172', 'Postres', 4, '117'), nodo('5111', 'Detergentes', 4, '511'),
  nodo('11111', 'Pan', 5, '1111'), nodo('11121', 'Arroz', 5, '1112'), nodo('11131', 'Harina de trigo', 5, '1113'),
  nodo('11132', 'Fideos secos', 5, '1113'), nodo('11211', 'Carne picada', 5, '1121'), nodo('11411', 'Leche entera', 5, '1141'),
  nodo('11412', 'Yogur', 5, '1141'), nodo('11511', 'Aceite de girasol', 5, '1151'), nodo('11611', 'Papa', 5, '1161'),
  nodo('11711', 'Azúcar refinada', 5, '1171'), nodo('11721', 'Gelatinas', 5, '1172'), nodo('51111', 'Detergente lavavajillas', 5, '5111', { derivado: true }),
];
const vari = (codigo, nombre, padre, categoria, ponderador, extra = {}) =>
  canasta.push(nodo(codigo, nombre, 6, padre, { categoria, ponderador, codigoVariedad12: `A${codigo}`, tratamientoEspecial: false, ...extra }));
vari('1111101', 'Pan francés tipo mignon', '11111', 'NUCLEO', 0.0133);
vari('1111102', 'Pan de mesa', '11111', 'NUCLEO', 0.0071);
vari('1112101', 'Arroz largo fino', '11121', 'NUCLEO', 0.0042);
vari('1113101', 'Harina de trigo 000', '11131', 'NUCLEO', 0.0038);
vari('1113201', 'Fideos tallarines', '11132', 'NUCLEO', 0.0055);
vari('1121101', 'Carne picada común', '11211', 'NUCLEO', 0.0211);
vari('1141101', 'Leche entera larga vida', '11411', 'REGULADO', 0.0094);
vari('1141102', 'Leche descremada larga vida', '11411', 'REGULADO', 0.0022, { estado: 'INACTIVO' });
vari('1141201', 'Yogur bebible vainilla', '11412', 'NUCLEO', 0.0031);
vari('1151101', 'Aceite de girasol', '11511', 'NUCLEO', 0.0049);
vari('1161101', 'Papa blanca', '11611', 'ESTACIONAL', 0.0066, { tratamientoEspecial: true });
vari('1171101', 'Azúcar refinada', '11711', 'NUCLEO', 0.0036);
vari('1172101', 'Polvo para gelatina', '11721', 'NUCLEO', 0.0012);
vari('5111101', 'Detergente lavavajillas', '51111', 'NUCLEO', 0.0027);

const stripBase = ({ _base, ...rest }) => rest;

const asig = (id, relevamiento, comercio, estado, encuestador = 'u-enc-1') => ({
  id, relevamiento, encuestador, comercio, estado, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
});
const asignaciones = [
  asig('asig-1', 'rel-2026-10', 'com-1', 'PENDIENTE'),
  asig('asig-2', 'rel-2026-10', 'com-2', 'EN_CURSO'),
  asig('asig-3', 'rel-2026-10', 'com-3', 'COMPLETADA'),
  asig('asig-4', 'rel-2026-09', 'com-2', 'COMPLETADA'),
  asig('asig-5', 'rel-2026-10', 'com-4', 'EN_CURSO', 'u-enc-2'),
  asig('asig-6', 'rel-2026-10', 'com-5', 'PENDIENTE', 'u-enc-2'),
  asig('asig-7', 'rel-2026-09', 'com-1', 'COMPLETADA', 'u-enc-2'),
];

// deterministic pseudo-noise
function noise(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
const precios = [];
function addPrecio(p) {
  precios.push({
    id: uuid(), oferta: false, observacion: null, alerta: null, createdAt: now(), updatedAt: now(), ...p,
  });
}
const comerciosConHistoria = ['com-1', 'com-2', 'com-3'];
const periodos = [
  { id: 'rel-2026-07', fecha: '2026-07-12T12:00:00.000Z', f: 0.92 },
  { id: 'rel-2026-08', fecha: '2026-08-12T12:00:00.000Z', f: 0.96 },
  { id: 'rel-2026-09', fecha: '2026-09-12T12:00:00.000Z', f: 1.0 },
];
for (const c of comerciosConHistoria) {
  const cIdx = Number(c.split('-')[1]);
  for (const p of productosFull.filter((x) => x.estado === 'ACTIVO')) {
    for (const per of periodos) {
      const jitter = 1 + (noise(cIdx * 100 + Number(p.id.split('-')[1]) * 7 + periodos.indexOf(per)) - 0.5) * 0.03;
      addPrecio({
        relevamiento: per.id, producto: p.id, comercio: c, encuestador: 'u-enc-1',
        valor: Math.round(p._base * per.f * jitter * (1 + cIdx * 0.02)), fechaRelevamiento: per.fecha,
      });
    }
  }
}
// Current relevamiento: com-3 (COMPLETADA) fully priced, com-2 (EN_CURSO) partially.
for (const p of productosFull.filter((x) => x.estado === 'ACTIVO')) {
  const last = precios.filter((x) => x.comercio === 'com-3' && x.producto === p.id && x.relevamiento === 'rel-2026-09')[0];
  addPrecio({
    relevamiento: 'rel-2026-10', producto: p.id, comercio: 'com-3', encuestador: 'u-enc-1',
    valor: Math.round(last.valor * 1.03), fechaRelevamiento: '2026-10-08T12:00:00.000Z',
  });
}
for (const n of [1, 2, 6]) {
  const last = precios.filter((x) => x.comercio === 'com-2' && x.producto === `prod-${n}` && x.relevamiento === 'rel-2026-09')[0];
  addPrecio({
    relevamiento: 'rel-2026-10', producto: `prod-${n}`, comercio: 'com-2', encuestador: 'u-enc-1',
    valor: Math.round(last.valor * 1.04), fechaRelevamiento: '2026-10-13T12:00:00.000Z',
  });
}

// Demo cases for GET /precios/anterior at com-2 (EN_CURSO):
//  prod-3 -> the previous price was an offer; prod-12 -> no previous price at all (204);
//  prod-4 -> the previous price was loaded by ANOTHER surveyor (own history has a gap there).
for (const x of precios.filter((x) => x.comercio === 'com-2' && x.producto === 'prod-3' && x.relevamiento === 'rel-2026-09')) {
  x.oferta = true;
  x.valor = Math.round(x.valor * 0.85);
}
for (let i = precios.length - 1; i >= 0; i -= 1) {
  const x = precios[i];
  if (x.comercio === 'com-2' && x.producto === 'prod-12' && x.relevamiento !== 'rel-2026-10') precios.splice(i, 1);
  else if (x.comercio === 'com-2' && x.producto === 'prod-4' && x.relevamiento === 'rel-2026-09') {
    x.encuestador = 'u-enc-2';
  }
}

const adjuntos = new Map(); // adjuntoId -> { meta, buffer }

// precio_auditoria: every write on a price leaves one row (the real backend does it in the same transaction).
const auditoria = [];
const snapshot = (p) => ({
  valor: p.valor, oferta: p.oferta, observacion: p.observacion ?? null, fechaRelevamiento: p.fechaRelevamiento,
});
function audit(accion, actor, p, anterior, posterior, extra = {}) {
  auditoria.push({
    id: uuid(), precio: p.id, relevamiento: p.relevamiento, comercio: p.comercio, producto: p.producto,
    accion, usuario: actor.id, rol: actor.role, anterior, posterior, detalle: null, createdAt: now(), ...extra,
  });
}
for (const p of precios) {
  audit('CREACION', { id: p.encuestador, role: 'ENCUESTADOR' }, p, null, snapshot(p), { createdAt: p.fechaRelevamiento });
}

// ---------- helpers ----------
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
  if (expected !== s) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    return payload.exp * 1000 > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
const send = (res, status, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isBuf ? headers['Content-Type'] ?? 'application/octet-stream' : 'application/json',
    ...headers,
  });
  res.end(body === undefined ? undefined : isBuf ? body : JSON.stringify(body));
};
/** 409 with the stable `code` next to `message` (omitted in legacy mode). */
const conflict = (res, message, code, extra = {}) =>
  send(res, 409, LEGACY ? { message, ...extra } : { message, code, ...extra });
/** A list answer with X-Total-Count (CORS-exposed), omitted in legacy mode. */
const sendList = (res, rows, total) =>
  send(res, 200, rows, LEGACY ? {} : { 'X-Total-Count': String(total), 'Access-Control-Expose-Headers': 'X-Total-Count' });
/** Optional page/limit like the real backend: absent = every row; invalid = 400 errors[]. Legacy ignores both. */
const pageOf = (q) => {
  if (LEGACY || (!q.has('page') && !q.has('limit'))) return { errors: [], slice: (rows) => rows };
  const errors = [];
  if (q.has('page') && !/^[1-9]\d*$/.test(q.get('page'))) errors.push({ field: 'page', message: 'page must be a positive integer' });
  if (q.has('limit') && !(/^[1-9]\d*$/.test(q.get('limit')) && Number(q.get('limit')) <= 200)) {
    errors.push({ field: 'limit', message: 'limit must be an integer between 1 and 200' });
  }
  const limit = Number(q.get('limit') ?? 50);
  const page = Number(q.get('page') ?? 1);
  return { errors, slice: (rows) => rows.slice((page - 1) * limit, page * limit) };
};
/** Date-only or full ISO; an impossible calendar day is not a date (2026-02-31). Null when invalid. */
const parseIsoDate = (v) => {
  const m = typeof v === 'string' && /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const cal = new Date(Date.UTC(y, mo - 1, d));
  if (cal.getUTCMonth() !== mo - 1 || cal.getUTCDate() !== d) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES + 1024) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
const readJson = async (req) => {
  const buf = await readBody(req);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString());
  } catch {
    return null;
  }
};

function detectMime(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.length > 4 && buf.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  return null;
}

// Server rule from the contract: variacion = valor / precioAnterior (latest non-offer price of the same
// producto+comercio in an earlier relevamiento; none -> not judged) against the P5-P95 percentiles (linear
// interpolation) of every historical variation of the producto's variedad (consecutive non-offer prices per
// producto+comercio, earlier relevamientos), never narrower than 0.90-1.10. The server needs 20 variations;
// the demo data has at most 6 per variedad, so the mock settles for 5.
const MUESTRA_MINIMA_MOCK = 5;
function percentil(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function judge({ relevamiento, comercio, producto, valor, excludeId }) {
  const current = relevamientos.find((r) => r.id === relevamiento);
  const start = (p) => Date.parse(relevamientos.find((r) => r.id === p.relevamiento)?.fechaInicio ?? 'NaN');
  const earlier = (p) => p.id !== excludeId && !p.oferta && start(p) < Date.parse(current.fechaInicio);

  const anterior = precios
    .filter((p) => p.comercio === comercio && p.producto === producto && earlier(p))
    .sort((a, b) => start(b) - start(a))[0];
  if (!anterior) return null;

  const variedad = productosFull.find((x) => x.id === producto)?.codigoVariedad;
  if (!variedad) return null;
  const variaciones = [];
  const series = new Map();
  for (const p of precios) {
    if (!earlier(p) || productosFull.find((x) => x.id === p.producto)?.codigoVariedad !== variedad) continue;
    const key = `${p.producto}|${p.comercio}`;
    series.set(key, [...(series.get(key) ?? []), p]);
  }
  for (const list of series.values()) {
    list.sort((a, b) => start(a) - start(b));
    for (let i = 1; i < list.length; i++) variaciones.push(list[i].valor / list[i - 1].valor);
  }
  if (variaciones.length < MUESTRA_MINIMA_MOCK) return null;

  const limiteInferior = Math.min(percentil(variaciones, 5), 0.9);
  const limiteSuperior = Math.max(percentil(variaciones, 95), 1.1);
  const variacion = valor / anterior.valor;
  if (variacion >= limiteInferior && variacion <= limiteSuperior) return null;
  return {
    metodo: 'PERCENTIL_VARIACION', variedad, precioAnterior: anterior.valor, variacion,
    percentilInferior: 5, percentilSuperior: 95, limiteInferior, limiteSuperior,
    rangoPrecio: { min: limiteInferior * anterior.valor, max: limiteSuperior * anterior.valor },
    n: variaciones.length,
  };
}

// Review demo data (current relevamiento, com-3): an offer, a confirmed atypical price, and corrections by
// a supervisor and an analyst, so the review table and the audit trail show every kind of mark.
{
  const cur = (producto) => precios.find((x) => x.relevamiento === 'rel-2026-10' && x.comercio === 'com-3' && x.producto === producto);
  const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
  const sup = USERS.find((u) => u.id === 'u-sup-1');
  const ana = USERS.find((u) => u.id === 'u-ana-1');

  const offer = cur('prod-2');
  offer.oferta = true;
  offer.valor = Math.round(offer.valor * 0.8);
  offer.observacion = 'Cartel de oferta en góndola';

  const atypical = cur('prod-4');
  atypical.valor = Math.round(atypical.valor * 1.4);
  atypical.observacion = 'Aumento confirmado con el encargado';
  atypical.alerta = judge({ relevamiento: 'rel-2026-10', comercio: 'com-3', producto: 'prod-4', valor: atypical.valor, excludeId: atypical.id });
  // The creation rows were written with the original seed values; keep them consistent with the demo edits.
  for (const p of [offer, atypical]) {
    const created = auditoria.find((a) => a.precio === p.id && a.accion === 'CREACION');
    if (created) created.posterior = snapshot(p);
  }
  const meta = {
    id: uuid(), precio: atypical.id, mime: 'image/jpeg', bytes: 183_500,
    sha256: crypto.createHash('sha256').update('demo').digest('hex'), subidoPor: 'u-enc-1', createdAt: hoursAgo(30),
  };
  audit('ADJUNTO_AGREGADO', { id: 'u-enc-1', role: 'ENCUESTADOR' }, atypical, null, null, { detalle: { adjunto: meta.id, mime: meta.mime, bytes: meta.bytes, sha256: meta.sha256 }, createdAt: hoursAgo(30) });

  const fixed = cur('prod-5');
  const before = snapshot(fixed);
  fixed.valor = Math.round(fixed.valor * 0.9);
  fixed.updatedAt = hoursAgo(20);
  audit('MODIFICACION', sup, fixed, before, snapshot(fixed), { createdAt: hoursAgo(20) });

  const noted = cur('prod-6');
  const before2 = snapshot(noted);
  noted.observacion = 'Verificado por teléfono con el comercio';
  noted.updatedAt = hoursAgo(5);
  audit('MODIFICACION', ana, noted, before2, snapshot(noted), { createdAt: hoursAgo(5) });

  const gone = { id: uuid(), relevamiento: 'rel-2026-10', comercio: 'com-3', producto: 'prod-9', valor: 8700, oferta: false, observacion: 'Cargado dos veces', fechaRelevamiento: '2026-10-08T12:00:00.000Z' };
  audit('CREACION', { id: 'u-enc-1', role: 'ENCUESTADOR' }, gone, null, snapshot(gone), { createdAt: hoursAgo(48) });
  audit('ELIMINACION', { id: 'u-enc-1', role: 'ENCUESTADOR' }, gone, snapshot(gone), null, { createdAt: hoursAgo(47) });
}

// ---------- cálculos (relativos por variedad + imputaciones) ----------
// Stateful: POST answers 202 with the run EJECUTANDO; each GET that touches a running run counts a tick and the
// run settles after the second one (COMPLETADO, or FALLIDO when `parametros.esperarMeses` is 12: the mock's
// "engine failure" switch). Only one run at a time, like the backend. The xlsx download is a placeholder, not a workbook.
const CALC_F = { '2026-07': 0.92, '2026-08': 0.96, '2026-09': 1.0, '2026-10': 1.02 };
const CALC_VARIEDADES = [...new Set(Object.values(VARIEDAD_OF))];
const CALC_DEFAULTS = { esperarMeses: 2, pesoSuper: 0.25, pesoTrad: 0.75, omitirGruposCompletos: true };
const monthIdx = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const monthList = (a, b) => {
  const out = [];
  for (let i = monthIdx(a); i <= monthIdx(b); i += 1) out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  return out;
};
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const calculos = [];
const calcRelativos = new Map();
const calcImputaciones = new Map();
const calcHoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const calcPublic = ({ _ticks, _fail, ...rest }) => rest;

function buildCalcData(run) {
  const months = monthList(run.mesBase, run.mesObjetivo);
  const relativos = [];
  CALC_VARIEDADES.forEach((v, vi) => {
    months.forEach((m, mi) => {
      const noData = vi === CALC_VARIEDADES.length - 1 && mi === months.length - 1 && months.length > 1;
      const f = (CALC_F[m] ?? 1) / (CALC_F[run.mesBase] ?? 1);
      relativos.push({
        calculo: run.id, variedad: v, mes: m,
        valor: noData ? null : Math.round(f * (1 + (noise(vi * 31 + mi) - 0.5) * 0.04) * 10000) / 10000,
        nSuper: noData ? 0 : 1 + Math.floor(noise(vi + mi) * 2), nTrad: noData ? 0 : 2 + Math.floor(noise(vi * 3 + mi) * 4),
      });
    });
  });
  const imputaciones = [];
  for (const c of ['com-1', 'com-2', 'com-3']) {
    CALC_VARIEDADES.forEach((v, vi) => {
      months.slice(1).forEach((m, mi) => {
        imputaciones.push({
          id: uuid(), calculo: run.id, variedad: v, comercio: c, mes: m, precio: Math.round(1000 + noise(vi * 7 + mi) * 9000) / 1,
          nivel: ['VARIEDAD', 'PRODUCTO', 'GRUPO'][(vi + mi) % 3], grupo: vi % 4 === 0 ? null : `G${(vi % 4) + 1}`,
          factor: Math.round((1 + (noise(vi * 5 + mi) - 0.5) * 0.06) * 10000) / 10000,
        });
      });
    });
  }
  // omitirGruposCompletos=false leaves a long tail of cases without imputation (the detail is cut at 200).
  const sinN = run.parametros.omitirGruposCompletos ? 3 : 250;
  const sin = Array.from({ length: sinN }, (_, i) => ({
    variedad: CALC_VARIEDADES[i % CALC_VARIEDADES.length], comercio: ['com-1', 'com-2', 'com-3'][i % 3], mes: months[(i % Math.max(1, months.length - 1)) + (months.length > 1 ? 1 : 0)],
  }));
  const inRange = precios.filter((p) => months.includes(p.relevamiento.slice(4)) && (!run.excluirOfertas || !p.oferta));
  run.resumen = {
    observaciones: inRange.length,
    variedades: CALC_VARIEDADES.length,
    informantes: new Set(inRange.map((p) => p.comercio)).size,
    imputaciones: imputaciones.length,
    sinImputar: sinN,
    sinImputarDetalle: sin.slice(0, 200),
  };
  calcRelativos.set(run.id, relativos);
  calcImputaciones.set(run.id, imputaciones);
}

function seedCalculo(over) {
  const run = {
    id: uuid(), mesBase: '2026-07', mesObjetivo: '2026-09', excluirOfertas: false, parametros: { ...CALC_DEFAULTS },
    motorVersion: 'mock-engine 0.1.0', entradaHash: crypto.createHash('sha256').update(String(calculos.length)).digest('hex'),
    estado: 'COMPLETADO', error: null, creadoPor: 'u-ana-1', createdAt: now(), updatedAt: now(), resumen: null, _ticks: 99, _fail: false, ...over,
  };
  if (run.estado === 'COMPLETADO') buildCalcData(run);
  calculos.push(run);
  return run;
}
seedCalculo({ createdAt: calcHoursAgo(30), updatedAt: calcHoursAgo(30), creadoPor: 'u-coo-1' });
seedCalculo({
  mesBase: '2026-08', mesObjetivo: '2026-09', excluirOfertas: true, estado: 'FALLIDO', resumen: null,
  error: 'Engine failure: not enough history for the requested wait window', createdAt: calcHoursAgo(6), updatedAt: calcHoursAgo(6),
});

function settleCalculo(run) {
  if (run.estado !== 'EJECUTANDO') return;
  run._ticks += 1;
  if (run._ticks < 2) return;
  run.updatedAt = now();
  if (run._fail) {
    run.estado = 'FALLIDO';
    run.error = 'Engine failure: not enough history for the requested wait window';
  } else {
    run.estado = 'COMPLETADO';
    buildCalcData(run);
  }
}

const failedLogins = new Map();
let outage = null;
const isUuid = () => true;

// ---------- router ----------
async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const q = url.searchParams;
  const log = () => console.log(`${method} ${path}${url.search} -> ${res.statusCode}`);
  res.on('finish', log);

  if (path === '/__mock/outage' && method === 'POST') {
    const body = await readJson(req);
    outage = body?.status ? Number(body.status) : null;
    return send(res, 200, { outage });
  }
  if (!path.startsWith('/api/')) return send(res, 404, { message: 'Not found' });
  const route = path.slice(4);
  if (outage && !route.startsWith('/auth/')) return send(res, outage, { message: 'Mock outage' });

  if (route === '/auth/login' && method === 'POST') {
    const body = await readJson(req);
    if (!body || !body.email || !body.password) return send(res, 400, { errors: [{ field: 'email', message: 'required' }] });
    const key = String(body.email).toLowerCase();
    const rec = failedLogins.get(key) ?? { count: 0, since: Date.now() };
    if (Date.now() - rec.since > 60_000) Object.assign(rec, { count: 0, since: Date.now() });
    if (rec.count >= 5) {
      const wait = Math.max(1, Math.ceil((rec.since + 60_000 - Date.now()) / 1000));
      return send(res, 429, { message: 'Too many attempts' }, { 'Retry-After': String(wait) });
    }
    const user = USERS.find((u) => u.email === key && u.password === body.password);
    if (!user) {
      failedLogins.set(key, { ...rec, count: rec.count + 1 });
      return send(res, 401, { message: 'Invalid credentials' });
    }
    if (user.estado !== 'ACTIVO') return send(res, 401, { message: 'Invalid credentials' });
    failedLogins.delete(key);
    user.ultimoAcceso = now();
    const iat = Math.floor(Date.now() / 1000);
    const token = signJwt({ userId: user.id, role: user.role, iat, exp: iat + 8 * 3600 });
    return send(res, 200, { token, user: { id: user.id, nombre: user.nombre, apellido: user.apellido, role: user.role } });
  }

  // auth required below
  const auth = req.headers.authorization ?? '';
  const payload = auth.startsWith('Bearer ') ? verifyJwt(auth.slice(7)) : null;
  if (!payload) return send(res, 401, { message: 'Unauthorized' });
  const me = USERS.find((u) => u.id === payload.userId);
  // The real backend re-validates the account on every request.
  if (!me || me.estado !== 'ACTIVO') return send(res, 401, { message: 'Invalid or expired token' });

  if (route === '/auth/me' && method === 'GET') {
    const { password: _pw, ...pub } = me;
    return send(res, 200, pub);
  }
  if (route === '/auth/password' && method === 'POST') {
    const body = await readJson(req);
    const errors = [];
    if (!body || typeof body.currentPassword !== 'string' || !body.currentPassword) {
      errors.push({ field: 'currentPassword', message: 'required' });
    }
    if (!body || typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
      errors.push({ field: 'newPassword', message: 'must be at least 8 characters' });
    }
    if (errors.length) return send(res, 400, { errors });
    if (body.currentPassword !== me.password) return send(res, 400, { message: 'The current password is not correct' });
    me.password = body.newPassword;
    res.writeHead(204);
    return res.end();
  }
  const mine = (a) => a.encuestador === me.id;

  // asignaciones. ENCUESTADOR sees only their own; every other role sees all (real backend behaviour).
  const isCoord = me.role === 'COORDINADOR';
  const visible = (a) => me.role !== 'ENCUESTADOR' || mine(a);
  const forbidden = () => send(res, 403, { message: 'You do not have permission to perform this action' });
  const isId = (v) => typeof v === 'string' && v.length > 0;
  if (route === '/asignaciones' && method === 'GET') {
    const errors = [];
    for (const k of ['relevamiento', 'encuestador', 'comercio']) {
      if (q.has(k) && !q.get(k)) errors.push({ field: k, message: `${k} must be a valid id` });
    }
    if (q.has('estado') && !['PENDIENTE', 'EN_CURSO', 'COMPLETADA'].includes(q.get('estado'))) {
      errors.push({ field: 'estado', message: 'estado must be one of: PENDIENTE, EN_CURSO, COMPLETADA' });
    }
    const paging = pageOf(q);
    errors.push(...paging.errors);
    if (errors.length) return send(res, 400, { errors });
    let list = asignaciones.filter(visible);
    for (const k of ['relevamiento', 'encuestador', 'comercio', 'estado']) {
      if (q.get(k)) list = list.filter((a) => a[k] === q.get(k));
    }
    const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return sendList(res, paging.slice(sorted), sorted.length);
  }
  if (route === '/asignaciones' && method === 'POST') {
    if (!isCoord) return forbidden();
    const b = (await readJson(req)) ?? {};
    const errors = [];
    for (const k of ['relevamiento', 'encuestador', 'comercio']) {
      if (!isId(b[k])) errors.push({ field: k, message: `${k} must be a valid id` });
    }
    if (errors.length) return send(res, 400, { errors });
    // Same check order as the real controller.
    const r = relevamientos.find((x) => x.id === b.relevamiento);
    if (!r) return send(res, 404, { message: 'Relevamiento not found' });
    if (r.estado !== 'ABIERTO') return conflict(res, 'Relevamiento is not ABIERTO', 'RELEVAMIENTO_NOT_ABIERTO');
    const e = USERS.find((x) => x.id === b.encuestador);
    if (!e) return send(res, 404, { message: 'Encuestador not found' });
    if (e.role !== 'ENCUESTADOR' || e.estado !== 'ACTIVO') {
      return send(res, 400, { message: 'encuestador must be an ACTIVO user with role ENCUESTADOR' });
    }
    const c = comercios.find((x) => x.id === b.comercio);
    if (!c) return send(res, 404, { message: 'Comercio not found' });
    if (c.estado !== 'ACTIVO') return send(res, 400, { message: 'comercio must be ACTIVO' });
    if (asignaciones.some((x) => x.relevamiento === b.relevamiento && x.comercio === b.comercio)) {
      return conflict(res, 'This comercio is already assigned in this relevamiento', 'COMERCIO_ALREADY_ASSIGNED');
    }
    const created = {
      id: uuid(), relevamiento: b.relevamiento, encuestador: b.encuestador, comercio: b.comercio,
      estado: 'PENDIENTE', createdAt: now(), updatedAt: now(),
    };
    asignaciones.push(created);
    return send(res, 201, created);
  }
  let m = route.match(/^\/asignaciones\/([^/]+)$/);
  if (m && method === 'GET') {
    const a = asignaciones.find((x) => x.id === m[1] && visible(x));
    return a ? send(res, 200, a) : send(res, 404, { message: 'Asignacion not found' });
  }
  m = route.match(/^\/asignaciones\/([^/]+)\/encuestador$/);
  if (m && method === 'PATCH') {
    if (!isCoord) return forbidden();
    const b = (await readJson(req)) ?? {};
    if (!isId(b.encuestador)) return send(res, 400, { errors: [{ field: 'encuestador', message: 'encuestador must be a valid id' }] });
    const e = USERS.find((x) => x.id === b.encuestador);
    if (!e) return send(res, 404, { message: 'Encuestador not found' });
    if (e.role !== 'ENCUESTADOR' || e.estado !== 'ACTIVO') {
      return send(res, 400, { message: 'encuestador must be an ACTIVO user with role ENCUESTADOR' });
    }
    const a = asignaciones.find((x) => x.id === m[1]);
    if (!a) return send(res, 404, { message: 'Asignacion not found' });
    // The real backend does not look at the relevamiento here: only the asignacion estado.
    if (a.estado !== 'PENDIENTE') return conflict(res, 'Only a PENDIENTE asignacion can be reassigned', 'ASIGNACION_NOT_PENDIENTE');
    a.encuestador = b.encuestador;
    a.updatedAt = now();
    return send(res, 200, a);
  }
  m = route.match(/^\/asignaciones\/([^/]+)\/estado$/);
  if (m && method === 'PATCH') {
    if (!['COORDINADOR', 'ENCUESTADOR'].includes(me.role)) return forbidden();
    const a = asignaciones.find((x) => x.id === m[1] && visible(x));
    if (!a) return send(res, 404, { message: 'Asignacion not found' });
    const body = await readJson(req);
    const estado = body?.estado;
    if (!['PENDIENTE', 'EN_CURSO', 'COMPLETADA'].includes(estado)) {
      return send(res, 400, { errors: [{ field: 'estado', message: 'invalid' }] });
    }
    const valid = (a.estado === 'PENDIENTE' && estado === 'EN_CURSO') || (a.estado === 'EN_CURSO' && estado === 'COMPLETADA');
    if (!valid) return conflict(res, `Cannot change estado from ${a.estado} to ${estado}`, 'INVALID_ESTADO_TRANSITION');
    if (relevamientos.find((r) => r.id === a.relevamiento)?.estado !== 'ABIERTO') {
      return conflict(res, 'Relevamiento is not ABIERTO', 'RELEVAMIENTO_NOT_ABIERTO');
    }
    a.estado = estado;
    a.updatedAt = now();
    return send(res, 200, a);
  }

  if (route === '/relevamientos' && method === 'GET') {
    const paging = pageOf(q);
    if (paging.errors.length) return send(res, 400, { errors: paging.errors });
    const sorted = [...relevamientos].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
    return sendList(res, paging.slice(sorted), sorted.length);
  }
  if (route === '/relevamientos' && method === 'POST') {
    if (!isCoord) return forbidden();
    const b = (await readJson(req)) ?? {};
    const errors = [];
    const FORMAT = { MENSUAL: /^\d{4}-(0[1-9]|1[0-2])$/, QUINCENAL: /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/ };
    if (!FORMAT[b.frecuencia]) errors.push({ field: 'frecuencia', message: 'frecuencia must be one of: QUINCENAL, MENSUAL' });
    if (typeof b.periodo !== 'string') errors.push({ field: 'periodo', message: 'periodo is required and must be a string' });
    else if (FORMAT[b.frecuencia] && !FORMAT[b.frecuencia].test(b.periodo)) {
      errors.push({ field: 'periodo', message: `periodo does not match the format required by ${b.frecuencia}` });
    }
    if (LEGACY) {
      // Older backend: the dates are not validated, an unparseable one is a 500 (DB error).
      if (errors.length) return send(res, 400, { errors });
      if (Number.isNaN(Date.parse(b.fechaInicio)) || Number.isNaN(Date.parse(b.fechaLimite))) {
        return send(res, 500, { message: 'Internal server error' });
      }
    } else {
      const inicio = parseIsoDate(b.fechaInicio);
      const limite = parseIsoDate(b.fechaLimite);
      if (inicio === null) errors.push({ field: 'fechaInicio', message: 'fechaInicio is required and must be a valid ISO date' });
      if (limite === null) errors.push({ field: 'fechaLimite', message: 'fechaLimite is required and must be a valid ISO date' });
      else if (inicio !== null && limite <= inicio) errors.push({ field: 'fechaLimite', message: 'fechaLimite must be after fechaInicio' });
      if (errors.length) return send(res, 400, { errors });
    }
    if (relevamientos.some((r) => r.periodo === b.periodo && r.frecuencia === b.frecuencia)) {
      return send(res, 409, { message: 'A relevamiento already exists for this periodo and frecuencia' });
    }
    const created = {
      id: uuid(), periodo: b.periodo, frecuencia: b.frecuencia,
      fechaInicio: new Date(b.fechaInicio).toISOString(), fechaLimite: new Date(b.fechaLimite).toISOString(),
      estado: 'ABIERTO', createdAt: now(), updatedAt: now(),
    };
    relevamientos.push(created);
    return send(res, 201, created);
  }
  m = route.match(/^\/relevamientos\/([^/]+)\/cerrar$/);
  if (m && method === 'PATCH') {
    if (!isCoord) return forbidden();
    const r = relevamientos.find((x) => x.id === m[1]);
    if (!r) return send(res, 404, { message: 'Relevamiento not found' });
    if (r.estado !== 'ABIERTO') return send(res, 409, { message: 'Relevamiento is already closed' });
    r.estado = 'CERRADO';
    r.updatedAt = now();
    return send(res, 200, r);
  }
  m = route.match(/^\/relevamientos\/([^/]+)$/);
  if (m && method === 'GET') {
    const r = relevamientos.find((x) => x.id === m[1]);
    return r ? send(res, 200, r) : send(res, 404, { message: 'Relevamiento not found' });
  }

  // users: the whole router is COORDINADOR-only.
  if (route === '/users' || route.startsWith('/users/')) {
    if (!isCoord) return forbidden();
    const ROLES = ['ENCUESTADOR', 'SUPERVISOR', 'ANALISTA', 'COORDINADOR', 'DIRECCION'];
    const ESTADOS = ['ACTIVO', 'INACTIVO', 'LICENCIA'];
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const view = (u) => ({
      id: u.id, nombre: u.nombre, apellido: u.apellido, dni: u.dni, legajo: u.legajo, email: u.email,
      role: u.role, estado: u.estado, ultimoAcceso: u.ultimoAcceso,
    });
    const taken = (body, exceptId) =>
      USERS.some((u) => u.id !== exceptId && (u.dni === body.dni || u.legajo === body.legajo || u.email === body.email));
    /** USER_DUPLICATE with the colliding fields (empty when MOCK_DUP_NO_DETAIL, like a driver without detail). */
    const duplicate = (body, exceptId) => {
      const errors = DUP_NO_DETAIL || LEGACY ? [] : ['dni', 'legajo', 'email']
        .filter((f) => USERS.some((u) => u.id !== exceptId && u[f] === body[f]))
        .map((field) => ({ field, message: `A user with this ${field} already exists` }));
      return conflict(res, 'A user with this dni, legajo or email already exists', 'USER_DUPLICATE', LEGACY ? {} : { errors });
    };
    const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

    if (route === '/users' && method === 'GET') {
      const errors = [];
      if (q.has('role') && !ROLES.includes(q.get('role'))) errors.push({ field: 'role', message: `role must be one of: ${ROLES.join(', ')}` });
      if (q.has('estado') && !ESTADOS.includes(q.get('estado'))) {
        errors.push({ field: 'estado', message: `estado must be one of: ${ESTADOS.join(', ')}` });
      }
      if (q.has('page') && !/^[1-9]\d*$/.test(q.get('page'))) errors.push({ field: 'page', message: 'page must be a positive integer' });
      if (q.has('limit') && !(/^[1-9]\d*$/.test(q.get('limit')) && Number(q.get('limit')) <= 200)) {
        errors.push({ field: 'limit', message: 'limit must be an integer between 1 and 200' });
      }
      if (errors.length) return send(res, 400, { errors });
      let list = [...USERS];
      if (q.get('role')) list = list.filter((u) => u.role === q.get('role'));
      if (q.get('estado')) list = list.filter((u) => u.estado === q.get('estado'));
      list.sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id));
      const limit = Number(q.get('limit') ?? 50);
      const page = Number(q.get('page') ?? 1);
      return sendList(res, list.slice((page - 1) * limit, page * limit).map(view), list.length);
    }
    if (route === '/users' && method === 'POST') {
      const b = (await readJson(req)) ?? {};
      const errors = [];
      for (const f of ['nombre', 'apellido', 'dni', 'legajo']) {
        if (!nonEmpty(b[f])) errors.push({ field: f, message: `${f} is required and must be a non-empty string` });
      }
      if (typeof b.email !== 'string' || !EMAIL.test(b.email.trim())) {
        errors.push({ field: 'email', message: 'email is required and must be a valid email address' });
      }
      if (typeof b.password !== 'string' || b.password.length < 8) {
        errors.push({ field: 'password', message: 'password is required and must have at least 8 characters' });
      }
      if (!ROLES.includes(b.role)) errors.push({ field: 'role', message: `role must be one of: ${ROLES.join(', ')}` });
      if (errors.length) return send(res, 400, { errors });
      const email = b.email.trim().toLowerCase();
      // The real backend trims the text fields on create (legacy mode keeps them as sent).
      const t = (v) => (LEGACY ? v : v.trim());
      const clean = { dni: t(b.dni), legajo: t(b.legajo), email };
      if (taken(clean)) return duplicate(clean);
      const created = {
        id: uuid(), nombre: t(b.nombre), apellido: t(b.apellido), dni: clean.dni, legajo: clean.legajo, email, password: b.password,
        role: b.role, estado: 'ACTIVO', ultimoAcceso: null,
      };
      USERS.push(created);
      if (LEGACY) {
        // Older POST /users response has no ultimoAcceso.
        const { ultimoAcceso: _u, ...out } = view(created);
        return send(res, 201, out);
      }
      return send(res, 201, view(created));
    }
    m = route.match(/^\/users\/([^/]+)(\/estado|\/password)?$/);
    if (m) {
      const target = USERS.find((u) => u.id === m[1]);
      const sub = m[2];
      if (!sub && method === 'GET') return target ? send(res, 200, view(target)) : send(res, 404, { message: 'User not found' });
      if (!sub && method === 'PATCH') {
        const b = (await readJson(req)) ?? {};
        const EDIT = ['nombre', 'apellido', 'dni', 'legajo', 'email', 'role'];
        if (!EDIT.some((f) => b[f] !== undefined)) {
          return send(res, 400, { errors: [{ field: 'body', message: `send at least one of: ${EDIT.join(', ')}` }] });
        }
        const errors = [];
        for (const f of ['nombre', 'apellido', 'dni', 'legajo']) {
          if (b[f] !== undefined && !nonEmpty(b[f])) errors.push({ field: f, message: `${f} must be a non-empty string` });
        }
        if (b.email !== undefined && (typeof b.email !== 'string' || !EMAIL.test(b.email.trim()))) {
          errors.push({ field: 'email', message: 'email must be a valid email address' });
        }
        if (b.role !== undefined && !ROLES.includes(b.role)) errors.push({ field: 'role', message: `role must be one of: ${ROLES.join(', ')}` });
        if (errors.length) return send(res, 400, { errors });
        // Even an unchanged role is refused for your own id.
        if (b.role !== undefined && m[1] === me.id) return send(res, 403, { message: 'You cannot change your own role' });
        if (!target) return send(res, 404, { message: 'User not found' });
        const next = { dni: b.dni?.trim() ?? target.dni, legajo: b.legajo?.trim() ?? target.legajo, email: b.email?.trim().toLowerCase() ?? target.email };
        if (taken(next, target.id)) return duplicate(next, target.id);
        for (const f of ['nombre', 'apellido', 'dni', 'legajo', 'role']) if (b[f] !== undefined) target[f] = typeof b[f] === 'string' ? b[f].trim() : b[f];
        if (b.email !== undefined) target.email = b.email.trim().toLowerCase();
        return send(res, 200, view(target));
      }
      if (sub === '/estado' && method === 'PATCH') {
        const b = (await readJson(req)) ?? {};
        if (!ESTADOS.includes(b.estado)) {
          return send(res, 400, { errors: [{ field: 'estado', message: `estado must be one of: ${ESTADOS.join(', ')}` }] });
        }
        if (m[1] === me.id) return send(res, 403, { message: 'You cannot change your own estado' });
        if (!target) return send(res, 404, { message: 'User not found' });
        target.estado = b.estado;
        return send(res, 200, view(target));
      }
      if (sub === '/password' && method === 'PUT') {
        const b = (await readJson(req)) ?? {};
        if (typeof b.password !== 'string' || b.password.length < 8) {
          return send(res, 400, { errors: [{ field: 'password', message: 'password is required and must have at least 8 characters' }] });
        }
        if (!target) return send(res, 404, { message: 'User not found' });
        target.password = b.password;
        res.writeHead(204);
        return res.end();
      }
    }
  }
  // ---------- catalogue: comercios, productos, canasta (backend: no page, no total, no text search) ----------
  const TIPOS = ['SUPERMERCADO', 'ALMACEN', 'VERDULERIA', 'CARNICERIA', 'FARMACIA', 'OTRO'];
  const UNIDADES = ['KG', 'G', 'LT', 'ML', 'UNIDAD'];
  const ESTADOS = ['ACTIVO', 'INACTIVO'];
  const CATEGORIAS = ['NUCLEO', 'ESTACIONAL', 'REGULADO'];
  const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
  const byNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const oneOf = (list, v) => list.includes(v);
  const listError = (field, list) => ({ field, message: `${field} must be one of: ${list.join(', ')}` });

  if (route === '/comercios' || route.startsWith('/comercios/')) {
    if (route === '/comercios' && method === 'GET') {
      const errors = [];
      if (q.has('zona') && !nonEmpty(q.get('zona'))) errors.push({ field: 'zona', message: 'zona must be a non-empty string' });
      if (q.has('tipo') && !oneOf(TIPOS, q.get('tipo'))) errors.push(listError('tipo', TIPOS));
      if (q.has('estado') && !oneOf(ESTADOS, q.get('estado'))) errors.push(listError('estado', ESTADOS));
      if (errors.length) return send(res, 400, { errors });
      let list = comercios;
      for (const k of ['zona', 'tipo', 'estado']) if (q.get(k)) list = list.filter((c) => c[k] === q.get(k).trim());
      return send(res, 200, [...list].sort(byNombre));
    }
    if (route === '/comercios' && method === 'POST') {
      if (!isCoord) return forbidden();
      const b = (await readJson(req)) ?? {};
      const errors = [];
      for (const k of ['nombre', 'direccion', 'zona']) if (!nonEmpty(b[k])) errors.push({ field: k, message: `${k} must be a non-empty string` });
      if (!oneOf(TIPOS, b.tipo)) errors.push(listError('tipo', TIPOS));
      if (errors.length) return send(res, 400, { errors });
      const created = {
        id: uuid(), nombre: b.nombre.trim(), direccion: b.direccion.trim(), zona: b.zona.trim(), tipo: b.tipo,
        estado: 'ACTIVO', createdAt: now(), updatedAt: now(),
      };
      comercios.push(created);
      return send(res, 201, created);
    }
    const mc = route.match(/^\/comercios\/([^/]+)(\/estado)?$/);
    if (mc) {
      const target = comercios.find((x) => x.id === mc[1]);
      if (method === 'GET' && !mc[2]) return target ? send(res, 200, target) : send(res, 404, { message: 'Comercio not found' });
      if (method === 'PATCH') {
        if (!isCoord) return forbidden();
        const b = (await readJson(req)) ?? {};
        const errors = [];
        if (mc[2]) {
          if (!oneOf(ESTADOS, b.estado)) errors.push(listError('estado', ESTADOS));
        } else {
          const present = ['nombre', 'direccion', 'zona', 'tipo'].filter((k) => b[k] !== undefined);
          if (present.length === 0) errors.push({ field: 'body', message: 'at least one of: nombre, direccion, zona, tipo is required' });
          for (const k of present) {
            if (k === 'tipo' ? !oneOf(TIPOS, b[k]) : !nonEmpty(b[k])) errors.push({ field: k, message: `${k} is not valid` });
          }
        }
        if (errors.length) return send(res, 400, { errors });
        if (!target) return send(res, 404, { message: 'Comercio not found' });
        if (mc[2]) target.estado = b.estado;
        else for (const k of ['nombre', 'direccion', 'zona', 'tipo']) if (b[k] !== undefined) target[k] = typeof b[k] === 'string' && k !== 'tipo' ? b[k].trim() : b[k];
        target.updatedAt = now();
        return send(res, 200, target);
      }
    }
  }

  const activeVariedad = (codigo) => canasta.some((n) => n.codigo === codigo && n.nivel === 6 && n.estado === 'ACTIVO');
  const sameIdentity = (a, b) =>
    a.nombre.toLowerCase() === b.nombre.toLowerCase() && (a.marca ?? '').toLowerCase() === (b.marca ?? '').toLowerCase() &&
    a.unidad === b.unidad && Number(a.cantidadReferencia) === Number(b.cantidadReferencia);
  const validProducto = (b, partial) => {
    const errors = [];
    const fields = ['nombre', 'categoria', 'unidad', 'cantidadReferencia', 'codigoVariedad', 'marca'];
    const present = fields.filter((k) => b[k] !== undefined);
    if (partial && present.length === 0) errors.push({ field: 'body', message: `at least one of: ${fields.join(', ')} is required` });
    for (const k of partial ? present : [...fields.slice(0, 5), ...(b.marca !== undefined ? ['marca'] : [])]) {
      const v = b[k];
      if (k === 'unidad') { if (!oneOf(UNIDADES, v)) errors.push(listError('unidad', UNIDADES)); }
      else if (k === 'codigoVariedad') { if (typeof v !== 'string' || !/^\d{7}$/.test(v.trim())) errors.push({ field: k, message: 'codigoVariedad must be a 7 digit string' }); }
      else if (k === 'cantidadReferencia') { if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) errors.push({ field: k, message: 'cantidadReferencia must be a number greater than 0' }); }
      else if (!nonEmpty(v)) errors.push({ field: k, message: `${k} must be a non-empty string` });
    }
    return errors;
  };
  const productoView = stripBase;
  if (route === '/productos' || route.startsWith('/productos/')) {
    if (route === '/productos' && method === 'GET') {
      const errors = [];
      if (q.has('categoria') && !nonEmpty(q.get('categoria'))) errors.push({ field: 'categoria', message: 'categoria must be a non-empty string' });
      if (q.has('unidad') && !oneOf(UNIDADES, q.get('unidad'))) errors.push(listError('unidad', UNIDADES));
      if (q.has('estado') && !oneOf(ESTADOS, q.get('estado'))) errors.push(listError('estado', ESTADOS));
      if (q.has('codigoVariedad') && !/^\d{7}$/.test(q.get('codigoVariedad').trim())) errors.push({ field: 'codigoVariedad', message: 'codigoVariedad must be a 7 digit string' });
      if (errors.length) return send(res, 400, { errors });
      let list = productosFull;
      for (const k of ['categoria', 'unidad', 'estado', 'codigoVariedad']) if (q.get(k)) list = list.filter((p) => p[k] === q.get(k).trim());
      return send(res, 200, [...list].sort(byNombre).map(productoView));
    }
    if (route === '/productos' && method === 'POST') {
      if (!isCoord) return forbidden();
      const b = (await readJson(req)) ?? {};
      const errors = validProducto(b, false);
      if (errors.length) return send(res, 400, { errors });
      if (!activeVariedad(b.codigoVariedad.trim())) {
        return send(res, 400, { message: 'codigoVariedad must be an existing active variedad of the canasta' });
      }
      const candidate = { nombre: b.nombre.trim(), marca: b.marca?.trim() ?? null, unidad: b.unidad, cantidadReferencia: b.cantidadReferencia };
      // The real 409 has no `code` (ERROR_CODES has none for productos).
      if (productosFull.some((p) => sameIdentity(p, candidate))) {
        return send(res, 409, { message: 'A producto with the same nombre, marca, unidad and cantidadReferencia already exists' });
      }
      const created = {
        id: `prod-${productosFull.length + 1}-${uuid().slice(0, 4)}`, ...candidate, categoria: b.categoria.trim(),
        codigoVariedad: b.codigoVariedad.trim(), estado: 'ACTIVO', createdAt: now(), updatedAt: now(), _base: 1000,
      };
      productosFull.push(created);
      return send(res, 201, productoView(created));
    }
    const mp = route.match(/^\/productos\/([^/]+)(\/estado)?$/);
    if (mp) {
      const target = productosFull.find((x) => x.id === mp[1]);
      if (method === 'GET' && !mp[2]) return target ? send(res, 200, productoView(target)) : send(res, 404, { message: 'Producto not found' });
      if (method === 'PATCH') {
        if (!isCoord) return forbidden();
        const b = (await readJson(req)) ?? {};
        let errors = [];
        if (mp[2]) { if (!oneOf(ESTADOS, b.estado)) errors.push(listError('estado', ESTADOS)); }
        else errors = validProducto(b, true);
        if (errors.length) return send(res, 400, { errors });
        if (!mp[2] && b.codigoVariedad !== undefined && !activeVariedad(b.codigoVariedad.trim())) {
          return send(res, 400, { message: 'codigoVariedad must be an existing active variedad of the canasta' });
        }
        if (!target) return send(res, 404, { message: 'Producto not found' });
        const next = mp[2] ? { ...target, estado: b.estado } : { ...target };
        if (!mp[2]) for (const k of ['nombre', 'categoria', 'unidad', 'cantidadReferencia', 'marca', 'codigoVariedad']) {
          if (b[k] !== undefined) next[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
        }
        if (productosFull.some((p) => p !== target && sameIdentity(p, next))) {
          return send(res, 409, { message: 'A producto with the same nombre, marca, unidad and cantidadReferencia already exists' });
        }
        Object.assign(target, next, { updatedAt: now() });
        return send(res, 200, productoView(target));
      }
    }
  }

  if (route === '/canasta' || route.startsWith('/canasta/')) {
    if (route === '/canasta' && method === 'GET') {
      const errors = [];
      if (q.has('nivel') && !/^[0-6]$/.test(q.get('nivel'))) errors.push({ field: 'nivel', message: 'nivel must be an integer between 0 and 6' });
      if (q.has('padre') && !/^\d{1,7}$/.test(q.get('padre').trim())) errors.push({ field: 'padre', message: 'padre must be a numeric codigo' });
      if (q.has('categoria') && !oneOf(CATEGORIAS, q.get('categoria'))) errors.push(listError('categoria', CATEGORIAS));
      if (q.has('estado') && !oneOf(ESTADOS, q.get('estado'))) errors.push(listError('estado', ESTADOS));
      if (errors.length) return send(res, 400, { errors });
      let list = canasta;
      if (q.get('nivel')) list = list.filter((n) => n.nivel === Number(q.get('nivel')));
      for (const k of ['padre', 'categoria', 'estado']) if (q.get(k)) list = list.filter((n) => n[k] === q.get(k).trim());
      return send(res, 200, [...list].sort((a, b) => a.codigo.localeCompare(b.codigo)));
    }
    if (route === '/canasta' && method === 'POST') {
      if (!isCoord) return forbidden();
      const b = (await readJson(req)) ?? {};
      const errors = [];
      if (typeof b.codigo !== 'string' || !/^\d{7}$/.test(b.codigo)) errors.push({ field: 'codigo', message: 'codigo must be a 7 digit string' });
      if (!nonEmpty(b.nombre)) errors.push({ field: 'nombre', message: 'nombre must be a non-empty string' });
      if (typeof b.padre !== 'string' || !/^\d{5}$/.test(b.padre)) errors.push({ field: 'padre', message: 'padre must be the 5 digit codigo of a producto' });
      if (!oneOf(CATEGORIAS, b.categoria)) errors.push(listError('categoria', CATEGORIAS));
      if (b.ponderador !== undefined && (typeof b.ponderador !== 'number' || !Number.isFinite(b.ponderador) || b.ponderador < 0)) {
        errors.push({ field: 'ponderador', message: 'ponderador must be a number greater than or equal to 0' });
      }
      if (b.codigoVariedad12 !== undefined && !nonEmpty(b.codigoVariedad12)) errors.push({ field: 'codigoVariedad12', message: 'must be a non-empty string' });
      if (b.tratamientoEspecial !== undefined && typeof b.tratamientoEspecial !== 'boolean') errors.push({ field: 'tratamientoEspecial', message: 'must be a boolean' });
      if (errors.length) return send(res, 400, { errors });
      const padre = canasta.find((n) => n.codigo === b.padre);
      if (!padre || padre.nivel !== 5 || padre.estado !== 'ACTIVO') return send(res, 400, { message: 'padre must be an existing active producto' });
      if (canasta.some((n) => n.codigo === b.codigo)) return send(res, 409, { message: 'A node with this codigo already exists' });
      const created = nodo(b.codigo, b.nombre.trim(), 6, b.padre, {
        ponderador: b.ponderador ?? 0, categoria: b.categoria, codigoVariedad12: b.codigoVariedad12 ?? null,
        tratamientoEspecial: b.tratamientoEspecial ?? null, createdAt: now(), updatedAt: now(),
      });
      canasta.push(created);
      return send(res, 201, created);
    }
    const mn = route.match(/^\/canasta\/([^/]+?)(\/estado)?$/);
    if (mn) {
      if (!/^\d{1,7}$/.test(mn[1])) return send(res, 400, { message: 'Invalid codigo' });
      if (method === 'GET' && !mn[2]) {
        const n = canasta.find((x) => x.codigo === mn[1]);
        return n ? send(res, 200, n) : send(res, 404, { message: 'Canasta node not found' });
      }
      if (method === 'PATCH' && mn[2]) {
        if (!isCoord) return forbidden();
        const b = (await readJson(req)) ?? {};
        if (!oneOf(ESTADOS, b.estado)) return send(res, 400, { errors: [listError('estado', ESTADOS)] });
        const n = canasta.find((x) => x.codigo === mn[1] && x.nivel === 6);
        if (!n) return send(res, 404, { message: 'Variedad not found' });
        n.estado = b.estado;
        n.updatedAt = now();
        return send(res, 200, n);
      }
    }
  }

  // precios
  const REVIEWERS = ['SUPERVISOR', 'ANALISTA'];
  const priceVisible = (p) => me.role !== 'ENCUESTADOR' || mine(p);
  /** page / limit as the real validators: positive integer, limit <= 200. */
  const pagingErrors = () => {
    const errors = [];
    if (q.has('page') && !/^[1-9]\d*$/.test(q.get('page'))) errors.push({ field: 'page', message: 'page must be a positive integer' });
    if (q.has('limit') && !(/^[1-9]\d*$/.test(q.get('limit')) && Number(q.get('limit')) <= 200)) {
      errors.push({ field: 'limit', message: 'limit must be an integer between 1 and 200' });
    }
    return errors;
  };
  const sliceOf = (rows) => {
    const limit = Number(q.get('limit') ?? 50);
    const page = Number(q.get('page') ?? 1);
    return rows.slice((page - 1) * limit, page * limit);
  };
  const totalHeader = (n) => (PRECIOS_TOTAL ? { 'X-Total-Count': String(n), 'Access-Control-Expose-Headers': 'X-Total-Count' } : {});
  if (route === '/precios' && method === 'GET') {
    const errors = pagingErrors();
    for (const k of ['relevamiento', 'comercio', 'producto', 'encuestador']) {
      if (q.has(k) && !q.get(k)) errors.push({ field: k, message: `${k} must be a valid id` });
    }
    if (q.has('oferta') && !['true', 'false'].includes(q.get('oferta'))) errors.push({ field: 'oferta', message: 'oferta must be true or false' });
    if (q.has('conAlerta') && q.get('conAlerta') !== 'true') errors.push({ field: 'conAlerta', message: 'conAlerta must be true' });
    if (errors.length) return send(res, 400, { errors });
    let list = precios.filter(priceVisible);
    for (const k of ['relevamiento', 'comercio', 'producto']) if (q.get(k)) list = list.filter((p) => p[k] === q.get(k));
    // A surveyor is always narrowed to their own prices, whatever `encuestador` says.
    if (me.role !== 'ENCUESTADOR' && q.get('encuestador')) list = list.filter((p) => p.encuestador === q.get('encuestador'));
    if (q.has('oferta')) list = list.filter((p) => p.oferta === (q.get('oferta') === 'true'));
    if (q.get('conAlerta') === 'true') list = list.filter((p) => p.alerta);
    list = [...list].sort(
      (a, b) => b.fechaRelevamiento.localeCompare(a.fechaRelevamiento) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
    return send(res, 200, sliceOf(list), totalHeader(list.length));
  }
  if (route === '/auditoria/precios' && method === 'GET') {
    if (me.role === 'ENCUESTADOR') return forbidden();
    const errors = pagingErrors();
    for (const k of ['precio', 'usuario', 'relevamiento']) {
      if (q.has(k) && !q.get(k)) errors.push({ field: k, message: `${k} must be a valid id` });
    }
    const ACCIONES = ['CREACION', 'MODIFICACION', 'ELIMINACION', 'ADJUNTO_AGREGADO', 'ADJUNTO_ELIMINADO'];
    if (q.has('accion') && !ACCIONES.includes(q.get('accion'))) {
      errors.push({ field: 'accion', message: `accion must be one of: ${ACCIONES.join(', ')}` });
    }
    if (errors.length) return send(res, 400, { errors });
    let list = auditoria;
    for (const k of ['precio', 'usuario', 'relevamiento', 'accion']) if (q.get(k)) list = list.filter((a) => a[k] === q.get(k));
    list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return send(res, 200, sliceOf(list), totalHeader(list.length));
  }

  // ----- cálculos. Read: SUPERVISOR, ANALISTA, COORDINADOR, DIRECCION. Run and exportacion: ANALISTA, COORDINADOR.
  // The 409s carry only `{message}` (no `code`), whatever MOCK_LEGACY_ERRORS says.
  if (route === '/calculos' || route.startsWith('/calculos/')) {
    if (me.role === 'ENCUESTADOR') return forbidden();
    const canRun = me.role === 'ANALISTA' || me.role === 'COORDINADOR';
    const conflictMsg = (message) => send(res, 409, { message });
    const isUuidV = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const formatoOf = () => {
      const f = q.get('formato') ?? 'xlsx';
      return ['xlsx', 'csv'].includes(f) ? f : null;
    };
    const fileOf = (formato, name, csvText) => {
      const csv = formato === 'csv';
      return send(res, 200, Buffer.from(csv ? csvText : `PK\u0003\u0004 mock placeholder, not a real workbook\n${csvText}`), {
        'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${name}.${formato}"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      });
    };
    /** Range check shared by POST and GET /exportacion. Same rules as the backend validators (see the contract). */
    const rangeErrors = (b) => {
      const errors = [];
      for (const k of ['mesBase', 'mesObjetivo']) {
        if (typeof b[k] !== 'string' || !MONTH_RE.test(b[k])) errors.push({ field: k, message: `${k} must be in the format YYYY-MM` });
      }
      if (!errors.length) {
        const span = monthIdx(b.mesObjetivo) - monthIdx(b.mesBase);
        if (span < 0) errors.push({ field: 'mesObjetivo', message: 'mesObjetivo must not be before mesBase' });
        // Ambiguity in the contract ("range <= 36 months"): the mock counts months inclusively, so a distance of 36 is refused.
        else if (span + 1 > 36) errors.push({ field: 'mesObjetivo', message: 'the range must not exceed 36 months' });
      }
      return errors;
    };
    /** The three data preconditions of a range, in the order of the contract. Returns the 409 message or null. */
    const rangeConflict = (b) => {
      for (const m of [b.mesBase, b.mesObjetivo]) {
        if (!relevamientos.some((r) => r.periodo === m)) return `No hay relevamientos para el mes ${m}`;
      }
      const months = monthList(b.mesBase, b.mesObjetivo);
      const abiertos = relevamientos.filter((r) => months.includes(r.periodo) && r.estado === 'ABIERTO').map((r) => r.periodo);
      if (abiertos.length) return `Hay relevamientos abiertos: ${abiertos.join(', ')}`;
      if (!precios.some((p) => months.includes(p.relevamiento.slice(4)))) return 'No hay precios cargados en el rango indicado';
      return null;
    };

    if (route === '/calculos' && method === 'POST') {
      if (!canRun) return forbidden();
      const b = await readJson(req);
      if (b === null || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { errors: [{ field: 'body', message: 'body must be an object' }] });
      const errors = rangeErrors(b);
      if (b.excluirOfertas !== undefined && typeof b.excluirOfertas !== 'boolean') errors.push({ field: 'excluirOfertas', message: 'excluirOfertas must be a boolean' });
      const par = b.parametros ?? {};
      if (typeof par !== 'object' || Array.isArray(par)) errors.push({ field: 'parametros', message: 'parametros must be an object' });
      else {
        if (par.esperarMeses !== undefined && !(Number.isInteger(par.esperarMeses) && par.esperarMeses >= 0 && par.esperarMeses <= 12)) {
          errors.push({ field: 'parametros.esperarMeses', message: 'esperarMeses must be an integer between 0 and 12' });
        }
        for (const k of ['pesoSuper', 'pesoTrad']) {
          if (par[k] !== undefined && !(typeof par[k] === 'number' && Number.isFinite(par[k]) && par[k] >= 0)) {
            errors.push({ field: `parametros.${k}`, message: `${k} must be a number greater than or equal to 0` });
          }
        }
        if (par.omitirGruposCompletos !== undefined && typeof par.omitirGruposCompletos !== 'boolean') {
          errors.push({ field: 'parametros.omitirGruposCompletos', message: 'omitirGruposCompletos must be a boolean' });
        }
      }
      if (errors.length) return send(res, 400, { errors });
      const conflictText = rangeConflict(b);
      if (conflictText) return conflictMsg(conflictText);
      if (calculos.some((c) => c.estado === 'EJECUTANDO')) return conflictMsg('Ya hay un cálculo en ejecución: espere a que termine');
      const parametros = { ...CALC_DEFAULTS, ...par };
      const run = {
        id: uuid(), mesBase: b.mesBase, mesObjetivo: b.mesObjetivo, excluirOfertas: b.excluirOfertas ?? false, parametros,
        motorVersion: 'mock-engine 0.1.0', entradaHash: crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex'),
        estado: 'EJECUTANDO', error: null, creadoPor: me.id, createdAt: now(), updatedAt: now(), resumen: null,
        _ticks: 0, _fail: parametros.esperarMeses === 12,
      };
      calculos.push(run);
      return send(res, 202, calcPublic(run));
    }
    if (route === '/calculos' && method === 'GET') {
      const errors = pagingErrors();
      if (errors.length) return send(res, 400, { errors });
      calculos.forEach(settleCalculo);
      const sorted = [...calculos].sort((a, b2) => b2.createdAt.localeCompare(a.createdAt) || b2.id.localeCompare(a.id));
      return send(res, 200, sliceOf(sorted).map(calcPublic)); // bare array, no X-Total-Count
    }
    if (route === '/calculos/exportacion' && method === 'GET') {
      if (!canRun) return forbidden();
      const b = { mesBase: q.get('mesBase'), mesObjetivo: q.get('mesObjetivo') };
      const errors = rangeErrors(b);
      if (q.has('excluirOfertas') && !['true', 'false'].includes(q.get('excluirOfertas'))) errors.push({ field: 'excluirOfertas', message: 'excluirOfertas must be true or false' });
      const formato = formatoOf();
      if (!formato) errors.push({ field: 'formato', message: 'formato must be one of: xlsx, csv' });
      if (errors.length) return send(res, 400, { errors });
      const conflictText = rangeConflict(b);
      if (conflictText) return conflictMsg(conflictText);
      const months = monthList(b.mesBase, b.mesObjetivo);
      const rows = precios
        .filter((p) => months.includes(p.relevamiento.slice(4)) && (q.get('excluirOfertas') !== 'true' || !p.oferta))
        .map((p) => `${VARIEDAD_OF[Number(p.producto.split('-')[1])] ?? ''},${p.comercio},${p.relevamiento.slice(4)},${p.valor},${p.oferta}`);
      return fileOf(formato, `entrada_${b.mesBase}_${b.mesObjetivo}`, ['variedad,comercio,mes,precio,oferta', ...rows].join('\n') + '\n');
    }
    const m = /^\/calculos\/([^/]+)(?:\/(relativos|imputaciones|resultados))?$/.exec(route);
    if (m && method === 'GET') {
      if (!isUuidV(m[1])) return send(res, 400, { errors: [{ field: 'id', message: 'id must be a valid UUID' }] });
      const run = calculos.find((c) => c.id === m[1]);
      if (!run) return send(res, 404, { message: 'Calculo not found' });
      settleCalculo(run);
      if (!m[2]) return send(res, 200, calcPublic(run));
      if (m[2] === 'relativos') {
        const errors = [];
        if (q.has('variedad') && !/^\d{7}$/.test(q.get('variedad'))) errors.push({ field: 'variedad', message: 'variedad must be 7 digits' });
        if (q.has('mes') && !MONTH_RE.test(q.get('mes'))) errors.push({ field: 'mes', message: 'mes must be in the format YYYY-MM' });
        if (errors.length) return send(res, 400, { errors });
        let rows = calcRelativos.get(run.id) ?? [];
        if (q.get('variedad')) rows = rows.filter((r) => r.variedad === q.get('variedad'));
        if (q.get('mes')) rows = rows.filter((r) => r.mes === q.get('mes'));
        return send(res, 200, rows);
      }
      if (m[2] === 'imputaciones') {
        const errors = pagingErrors();
        if (errors.length) return send(res, 400, { errors });
        return send(res, 200, sliceOf(calcImputaciones.get(run.id) ?? [])); // no X-Total-Count
      }
      const formato = formatoOf();
      if (!formato) return send(res, 400, { errors: [{ field: 'formato', message: 'formato must be one of: xlsx, csv' }] });
      if (run.estado !== 'COMPLETADO') return conflictMsg('Calculo is not COMPLETADO');
      const lines = (calcRelativos.get(run.id) ?? []).map((r) => `${r.variedad},${r.mes},${r.valor ?? ''},${r.nSuper},${r.nTrad}`);
      return fileOf(formato, `calculo_${run.mesBase}_${run.mesObjetivo}`, ['variedad,mes,valor,nSuper,nTrad', ...lines].join('\n') + '\n');
    }
    return send(res, 404, { message: 'Not found' });
  }

  // Must be matched before /precios/:id. Contract of backend commit 764de24.
  if (route === '/precios/anterior' && method === 'GET') {
    const errors = [];
    for (const k of ['relevamiento', 'comercio', 'producto']) {
      if (!q.get(k)) errors.push({ field: k, message: `${k} is required` });
    }
    if (errors.length) return send(res, 400, { errors });
    const a = asignaciones.find((x) => x.relevamiento === q.get('relevamiento') && x.comercio === q.get('comercio') && mine(x));
    if (!a) return send(res, 404, { message: 'Asignacion not found' });
    const current = relevamientos.find((r) => r.id === q.get('relevamiento'));
    const best = precios
      .filter((p) => p.comercio === q.get('comercio') && p.producto === q.get('producto'))
      .map((p) => ({ p, rel: relevamientos.find((r) => r.id === p.relevamiento) }))
      .filter((x) => x.rel && Date.parse(x.rel.fechaInicio) < Date.parse(current.fechaInicio))
      .sort((a, b) => Date.parse(b.rel.fechaInicio) - Date.parse(a.rel.fechaInicio))[0];
    if (!best) {
      res.writeHead(204);
      return res.end();
    }
    return send(res, 200, { valor: best.p.valor, periodo: best.rel.periodo, oferta: best.p.oferta });
  }
  if (route === '/precios' && method === 'POST') {
    if (me.role !== 'ENCUESTADOR') return forbidden();
    const b = await readJson(req);
    const errors = [];
    if (!b || typeof b !== 'object') return send(res, 400, { errors: [{ field: 'body', message: 'invalid JSON' }] });
    for (const f of ['relevamiento', 'comercio', 'producto']) if (typeof b[f] !== 'string') errors.push({ field: f, message: 'required' });
    if (!(typeof b.valor === 'number' && b.valor > 0)) errors.push({ field: 'valor', message: 'must be a number > 0' });
    // Mock-only rule so the "rejected by the server" path can be exercised: absurd values are refused.
    else if (b.valor >= MAX_VALOR) errors.push({ field: 'valor', message: 'valor is out of the accepted range' });
    if (b.observacion !== undefined && b.observacion !== null && String(b.observacion).length > 500) {
      errors.push({ field: 'observacion', message: 'max 500 characters' });
    }
    if (b.fechaRelevamiento !== undefined) {
      const t = Date.parse(b.fechaRelevamiento);
      if (Number.isNaN(t)) errors.push({ field: 'fechaRelevamiento', message: 'fechaRelevamiento must be an ISO 8601 date' });
      else if (t > Date.now()) errors.push({ field: 'fechaRelevamiento', message: 'fechaRelevamiento cannot be in the future' });
    }
    if (errors.length) return send(res, 400, { errors });
    const r = relevamientos.find((x) => x.id === b.relevamiento);
    if (!r) return send(res, 404, { message: 'Relevamiento not found' });
    if (r.estado !== 'ABIERTO') return send(res, 409, { message: 'Relevamiento is not ABIERTO' });
    const a = asignaciones.find((x) => mine(x) && x.relevamiento === b.relevamiento && x.comercio === b.comercio && x.estado === 'EN_CURSO');
    if (!a) return send(res, 403, { message: 'No EN_CURSO asignacion for this comercio' });
    const p = productosFull.find((x) => x.id === b.producto);
    if (!p) return send(res, 404, { message: 'Producto not found' });
    if (p.estado !== 'ACTIVO') return send(res, 400, { message: 'Producto is not ACTIVO' });
    const alerta = b.oferta === true ? null : judge({ relevamiento: b.relevamiento, comercio: b.comercio, producto: b.producto, valor: b.valor });
    if (alerta && b.confirmarDesvio !== true) {
      return send(res, 409, { message: 'Atypical price, confirmation required', requiereConfirmacion: true, alerta });
    }
    if (precios.some((x) => x.relevamiento === b.relevamiento && x.producto === b.producto && x.comercio === b.comercio)) {
      return send(res, 409, { message: 'Precio already exists for this relevamiento, producto and comercio' });
    }
    const created = {
      id: uuid(), relevamiento: b.relevamiento, producto: b.producto, comercio: b.comercio, encuestador: me.id,
      valor: b.valor, oferta: b.oferta === true, fechaRelevamiento: b.fechaRelevamiento ?? now(),
      observacion: b.observacion ? String(b.observacion) : null, alerta: alerta ?? null, createdAt: now(), updatedAt: now(),
    };
    precios.push(created);
    audit('CREACION', me, created, null, snapshot(created));
    return send(res, 201, created);
  }
  m = route.match(/^\/precios\/([^/]+)$/);
  if (m) {
    if (method === 'GET') {
      const p = precios.find((x) => x.id === m[1] && priceVisible(x));
      return p ? send(res, 200, p) : send(res, 404, { message: 'Precio not found' });
    }
    if (method === 'PATCH') {
      // Router order of the backend: authorize -> validate body -> load (404) -> relevamiento (409) -> asignacion (409).
      if (!['ENCUESTADOR', 'SUPERVISOR', 'ANALISTA'].includes(me.role)) return forbidden();
      const b = await readJson(req);
      if (!b || typeof b !== 'object') return send(res, 400, { errors: [{ field: 'body', message: 'invalid JSON' }] });
      const errors = [];
      if (b.valor === undefined && b.observacion === undefined && b.oferta === undefined) {
        errors.push({ field: 'body', message: 'at least one of: valor, observacion, oferta is required' });
      }
      if (b.valor !== undefined && !(typeof b.valor === 'number' && Number.isFinite(b.valor) && b.valor > 0)) {
        errors.push({ field: 'valor', message: 'valor must be a number greater than 0' });
      } else if (b.valor !== undefined && b.valor >= MAX_VALOR) errors.push({ field: 'valor', message: 'valor is out of the accepted range' });
      if (b.observacion !== undefined && b.observacion !== null && !(typeof b.observacion === 'string' && b.observacion.length <= 500)) {
        errors.push({ field: 'observacion', message: 'observacion must be a string of at most 500 characters, or null to clear it' });
      }
      if (b.oferta !== undefined && typeof b.oferta !== 'boolean') errors.push({ field: 'oferta', message: 'oferta must be a boolean' });
      if (b.confirmarDesvio !== undefined && typeof b.confirmarDesvio !== 'boolean') {
        errors.push({ field: 'confirmarDesvio', message: 'confirmarDesvio must be a boolean' });
      }
      if (errors.length) return send(res, 400, { errors });

      const reviewer = REVIEWERS.includes(me.role);
      const p = precios.find((x) => x.id === m[1]);
      if (!p || (!reviewer && !mine(p))) return send(res, 404, { message: 'Precio not found' });
      const r = relevamientos.find((x) => x.id === p.relevamiento);
      // The reviewer may act after the asignacion is COMPLETADA, but never once the relevamiento is closed.
      // The backend sends no `code` on this 409 (docs/api-contract-gestion.md, gap 24).
      if (!r || r.estado !== 'ABIERTO') return send(res, 409, { message: 'Relevamiento is not ABIERTO' });
      if (!reviewer && !asignaciones.some((x) => mine(x) && x.relevamiento === p.relevamiento && x.comercio === p.comercio && x.estado === 'EN_CURSO')) {
        return send(res, 409, { message: 'The asignacion is no longer EN_CURSO' });
      }

      const valor = b.valor ?? p.valor;
      const oferta = b.oferta ?? p.oferta;
      let alerta = p.alerta;
      if (b.valor !== undefined || b.oferta !== undefined) {
        alerta = oferta === true ? null : judge({ relevamiento: p.relevamiento, comercio: p.comercio, producto: p.producto, valor, excludeId: p.id });
        if (alerta && b.confirmarDesvio !== true) {
          return send(res, 409, { message: 'Atypical price, confirmation required', requiereConfirmacion: true, alerta });
        }
      }
      const before = snapshot(p);
      let observacion = p.observacion;
      if (b.observacion !== undefined) {
        const text = typeof b.observacion === 'string' ? b.observacion.trim() : '';
        observacion = text === '' ? null : text;
      }
      Object.assign(p, { valor, oferta, alerta, observacion, updatedAt: now() });
      audit('MODIFICACION', me, p, before, snapshot(p));
      return send(res, 200, p);
    }
    if (method === 'DELETE') {
      if (me.role !== 'ENCUESTADOR') return forbidden();
      const p = precios.find((x) => x.id === m[1] && mine(x));
      if (!p) return send(res, 404, { message: 'Precio not found' });
      const r = relevamientos.find((x) => x.id === p.relevamiento);
      const a = asignaciones.find((x) => mine(x) && x.relevamiento === p.relevamiento && x.comercio === p.comercio);
      if (r?.estado !== 'ABIERTO') return send(res, 409, { message: 'Relevamiento is not ABIERTO' });
      if (a?.estado !== 'EN_CURSO') return send(res, 409, { message: 'Asignacion is no longer EN_CURSO' });
      precios.splice(precios.indexOf(p), 1);
      for (const [id, att] of adjuntos) if (att.meta.precio === p.id) adjuntos.delete(id);
      audit('ELIMINACION', me, p, snapshot(p), null);
      return send(res, 204);
    }
  }

  m = route.match(/^\/precios\/([^/]+)\/adjuntos(?:\/([^/]+))?$/);
  if (m) {
    const p = precios.find((x) => x.id === m[1] && mine(x));
    if (!p) return send(res, 404, { message: 'Precio not found' });
    const list = () => [...adjuntos.values()].filter((a) => a.meta.precio === p.id).map((a) => a.meta);
    if (!m[2]) {
      if (method === 'GET') return send(res, 200, list());
      if (method === 'POST') {
        const r = relevamientos.find((x) => x.id === p.relevamiento);
        const a = asignaciones.find((x) => mine(x) && x.relevamiento === p.relevamiento && x.comercio === p.comercio);
        if (r?.estado !== 'ABIERTO' || a?.estado !== 'EN_CURSO') return send(res, 409, { message: 'Precio is no longer editable' });
        if (list().length >= MAX_ATTACH) return send(res, 409, { message: 'Attachment limit reached' });
        let buf;
        try {
          buf = await readBody(req);
        } catch (e) {
          return send(res, e.status ?? 400, { message: 'Payload too large' });
        }
        if (buf.length === 0) return send(res, 400, { message: 'Empty body' });
        if (buf.length > MAX_BYTES) return send(res, 413, { message: 'Payload too large' });
        const mime = detectMime(buf);
        if (!mime) return send(res, 415, { message: 'Unsupported media type' });
        const meta = {
          id: uuid(), precio: p.id, mime, bytes: buf.length,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'), subidoPor: me.id, createdAt: now(),
        };
        adjuntos.set(meta.id, { meta, buffer: buf });
        audit('ADJUNTO_AGREGADO', me, p, null, null, { detalle: { adjunto: meta.id, mime: meta.mime, bytes: meta.bytes, sha256: meta.sha256 } });
        return send(res, 201, meta);
      }
    } else {
      const att = adjuntos.get(m[2]);
      if (!att || att.meta.precio !== p.id) return send(res, 404, { message: 'Adjunto not found' });
      if (method === 'GET') return send(res, 200, att.buffer, { 'Content-Type': att.meta.mime });
      if (method === 'DELETE') {
        const r = relevamientos.find((x) => x.id === p.relevamiento);
        const a = asignaciones.find((x) => mine(x) && x.relevamiento === p.relevamiento && x.comercio === p.comercio);
        if (r?.estado !== 'ABIERTO' || a?.estado !== 'EN_CURSO') return send(res, 409, { message: 'Precio is no longer editable' });
        adjuntos.delete(att.meta.id);
        audit('ADJUNTO_ELIMINADO', me, p, null, null, { detalle: { adjunto: att.meta.id, mime: att.meta.mime, bytes: att.meta.bytes, sha256: att.meta.sha256 } });
        return send(res, 204);
      }
    }
  }

  return send(res, 404, { message: 'Not found' });
}

void isUuid;
http
  .createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { message: 'Internal error' });
    });
  })
  .listen(PORT, () => {
    console.log(`[mock-api] DEV TOOLING. Listening on http://localhost:${PORT}`);
    console.log('[mock-api] encuestador@sipc.test / sipc12345  (also coordinador@, supervisor@, analista@, direccion@sipc.test)');
  });
