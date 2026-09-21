# Contributing

Everything here is what this repository actually does today. If a rule below and the code disagree,
the code is the bug — say so rather than working around it.

## Setup

Node 22. There is no `engines` field and no `.nvmrc`, so nothing will stop you on another version,
but Node 22 is what this repository was developed with and what CI runs.

```bash
cd frontend
npm ci                  # reproducible; use `npm install` only when changing dependencies
cp .env.example .env     # VITE_API_MODE=mock — no database needed
npm run dev              # http://localhost:5173
```

On Windows, `start.bat` in the repository root does the environment copy, the install and the dev
server for you.

## Before you open a change

Run all three, from `frontend/`. These are the same commands CI runs.

```bash
npm run typecheck        # tsc --noEmit
npm test                 # vitest run
npm run build            # tsc --noEmit && vite build
```

There is no linter in this repository — no ESLint, no Prettier. `typecheck` is the only automated
static check, so it has to pass cleanly. `.editorconfig` carries the formatting rules.

## Browser verification

Required when you touch a shared component, a layout or a design token. The scripts live in
`frontend/scripts/` and drive a **production build**, not the dev server.

Playwright is **not** a declared dependency — install it only when you need it:

```bash
cd frontend
npm i -D playwright && npx playwright install chromium
npm run build
npx vite preview --port 4173 --strictPort &

node scripts/verify-themes.mjs dark 1440 900     # and light, at 360 · 390 · 768 · 1024 · 1440
node scripts/verify-overflow.mjs 390 844
node scripts/verify-contrast.mjs
node scripts/verify-reachability.mjs
```

`verify-themes.mjs` is the one to run after any shared-component or token change, **in both
themes**. When it reports a contrast failure and you cannot tell which element it means, use
`node scripts/explain-contrast.mjs <role> <theme> <route> "rgb(r, g, b)" [textPattern]` — it names
the element rather than making you guess.

These scripts sign in with seeded accounts, so they only work against `VITE_API_MODE=mock`.

`frontend/scripts/README.md` records what this build has actually been measured at. Update it when
you measure something; do not let it claim a result nobody ran.

## House rules

These are conventions the codebase genuinely follows. They exist because each one was a defect
first — `docs/UI_ISSUE_LOG.md` has the history.

**Palette tokens only.** Use the Tailwind token scales (`neutral-*`, `primary-*`, `surface-*`, …).
Do not write a raw hex value in a component. The only place hex belongs is
`frontend/src/config/chartTheme.ts`, where the charting library needs literal colours. Two
exceptions exist and both are commented in place: the standalone print document in
`features/tables/QrPage.tsx` (it cannot reach the app's stylesheet and must print dark ink on white
paper whatever the screen theme is), and the `theme-color` meta tag in `store/uiStore.ts`. Hex
appearing in a comment to explain a token is fine.

**No colour decision in a feature file about its own shell.** Whether a screen is charcoal or ivory
is declared once, per route, in `config/surfaces.ts`, and resolved by `hooks/useSurface.ts`.

**Presentation comes from the role, never the URL.** `config/workspace.ts` derives the workspace
from the signed-in role. Never branch on `location.pathname` to decide how something looks, and
never let a workspace grant a capability — capability comes from `hasPermission` only.

**Grids start at `grid-cols-1`.** Declare the single-column base and add breakpoints upward. A grid
that starts multi-column overflows on a phone.

**Use `minmax(0, 1fr)`, not `1fr`.** A bare `1fr` track has an `auto` minimum, so one long
unbreakable string — an item name, an order number, a URL — pushes the whole row wider than the
viewport. This is the single most common cause of horizontal overflow in this codebase.

**Sticky chrome needs its spacer.** Any scrollable screen that sits under the bottom navigation
takes `.pb-nav`; any screen with a sticky action bar uses `.save-bar`. Both are defined in
`styles/index.css`. Without them the last control is unreachable — which a screenshot of the
initial viewport cannot show you, and which `verify-reachability.mjs` exists to catch.

**Icon-only controls need an accessible name.** Every button whose content is only an icon gets
`aria-label` (or visually hidden text), and the icon itself gets `aria-hidden`.
`verify-overflow.mjs` and `verify-themes.mjs` both fail on unnamed interactive controls.

**Never invent data, and never draw a control that does nothing.** If there is no endpoint, no
provider and no server route behind a control, leave it out rather than drawing it. The login
screen's omitted "continue with Google / Microsoft" block is the worked example, and the reasoning
is in the comment at the top of `features/auth/LoginPage.tsx`. The same applies to numbers: do not
render a metric the backend cannot produce.

## Mirrored rules

Some rules exist twice on purpose — once in TypeScript for the UI and once in PL/SQL for the
server. Changing one side and not the other is the most expensive mistake available here.

| Rule | TypeScript | PL/SQL | Test |
|---|---|---|---|
| Billing calculation | `utils/billing.ts` | `BILLING_PKG.calculate` | `utils/billing.test.ts` |
| Order / item status | `utils/orderStatus.ts` | `ORDER_PKG.derive_status`, `set_item_status` | `utils/orderStatus.test.ts` |
| Offers | `utils/offers.ts` | offer logic in the menu/billing packages | `utils/offers.test.ts` |
| Permissions | `config/permissions.ts` | `SEC_PKG.assert_permission` + seed rows | `mock/engine/workflow.test.ts` |
| Discount caps | `ROLE_MAX_DISCOUNT` | `roles.max_discount_pct` | — |

The backend is the source of truth in every row. The frontend copy is for user experience — instant
totals, disabled buttons — and never the decision.

## Adding things

**A permission:** add the code to `config/permissions.ts` and the relevant `ROLE_PERMISSIONS`
bundle; add the seed row in SQL; update `docs/RBAC.md`; and write a **migration** for existing
installations. `database/11_migration_loyalty_configure.sql` is the pattern to copy — note that it
is idempotent and is deliberately kept out of `run_all.sql` so it never joins a fresh install.

**A route:** register it in `app/router.tsx` behind the right `RequirePermission`; add it to
`config/navigation.ts`; and add it to `config/surfaces.ts` only if it is not charcoal.

**An endpoint:** it has to exist in four places to be real — `services/api/endpoints/`, the mock
engine under `services/api/mock/engine/`, the PL/SQL package, and the router. Then document it in
`docs/API_SPEC.md`. An endpoint that exists only in the mock engine is a demo, not a feature.

## Tests

`vite.config.ts` includes `src/**/*.test.ts` and `src/**/*.test.tsx`. Tests run in `node`;
`*.test.tsx` gets `happy-dom`, which is a declared devDependency so `npm ci` reproduces the suite
anywhere. Put pure logic in `.test.ts` — it is much faster — and use `.test.tsx` only when you
genuinely need to assert on rendered output.

Add a test when you fix a defect. `mock/engine/regressions.test.ts` is where functional regressions
go.

## Commits

Write what changed and why, in the imperative. There is no commit-message tool, hook or convention
enforced in this repository, and no CHANGELOG automation — if a change is user-visible, add it to
the `## [Unreleased]` section of `CHANGELOG.md` yourself.

## Things not to do

- Do not commit `frontend/.env`. It is ignored; `.env.example` is the tracked one. Every `VITE_*`
  value is compiled into the client bundle and is therefore public — no secret belongs in either.
- Do not add a `package.json` at the repository root. The app lives in `frontend/`, and the root
  `package-lock.json` stub is an artefact, ignored on purpose.
- Do not put a `COMMIT` or `ROLLBACK` in a business package. The router owns the transaction
  boundary — see [`ARCHITECTURE.md` §5](ARCHITECTURE.md#transaction-boundaries).
- Do not use the mock backend for anything but local development and demonstration. See
  [`SECURITY.md`](SECURITY.md).
