# Nexovo Hospitality POS

A point-of-sale and back-office application for hospitality venues — restaurants, bars, clubs,
cafés, lounges and hotel F&B.

It covers the whole service loop: a public QR menu for guests, waiter order entry, routing to
kitchen and bar displays, billing with split payments and receipts, and the back office behind it —
inventory and recipes, suppliers and purchasing, CRM and loyalty, reservations, club door and VIP
tables, hotel room posting, multi-branch operation, notifications and reports.

The repository contains a React frontend, an Oracle schema with PL/SQL packages exposed through
ORDS, and a set of design and verification documents under `docs/`.

**The frontend runs with no database at all.** In its default `mock` mode an in-browser backend
implements every endpoint, so the product can be explored end to end by opening one file. See
[Running it](#running-it).

---

## Contents

- [Modules and roles](#modules-and-roles)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Running it](#running-it)
- [Mock mode and ORDS mode](#mock-mode-and-ords-mode)
- [Configuration](#configuration)
- [Database setup](#database-setup)
- [Scripts, tests and verification](#scripts-tests-and-verification)
- [Demo credentials](#demo-credentials)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [Licence](#licence)

---

## Modules and roles

Permissions are the unit of authorisation. `frontend/src/config/permissions.ts` declares
**68 permission codes** across these modules:

| Module | Permission prefix |
|---|---|
| Dashboard, Reports, Audit | `dashboard:` `reports:` `audit:` |
| Users, Roles, Settings | `users:` `roles:` `settings:` |
| Menu, Offers | `menu:` `offers:` |
| Tables, QR codes | `tables:` `qr:` |
| Orders | `orders:` |
| Kitchen, Bar | `kitchen:` `bar:` |
| Billing | `billing:` |
| Inventory, Recipes | `inventory:` `recipes:` |
| Suppliers, Purchasing | `suppliers:` `purchases:` |
| Customers, Loyalty | `customers:` `loyalty:` |
| Reservations | `reservations:` |
| Club entry, VIP tables | `club:` `vip:` |
| Room charges | `room-charge:` |
| Branches, Notifications | `branches:` `notifications:` |

There are **8 roles**, each a named default bundle of those permissions
(`ROLE_PERMISSIONS` in the same file):

| Role | Lands on | Maximum discount |
|---|---|---|
| `SUPER_ADMIN` | `/admin` | 100% |
| `ADMIN` | `/admin` | 100% |
| `MANAGER` | `/manager` | 30% |
| `WAITER` | `/waiter` | 0% |
| `CASHIER` | `/cashier` | 10% |
| `KITCHEN` | `/kitchen` | 0% |
| `BAR` | `/bar` | 0% |
| `HOST` | `/host` | 0% |

Landing routes come from `frontend/src/config/roleHome.ts`; discount caps from `ROLE_MAX_DISCOUNT`.
When an account holds several roles the highest-privilege one wins, in the order
`SUPER_ADMIN → ADMIN → MANAGER → CASHIER → HOST → WAITER → KITCHEN → BAR`.

Loyalty is deliberately split into four permissions rather than two — `loyalty:view`,
`loyalty:manage` (member operations, including point adjustments), `loyalty:configure`
(programme rules: earning, redemption, tiers, expiry, limits) and `loyalty:redeem`. Managers get
`manage` but not `configure`, because changing the earn rate retrospectively re-prices every point
every member holds. Existing installations are upgraded by
`database/11_migration_loyalty_configure.sql`; see [Database setup](#database-setup) and
`docs/RBAC.md`.

The full role × permission matrix is in `docs/RBAC.md`.

---

## Stack

Read from `frontend/package.json`. These are exact pinned versions — the manifest uses no ranges.

**Runtime dependencies**

| Package | Version |
|---|---|
| `react` / `react-dom` | 18.3.1 |
| `react-router-dom` | 6.26.2 |
| `@tanstack/react-query` | 5.59.0 |
| `zustand` | 4.5.5 |
| `react-hook-form` | 7.53.0 |
| `@hookform/resolvers` | 3.9.0 |
| `zod` | 3.23.8 |
| `recharts` | 2.12.7 |
| `lucide-react` | 0.446.0 |
| `qrcode.react` | 4.0.1 |
| `date-fns` | 3.6.0 |
| `clsx` | 2.1.1 |
| `tailwind-merge` | 2.5.2 |

**Build and test**

| Package | Version |
|---|---|
| `typescript` | 5.6.2 |
| `vite` | 5.4.8 |
| `@vitejs/plugin-react` | 4.3.1 |
| `vitest` | 2.1.1 |
| `happy-dom` | 15.7.4 |
| `@testing-library/react` | 16.0.1 |
| `@testing-library/dom` | 10.4.0 |
| `tailwindcss` | 3.4.13 |
| `postcss` | 8.4.47 |
| `autoprefixer` | 10.4.20 |
| `@types/react` | 18.3.10 |
| `@types/react-dom` | 18.3.0 |

Backend: Oracle Database with PL/SQL packages, exposed over HTTP by Oracle REST Data Services
(ORDS). No ORDS or database version is pinned anywhere in this repository — see
[Known limitations](#known-limitations).

There is no ESLint or Prettier configuration in this repository. Style is maintained by
`.editorconfig` and the conventions in `CONTRIBUTING.md`.

---

## Repository layout

```
.
├── .editorconfig            indentation, encoding and line endings
├── .gitattributes           normalised line endings (LF; CRLF for .bat/.cmd)
├── .github/workflows/ci.yml typecheck, test and build on Node 22
├── ARCHITECTURE.md          root overview; links to docs/ARCHITECTURE.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE                  proprietary draft — holder must be confirmed
├── SECURITY.md
├── start.bat                Windows entry point (see below)
├── database/                17 .sql files: schema, PL/SQL packages, ORDS module, seeds
├── docs/                    architecture, API spec, RBAC, workflows, design system, logs
└── frontend/
    ├── index.html           Vite entry document
    ├── package.json         the only package.json in the repository
    ├── vite.config.ts       build config + vitest config (aliases, test globs)
    ├── tsconfig.json        strict TypeScript, `@/*` → `src/*`
    ├── tailwind.config.ts
    ├── postcss.config.js
    ├── .env.example         copy to .env
    ├── scripts/             six Playwright verification scripts + their README
    └── src/
        ├── main.tsx         the single entry module
        ├── app/             App shell, providers, router, error boundary, query client
        ├── config/          env, permissions, roleHome, navigation, statuses,
        │                    workspace, surfaces, motion, chartTheme, notifications
        ├── types/           domain types shared by UI, API layer and mock backend
        ├── services/
        │   ├── api/         ApiClient interface · OrdsClient (HTTP) · MockClient
        │   │                (in-browser) · typed endpoint modules
        │   └── realtime/    RealtimeProvider abstraction (broadcast / polling / none)
        ├── store/           Zustand: authStore, cartStore, uiStore
        ├── hooks/           useAuth, usePermission, useRealtimeInvalidate,
        │                    useRealtimeStatus, useNow, useDebounce, useMediaQuery,
        │                    useWorkspace, useRouteSurface
        ├── components/      ui (design system) · graphics · layout · motion
        ├── layouts/         AdminLayout · PosLayout · DisplayLayout
        ├── routes/          guards.tsx — ProtectedRoute, RequirePermission
        ├── features/        27 feature folders (auth, waiter, kitchen, bar, cashier,
        │                    billing, manager, inventory, purchasing, crm, club, …)
        ├── styles/          index.css
        └── utils/           billing engine · order status machine · offers · money ·
                             dates · csv
```

`frontend/package-lock.json` is the real lockfile. The `package-lock.json` at the repository root
is an empty stub with no corresponding root `package.json`; it is untracked and ignored, and
`docs/CLEANUP_LOG.md` §3 records why it was left in place rather than deleted.

---

## Prerequisites

- **Node.js 22.** `frontend/package.json` declares no `engines` field, so npm will not stop you
  on another version — but Node 22 is what this repository was developed and verified with, and is
  what `.github/workflows/ci.yml` runs. There is no `.nvmrc`.
- npm (bundled with Node).
- A database is **not** required for the default mock mode.
- The verification scripts in `frontend/scripts/` additionally need Playwright, which is **not** a
  declared dependency — install it only when you want to run them.

---

## Running it

### Windows — `start.bat`

Double-click **`start.bat`** in the repository root. It is a real script, not a shortcut, and it
does exactly this, in order:

1. `cd /d "%~dp0frontend"` — and stops with an error if that folder is missing.
2. Checks that `node` is on `PATH`; if not it prints the nodejs.org URL and exits. Otherwise it
   echoes the detected version.
3. If `frontend\.env` does not exist and `frontend\.env.example` does, copies the example to
   `.env` — giving you the mock backend by default.
4. If `frontend\node_modules` does not exist, runs `npm install` (a few minutes, once) and aborts
   on failure.
5. Reads the first IPv4 address out of `ipconfig` and prints both
   `http://localhost:5173` and `http://<LAN-IP>:5173`, with a note that table QR codes point at
   whichever address you are browsing.
6. Schedules a browser to open `http://localhost:5173` after a six-second delay.
7. Runs `npm run dev` in the foreground.

Leave the window open. `Ctrl+C` stops the server.

### Any platform — manually

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_MODE=mock is the default
npm run dev                   # http://localhost:5173
```

`vite.config.ts` sets `server: { port: 5173, host: true }`, so the dev server is reachable from
other devices on the same network without extra flags.

### Production build

```bash
cd frontend
npm ci                        # reproducible install from the committed lockfile
npm run build                 # tsc --noEmit && vite build  →  dist/
```

Serve `dist/` from any static host. The app is a single-page application, so the host needs a
history fallback (unknown paths → `index.html`). Set `VITE_PUBLIC_APP_URL` to the public origin so
printed QR codes do not change.

---

## Mock mode and ORDS mode

One environment variable decides which backend the app talks to. From
`frontend/src/config/env.ts`:

```ts
apiMode: read('VITE_API_MODE', 'mock')
isMock:  read('VITE_API_MODE', 'mock') === 'mock'
```

and from `frontend/src/services/api/index.ts`:

```ts
client = env.apiMode === 'ords'
  ? new OrdsClient(env.apiBaseUrl, tokenProvider)
  : new MockClient(tokenProvider, env.mockLatencyMs);
```

The value is read once and the client is memoised, so **changing `VITE_API_MODE` requires
restarting the dev server**. Anything other than the exact string `ords` selects the mock client —
the default when the variable is absent or empty is `mock`.

`VITE_REALTIME_MODE` defaults to match: `broadcast` when the API mode is `mock`, `polling`
otherwise. Setting it to `none` installs a provider that reports status `disabled`, so the UI
offers manual refresh instead of implying live updates that will never arrive.

**Mock mode** runs an in-browser backend (`frontend/src/services/api/mock/`) that implements the
endpoints with the same business rules as the PL/SQL packages, persists to `localStorage` and
broadcasts realtime events between tabs of the same browser. Open the waiter, kitchen, bar and
cashier screens in separate tabs to watch an order move through the whole flow.

Mock mode is a **local demo backend**. It has seeded credentials and no server-side authorisation,
and it must never be used in production. See `SECURITY.md`.

---

## Configuration

`frontend/.env` — copy from `frontend/.env.example`. Every variable and every default below is
read from `frontend/src/config/env.ts`.

| Variable | Default if unset | Purpose |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` (in-browser) or `ords` |
| `VITE_API_BASE_URL` | `http://localhost:8080/ords/pos/v1` | ORDS module base URL; a trailing slash is stripped |
| `VITE_PUBLIC_APP_URL` | the browsing origin (`window.location.origin`) | Origin embedded in QR codes; must be reachable from guests' phones |
| `VITE_REALTIME_MODE` | `broadcast` in mock mode, `polling` otherwise | `broadcast` · `polling` · `none` |
| `VITE_REALTIME_POLL_MS` | `5000` | Polling interval in ms |
| `VITE_MOCK_LATENCY_MS` | `150` | Simulated latency in mock mode |
| `VITE_APP_NAME` | `Nexovo POS` | Product name shown in the UI |

`.env` is git-ignored; `.env.example` is tracked. Do not put secrets in either — every `VITE_*`
value is compiled into the client bundle and is therefore public.

---

## Database setup

The schema owner needs the usual DDL privileges plus `EXECUTE ON DBMS_CRYPTO`, and ORDS must be
installed with the schema REST-enabled. These prerequisites are stated in the header of
`database/run_all.sql` itself.

```sql
-- as a privileged user
CREATE USER pos_app IDENTIFIED BY "<strong password>" QUOTA UNLIMITED ON users;
GRANT CREATE SESSION, CREATE TABLE, CREATE VIEW, CREATE PROCEDURE, CREATE SEQUENCE,
      CREATE TRIGGER TO pos_app;
GRANT EXECUTE ON DBMS_CRYPTO TO pos_app;
```

```bash
cd database
sql pos_app/<password>@//localhost:1521/<service> @run_all.sql    # SQLcl or SQL*Plus
```

### Install order

`run_all.sql` invokes the numbered files in this exact order — not in filename order, deliberately:

| Step | File | Why here |
|---|---|---|
| 1 | `01_schema.sql` | Phase 1 tables |
| 2 | `08_phase2_schema.sql` | Phase 2 tables, **before** the Phase 1 packages, because those packages now reference Phase 2 columns (`min_spend_shortfall`, `user_branches`) |
| 3 | `02_pkg_core.sql` | core / security / numbering |
| 4 | `03_pkg_menu_tables.sql` | menu, offers, tables |
| 5 | `04_pkg_orders.sql` | orders, tickets |
| 6 | `05_pkg_billing.sql` | billing, payments, reports, users |
| 7 | `09a_pkg_branch_inventory.sql` | branch + inventory |
| 8 | `09b_pkg_purchasing.sql` | suppliers, purchase orders, receipts |
| 9 | `09c_pkg_crm_loyalty.sql` | CRM and loyalty |
| 10 | `09d_pkg_reservations_club_vip.sql` | reservations, club, VIP, PMS seam |
| 11 | `09e_pkg_notify_reports.sql` | notifications, reports v2 |
| 12 | `06_ords_modules.sql` | router + ORDS module definition |
| 13 | `09f_pkg_router2.sql` | Phase 2 router body |
| 14 | — | `DBMS_UTILITY.COMPILE_SCHEMA` twice, to resolve cross-file references |
| 15 | — | lists any object whose status is not `VALID` — **this must come back empty** |
| 16 | `07_seed.sql` | Phase 1 seed data |
| 17 | `10_phase2_seed.sql` | Phase 2 seed data |

It finishes by counting rows in `orders`, `bills`, `inventory_items` and `notifications`.

### `11_migration_loyalty_configure.sql` — upgrades only

> **A fresh install must not run `database/11_migration_loyalty_configure.sql`.**

It is deliberately **not** part of `run_all.sql`. It splits `loyalty:manage` into member operations
and programme configuration on an **existing** installation. A fresh install reaches the same end
state from `10_phase2_seed.sql`. The file's own header says so, and every statement in it is
idempotent — running it anyway is harmless, but it is excluded so that a migration never silently
joins a fresh install. Run it once, as the schema owner, only when upgrading. See `docs/RBAC.md`.

### Pointing the frontend at ORDS

```
VITE_API_MODE=ords
VITE_API_BASE_URL=http://localhost:8080/ords/pos/v1
VITE_REALTIME_MODE=polling
```

`06_ords_modules.sql` calls
`ORDS.SET_MODULE_ORIGINS_ALLOWED('pos.v1', 'http://localhost:5173,http://localhost:4173')` — the
dev server and the `vite preview` port. Adjust it for any other origin.

---

## Scripts, tests and verification

### npm scripts

All of these run in `frontend/`. This table is the whole `scripts` block of
`frontend/package.json` — there are no others.

| Command | What it actually runs |
|---|---|
| `npm run dev` | `vite` |
| `npm run build` | `tsc --noEmit && vite build` |
| `npm run preview` | `vite preview` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` |
| `npm run test:watch` | `vitest` |

### Tests

`vite.config.ts` includes `src/**/*.test.ts` and `src/**/*.test.tsx`. Tests run in `node` by
default; `*.test.tsx` files get `happy-dom`, which is a declared devDependency so a clean
`npm ci` reproduces the suite. There are **10 test files**:

```
src/utils/billing.test.ts                              billing calculation engine
src/utils/offers.test.ts                               offer evaluation
src/utils/orderStatus.test.ts                          order / item state machine
src/config/workspace.test.ts                           workspace derivation
src/services/realtime/realtime.test.tsx                realtime status lifecycle
src/services/api/mock/engine/workflow.test.ts          end-to-end workflow + RBAC
src/services/api/mock/engine/phase2.test.ts            Phase 2 engine
src/services/api/mock/engine/regressions.test.ts       regression suite
src/services/api/mock/engine/loyaltyPermissions.test.ts  loyalty permission split
src/features/billing/vipShortfall.test.tsx             rendered VIP shortfall
```

See `docs/TESTING.md`.

### Browser verification scripts

`frontend/scripts/` holds six Playwright scripts. They are **not** wired into `package.json` and
**Playwright is not a declared dependency** — install it only to run them:

```bash
cd frontend
npm i -D playwright
npx playwright install chromium
```

They drive a **production build**, so build and serve first:

```bash
npm run build
npx vite preview --port 4173 --strictPort &
```

| Command | Arguments (defaults in brackets) |
|---|---|
| `node scripts/verify-overflow.mjs <width> <height>` | `[390] [844]` — page-level horizontal overflow and interactive controls with no accessible name |
| `node scripts/verify-contrast.mjs` | none — real WCAG 2.1 contrast of every visible text node against its painted background |
| `node scripts/verify-reachability.mjs` | none — at 390 px, scrolls representative screens to the end and asserts the last control clears the bottom navigation and any sticky save bar |
| `node scripts/verify-themes.mjs <theme> <width> <height>` | `[dark] [1440] [900]` — overflow, contrast and unnamed controls across roles in the named theme. **Run this after any shared-component or token change, in both themes.** |
| `node scripts/explain-contrast.mjs <role> <theme> <route> "rgb(r, g, b)" [textPattern]` | all but the pattern required — names the element behind a contrast failure |
| `node scripts/capture-screens.mjs [widthTags]` | comma-separated tags from `390,768,1024,1440`; omit for all. Honours `OUT` (default `./screenshots`) |

`verify-themes.mjs` and `explain-contrast.mjs` honour a `BASE` environment variable
(default `http://127.0.0.1:4173`); `capture-screens.mjs` uses `http://localhost:4173`.

All of them sign in with seeded accounts, so **they only work against `VITE_API_MODE=mock`**.

`frontend/scripts/README.md` records what this build has actually been measured at, and what has
not been re-measured. Read it before treating a result as current.

---

## Demo credentials

> **Local demo accounts for the in-browser mock backend only.** These are the six accounts offered
> as one-click fill buttons on the login screen, read from the `DEMO` array in
> `frontend/src/features/auth/LoginPage.tsx`. They exist in seed data. They are not production
> credentials, they are published in this repository, and they must never reach a deployment that
> anyone outside your machine can reach.

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Manager | `manager` | `Manager@123` |
| Waiter | `waiter1` | `Waiter@123` |
| Cashier | `cashier` | `Cashier@123` |
| Kitchen | `kitchen` | `Kitchen@123` |
| Host | `host` | `Host@123` |

The seed data also creates accounts for the roles not listed here (super admin, bar, a second
waiter). Their passwords are not reproduced in this README; read them from the seed files if you
need them.

The customer QR menu needs no login: Admin → **QR codes** → open any table's link
(`/menu/<branchCode>/<publicCode>`).

### Scanning a QR code from a phone

QR codes embed whatever address you are browsing, so codes generated at `http://localhost:5173`
only work on that same computer — on a phone, "localhost" is the phone. To test with a real phone:

1. Put the phone on the **same Wi-Fi** as the computer.
2. Open the app on the computer's LAN address, which `start.bat` prints (e.g.
   `http://192.168.1.5:5173`).
3. Print or display the QR codes from **that** address.
4. Allow Node.js on private networks if Windows Firewall prompts.

In mock mode each browser keeps its own database in `localStorage`, so seeded tables use fixed
public codes and scan from any device, but tables you create yourself — and any code you
**Regenerate** — exist only in the browser that made them. Use the Oracle backend for codes shared
across devices, and set `VITE_PUBLIC_APP_URL` for a deployed venue so printed codes never change.

---

## Troubleshooting

**The browser says it cannot connect after `start.bat`.**
Delete the folder `frontend\node_modules\.vite` and run `start.bat` again. Vite keeps its
pre-bundling cache there, and a half-written cache — from an interrupted start, an antivirus lock,
or the folder having been opened from another operating system — stops the dev server binding to
port 5173. Deleting it is safe; it is rebuilt on the next start.

**QR codes do not work on a phone.**
See [Scanning a QR code from a phone](#scanning-a-qr-code-from-a-phone). You are almost certainly
browsing `localhost` rather than the LAN address.

**Changing `VITE_API_MODE` seems to have no effect.**
The API client is created once and memoised. Restart the dev server.

**`node` is not recognised.**
`start.bat` checks for this and prints the nodejs.org URL. Install Node 22 and reopen the terminal
or re-run the file so the new `PATH` is picked up.

---

## Known limitations

Stated plainly, because the difference between "built" and "verified" matters.

- **The Oracle / ORDS integration has not been verified in this environment.** The schema, the
  PL/SQL packages and the ORDS module definitions are written and are internally consistent, but no
  database or ORDS instance was available here, so `run_all.sql` has not been executed end to end
  against a real instance and the `ords` API mode has not been exercised against a live server.
  Everything demonstrated so far has run against the in-browser mock backend.
- **No Oracle or ORDS version is pinned.** Nothing in this repository states a minimum version for
  either. Confirm compatibility against your own instance before relying on it.
- **Physical thermal printing is not verified.** The receipt is laid out for 80 mm stock and prints
  from the browser; no thermal printer, driver or cash-drawer kick has been tested.
- **Touch hardware is not verified.** Layouts were checked at phone, tablet and desktop widths in a
  desktop browser. No POS terminal, tablet or touch device was used.
- **External payment providers are not integrated.** Card, UPI and cash tenders are recorded as
  amounts against a bill. There is no terminal, gateway or acquirer integration of any kind.
- **PMS / hotel integration is a seam, not an integration.** Room posting goes through an adapter
  with a `SIMULATED` demo provider. No real property-management system has been connected.
- **Browser verification is incomplete.** `frontend/scripts/README.md` records that only the
  `dark 1440` combination has been measured against this build, and that a contrast fix has not
  been re-measured. Treat the remaining combinations as unrun.
- **Not all files are committed.** `docs/CLEANUP_LOG.md` §8 (H1) records files present on disk but
  untracked, including ones that tracked files import. Check `git status` before assuming a fresh
  clone builds.
- **There is no linter.** No ESLint or Prettier configuration exists; `npm run typecheck` is the
  only automated static check.

---

## Documentation

| File | Contents |
|---|---|
| `ARCHITECTURE.md` | Root overview of how the system fits together |
| `docs/ARCHITECTURE.md` | Phase 1 layers, data flow, state machines, billing formula |
| `docs/API_SPEC.md` | Every endpoint, its permission and its payloads |
| `docs/RBAC.md` | Role × permission matrix, discount caps, the loyalty split |
| `docs/DATABASE.md` | Schema overview and package responsibilities |
| `docs/WORKFLOWS.md` | Sequence and state diagrams |
| `docs/TESTING.md` | Test strategy and a manual end-to-end script |
| `docs/ASSUMPTIONS.md` | Assumptions made where requirements were silent |
| `docs/PHASE2_PLAN.md` | Phase 2 schema and roadmap |
| `docs/DESIGN_SYSTEM.md` | Palette with measured contrast, type scale, currency rules, shape, elevation, motion, layout |
| `docs/MANAGER_BOARDS.md` | The six manager boards mapped panel by panel to routes |
| `docs/REFERENCE_BOARDS.md` | The reference boards, panel by panel |
| `docs/REFERENCE_MAPPING.md` | Reference board → implemented screen, and what was deliberately not built |
| `docs/REDESIGN_COVERAGE.md` | Route-by-route checklist and the four verification states |
| `docs/UI_ISSUE_LOG.md` | Every defect found in a real browser, its cause, fix and verification |
| `docs/CLEANUP_LOG.md` | Repository audit: inventory, reachability proof, dead code, licence position, ignore coverage |
| `frontend/scripts/README.md` | The verification scripts and what has actually been measured |
| `CONTRIBUTING.md` | How to install, run, check and the house rules |
| `SECURITY.md` | Security posture and how to report a vulnerability |
| `CHANGELOG.md` | Change history, starting from this cycle |

---

## Licence

See [`LICENSE`](LICENSE).

**The licence is a draft and is not yet effective.** The repository has no established copyright
holder: `docs/CLEANUP_LOG.md` §10 records that before this cycle there was no licence file, no
`license` field in `frontend/package.json`, and no copyright header anywhere in the source.

`LICENSE` is therefore an **all-rights-reserved proprietary draft** carrying explicit
`<COPYRIGHT HOLDER>` and `<YEAR>` placeholders. **The holder and the year must be confirmed by the
owner, and the placeholders replaced, before this software is distributed to anyone.** Nothing here
relicenses the project, and no third party should infer a grant of rights from it.

Third-party npm dependencies keep their own licences. `LICENSE` §5 says so explicitly.
