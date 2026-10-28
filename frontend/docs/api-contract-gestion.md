# API contract: management screens (COORDINADOR)

Source: backend code (`routes`, `controllers`, `validators`, `domain/enums.ts`, `repositories`) read on 2026-10-15, with every
GET re-checked live against the dev backend. **Writes were never sent to the dev backend**: their behaviour comes from the code
and is reproduced by `scripts/mock-api.mjs`. Base path `/api`, `Authorization: Bearer <jwt>` on everything.

**Update 2026-10-15** (backend branch `dev-dieggo`, commits `6270080` stable codes, `5f6026a` date validation, `858c38e`
`X-Total-Count` + optional pagination, `d9187c0` trim + user view): the additive contract below is what the screens rely on.
Every item has a fallback for a backend that has not been restarted/updated (see "What the UI relies on").

## Error shapes

| Status | Body | Meaning here |
|---|---|---|
| 400 | `{ errors: [{ field, message }] }` | Validator failure (also bad query params). `field: "body"` = empty PATCH |
| 400 | `{ message }` | Business rule or bad id (`Invalid user id`, `encuestador must be an ACTIVO user...`) |
| 401 | `{ message }` | Missing/invalid token, **or the account is not ACTIVO** (checked on every request) |
| 403 | `{ message }` | Role not allowed, or self-protection (own role / own estado) |
| 404 | `{ message }` | Unknown id (`User not found`, `Relevamiento not found`, ...) |
| 409 | `{ message, code }` | Unique violation or state conflict. `code` is a stable machine code (table below); `USER_DUPLICATE` adds `errors: [{ field, message }]` |
| 500 | `{ message }` | Unexpected (see "surprises": unvalidated dates) |

The frontend never shows server text: Spanish copy is chosen by status and, for a 409, by `code`
(`mapAsignacionError`, `mapUserConflict`). Matching the English `message` survives only as a fallback when `code` is absent.

### 409 codes (backend `src/domain/error-codes.ts`; values are public contract)

| `code` | Where | UI |
|---|---|---|
| `RELEVAMIENTO_NOT_ABIERTO` | `POST /asignaciones`, `PATCH /asignaciones/:id/estado` | error on the Relevamiento field |
| `COMERCIO_ALREADY_ASSIGNED` | `POST /asignaciones` | error on the Comercio field |
| `ASIGNACION_NOT_PENDIENTE` | `PATCH /asignaciones/:id/encuestador` | form-level message |
| `INVALID_ESTADO_TRANSITION` | `PATCH /asignaciones/:id/estado` | form-level message (not used by these screens) |
| `ASIGNACION_CONCURRENT_MODIFICATION` | `PATCH /asignaciones/:id/estado` | form-level message (not used by these screens) |
| `USER_DUPLICATE` | `POST /users`, `PATCH /users/:id` | `errors[].field` (`dni`, `legajo`, `email`) on that field; `errors: []` -> form message naming the three |

Other 409s have **no** `code` (close relevamiento "already closed", duplicate periodo, precios): they stay status-based.
An unknown `code` degrades to the generic conflict message.

## Relevamientos

| Call | Roles | Body / query | Success | Errors |
|---|---|---|---|---|
| `GET /relevamientos` | any | none | 200 `Relevamiento[]`, `fechaInicio` desc. Every row unless `page`/`limit` is sent. `X-Total-Count` always | 400 errors[] (`page`, `limit`) |
| `GET /relevamientos/:id` | any | | 200 | 400 invalid id, 404 |
| `POST /relevamientos` | COORDINADOR | `{ periodo, frecuencia, fechaInicio, fechaLimite }` | 201 (estado `ABIERTO`) | 400 errors[] (`frecuencia`, `periodo`, `fechaInicio`, `fechaLimite`), 409 same periodo+frecuencia |
| `PATCH /relevamientos/:id/cerrar` | COORDINADOR | none | 200 (estado `CERRADO`) | 404, 409 already closed |

`frecuencia`: `QUINCENAL` \| `MENSUAL`. `periodo`: `^\d{4}-(0[1-9]\|1[0-2])$` for MENSUAL, `...-Q[12]` suffix for QUINCENAL.
Estados: `ABIERTO` -> `CERRADO` only; no reopen. `fechaInicio` and `fechaLimite` are **required**, ISO 8601 (`YYYY-MM-DD` or a
full timestamp); impossible days (`2026-02-31`) are rejected and `fechaLimite` must be **strictly after** `fechaInicio`
(400 `errors[]` with that field). The form sends `...T00:00:00.000Z`.

## Asignaciones

| Call | Roles | Body / query | Success | Errors |
|---|---|---|---|---|
| `GET /asignaciones` | any (ENCUESTADOR: only own) | `relevamiento`, `encuestador`, `comercio` (ids), `estado`, optional `page`, `limit` | 200 `Asignacion[]`, `createdAt` desc. Every row unless `page`/`limit` is sent. `X-Total-Count` = filtered total (for ENCUESTADOR only their own) | 400 errors[] |
| `POST /asignaciones` | COORDINADOR | `{ relevamiento, encuestador, comercio }` | 201 (estado `PENDIENTE`) | see below |
| `PATCH /asignaciones/:id/encuestador` | COORDINADOR | `{ encuestador }` | 200 | 400, 404, 409 not PENDIENTE |
| `PATCH /asignaciones/:id/estado` | COORDINADOR, ENCUESTADOR | `{ estado }` | 200 | 409 invalid transition / relevamiento not ABIERTO (not used by these screens) |

`POST` check order: 400 ids (errors[]) -> 404 relevamiento -> 409 `Relevamiento is not ABIERTO` -> 404 encuestador ->
400 `encuestador must be an ACTIVO user with role ENCUESTADOR` -> 404 comercio -> 400 `comercio must be ACTIVO` ->
409 `This comercio is already assigned in this relevamiento` (unique relevamiento+comercio).
Estados: `PENDIENTE` -> `EN_CURSO` -> `COMPLETADA`. Reassign: only `PENDIENTE` (409 otherwise). **There is no cancel/delete.**

Lookups used for names: `GET /comercios` (any role, plain array, by nombre) and `GET /users?role=ENCUESTADOR&limit=200`.

## Users (whole router is COORDINADOR-only; others get 403)

| Call | Body / query | Success | Errors |
|---|---|---|---|
| `GET /users` | `role`, `estado`, `page` (>=1), `limit` (1..200, default 50) | 200 `User[]` ordered apellido, nombre, id. `X-Total-Count` = filtered total | 400 errors[] |
| `GET /users/:id` | | 200 | 400 invalid id, 404 |
| `POST /users` | `{ nombre, apellido, dni, legajo, email, password(>=8), role }` | 201 `User` (same view as the other endpoints, `ultimoAcceso: null`), estado `ACTIVO`. Text fields are trimmed | 400 errors[], 409 `USER_DUPLICATE` |
| `PATCH /users/:id` | any of `nombre, apellido, dni, legajo, email, role` (>=1) | 200 `User` | 400 errors[] (`body` if empty), 403 own `role`, 404, 409 `USER_DUPLICATE` |
| `PATCH /users/:id/estado` | `{ estado: ACTIVO\|INACTIVO\|LICENCIA }` | 200 `User` | 400, 403 own id, 404 |
| `PUT /users/:id/password` | `{ password(>=8) }` | 204 | 400 errors[], 404 |

`User` = `{ id, nombre, apellido, dni, legajo, email, role, estado, ultimoAcceso }`. Roles: `ENCUESTADOR, SUPERVISOR, ANALISTA,
COORDINADOR, DIRECCION, AUDITOR`. Email is trimmed and lower-cased server side. `estado` takes effect on the target's next request
(any non-ACTIVO estado, `LICENCIA` included, answers 401 on every call).

## Self-lockout (what the backend allows)

| Action on your own id | Result |
|---|---|
| `PATCH` with `role` (even unchanged) | **403** |
| `PATCH /estado` (any value) | **403** |
| `PATCH` other fields, `PUT /password` | allowed (reset needs no current password) |
| Deactivate or change the role of **another** coordinator | allowed, including the last other coordinator |

UI: the role select is disabled and omitted from the PATCH on your own row, and "Cambiar estado" is disabled with the reason.

## Catalogue: comercios, productos, canasta

Read from `routes`, `controllers`, `validators`, `repositories`, `domain/enums.ts` and `db/schema.ts`; every GET re-checked live
(dev DB: 3 comercios, 5 productos, 1069 canasta nodes of which 677 are variedades). **No write was sent to the dev backend.**
Reads are open to every role; every write is COORDINADOR only (others get 403). All three lists are **plain arrays with no
`X-Total-Count`, no `page`/`limit` and no text search** (`?page=1&limit=2` and `?q=a` are silently ignored).

| Call | Body / query | Success | Errors |
|---|---|---|---|
| `GET /comercios` | `zona` (exact), `tipo`, `estado` | 200 `Comercio[]` by nombre | 400 errors[] on a bad enum / empty zona |
| `GET /comercios/:id` | | 200 | 400 `{message}` invalid id, 404 |
| `POST /comercios` | `{ nombre, direccion, zona, tipo }` all required, text trimmed | 201 (estado `ACTIVO`) | 400 errors[] per field |
| `PATCH /comercios/:id` | any of `nombre, direccion, zona, tipo` (>=1) | 200 | 400 errors[] (`body` if empty), 404 |
| `PATCH /comercios/:id/estado` | `{ estado: ACTIVO\|INACTIVO }` | 200 | 400, 404 |
| `GET /productos` | `categoria` (exact), `unidad`, `estado`, `codigoVariedad` | 200 `Producto[]` by nombre | 400 errors[] |
| `GET /productos/:id` | | 200 | 400 invalid id, 404 |
| `POST /productos` | `{ nombre, categoria, unidad, cantidadReferencia(>0), codigoVariedad(7 digits), marca? }` | 201 (`ACTIVO`) | 400 errors[]; 400 `{message}` variedad not an existing ACTIVE nivel 6; **409 `{message}` without `code`** |
| `PATCH /productos/:id` | any of the same fields (>=1) | 200 | same as POST, 404 |
| `PATCH /productos/:id/estado` | `{ estado }` | 200 | 400, 404 |
| `GET /canasta` | `nivel` 0-6, `padre`, `categoria`, `estado` | 200 `CanastaNodo[]` by codigo | 400 errors[] |
| `GET /canasta/:codigo` | codigo `^\d{1,7}$` | 200 | 400 `{message}`, 404 |
| `POST /canasta` | `{ codigo(7 digits), nombre, padre(5 digits), categoria, ponderador?>=0, codigoVariedad12?, tratamientoEspecial? }` | 201 nivel 6 `ACTIVO` | 400 errors[]; 400 `{message}` padre is not an existing ACTIVE nivel 5; **409 `{message}` without `code`** (codigo exists) |
| `PATCH /canasta/:codigo/estado` | `{ estado: ACTIVO\|INACTIVO }` | 200 | 400, **404 for any non nivel 6 or unknown** |

Enums: `tipo` SUPERMERCADO, ALMACEN, VERDULERIA, CARNICERIA, FARMACIA, OTRO. `unidad` KG, G, LT, ML, UNIDAD. `categoria` of a
variedad NUCLEO, ESTACIONAL, REGULADO. There is **no rubro, no coordinates** on a comercio: only nombre, direccion, zona, tipo,
estado, createdAt, updatedAt.

Shapes: `Comercio` / `Producto` as in `types.ts`; `CanastaNodo = { codigo, nombre, nivel, padre, ponderador, derivado, estado,
categoria, codigoVariedad12, tratamientoEspecial, createdAt, updatedAt }` (the last three category fields are `null` above nivel 6).

How they relate: a `Producto` (the thing with marca, unidad and cantidad that the surveyor prices) points at **one** variedad
through `codigoVariedad` (nivel 6 of the canasta). A variedad hangs from a nivel 5 node that the canasta calls "producto" (not the
same entity as `Producto`). The API never edits levels 0-5; it only adds variedades and flips their estado ("removal" is
`INACTIVO`, reversible, and an import never overwrites it).

Rules that the UI states in the dialogs (all verified in code):
- A producto is unique by `lower(nombre) + lower(marca ?? '') + unidad + cantidadReferencia`.
- A producto can only point at an ACTIVE variedad, on create **and** on update.
- Deactivating a producto: `POST /precios` answers 400 `producto must be ACTIVO`; the surveyor list already asks `estado=ACTIVO`.
- Deactivating a comercio: only `POST /asignaciones` rejects it (400). Existing asignaciones and price loading are untouched.
- Deactivating a variedad: nothing else changes. Its productos keep pointing at it.

UI behaviour: search and 25-per-page paging are client side over the whole list; zone and category dropdowns are built from the
values present in the data (the backend filters are exact text matches); 409s are read by status (no `code` exists), with
`PRODUCTO_DUPLICATE` / `CANASTA_CODIGO_DUPLICATE` / `VARIEDAD_DUPLICATE` accepted if the backend adds them and any other
`code` degrading to the generic conflict message.

## Surprises and gaps to relay to the backend owner

1. **No cancel for asignaciones** (no DELETE, no CANCELADA estado). The screen only offers reassign. If cancel is wanted it
   needs an endpoint and a rule for EN_CURSO visits that already have prices.
2. ~~`POST /relevamientos` does not validate `fechaInicio`/`fechaLimite`~~ **Resolved 2026-10-15, backend `5f6026a`**: both
   required, ISO, impossible days rejected, limit strictly after start, 400 `errors[]`. Overlapping periods are still accepted.
   The form keeps the checks as UX hints and maps the server `errors[]` onto the date fields.
3. ~~No pagination / no total~~ **Resolved 2026-10-15, backend `858c38e`**: `X-Total-Count` (CORS-exposed) on `/users`,
   `/relevamientos`, `/asignaciones`; `page`/`limit` optional on the last two. Still open as a detail: the encuestador
   lookup `GET /users?role=ENCUESTADOR&limit=200` is capped at 200 (more encuestadores would need paging the lookup).
4. ~~409 has no code~~ **Resolved 2026-10-15, backend `6270080`** (codes above). Still open as a detail: 404 vs 400 on
   encuestador/comercio ("not found" is 404, "not ACTIVO" is 400) carry no code, and the UI still reads those messages.
5. **Closing a relevamiento does not touch its asignaciones** (they stay PENDIENTE/EN_CURSO and can no longer advance), and
   reassign does **not** check the relevamiento estado: a PENDIENTE visit of a CERRADO relevamiento can still be reassigned.
6. **Deactivating an encuestador leaves their visits assigned.** PENDIENTE ones can be reassigned; EN_CURSO ones cannot
   (409), so they are stuck. The estado dialog warns with the counts.
7. **Password reset does not end the user's open sessions** (tokens live 8 h; only estado is re-read per request). Also
   `PUT /users/:id/password` on your own id needs no current password, unlike `POST /auth/password`.
8. ~~Create does not trim `nombre/apellido/dni/legajo`~~ **Resolved 2026-10-15, backend `d9187c0`**: create and update trim.
   The form still trims before sending (harmless).
9. ~~`POST /users` response lacks `ultimoAcceso`~~ **Resolved 2026-10-15, backend `d9187c0`** (same view as the rest). No user
   has `createdAt/updatedAt` in the view.
10. Two coordinators can deactivate each other (no "at least one ACTIVO coordinator" invariant); only self-changes are blocked.
11. `PATCH /asignaciones/:id/estado` lets a COORDINADOR advance any visit (not used by the screens).
12. Reassigning to the encuestador who already has the visit answers 200 (no-op); the UI excludes the current one.

### Catalogue gaps (slice 3)

13. **No `X-Total-Count`, no `page`/`limit`, no search on `/comercios`, `/productos`, `/canasta`** (severity: medium). The
    canasta list is 1069 nodes (677 variedades) in one response. The UI pages and searches on the client; it will not scale
    past a few thousand rows. Wanted: the same optional paging + total as `/users`, and a `q` (nombre/direccion/zona,
    nombre/marca, nombre/codigo).
14. **409 without `code` on `POST/PATCH /productos` and `POST /canasta`** (severity: low). Read by status today. Wanted:
    `PRODUCTO_DUPLICATE`, `CANASTA_CODIGO_DUPLICATE` in `ERROR_CODES`.
15. **400 `{message}` without `errors[]`** for "variedad is not an active variedad" and "padre is not an active producto"
    (severity: low). The UI matches the English text to put it on the field. Wanted: `errors: [{ field: 'codigoVariedad' }]`.
16. **`marca` cannot be cleared** (severity: low): `null` and `""` are both 400 `marca must be a non-empty string`. The form tells
    the user it cannot be removed. Wanted: accept `null` on PATCH.
17. **Deactivating a variedad leaves its productos pointing at it** (severity: medium). No check, no cascade, no warning
    payload; the productos stay ACTIVO with an inactive variedad (the mock seed reproduces it). Wanted: either
    refuse (409 with the count) or return the affected productos; the UI today only counts them with
    `GET /productos?codigoVariedad=`.
18. **No effect or count endpoint for deactivating a comercio/producto** (severity: medium). The UI shows open visits for a
    comercio through `GET /asignaciones?comercio=` but cannot show how many prices a producto has in the open relevamiento.
    Open visits of an inactive comercio stay workable. Wanted: decide the rule (block, cancel, or keep) and expose it.
19. **`PATCH /canasta/:codigo/estado` answers 404 for a non nivel 6 node** (severity: low) instead of 400/409, so "not found"
    and "not removable" are indistinguishable.
20. **No server check that a new variedad's `codigo` starts with its `padre`** (severity: low). Code prefixes are how the
    import derives ancestors; a mismatched codigo is accepted. The form only hints at the convention.
21. **Zone is free text** (severity: low): `GET /comercios?zona=` is an exact, case-sensitive match, so "Centro" and "centro"
    are different zones. Wanted: a catalogue of zones or a case-insensitive filter.
22. **`cantidadReferencia` is a Postgres `decimal`**: it arrives as a number today but the type is not guaranteed
    (severity: info). The UI coerces with `Number()`.
23. **Open question: no audit of catalogue changes** (severity: info). Nothing records who deactivated a comercio, producto or
    variedad; the Auditoría section will have nothing to show for them unless the backend logs these writes.

## Price review and audit trail (slice 4: SUPERVISOR, ANALISTA, audit readers)

Read from `routes/precio.routes.ts`, `routes/auditoria.routes.ts`, `controllers/{precio,auditoria,precio-access}*.ts`,
`validators/{precio,auditoria}.validator.ts`, `repositories/{precio,auditoria}.repository.ts`, `domain/{enums,desvio,error-codes}.ts`
and `db/schema.ts`. **Nothing was sent to the dev backend for this slice** (no login, no request); every behaviour below comes
from the code and is reproduced by `scripts/mock-api.mjs`.

| Call | Roles (backend guard) | Query / body | Success | Errors |
|---|---|---|---|---|
| `GET /precios` | any authenticated role. ENCUESTADOR is narrowed to their own prices whatever `encuestador` says; every other role sees all | `relevamiento`, `comercio`, `producto`, `encuestador` (ids), `oferta` (`true`\|`false`, tri-state), `conAlerta` (**only `true`**), `page` (>=1, default 1), `limit` (1..200, default 50) | 200 `Precio[]` ordered `fechaRelevamiento` desc, `createdAt` desc, `id` desc. **No `X-Total-Count`** | 400 errors[] (bad id, `oferta`, `conAlerta=false`, `page=0`, `limit>200`) |
| `GET /precios/:id` | any (ENCUESTADOR: only own, else 404) | | 200 | 400 invalid id, 404 |
| `PATCH /precios/:id` | ENCUESTADOR, SUPERVISOR, ANALISTA (COORDINADOR and DIRECCION get **403**) | any of `valor` (>0), `observacion` (string <= 500, or `null`/blank to clear), `oferta` (boolean) plus `confirmarDesvio` (boolean) | 200 `Precio` | see below |
| `GET /auditoria/precios` | SUPERVISOR, ANALISTA, COORDINADOR, DIRECCION (ENCUESTADOR **403**, not even their own) | `precio`, `usuario`, `relevamiento` (ids), `accion` (enum), `page`, `limit` (same rules) | 200 `AuditoriaPrecio[]` ordered `createdAt` desc, `id` desc. **No `X-Total-Count`** | 400 errors[] |

`PATCH /precios/:id` check order: `authorize` (403) -> body validator (400 `errors[]`; `field: "body"` when none of
`valor`/`observacion`/`oferta` is sent) -> 404 `Precio not found` (also for an unknown id; a surveyor that is not the owner) ->
**409 `Relevamiento is not ABIERTO`** -> (owner only) 409 `The asignacion is no longer EN_CURSO` -> soft-stop 409
`requiereConfirmacion` + `alerta` when the new `valor` (or turning `oferta` off) has a variation outside the usual range of its variedad and
`confirmarDesvio` is not `true`. A reviewer may correct while the asignacion is COMPLETADA, **never** once the relevamiento is
CERRADO. The 409 for the closed relevamiento has **no `code`** (gap 24). There is **no reason / motivo field** anywhere (gap 27):
the only free text is `observacion`, and it replaces the surveyor's note.

A correction is judged like a create: `variacion = valor / precioAnterior` (latest non-offer price of the same producto and comercio
from a relevamiento that started before the price's own; none -> not judged) against the P5-P95 percentiles (linear interpolation) of
all the historical variations of the producto's variedad (`codigoVariedad`) across productos and comercios, at least 20 of them, and
never narrower than 0.90-1.10. A price that is an offer is never judged and its `alerta` becomes `null`. Changing only `observacion`
keeps the stored `alerta`.

`Precio.alerta` is `AlertaPercentil | AlertaHistorica | null` and means "unusual and confirmed anyway".
`AlertaPercentil = { metodo: "PERCENTIL_VARIACION", variedad, precioAnterior, variacion, percentilInferior, percentilSuperior,
limiteInferior, limiteSuperior, rangoPrecio: { min, max }, n }` (bounds as variation, `rangoPrecio` as prices); rows saved before this
rule keep the legacy `AlertaHistorica = { media, desvio, n, limiteInferior, limiteSuperior }` (no `metodo`; not migrated).
anyway". `AuditoriaPrecio` = `{ id, precio, relevamiento, comercio, producto, accion, usuario, rol, anterior, posterior, detalle,
createdAt }` with `accion` in `CREACION | MODIFICACION | ELIMINACION | ADJUNTO_AGREGADO | ADJUNTO_ELIMINADO`; `anterior` /
`posterior` are `{ valor, oferta, observacion, fechaRelevamiento } | null` (null before a creation / after a deletion / on
attachment events) and `detalle` is `{ adjunto, mime, bytes, sha256 } | null` (attachment events only). `rol` is plain text (the
actor's role at that moment). Every row holds **ids only**: no names of producto, comercio, relevamiento or user.

Who can read the lookups the screens need:

| List | Roles |
|---|---|
| `GET /relevamientos`, `/comercios`, `/productos`, `/canasta` | any role |
| `GET /users` (to name an encuestador or an actor) | **COORDINADOR only** (the whole router) |

UI behaviour (`/gestion/precios`, `/gestion/auditoria`):
- Filters, paging and the audit `precio` / `usuario` narrowing live in the URL (`relevamiento`, `comercio`, `producto`, `oferta`,
  `conAlerta`, `encuestador`, `page` on prices; `relevamiento`, `accion`, `usuario`, `precio`, `page` on audit). 25 rows per page.
- No total comes from the backend, so the pager says "Página N" and keeps "Siguiente" while a page is full. If it ever sends
  `X-Total-Count` the pager shows "Mostrando X-Y de N" with no change (the mock does with `MOCK_PRECIOS_TOTAL=1`). An exactly
  full last page leads to an empty next page, shown as "No hay más resultados" with a way back.
- Corrections are SUPERVISOR / ANALISTA only. The action is disabled with the reason on a CERRADO relevamiento (read from
  `GET /relevamientos`) and offline (nothing is queued). The flow is edit -> review (before and after, consequences) -> confirm; a
  soft-stop 409 becomes a third step ("El nuevo valor se aleja de lo habitual") that resends with `confirmarDesvio: true`. Nothing
  is applied optimistically: the toast and the row show what the server answered; price list, audit trail and relevamientos are
  invalidated after **any** outcome, so a 409/404 leaves the screen current.
- 400 `errors[]` of `valor` / `observacion` land on the field; 409 is mapped by `code` (`RELEVAMIENTO_NOT_ABIERTO`) with the
  English message as fallback because the backend sends none today; 404 says the price no longer exists; an unknown code is a
  generic conflict.
- The encuestador filter exists only for a role that can list users (COORDINADOR); otherwise rows say "Encuestador #abcd1234". The
  audit trail names actors only for a COORDINADOR; the others see the role, "Usted" for their own rows, and "Solo mis cambios".
- The audit screen is read-only for every role (marked "Solo lectura"); there is no action on it at all.

### Price and audit gaps (slice 4)

24. **`PATCH /precios/:id` answers 409 `Relevamiento is not ABIERTO` without `code`** (severity: low). `RELEVAMIENTO_NOT_ABIERTO`
    already exists and is sent by `/asignaciones`, but `precio-access.ts` (`loadEditable`) and `POST /precios` send only
    `{ message }`. The UI falls back to the English text. Wanted: add the code (same for `POST` and `DELETE`).
25. **No `X-Total-Count` on `GET /precios` and `GET /auditoria/precios`** (severity: medium). `/users`, `/relevamientos` and
    `/asignaciones` have it. Without it there is no "N precios", no last page, and an exactly-full last page shows an empty
    next page. Wanted: the same header (filtered total) on both, CORS-exposed.
26. **Names cannot be resolved by SUPERVISOR, ANALISTA or DIRECCION** (severity: high for usability). `GET /users` is
    COORDINADOR-only, and prices carry only `encuestador` (an id) while audit rows carry only `usuario` (an id) and `rol`. A
    reviewer sees "Encuestador #1f2e3d4c" and "Analista", cannot filter by encuestador, and cannot say who corrected a price.
    Wanted: either embed `{ id, nombre, apellido }` for `encuestador` / `usuario` in both lists, or a role-limited
    `GET /users/lookup` (id, nombre, apellido, role) readable by every management role.
27. **A correction has no reason** (severity: medium). `PATCH` accepts no `motivo` and `precio_auditoria` has no column for one;
    the audit can show *what* changed and *who*, never *why*. The UI cannot require a reason the API would drop. Wanted: an
    optional (or required for reviewers) `motivo` on `PATCH`, stored on the audit row.
28. **A correction overwrites the surveyor's `observacion` and there is no concurrency check** (severity: medium). The same
    field holds the surveyor's note and the reviewer's, and `PATCH` has no `If-Match`/`updatedAt` precondition, so two reviewers
    (or a reviewer and the surveyor) silently overwrite each other (last write wins; the audit keeps both snapshots). Wanted:
    a precondition on `updatedAt` answering 409, and/or a separate reviewer note.
29. **Audit rows have ids only and few filters** (severity: low). Producto, comercio and relevamiento names are joined on the
    client from three lists; there is no filter by comercio, producto or a date range, which is what an auditor asks first.
    Wanted: `comercio`, `producto`, `desde`, `hasta` filters (names optional).
30. **Audit snapshots omit `alerta`** (severity: low). A correction that turns a price atypical (or clears it) is visible only by
    comparing the list; the trail cannot say "became atypical". Wanted: `alerta` (or a boolean) in `PrecioSnapshot`.
31. **COORDINADOR and DIRECCION can read every price (`GET /precios`) but the role map hides the section** (severity: info). The
    backend guard is open; `roles.ts` keeps `precios` for SUPERVISOR and ANALISTA only. Open question for the backend owner and
    product: should DIRECCION get a read-only price list? Today the UI follows the map; the API would allow it.

## Cálculos (slice 5: relativos por variedad + imputaciones)

Router `/api/calculos`, Bearer on every route. The system does **not** compute a final index: it returns variedad-level
relatives and the imputations that were applied, and the copy of the screens says so.

| Method and path | Roles | Answer |
|---|---|---|
| `POST /calculos` | AUDITOR | **202** + run row (`estado: EJECUTANDO`) |
| `GET /calculos?page&limit` | AUDITOR, DIRECCION | bare array, newest first, `limit` <= 200 (default 50), **no `X-Total-Count`** |
| `GET /calculos/:id` | same read roles | run row; 400 non-UUID, 404 unknown |
| `GET /calculos/:id/relativos?variedad=<7 digits>&mes=AAAA-MM` | same read roles | not paginated: `[{ calculo, variedad, mes, valor \| null, nSuper, nTrad }]` |
| `GET /calculos/:id/imputaciones?page&limit` | same read roles | `[{ id, calculo, variedad, comercio, mes, precio, nivel, grupo, factor }]`, no total header |
| `GET /calculos/:id/resultados?formato=xlsx\|csv` | same read roles | file; 409 `{message}` unless `COMPLETADO` |
| `GET /calculos/exportacion?mesBase&mesObjetivo[&excluirOfertas=true\|false][&formato=xlsx\|csv]` | AUDITOR | file (the engine input for a range); same 409s as `POST` |

`POST` body: `{ mesBase, mesObjetivo, excluirOfertas?, parametros? }`. Months are `AAAA-MM`, `mesObjetivo >= mesBase`, range <= 36
months. `parametros`: `esperarMeses` integer 0-12 (default 2), `pesoSuper` >= 0 (0.25), `pesoTrad` >= 0 (0.75),
`omitirGruposCompletos` boolean (true). 400 -> `{ errors: [{ field, message }] }`.

**409 carries only `{ message }`, no `code`** (the UI matches the English text and falls back to a generic explanation):

| Message | UI copy |
|---|---|
| `No hay relevamientos para el mes X` | "No hay relevamientos para el mes X. Revise el rango elegido." |
| `Hay relevamientos abiertos: <periodos>` | "Hay relevamientos abiertos (...). Ciérrelos antes de calcular." |
| `No hay precios cargados en el rango indicado` | "No hay precios cargados en el rango indicado. Elija otros meses." |
| `Ya hay un cálculo en ejecución: espere a que termine` | "Ya hay un cálculo en ejecución. Espere a que termine para iniciar otro." |

Run row: `{ id, mesBase, mesObjetivo, excluirOfertas, parametros, motorVersion, entradaHash, estado: EJECUTANDO | COMPLETADO | FALLIDO,
error: string | null, creadoPor, createdAt, updatedAt, resumen: { observaciones, variedades, informantes, imputaciones, sinImputar,
sinImputarDetalle?: [{ variedad, comercio, mes }] (max 200) } }`. `creadoPor` is a user id (names only for a COORDINADOR, see the
lookup table above). A relative with `valor: null` means no shop had a price in both months.

UI behaviour (`/gestion/calculos`, `/gestion/calculos/:id`):
- The run is asynchronous. After `POST` the UI opens the detail and polls `GET /calculos/:id` every 2 s only while `estado` is
  `EJECUTANDO`; `COMPLETADO` and `FALLIDO` stop it (`FALLIDO` shows `error` in an alert). The list also refreshes while any run on
  the page is executing.
- The list pages 20 at a time through `page` in the URL and says "Página N" (no total). Imputaciones page 50 at a time (`page`).
  Relativos come whole and are paged client-side, 25 rows per page (`rpage`); filters `variedad` (7 digits) and `mes` are in the URL
  and sent to the server.
- Writes (`Nuevo cálculo`, input download) exist only for AUDITOR (SUPERVISOR, ANALISTA and COORDINADOR have no access to
  calculations and get the 403 page; `isReadOnly(role, 'calculos')` hides the writes for DIRECCION) and are disabled offline. Reads and the results download are open to every read role.
- Client validation mirrors the backend as hints (format, order, 36 months, parameter ranges); a server 400 lands on the field, a 409
  becomes the copy above in the form's alert.
- Names: variedad names come from `GET /canasta?nivel=6` and comercio names from `GET /comercios` (both open to every role);
  if they are missing the code is shown. Creator names need `GET /users` (COORDINADOR); others see "Usuario #abcd1234".

### Cálculos gaps (slice 5)

32. **No `X-Total-Count` on `GET /calculos` and `GET /calculos/:id/imputaciones`** (severity: medium). Same gap as 25: no "N cálculos" and an
    exactly-full last page leads to an empty next page.
33. **409s have no `code`** (severity: medium). The four conflicts above are recognised by their text. Wanted: stable codes
    (for example `CALCULO_EN_EJECUCION`, `RELEVAMIENTOS_ABIERTOS`) like the ones `/asignaciones` already sends. The 409 of
    `/resultados` on a run that is not `COMPLETADO` is likewise matched by status only.
34. **"Range <= 36 months" is ambiguous** (severity: low): distance of 36 months or 36 months counted inclusively? The client accepts
    a distance of up to 36 and lets the server's 400 land on the field; the mock counts inclusively.
35. **`nivel`, `grupo`, `factor` and `nSuper` / `nTrad` are undocumented** (severity: low). Typed as `string | number`, `string | number | null`
    and `number | null`; shown as received ("Súper (n)", "Tradicional (n)" are guesses at the meaning of the counts).
36. **`resumen` while the run is `EJECUTANDO` or `FALLIDO`** is not specified; the UI treats it as optional.
37. **`GET /calculos/:id/relativos` is not paginated** and may be large (variedades x months); the UI loads it whole and pages client-side.
38. **`GET /calculos/exportacion` and the "en ejecución" 409:** it is assumed not to apply to the export (nothing runs). The mock answers
    only the three data conflicts there.

## What the UI relies on now (and its fallback)

| Backend behaviour | UI | If it is absent (older / not restarted backend) |
|---|---|---|
| `code` on 409 | `mapAsignacionError` / `mapUserConflict` branch on it | message heuristic (English text), as before |
| unknown `code` | generic "conflicto" message | n/a |
| `USER_DUPLICATE.errors[].field` | error under DNI / Legajo / Correo | form-level message naming the three fields |
| `X-Total-Count` | pager "Mostrando X-Y de N", next disabled at the end; "N asignaciones" / "N relevamientos" | old inference: a full page may have another; counts use the rows received |
| optional `page`/`limit` | not used yet: asignaciones and relevamientos are read whole (one request, filters are server-side) | n/a |
| `X-Total-Count` on `/precios`, `/auditoria/precios` | not sent today; pager "Página N" and "Siguiente" on a full page | same screens, "Mostrando X-Y de N" when it arrives |
| `code` on the closed-relevamiento 409 of `PATCH /precios/:id` | `mapCorrectionError` reads `RELEVAMIENTO_NOT_ABIERTO` | English message `Relevamiento is not ABIERTO` (what the backend sends today) |
| `code` on the cálculo 409s | `describeCalculoConflict` matches the English `message` | n/a: the backend sends no code today, the text is the contract |
| date validation | client hints (required, real day, limit after start) + server `errors[]` on the field | server errors never arrive; the hints still block |

`scripts/mock-api.mjs` implements all of the above. `MOCK_LEGACY_ERRORS=1 npm run mock` reproduces the older backend (no `code`,
no `X-Total-Count`, no date validation, POST /users without `ultimoAcceso`); `MOCK_DUP_NO_DETAIL=1` answers `USER_DUPLICATE`
with `errors: []`.
