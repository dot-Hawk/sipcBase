# SIPC Móvil, módulo Encuestador

Frontend for field surveyors (tablet first, works down to phone width) of the SIPC price-survey system.
Vite + React 18 + TypeScript strict, React Router 6, TanStack Query 5, plain CSS, local fonts (@fontsource).
The API contract lives in `docs/api-contract-encuestador.md` (single source of truth).

## Run

```sh
npm install
cp .env.example .env        # optional

# A. With the dev mock (the real backend has no demo surveyor)
npm run mock                # http://localhost:3000, dev tooling only
npm run dev                 # http://localhost:5173
#   login: encuestador@sipc.test / sipc12345
#   other roles (same password): coordinador@, supervisor@, analista@, direccion@sipc.test

# B. With the real backend (see below)
```

### Option B: with the real backend

The backend listens on whatever `PORT` it is started with (3100 in this example). From `backend/`:

```sh
docker compose up -d db          # PostgreSQL on localhost:5432
export DATABASE_URL="postgres://<user>:<password>@localhost:5432/<database>"
export JWT_SECRET="<a long random secret>"
export CORS_ORIGINS="http://localhost:5173"
export PORT=3100
npm run db:migrate               # create the tables
SEED_EMAIL=<coordinator email> SEED_PASSWORD=<coordinator password> npm run dev:bootstrap
npm run dev                      # API on http://127.0.0.1:3100
```

`dev:bootstrap` is idempotent. It creates a coordinator and a test surveyor, `encuestador.dev@sipc.local`, whose password comes from `DEV_ENCUESTADOR_PASSWORD` (default `encuestador-dev-1`, set in `backend/src/scripts/dev-bootstrap.ts`), plus sample data for the current month. Then, from `frontend/`:

```sh
VITE_API_TARGET=http://127.0.0.1:3100 npm run dev
```

Log in with the test surveyor. Do not commit real secrets: keep `DATABASE_URL`, `JWT_SECRET` and the seed passwords in your environment or an untracked `.env`.

`/api` is proxied by Vite to `VITE_API_TARGET` (the backend CORS is now an allowlist, so the proxy keeps working unchanged).

Other scripts: `npm test`, `npm run typecheck`, `npm run build`, `npm run preview`.

## Roles

One app, role-aware routes. `src/app/roles.ts` is the single source of truth (landing, nav, allowed sections).

| Role | Lands on | Sections |
|---|---|---|
| ENCUESTADOR | `/` | unchanged: `/`, `/visita/:id`, `/precios`, `/cuenta` (offline snapshot, outbox, service worker) |
| COORDINADOR | `/gestion/relevamientos` | Relevamientos, Asignaciones, Usuarios, Catálogo, Cálculos, Auditoría |
| SUPERVISOR | `/gestion/precios` | Precios, Auditoría, Cálculos (lectura) |
| ANALISTA | `/gestion/precios` | Precios, Auditoría, Cálculos |
| DIRECCION | `/gestion/calculos` | Cálculos, Auditoría (solo lectura) |

All management roles also have `/gestion/cuenta` and `/gestion/403`. `/` redirects a management role to its landing, `/gestion/*` redirects the surveyor to `/`, a section outside the role goes to `/gestion/403`, unknown paths go to the landing. Only Cálculos is not built yet and renders "Próximamente".

### Gestión (COORDINADOR, SUPERVISOR, ANALISTA, DIRECCION)

Contracts and backend gaps: `docs/api-contract-gestion.md`.

| Route | What it does |
|---|---|
| `/gestion/relevamientos` | List with avance, create (periodo, frecuencia, fechas), close with a confirm that states the consequences |
| `/gestion/asignaciones` | List filtered on the server (relevamiento, encuestador, comercio, estado), create, reassign (PENDIENTE only). The API has **no cancel**, so none is offered |
| `/gestion/usuarios` | List (50 per page, role/estado filters), create, edit, change estado, reset password. Your own role and estado are locked (the API answers 403) |
| `/gestion/precios` (SUPERVISOR, ANALISTA) | Review table over `GET /precios`: filters relevamiento, comercio, producto, oferta, "solo con alerta" (and encuestador for a role that can list users) and 25-per-page paging, all in the URL; offer and atypical marks with text and icon; detail with the expected range; **correction** (valor, oferta, observación) through edit -> review before/after -> confirm, with a second confirmation when the server judges the new value atypical. Disabled on a CERRADO relevamiento and offline, never optimistic. The API has **no total, no reason field and no names for these roles** (gaps 24-31) |
| `/gestion/auditoria` (COORDINADOR, SUPERVISOR, ANALISTA, DIRECCION) | Read-only trail of `GET /auditoria/precios`: when, action, price, readable before/after, who. Filters relevamiento, acción, usuario (COORDINADOR) or "Solo mis cambios", and the history of one price (`?precio=`), all in the URL. No action on the screen for any role |
| `/gestion/catalogo/{comercios,productos,canasta}` | Three tabs, each its own route (`/gestion/catalogo` redirects to comercios). Filters, search and page live in the URL. **Comercios**: list, create, edit, activate/deactivate (consequences stated, with the open visits), detail. **Productos**: same, plus the variedad it points to (name resolved from the canasta). **Canasta**: variedades (nivel 6) with their producto, add a variedad, logical removal / reincorporation, detail with the productos that use it. The catalogue endpoints have **no total, no paging and no text search**, so search and 25-per-page paging run on the client |

- Code: `src/features/{relevamientos,asignaciones-gestion,usuarios,catalogo,precios-gestion,auditoria}`; shared admin primitives in `src/features/gestion/ui` (table that stacks by container width, form field, confirm dialog, states, pager); hooks in `src/features/gestion/queries.ts` (keys under `['gestion', ...]`, never persisted).
- These screens need a connection: offline, writes are disabled with the reason and nothing is queued. They never touch the offline snapshot or the outbox.
- Destructive actions (close relevamiento, set INACTIVO/LICENCIA, reset password) use a dialog that says what happens. Client-side rules (periodo format, 8-character password, dates) are hints; the server decides and its field errors are shown inline.
- Mock: `npm run mock` implements these endpoints with seed data (relevamientos open/closed, assignments in every estado, users of every role/estado). `MOCK_EXTRA_USERS=60 npm run mock` adds users to exercise pagination. The catalogue part also seeds a small canasta tree (levels 0-6, one inactive variedad), comercios of every tipo/estado and productos pointing at real variedades; duplicates answer 409 **without** `code`, as the real backend does. The price review part keeps an audit trail (every create, correction and delete writes a row), seeds an offer, a confirmed atypical price and two corrections, answers `PATCH /precios/:id` like the real guards (403 for COORDINADOR/DIRECCION, 409 without `code` on a closed relevamiento) and sends no `X-Total-Count` on `/precios` and `/auditoria/precios` unless `MOCK_PRECIOS_TOTAL=1`.

Route guards only hide screens; the API must authorize every request. Management roles never start the offline snapshot or the outbox.

## Structure

```
src/app                 router, providers, role map (roles.ts), Shell (surveyor) and AdminShell (management)
src/features/gestion    management shared: 403, "Próximamente", ui/ primitives, queries, error copy
src/features/{relevamientos,asignaciones-gestion,usuarios,catalogo}  COORDINADOR screens
src/features/{precios-gestion,auditoria}  price review (SUPERVISOR, ANALISTA) and audit trail
src/shared/api          client (Bearer, ApiError), endpoints, types, queries
src/shared/{ui,lib,icons,styles}
src/features/auth       login, session (JWT exp, role gate)
src/features/asignaciones  visit list, assignment rules
src/features/visita     visit screen: price rows, save orchestration, drafts
src/features/precios    own prices, paginated
src/features/adjuntos   photo capture, downscale, upload/download
src/features/cuenta     account
scripts/mock-api.mjs    dependency-free mock API (dev tooling)
```

## Behaviour notes

- Every known role can sign in; the role decides the shell (surveyor shell or management shell).
- The stored session is validated with `GET /auth/me` on start and on focus / reconnect (throttled). A non-ACTIVO account or another role ends the session with a notice on the login screen; offline or network errors never log the user out.
- Cuenta shows legajo, email and last access, and lets the user change the password (`POST /auth/password`; disabled offline, session stays valid).
- PATCH of a precio sends only the fields that changed; an unchanged price makes no request.
- "Anterior" is derived from the surveyor's own prices at the same comercio, joined to relevamientos by `fechaInicio`.
- The +/- variation chip and the 20% attention threshold (`ATENCION_THRESHOLD`) are a UI hint. The authoritative check is the server 409 `requiereConfirmacion`.
- Offline: see the Offline section below.

## Offline

Works after one online load, in production builds only (`npm run build`; the service worker is never registered by `npm run dev`).

- **App shell**: `src/pwa/sw.js` (no dependencies) precaches `index.html`, every route chunk, CSS, `woff2` fonts and icons. `scripts/swPlugin.ts` writes the final `dist/sw.js` with the file list and a content revision after each build. Navigations are answered from the cached shell; `/api/*`, non-GET requests and cross-origin requests are never touched by the worker.
- **Last known data**: `src/shared/api/persist.ts` keeps a snapshot of asignaciones, relevamientos, comercios, productos and precios in `localStorage` (`sipc.queryCache`), bound to the user id, 7 days max, wiped on logout, login and 401. No tokens or photos are in it. A cold start offline hydrates it and lands on Visitas with the offline banner.
- **Outbox (prices and photos)**: `src/features/outbox`. Saving a price offline, or when the connection drops mid-save, stores the value in an IndexedDB outbox (`sipc-outbox`) bound to the user id, and the surveyor keeps working (optimistic value in the list, editor and totals). Photos go in the same store as Blobs.
  - *Keys and order*: one queued price per (visit, producto): later edits coalesce into the latest value and keep their place; items are flushed one at a time in first-enqueue order; a photo is sent only after its price exists.
  - *Flush*: on app start while online, on the `online` event, on the retry timer (exponential backoff 5 s to 5 min) and with "Reintentar". A Web Lock (`navigator.locks`) keeps two tabs from sending at once and a `BroadcastChannel` refreshes the other tab's view; without them the in-tab guard still prevents double sends. Page death mid-send is safe: a stale "sending" item is re-sent, a duplicate-create 409 becomes a PATCH with the queued value, and a photo that may already be on the server is matched by sha256 before uploading again.
  - *Server answers*: 409 atypical -> item "Requiere confirmación" (never auto-confirmed; the surveyor confirms or edits it); 400/413/415 -> "Rechazado" with the reason, kept and editable; 401 -> queue paused, items kept, the session-ended notice appears; 403/404/409 on the visit -> "No se pudo enviar" with a manual retry; network/5xx/429 -> retried later.
  - *UI*: row states ("Pendiente de envío", "Enviando", "Requiere confirmación", "Rechazado"), a shell chip with the count and "Reintentar", and finishing a visit is blocked while that visit still has unsent work.
  - *Online behaviour is unchanged*: online saves go straight to the server and show errors immediately; the outbox is used only when offline or on a network error. An online save supersedes the queued value of that product.
  - *Logout*: signing out by hand with unsent work asks for confirmation and then discards it. A forced sign-out (401, token expiry) keeps the items; the login screen says so and the same account sends them on the next sign-in; signing in as another user wipes them. If IndexedDB is unavailable the outbox falls back to memory for the session.
- **Not queued (needs a connection)**: starting a visit, finishing a visit, deleting a price, deleting a photo, viewing photos, login, password change. A visit that has not been started cannot take prices offline.
- **Updates**: a new worker installs in the background and waits. The shell shows "Actualizar"; accepting it activates the new version and reloads once. Nothing is swapped without the user. Serve `/sw.js` and `/index.html` with `Cache-Control: no-cache`.
- **Not offline-capable**: first visit ever, login, password change, price-history lookups not in the snapshot (`/precios/anterior`; the own-price derivation still works), photo listing/viewing.

## Known backend gaps

- No logout or token refresh endpoint: session ends at JWT expiry (8 h) or on a 401 (which also covers a deactivated account).
- "Anterior" only uses the surveyor's own previous prices. If another surveyor visited the comercio first it shows "Sin precio anterior", although the server uses all history to flag atypical prices. A backend endpoint for the previous price would fix it.
- No "previous price" endpoint, no totals on `/precios`, no bulk endpoint, no idempotency keys.
- Products are not linked to an asignacion: the whole ACTIVO catalog is listed for every visit.
- No idempotency keys or client ids: replays are made safe on the client (see Offline). Start/finish of a visit and photo deletion need a connection.
- Visit progress needs the full own-prices list (paged 200 at a time).
- The mock's std-deviation formula (population) is an assumption: the contract does not say which one the server uses.
