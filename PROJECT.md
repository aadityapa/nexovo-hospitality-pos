# Nexovo Hospitality POS — project record

One document for the whole build: what it is, how it is put together, what was decided and why,
what was measured, and what is still unproven.

- **What it is** — §1
- **Run it on Windows in two minutes** — §2
- **Architecture** — §3
- **Roles and permissions** — §4
- **The design system** — §5
- **Screens** — §6
- **Verification** — §7
- **What is NOT verified** — §8
- **Open items and decisions you still owe** — §9

Deeper detail lives in `docs/`; this file links to it rather than repeating it.

---

## 1. What it is

A hospitality point-of-sale for a multi-outlet restaurant, bar and club — **The Saffron Lounge**,
Main Branch, in the seeded demo data.

| Area | What it does |
|---|---|
| Service | One master order per table; waiters build it, the kitchen and bar receive only their own lines |
| Preparation | Kitchen and bar displays with NEW / PREPARING / READY, elapsed time, per-line state |
| Billing | Settlement queue, split payments, discounts with approval, refunds, room charges, loyalty redemption, 80 mm thermal receipt |
| Menu | Items, categories, offers, recipes and costing, table QR codes |
| Stock | Inventory, movements ledger, suppliers, purchase orders with a real approval and receiving lifecycle |
| Guests | Customers, loyalty programme, reservations, club door and entry register, VIP tables, bottle service |
| Insight | Sales reports, payment mix, advanced comparative reports, multi-branch |
| Administration | Users, roles and permissions, audit log, settings, notifications and alert thresholds |

**Two backends behind one API client.** `VITE_API_MODE=mock` runs an in-browser engine that
implements every workflow — no server, no database, ideal for demo and for tests.
`VITE_API_MODE=ords` points at Oracle REST Data Services over the PL/SQL packages in `database/`.
The screens cannot tell the difference.

> The mock backend stores data in one browser only and is for local demo. It must never be used
> in production.

---

## 2. Run it on Windows

```
start.bat
```

That installs dependencies if needed, writes `frontend/.env` from `.env.example` if missing, and
starts the dev server. Or by hand:

```
cd frontend
npm install
npm run dev
```

Open the URL it prints (Vite's default is `http://localhost:5173`).

### Demo logins — local demo only

These are the seeded accounts in the in-browser mock backend. They are not production
credentials and grant nothing outside this demo.

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | Admin |
| `manager` | `Manager@123` | Manager |
| `waiter1` | `Waiter@123` | Waiter |
| `cashier` | `Cashier@123` | Cashier |
| `kitchen` | `Kitchen@123` | Kitchen |
| `host` | `Host@123` | Host / Door |

### One-click scripts (double-click in this folder)

| Script | Does |
|---|---|
| `start.bat` | Install if needed, write `.env`, start the dev server |
| `verify.bat` | `npm install` → `tsc --noEmit` → `vitest run` → `vite build` → theme audit; every result to `frontend/verify-log.txt` |
| `capture-screenshots.bat` | Build, serve, capture every screen for every role in both themes → `frontend/screenshots/` |
| `package.bat` | Write `nexovo-hospitality-pos.zip` (no `node_modules`, `dist`, `.git`) with Windows' built-in `tar` |

### Commands

| | |
|---|---|
| `npm run dev` | Dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, once |
| `npm run build` | Typecheck then production build |
| `npm run preview` | Serve the built app on 4173 |

### If the dev server misbehaves

Delete `frontend/node_modules/.vite` and start again. A half-written dependency cache there is the
one failure that looks like a code error and is not.

---

## 3. Architecture

React 18.3 · TypeScript 5.6 (strict) · Vite 5.4 · Tailwind 3.4 · React Router 6.26 ·
TanStack Query 5 · Zustand · React Hook Form + Zod · Recharts · Vitest 2.1.

```
/                      README, ARCHITECTURE, LICENSE, CHANGELOG, CONTRIBUTING, SECURITY, this file
  .github/workflows/   CI: clean install, typecheck, test, build (Node 22)
  database/            17 SQL files — schema, PL/SQL packages, ORDS modules, seed, one migration
  docs/                Architecture, API, RBAC, database, workflows, design system, boards, verification
  frontend/
    scripts/           Verification and capture scripts (Playwright, installed ad hoc)
    src/
      app/             Router and query client
      config/          Permissions, navigation, workspaces, surfaces, chart theme, motion
      components/      ui/ (primitives) · layout/ (shell) · graphics/ (original SVG) · motion/
      features/        One folder per domain — the screens
      hooks/ services/ store/ types/ utils/ styles/
```

Full detail: `ARCHITECTURE.md` (root overview) and `docs/ARCHITECTURE.md` (the Phase 1 record).

### The workspace boundary — the one idea worth reading

Four audiences use this product and the reference boards draw them differently:
`admin` · `manager` · `operations` (waiter, cashier, kitchen, bar, host) · `guest` (the QR menu).

Two rules make that safe:

1. **A workspace is derived from the signed-in role, never from the URL.** `/admin/suppliers` is a
   route an admin *and* a manager open; the prefix says where a screen lives, not who is looking
   at it. Deriving presentation from the path would have given the manager the admin's design on
   two thirds of their screens.
2. **A workspace grants nothing.** It selects a surface, a layout and a rail. Every capability
   still comes from `hasPermission`, mirroring what the server enforces. Nothing in
   `config/workspace.ts` is ever consulted by a guard, a mutation or an API call.

The admin surface table is **frozen**; the fourteen screens the manager sees differently live in a
separate overlay consulted only for managers, so nothing an admin sees can change by editing it.
`config/workspace.test.ts` proves all of this, including that a multi-role account gets the
workspace matching the dashboard it was sent to.

### Transaction boundary

The PL/SQL packages contain **no** `COMMIT` or `ROLLBACK`. The ORDS router owns it: one commit on
a successful dispatch, a rollback in `WHEN OTHERS`. That is what makes closing a bill atomic.

### Sessions

Opaque bearer tokens — `DBMS_CRYPTO.RANDOMBYTES(32)`, hex-encoded, stored only as a SHA-256 hash.
Passwords are salted `HASH_SH512`. **Not JWTs**, despite what an older doc says.

---

## 4. Roles and permissions

Eight roles, 69 permission codes. The server is the authority; the client list powers route guards
and affordances. Full matrix: `docs/RBAC.md`.

### Loyalty is three permissions, not two

`loyalty:manage` used to mean both *adjust this member's points* and *rewrite the programme's
rules*. Those have very different consequences, so they are separate grants:

| Code | Covers |
|---|---|
| `loyalty:view` | See the programme and permitted member information |
| `loyalty:manage` | Member operations, including point adjustments |
| `loyalty:configure` | Programme rules: earning, redemption, tiers, expiry, limits |
| `loyalty:redeem` | Redeem points against a bill |

Adjusting points is a daily, audited, reversible gesture a floor manager makes at the table.
Changing the earn rate or the point value **retrospectively re-prices every point every member
holds**. Managers hold `view`, `manage` and `redeem`; administrators hold all four.

Enforced in five places that must move together: the mock engine, `loyalty_pkg.save_program`, the
ORDS router, the seed, and the screen. 17 tests cover both directions — including that a manager
sending `PUT /loyalty/program` directly is refused **403 before validation runs**, so the error
cannot leak which values are accepted.

**Upgrading an existing database:** run `database/11_migration_loyalty_configure.sql` once. It is
idempotent, prints every affected role, and carries its own rollback. Custom roles holding
`loyalty:manage` **gain** `loyalty:configure`, because they could already configure the programme —
splitting a permission must not quietly take capability away from a role somebody configured on
purpose. MANAGER is the one deliberate reduction. **This migration has never been executed.**

### Read-only is a permission, not a workspace

The manager's Settings and Branches are read-only because the seeded MANAGER role holds
`settings:view` and `branches:view` and **not** the matching `:manage`. The treatment is driven by
`useReadOnly('settings:manage')` — exactly two call sites, no workspace check anywhere. An admin
holds both and keeps the editable form on the same screen; if server policy changes, the screens
follow with no code edit.

Three controls the reference boards draw are **not rendered for a manager**, because the
permission model does not grant them: *Add item* and *Add category* (`menu:manage`) and
*Add supplier* (`suppliers:manage`).

---

## 5. The design system

**"The Night Collection"** — obsidian `#0B0E11`, smoked charcoal `#171C21`, champagne gold
`#D6BA83`, warm ivory `#F3EFE6`, bronze hairlines, violet for VIP only — in **two complete themes**.
Token *names* live in `tailwind.config.ts`; token *values* are CSS custom properties in
`styles/index.css`, one block per theme. The specification as implemented, with every colour,
type, imagery and motion rule: **`docs/DESIGN_SPEC.md`**. The rules every screen was held to:
`docs/LUXURY_HOUSE_RULES.md`. The older Phase-N record: `docs/DESIGN_SYSTEM.md`.

- **The editorial serif** (Cormorant Garamond → Georgia) is set in exactly two components —
  `PageHeader` and `DashboardHero` — plus the login's "Welcome back" and one hospitality line per
  screen at most. Tables, forms, navigation, tickets, bills and figures stay in the sans.
- **Photographs are licensed and local.** 57 pictures (the room, three floors, the Hyderabad
  branch, 36 dishes and drinks, two bottle-service bottles, 14 stock items; categories, offers and
  recipes reuse their own dishes' photos) from Pexels and Unsplash, fetched once into
  `frontend/public/img/` by a script Vite runs at the start of `dev`/`build`; the app never
  loads an image from the internet. Each was opened and checked against its record — nine of
  the seed's original hot-linked pictures were the wrong dish or dead links (`docs/IMAGERY.md`).
  Every slot keeps a drawn understudy (`LoungeScene`, `VenueArt`, `DishArt`, `BottleArt`) for
  loading, absence and error. Nothing behind a table, a bill or a ticket.
- **Monetary totals never animate.** `CountUp` was removed from both dashboards' sales figure.

- **The neutral ramp keeps its meaning, not its lightness.** `neutral-200` is a hairline border in
  both themes; `neutral-900` is primary text in both. That is why ~90 files contain no
  theme-specific code at all.
- **Gold is the primary action**, one per view. Its label is always near-black — white on gold is
  1.9:1 and never used.
- **Violet is VIP classification only.** Never an action, never a generic highlight.
- **Per-route surfaces.** Some screens are warm ivory workspaces inside the charcoal product,
  applied as a `.chrome-light` island that re-declares the palette for its subtree. Under the
  **light theme the whole application is light** — someone who asked for a light interface has not
  asked for two thirds of it to stay black.
- **Original artwork only.** Menu items, bottles, venues and the login panel are drawn in SVG
  (`components/graphics/`), keyed deterministically off each record's own name so a dish is the
  same picture everywhere. No photography was invented. QR codes contain the real public-menu URL
  and scan.
- **Motion is entrances only**, 120–220 ms. Nothing loops, glows or re-animates on a poll. The
  kitchen, bar, order-entry and billing screens are explicitly calm. `prefers-reduced-motion`
  collapses everything to its end state.

---

## 6. Screens

**Every route, every role, what the luxury pass changed on it, what the concept drew that the code
cannot back, and its verification state: `docs/ROUTE_CHECKLIST.md`.** The older panel maps:

- `docs/REFERENCE_BOARDS.md` — the admin set
- `docs/MANAGER_BOARDS.md` — the manager set, plus the fourteen deliberate differences and the
  controls a manager must not be shown

One-click on Windows: **`capture-screenshots.bat`** builds, serves and captures every screen for
every role in both themes at 1440 and 390 (edit one line for other widths).

### Regenerating the screenshots

```
cd frontend
npm i -D playwright && npx playwright install chromium
npm run build
npx vite preview --port 4173 --host 127.0.0.1 &
node scripts/capture-screens.mjs
```

Writes `screenshots/<theme>-<width>/<role>/<nn-slug>.png` covering the login, the guest QR menu
and every screen each role can reach — admin, manager, waiter, cashier, kitchen, bar and host —
and flags any route that overflows its viewport. Narrow it with `--roles manager --widths 1440
--themes dark`.

### Nothing on a screen is invented

No fabricated trend, comparison, ranking, delivery event or figure appears anywhere. A comparison
is drawn only from a second, separately fetched period; where the prior period has no data the
card prints *"no data for &lt;label&gt;"* rather than "+100%". Controls the reference boards drew
that have no backing API — social login, invitations, 2FA, session management, carrier delivery
tracking, import — were **omitted**, not mocked. `docs/REFERENCE_BOARDS.md` §7 records every such
decision, and §"Fields the boards show that this venue's records do not hold" records the columns
dropped rather than filled with an approximation.

---

## 7. Verification

Full record with commands: `docs/VERIFICATION.md`.

### The luxury pass (this cycle) — measured 25-09-2026

On the final code, both on the owner's Windows machine (`verify.bat`) and in a clean Linux
checkout:

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `vitest run` | **156 / 156**, 11 files |
| `vite build` | **clean** |
| Audit: 81 routes × 2 themes × 5 widths = 810 checks | **0 overflow · 0 contrast failures · 0 unnamed controls** |
| Screenshots | **388 before + 388 after + 388 side-by-side** in `screenshots/` |
| End-to-end flows (`scripts/e2e-flows.mjs`) | **7 / 7**: sign-in (7 roles), permission denied, order entry, kitchen preparation, billing + cash payment, reservation, purchase order approve → receive. Each step is checked against the database the app wrote |

The review of the rendered screens found four defects, all fixed and re-measured: serif titles
colliding with subtitles, a see-through cart bar on the waiter's phone, a bottle photo of the
wrong product, and the capture script photographing the login page as the guest menu. Details:
`docs/VERIFICATION.md` §0. All of this ran against the **in-browser demo backend** (see §8).

Treat the figures in the next table as the state of the commit *before* this pass.

### The previous cycle (`05c99c3`) — measured

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `vitest run` | **156 / 156**, 11 files |
| `vite build` | **clean** |
| Browser sweep | **810 route inspections** — 6 roles × 81 routes × 5 widths × 2 themes |
| Contrast | **0 failures** in all ten combinations |
| Controls without an accessible name | **0** in all ten combinations |
| Page overflow | **0** at 768 / 1024 / 1440; **1 route** at 360 / 390 — cause now found, see §9 |

That ZIP was not assumed to work — it was a `git archive` of the commit, extracted to a clean
directory and built from scratch: `npm ci` → 238 packages → typecheck 0 → 156/156 → build clean.
The new ZIP (`package.bat`) has had no such proof yet.

### Defects found and fixed this cycle

Eight. Two mattered:

- **Cross-branch write.** `findBill`, `findOrder`, `getTable` and `getItem` looked a row up by id
  with no branch predicate. Since `addPayment` resolves through `findBill`, a cashier on branch 2
  who knew a branch-1 bill id could **take money against it**. All four are branch-scoped now and
  answer **404, not 403** — a caller with no business seeing a row should not learn from the error
  that it exists. Filtering the list and trusting the id on the write is the classic shape of this
  bug; it is worth checking wherever a by-id helper exists.
- **The light theme did not win.** A dark-declared route kept a `chrome-dark` island under the
  light theme, so operational screens stayed black in light mode while light-theme tokens painted
  on them at 3.31:1. Invisible to a dark-only sweep — only walking both themes found it.

The other six were overflow and contrast corrections, each traced to a shared cause and fixed
there rather than patched per screen.

**The audit tool itself had two defects** — it read `color` on SVG text (which is painted by
`fill`) and could not see gradient backgrounds, producing 1.00:1 on perfectly legible
white-on-scrim. Both fixed. A probe that reports false failures trains you to skim past the real
one.

---

## 8. What is NOT verified

Read this before describing the product to anyone.

| Area | Status |
|---|---|
| **Oracle / ORDS** | **NOT RUN.** No instance was available. The SQL was written and reviewed but never executed. Nothing about the packages, the router or the migration is proven against a database |
| `11_migration_loyalty_configure.sql` | **NOT EXECUTED** |
| Physical thermal printing (80 mm) | **NOT VERIFIED** — no printer |
| Touch hardware, on-screen keyboards | **NOT VERIFIED** — touch targets checked by rule, not on a device |
| External payment providers | **NOT VERIFIED** — none is integrated |
| PMS / room-charge posting | **NOT VERIFIED** — no PMS |
| Real-device browsers (iOS, Android) | **NOT VERIFIED** — all measurement was headless Chromium at emulated widths |
| Load, concurrency, long-run stability | **NOT TESTED** |
| Motion by eye (login light-reveal, add-to-order, ticket change, payment confirmation) | **NOT JUDGED BY EYE** — the timings and the `prefers-reduced-motion` collapse are in code, but screenshots are still frames; no one has watched them on a device |
| Photograph licences | Pexels and Unsplash licences as published on 25-09-2026. Brand bottles (Jack Daniel's, Grey Goose, Glenfiddich, Kingfisher) appear as the products the venue sells; **confirm with your own counsel before using them in marketing** |
| Serif font | Cormorant Garamond loads from Google Fonts. Offline, the Georgia fallback is used; it has not been bundled locally |
| npm advisories | `react-router-dom` raised 6.26.2 → **6.30.6** (same major), which closes the two open-redirect/XSS advisories in the shipped app. Shipped dependencies now show **2 moderate** advisories, which need React Router v7, a breaking upgrade left for you to decide. The critical and high findings that remain are in test/build tooling only (vitest, happy-dom, vite, esbuild, postcss) and do not ship |

**Release decision: DEMO-READY against the in-browser mock backend. NOT production-ready.**
Everything in §7 was measured against the mock backend. Oracle/ORDS, hardware, payments, PMS and
real devices are unverified, and nothing above should be read as saying otherwise.

---

## 9. Open items, and decisions you still owe

### The three screenshot issues — causes found

| Reported | Cause | Fixed in |
|---|---|---|
| Guest QR page "Menu unavailable" in the archive | The capture script opened `/menu/MAIN/T1`; a table's public code is an opaque hash, so the app correctly refused an invented one. **Screenshot-process bug.** | `scripts/capture-screens.mjs` now reads a real link off `/admin/qr` |
| Dark-mobile captures with light surfaces | A deliberate "phones are ivory" rule painted the management shell paper below `lg` in the dark theme. **App bug.** | Rule removed (`config/surfaces.ts`, `hooks/useSurface.ts`); the theme holds at every width |
| `/admin/roles` 436 px document at ≤ 390 px, nothing visible past the edge | Tailwind's `sr-only` is `position: absolute`; the table's scroll wrapper was unpositioned, so the sr-only spans inside the 760 px matrix escaped its clip and sat at their static x-offset in the unscrolled table. Explains the constant 436 at both widths, the invisible 1×1 boxes and why three `min-w-0` fixes did nothing. **App layout bug, product-wide.** | `position: relative` on `.table-scroll` (`styles/index.css`) and the roles chip row. Diagnosed by static analysis; confirm with `document.scrollWidth` at 360/390 on the next browser run |

### Decisions only you can make

1. **Licensing.** The project had no licence, no `license` field and no copyright headers. `LICENSE`
   is a proprietary / all-rights-reserved **draft** with `<COPYRIGHT HOLDER>` and `<YEAR>`
   placeholders and a "DRAFT — NOT YET EFFECTIVE" header. Third-party MIT/ISC notices are preserved
   and explicitly not superseded. **Confirm the holder and year before distributing.**
2. **Security contact.** `SECURITY.md` carries a `<SECURITY CONTACT>` placeholder. No address was
   invented.
3. **Run the migration.** `11_migration_loyalty_configure.sql` against a real database, and read
   the roles it prints — custom roles keep the configuration capability they already had, and you
   may want to revoke it from some of them.

### Known imperfections worth naming

- `frontend/scripts/README.md` says "Four Playwright scripts"; there are six.
- `docs/ARCHITECTURE.md` describes sessions as "JWT bearer". They are opaque random tokens. The
  root `ARCHITECTURE.md` states it correctly; the older file was left as the Phase 1 record.
- `inventory.manualMovement` writes its audit row *before* applying the movement, so a refused
  adjustment leaves an audit entry for a movement that never happened. The balance and the ledger
  are correct; only the audit trail overstates. Same atomicity defect that was fixed for
  `createOrder`, surviving in the inventory path.
- `inventory.listMovements` claims newest-first but sorts on a millisecond timestamp with a stable
  sort, so rows written in the same tick come back oldest-first. Cosmetic, not financial.

---

## 10. Git

| | |
|---|---|
| Starting revision | `65d413b` |
| This cycle | `05c99c3` — manager workspace, workspace boundary, loyalty split |
| Changed | 143 files, +20 478 / −3 838 |
| History | preserved — no rebase, no force-push, no tag, no remote, no authorship rewritten |

27 files were previously untracked **and imported by tracked files** — a fresh clone would not
have built. They are committed. `node_modules`, `dist`, `.env` and caches remain untracked and
were verified absent from the staged set.
