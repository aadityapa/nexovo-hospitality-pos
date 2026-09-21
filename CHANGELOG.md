# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **This changelog starts here.** No version has ever been tagged in this repository — `git tag`
> returns nothing — and the commit history is too coarse to reconstruct honest release notes for
> what came before. Rather than invent version numbers and dates for releases that were never cut,
> earlier work is left unrecorded. The [Unreleased](#unreleased) section below describes the
> current cycle only, from direct evidence in the working tree.
>
> `frontend/package.json` declares `"version": "1.0.0"`. That value has been there since the
> manifest was written and does not correspond to a tagged or published release, so it is not
> treated as a release marker here.

## [Unreleased]

### Added

- **Manager workspace.** A dedicated command centre for the floor manager (`/manager`), plus a live
  orders board, implemented against the six manager reference boards. `docs/MANAGER_BOARDS.md` maps
  every panel to its route.
- **Workspace presentation system** (`frontend/src/config/workspace.ts`). Four named audiences —
  `admin`, `manager`, `operations`, `guest` — let one screen present itself appropriately for the
  person looking at it without being forked into per-role copies. Two properties are enforced and
  covered by `frontend/src/config/workspace.test.ts`:
  - a workspace is derived from the **signed-in role, never from the URL**, because a path prefix
    says where a screen lives, not who is looking at it; and
  - a workspace **grants nothing** — it selects a surface, a layout variant and a rail, while every
    capability still comes from `hasPermission`. Nothing in the file is consulted by a guard, a
    mutation or an API call, and read-only presentations are driven by the absence of a permission
    rather than by the workspace.
- **Manager surface overlay** in `frontend/src/config/surfaces.ts`. The admin surface table is
  frozen; every manager difference is declared in a separate list consulted only when the
  signed-in role resolves to the manager workspace, so no admin screen can be changed by editing
  the manager's declarations.
- **`loyalty:configure` permission.** Loyalty is now four permissions rather than three meaningful
  ones: `loyalty:view`, `loyalty:manage` (member operations, including point adjustments),
  `loyalty:configure` (programme rules — earning, redemption, tiers, expiry, limits) and
  `loyalty:redeem`.
- **`database/11_migration_loyalty_configure.sql`** — an idempotent migration that applies the
  loyalty split to existing installations. It is deliberately **not** part of `run_all.sql`: a
  fresh install reaches the same end state from `10_phase2_seed.sql`, and a migration that silently
  joins a fresh install is one nobody can reason about later.
- **Verification tooling** in `frontend/scripts/`. Playwright scripts that check the production
  build in a real browser rather than by reading source — `verify-themes.mjs` (overflow, WCAG
  contrast against actually-painted backgrounds, and unnamed interactive controls, per theme and
  viewport), `verify-overflow.mjs`, `verify-contrast.mjs`, `verify-reachability.mjs`,
  `explain-contrast.mjs` (names the element behind a contrast failure) and `capture-screens.mjs`.
  Playwright is intentionally not a declared dependency.
- **Repository documentation and hygiene files**, none of which existed before: `LICENSE`,
  `CONTRIBUTING.md`, `SECURITY.md`, this `CHANGELOG.md`, a root `ARCHITECTURE.md`, `.gitattributes`,
  `.editorconfig` and a GitHub Actions workflow.
- **Continuous integration** (`.github/workflows/ci.yml`): checkout, Node 22 with the npm cache
  keyed on `frontend/package-lock.json`, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
  There was no CI of any kind before this.
- **`docs/CLEANUP_LOG.md`** — a repository audit with a module-graph reachability proof, a dead-code
  inventory, the licence position and ignore-rule coverage. It concluded with **zero files deleted**.

### Changed

- **Loyalty permissions split across every enforcement layer** — the permission list, the role
  bundles, the mock engine, the PL/SQL packages and the seed data. Managers keep `loyalty:view` and
  `loyalty:manage`; they do **not** get `loyalty:configure` by default, because changing the earn
  rate or the redemption value retrospectively re-prices every point every member holds.
  Super admins and admins gain `configure` with no change in effective capability.
- **Design language extended to the remaining roles.** The waiter, cashier, kitchen, bar and host
  tools and the guest QR menu were brought onto the same surface, density and component system as
  the admin and manager screens. The in-service tools keep their charcoal at every width — they are
  used in a dim room and are not management screens.
- **README rewritten** against the code rather than against memory. Corrections of record: the RBAC
  figures were wrong (the codebase has **8 roles and 68 permissions**, not 7 and 38), and the demo
  credentials table listed accounts the login screen does not offer. The table now reproduces only
  the six accounts in the `DEMO` array of `frontend/src/features/auth/LoginPage.tsx`, labelled as
  local demo accounts for the mock backend.
- **`.gitignore` extended** with the gaps the cleanup audit identified — `*~`, `*.swo`,
  `desktop.ini`, `coverage/`, `*.tsbuildinfo`, `.vite/` and `.cache/`. Existing rules unchanged.

### Fixed

- **Chart colours on paper surfaces.** `useChartTheme()` now resolves against the route's own
  surface rather than the global theme, which was the cause of the four contrast failures recorded
  on `/admin/reports/advanced`. **This fix has not been re-measured** — see Known issues.

### Security

- Documented the security posture for the first time in `SECURITY.md`: server-enforced permissions
  via `SEC_PKG.assert_permission`, server-side branch isolation via `X-Branch-Id`, opaque bearer
  tokens stored only as SHA-256 hashes, salted `HASH_SH512` passwords, and the router-owned
  transaction boundary.
- Stated explicitly, in `README.md`, `SECURITY.md` and `LICENSE`, that the mock backend is a local
  demonstration backend with seeded credentials and no server-side authorisation, and must never be
  used in production.

### Known issues

Carried forward deliberately rather than closed, so that nothing here reads as more finished than
it is:

- The Oracle/ORDS integration is **unverified in this environment** — `run_all.sql` has not been run
  against a live database and the `ords` API mode has not been exercised against a live server.
- Browser verification is incomplete. `frontend/scripts/README.md` records that only the
  `dark 1440` combination has been measured against this build, and that the chart-theme fix above
  has not been re-measured.
- Thermal printing, touch hardware, external payment providers and PMS integration are not verified.
- `docs/CLEANUP_LOG.md` §8 (H1) records files present on disk but untracked, including files that
  tracked files import. A fresh clone may not build until they are committed.
- The `LICENSE` is a draft: the copyright holder and year are placeholders and must be confirmed
  before distribution.

[Unreleased]: #unreleased
