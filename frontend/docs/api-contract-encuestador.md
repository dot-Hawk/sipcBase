# API contract — ENCUESTADOR role

Source: mapped from `backend/src` (routes, controllers, validators, domain). Backend is Express + TS + PostgreSQL.

## Server
- All routes under `/api`. `PORT` has no default (set in backend `.env`). CORS is an allowlist (`CORS_ORIGINS`) and helmet is on; the frontend still uses the Vite dev proxy (`/api` → `VITE_API_TARGET`, default `http://localhost:3000`), so no change is needed.
- IDs are UUIDs (`id`), canasta nodes use numeric-string `codigo`. Timestamps ISO. Numbers are JSON numbers.
- Errors: `{message}` or validation `{errors:[{field,message}]}`. Messages are English → never match on text; map by status/shape and write Spanish copy in the UI.
- Encuestador only sees own asignaciones/precios; other people's resources return 404.

## Auth
- `POST /api/auth/login` `{email,password}` → `{token, user:{id,nombre,apellido,role}}`. 400 missing fields, 401 invalid/inactive, 429 rate limited (`Retry-After`).
- `GET /api/auth/me` (Bearer) → 200 `{id,nombre,apellido,dni,legajo,email,role,estado,ultimoAcceso}`. 404 `{message}` if the user no longer exists, 401 if the token is invalid or the account is not `ACTIVO`. The frontend calls it on start and on focus / reconnect (throttled 60 s): role !== ENCUESTADOR or estado !== ACTIVO (or 404) ends the session with a login notice; network errors, 429 and 5xx keep the stored session.
- `POST /api/auth/password` (Bearer) `{currentPassword (non-empty), newPassword (min 8)}` → 204 no body. 400 `{message}` (no `errors`) = wrong current password; 400 `{errors:[{field:"newPassword",...}]}` = validation. Map by shape, never by text. The current token stays valid afterwards (no revocation), so the user is not logged out.
- JWT HS256 `{userId, role, iat, exp}`, 8h. Header `Authorization: Bearer <token>`.
- **Every authenticated request re-checks the account in the DB**: a deactivation, leave or role change makes the next request return 401 (`{message:"Invalid or expired token"}`) even with an unexpired token. 401 therefore means "session expired or account disabled" → drop session, go to login.
- No refresh and no server-side logout (logout is client-side only: drop the token). Persist `user` client-side and refresh it from `/auth/me`; decode `exp` locally.
- Roles: ENCUESTADOR|SUPERVISOR|ANALISTA|COORDINADOR|DIRECCION. The surveyor UI must only accept ENCUESTADOR.

## Roles (frontend assumption)
- `user.role` is one of `ENCUESTADOR | COORDINADOR | SUPERVISOR | ANALISTA | DIRECCION` (login and `/auth/me`). The app routes by it (`src/app/roles.ts`); any other string is refused at login and on `/auth/me` revalidation.
- Only ENCUESTADOR uses the endpoints below with offline support. The other roles use `/auth/login`, `/auth/me` and `/auth/password` today; their section endpoints are not wired yet.
- Hiding a screen is a convenience, never authorization: the backend must enforce role access on every route.

## Endpoints used by the encuestador (all need Bearer)
| Method + path | Notes |
|---|---|
| GET `/api/asignaciones?relevamiento=&comercio=&estado=` | auto-filtered to caller. Bare array, unpaginated, `createdAt` desc |
| GET `/api/asignaciones/:id` | 404 if not owned |
| PATCH `/api/asignaciones/:id/estado` `{estado}` | PENDIENTE→EN_CURSO→COMPLETADA only |
| GET `/api/relevamientos` / `/:id` | bare array, `fechaInicio` desc |
| GET `/api/comercios?zona=&tipo=&estado=` / `/:id` | all comercios, not scoped |
| GET `/api/productos?categoria=&unidad=&estado=&codigoVariedad=` / `/:id` | only ACTIVO can be priced |
| GET `/api/canasta?nivel=&padre=&categoria=&estado=` / `/:codigo` | tree; only nivel 6 (VARIEDAD) priced |
| POST `/api/precios` | create |
| GET `/api/precios?relevamiento=&comercio=&producto=&oferta=&conAlerta=&page=&limit=` | caller only; paginated (`limit` 1..200, default 50); no total → last page when `length < limit`; order `fechaRelevamiento` desc |
| GET `/api/precios/anterior?relevamiento=&comercio=&producto=` | previous price of that producto at that comercio, **from anyone**, in the latest relevamiento that started before the given one. `200 {valor, periodo, oferta}` · `204` no body = none (not an error) · `400 {errors:[{field,message}]}` · `404 {message}` comercio not assigned to the caller. Declare before `/:id` |
| GET `/api/precios/:id` | |
| PATCH `/api/precios/:id` | `{valor?,observacion?,oferta?,confirmarDesvio?}`; cannot change comercio/producto/fecha |
| DELETE `/api/precios/:id` | 204; deletes attachments too |
| POST `/api/precios/:id/adjuntos` | **raw body** (not multipart); JPEG/PNG/WebP/PDF by magic bytes; ≤5 MB; ≤5 per precio |
| GET `/api/precios/:id/adjuntos` | `[{id,precio,mime,bytes,sha256,subidoPor,createdAt}]` |
| GET `/api/precios/:id/adjuntos/:adjuntoId` | binary, needs Bearer → `fetch` + `URL.createObjectURL` |
| DELETE `/api/precios/:id/adjuntos/:adjuntoId` | 204 |

## Types
```
Relevamiento = {id, periodo, frecuencia:"QUINCENAL"|"MENSUAL", fechaInicio, fechaLimite, estado:"ABIERTO"|"CERRADO", createdAt, updatedAt}
  periodo: YYYY-MM (MENSUAL) | YYYY-MM-Q1|Q2 (QUINCENAL)
Comercio = {id, nombre, direccion, zona, tipo:"SUPERMERCADO"|"ALMACEN"|"VERDULERIA"|"CARNICERIA"|"FARMACIA"|"OTRO", estado:"ACTIVO"|"INACTIVO", createdAt, updatedAt}
Producto = {id, nombre, categoria:string, unidad:"KG"|"G"|"LT"|"ML"|"UNIDAD", cantidadReferencia:number, marca:string|null, codigoVariedad:string(7), estado, createdAt, updatedAt}
Asignacion = {id, relevamiento:uuid, encuestador:uuid, comercio:uuid, estado:"PENDIENTE"|"EN_CURSO"|"COMPLETADA", createdAt, updatedAt}   // flat: join client-side
Alerta = AlertaPercentil | AlertaHistorica   // legacy rows only: no `metodo`
AlertaPercentil = {metodo:"PERCENTIL_VARIACION", variedad, precioAnterior, variacion, percentilInferior, percentilSuperior, limiteInferior, limiteSuperior, rangoPrecio:{min,max}, n}
AlertaHistorica = {media, desvio, n, limiteInferior, limiteSuperior}
Precio = {id, relevamiento, producto, comercio, encuestador, valor:number, oferta:boolean, fechaRelevamiento, observacion:string|null, alerta:Alerta|null, createdAt, updatedAt}
```
Products are NOT linked to an asignacion: the surveyor may price any ACTIVO producto at a comercio whose asignacion is EN_CURSO.

## POST /api/precios
```
{relevamiento, comercio, producto, valor>0, oferta?=false, observacion?<=500, fechaRelevamiento?(ISO, not future, not < relevamiento.fechaInicio), confirmarDesvio?}
```
201 → Precio. Failure order: 400 `{errors}` · 404 relevamiento · 409 relevamiento not ABIERTO · 403 no EN_CURSO asignacion for comercio · 404 producto · 400 producto not ACTIVO · 400 fecha before start · **409 atypical** · 409 duplicate `(relevamiento, producto, comercio)`.

### Atypical price (soft stop)
- 409 body `{message, requiereConfirmacion:true, alerta:Alerta}`. Show stats; if user confirms, resend same body + `confirmarDesvio:true`; price is stored with `alerta`.
- Only judged when `oferta !== true`. `variacion = valor / precioAnterior` (latest non-offer price of the same producto+comercio in an earlier relevamiento; none → not judged). Reference = all historical variations of the producto's variedad (consecutive non-offer prices per producto+comercio, earlier relevamientos). Needs `n>=20`; alert if `variacion` is outside `[min(P5, 0.9), max(P95, 1.1)]` (linear-interpolation percentiles). `rangoPrecio` = bounds × `precioAnterior`.
- PATCH of `valor`/`oferta` re-judges with the same 409 flow; if no longer atypical, `alerta` cleared.

## PATCH /api/asignaciones/:id/estado
`{estado}` → Asignacion. 400 invalid · 404 not found/not owned · 409 invalid transition · 409 relevamiento not ABIERTO · 409 concurrent modification.

## Workflow & edit window
1. Login → 2. `GET /asignaciones` → join relevamientos + comercios → 3. PATCH `EN_CURSO` → 4. per producto POST precio (handle 409 alert), attach photos after the precio exists → 5. PATCH `COMPLETADA`.
- Create/edit/delete precios & attachments only while relevamiento ABIERTO **and** asignacion EN_CURSO (PATCH precio → 409 "asignacion is no longer EN_CURSO").
- One precio per (relevamiento, producto, comercio): correct via PATCH, never re-POST. A retried POST that returns 409 duplicate means "already saved" → refetch.
- No draft/submit state, no server sync, no idempotency keys, no bulk endpoint, no client IDs. The client keeps an offline outbox (README "Offline") and relies on these properties to replay safely:
  - Identity is the triple `(relevamiento, producto, comercio)` (unique constraint): a replayed POST answers 409 duplicate, so the client looks the precio up and PATCHes the queued values. PATCH sets absolute values, so replaying it is idempotent (the atypical check runs again; a PATCH that sends only `observacion` is not re-judged).
  - The atypical check runs before the uniqueness check: a replayed unconfirmed POST of an atypical value gets the atypical 409, not the duplicate one.
  - `fechaRelevamiento` is accepted on POST only (ISO, not in the future): the client sends the capture time and retries without it if the server refuses it (device clock ahead).
  - Attachments have no idempotency: the client compares the sha256 returned by `GET /precios/:id/adjuntos` with the queued blob before re-uploading after an uncertain send.
  - Last write wins: the queued value overwrites whatever another writer (supervisor/analyst PATCH) stored in between.
- Previous price: `GET /precios/anterior` (above). The editor asks it **only for the selected producto** (one cached query each, 5 min), never per list row. `oferta: true` is shown as a visible warning. `204` → "Sin precio anterior". `400`/`404`/network failure or offline degrade to the own-price derivation (`GET /precios?comercio=X` joined with relevamientos by `fechaInicio`), which also feeds the own-price sparkline.

## Not in the backend (do NOT invent in UI)
Variety attributes (marca/modelo/material…), "afecta precio", panel, aglomerado, informante code, visit number, razón codes, tipo P. A missing price is simply no POST.
