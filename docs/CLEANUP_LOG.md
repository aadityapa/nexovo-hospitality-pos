# Repository cleanup audit

**Date:** 2026-09-21
**Repository:** Nexovo Hospitality POS (`Bill system`)
**Rule applied:** nothing is deleted that has not been *proved* unreferenced. "Not imported by
TypeScript" was never accepted as proof on its own — every candidate was checked against static
imports, dynamic/lazy imports and route registration, public-asset and CSS `url(...)` references,
build and test configuration, SQL runner order, `start.bat`, documentation and runtime/generated-code
requirements.

**Outcome: 0 files deleted.** The repository contains no OS/editor trash, no stray logs, no build
output, no archives, no temporary artefacts and no orphaned source files. One genuinely dead file and
ten genuinely dead exported symbols were found; all are in protected categories and are recorded as
recommendations only.

---

## 1. Inventory

| Scope | Count |
| --- | --- |
| Files on disk, excluding `.git/` and `node_modules/` | **235** |
| Files tracked by git (`git ls-files`) | **207** |
| Tracked but modified, uncommitted | 40 |
| Present on disk, not tracked, not ignored | 26 |
| Present on disk and correctly ignored | 2 (`frontend/.env`, root `package-lock.json`) |

### Per-directory breakdown (file counts, excluding `.git/` and `node_modules/`)

| Directory | Files |
| --- | --- |
| `database/` | 17 |
| `docs/` | 14 (15 after this file) |
| `frontend/` (root-level files) | 10 |
| `frontend/scripts/` | 6 |
| `frontend/src/app/` | 4 |
| `frontend/src/components/graphics/` | 6 |
| `frontend/src/components/layout/` | 3 |
| `frontend/src/components/motion/` | 1 |
| `frontend/src/components/ui/` | 11 |
| `frontend/src/config/` | 11 |
| `frontend/src/features/` (27 sub-folders) | 75 |
| `frontend/src/hooks/` | 4 |
| `frontend/src/layouts/` | 3 |
| `frontend/src/routes/` | 1 |
| `frontend/src/services/api/` | 2 |
| `frontend/src/services/api/endpoints/` | 8 |
| `frontend/src/services/api/http/` | 1 |
| `frontend/src/services/api/mock/` | 3 |
| `frontend/src/services/api/mock/engine/` | 13 |
| `frontend/src/services/api/mock/engine/p2/` | 7 |
| `frontend/src/services/realtime/` | 5 |
| `frontend/src/store/` | 3 |
| `frontend/src/styles/` | 1 |
| `frontend/src/types/` | 10 |
| `frontend/src/utils/` | 10 |
| `frontend/src/` (root-level files) | 2 |
| repository root | 4 |
| **Total** | **235** |

(Sub-totals: root 4 · `database/` 17 · `docs/` 14 · `frontend/` top level 10 · `frontend/scripts/` 6 ·
`frontend/src/` 184 — being 183 `.ts`/`.tsx` plus `styles/index.css`.)

### By extension

`.tsx` 98 · `.ts` 87 · `.sql` 17 · `.md` 16 · `.mjs` 5 · `.json` 4 · `.gitignore` 2 ·
`.js` 1 · `.html` 1 · `.css` 1 · `.bat` 1 · `.env` 1 · `.example` 1

---

## 2. Reachability proof for `frontend/src`

A module-graph walk (`/tmp/audit/reach.mjs`) started from `frontend/src/main.tsx` — the only entry
referenced by `frontend/index.html` (`<script type="module" src="/src/main.tsx">`) — plus every file
matched by the vitest include globs in `vite.config.ts`
(`include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`). It resolved every relative and `@/` specifier,
including `React.lazy(() => import(...))` calls, using the `@ -> src` alias declared in both
`vite.config.ts` and `tsconfig.json`.

```
TOTAL ts/tsx in src:                        183
REACHABLE from main.tsx + test globs:       182
UNREACHABLE:                                src/vite-env.d.ts
UNRESOLVED relative/alias specifiers:       (none)
```

**There are no orphaned source files.** The single unreachable file is an ambient declaration file,
covered separately below. No broken imports exist.

---

## 3. Candidate table

Every file or symbol that any heuristic flagged, with the evidence that decided it.

| # | Path | Size | Classification | Evidence (every check performed) | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | `package-lock.json` (repository root) | 90 B | **CONFIRMED UNUSED** | **static imports:** n/a (JSON). **build/test config:** no `package.json` exists at the repository root, so npm has nothing to lock; the file's `"packages": {}` is empty. **package.json scripts:** the only scripts live in `frontend/package.json`. **start.bat:** `cd /d "%~dp0frontend"` then `npm install` / `npm run dev` — operates entirely inside `frontend/`, never at the root. **docs:** the one lockfile mention, `docs/REDESIGN_COVERAGE.md` ("`npm ci` from the committed `package.json` + `package-lock.json`"), refers to the frontend pair. **git:** untracked — `git check-ignore -v` returns `.gitignore:22:/package-lock.json`, i.e. the ignore rule exists *specifically* to exclude this file, commented "Accidental root lockfile (app lives in frontend/)". **history:** never committed. | **RECOMMENDED, NOT DELETED** — the filename is on the do-not-delete list. It is already untracked and costs the repository nothing. See §7. |
| 2 | `frontend/src/vite-env.d.ts` | 399 B | **KEEP** | Unreachable through the import graph *by design*: it is an ambient `.d.ts`. `tsconfig.json` sets `"include": ["src"]` and `"types": ["vite/client"]`, so `tsc --noEmit` (the `build` and `typecheck` scripts) loads it to type `import.meta.env`, which `frontend/src/config/env.ts` reads. Deleting it breaks the typecheck. | Kept |
| 3 | `frontend/src/config/workspace.test.ts` | 6.3 KB | **KEEP** | Zero textual references by name — expected for a test. Executed by the runner: `vite.config.ts` → `test.include: ['src/**/*.test.ts', …]`, run by `npm test` (`vitest run`). Useful test coverage for the workspace-variant system. | Kept |
| 4 | `frontend/src/services/api/mock/engine/regressions.test.ts` | 11.8 KB | **KEEP** | Same evidence as #3. Documented in `docs/TESTING.md` as the regression suite for the three functional fixes. | Kept |
| 5 | `database/11_migration_loyalty_configure.sql` | 8.0 KB | **KEEP** | **Not** in `database/run_all.sql` — deliberately, and the file says why in its own header: "A fresh install gets the same end state from `10_phase2_seed.sql` and must NOT run this file … it is not part of `run_all.sql`". **Referenced by three live files:** `database/09c_pkg_crm_loyalty.sql:173`, `docs/RBAC.md:154` ("Run `database/11_migration_loyalty_configure.sql` once, as the schema owner"), and `frontend/src/config/permissions.ts:36`. A required migration for existing installations. | Kept |
| 6 | `database/01–10` + `run_all.sql` (16 files) | 33 KB–47 KB each | **KEEP** | Every file is invoked by name from `database/run_all.sql` in a documented order (Phase 1 schema → Phase 2 schema → packages → ORDS routers → seeds). Schema installers, PL/SQL packages and seed definitions. | Kept |
| 7 | `frontend/postcss.config.js` | 81 B | **KEEP** | Zero references by name — expected. Auto-discovered by Vite's PostCSS integration at build time; loads `tailwindcss` and `autoprefixer`, both declared in `frontend/package.json` devDependencies. Removing it silently disables Tailwind. | Kept |
| 8 | `frontend/tsconfig.json` | 533 B | **KEEP** | Zero references by name — expected. Consumed by `tsc --noEmit` in the `build` and `typecheck` scripts, and supplies the `@/*` path alias. | Kept |
| 9 | `frontend/.env` | 951 B | **KEEP** | Correctly ignored (`git check-ignore -v` → `frontend/.gitignore:3:.env`), never committed in any revision. `diff frontend/.env frontend/.env.example` → **identical**; contains no secrets, only `VITE_*` mode flags. Recreated automatically by `start.bat` step 2 if absent. A developer's working copy, not a leak. | Kept (and it is not in git) |
| 10 | `frontend/.env.example` | 951 B | **KEEP** | Tracked; read by `start.bat` (`copy /y ".env.example" ".env"`). Required for first-run setup. | Kept |
| 11 | `frontend/scripts/*.mjs` (5 files) + `frontend/scripts/README.md` | 2.7–5.3 KB each | **KEEP** | Not wired into `package.json` scripts, but referenced from `docs/DESIGN_SYSTEM.md` (3 mentions) and documented in `frontend/scripts/README.md`, which `README.md:131` links as "the Playwright scripts that produce the overflow, contrast and scroll-reachability results. Re-runnable." Deliberate release/verification evidence. | Kept |
| 12 | `docs/MANAGER_BOARDS.md` | 13.7 KB | **UNCERTAIN → KEEP** | Not linked from `README.md` and not referenced by any other file (it links *out* to `RBAC.md`). It is nevertheless a substantial design deliverable (the six manager boards → route mapping). Documentation is never deleted under this audit's rules, and orphan-in-the-index is not evidence of deadness. | Kept — recommend adding a link from `README.md` |
| 13 | `docs/REFERENCE_BOARDS.md` | 18.8 KB | **UNCERTAIN → KEEP** | Same as #12: no inbound reference from `README.md` or any doc. Substantial reference-board deliverable. | Kept — recommend adding a link from `README.md` |
| 14 | `docs/REFERENCE_MAPPING.md`, `REDESIGN_COVERAGE.md`, `UI_ISSUE_LOG.md`, `DESIGN_SYSTEM.md` | 13–21 KB each | **KEEP** | All four linked from `README.md:127–130`. Deliberate release evidence (defect log, coverage checklist, reference mapping). | Kept |
| 15 | `docs/API_SPEC.md`, `ARCHITECTURE.md`, `ASSUMPTIONS.md`, `DATABASE.md`, `PHASE2_PLAN.md`, `RBAC.md`, `TESTING.md`, `WORKFLOWS.md` | 1.8–17.9 KB | **KEEP** | All linked from `README.md:147–153` (and `PHASE2_PLAN.md` from the Phase 2 section). | Kept |
| 16 | `start.bat` | 2.7 KB | **KEEP** | The documented startup path — `README.md:17` "Double-click **`start.bat`**". Startup/deployment script. | Kept |
| 17 | `frontend/package-lock.json` | 135 KB | **KEEP** | The real lockfile for the only `package.json` in the repository. `docs/REDESIGN_COVERAGE.md` records a clean-environment `npm ci` against it. | Kept |
| 18 | `frontend/index.html`, `vite.config.ts`, `tailwind.config.ts`, `package.json` | 1.0–8.6 KB | **KEEP** | Vite entry document, build/test config, Tailwind config (`content: ['./index.html', './src/**/*.{ts,tsx}']`), and the manifest holding every script. | Kept |
| 19 | `frontend/src/components/ui/ReadOnly.tsx`, `components/motion/index.tsx`, `components/graphics/*` (6), `components/layout/DashboardHero.tsx`, `config/motion.ts`, `config/surfaces.ts`, `config/workspace.ts`, `hooks/useMediaQuery.ts`, `hooks/useSurface.ts` | various | **KEEP** | All flagged only because they are *untracked*, not because they are unreferenced. Every one is reachable in the module graph (§2) — e.g. `ReadOnly.tsx` is re-exported from `components/ui/index.ts`, `graphics/*` from `components/graphics/index.ts`. | Kept — see hygiene finding H1 |
| 20 | 10 exported symbols with no consumer (see §4) | — | **CONFIRMED UNUSED (symbols)** | Verified by `grep -E "\bSYMBOL\b"` across the whole repository excluding `node_modules` — each appears exactly once, at its own definition. Barrel re-exports were checked: none of the ten is re-exported by `components/ui/index.ts`, `components/graphics/index.ts`, `services/api/endpoints/index.ts`, `services/realtime/index.ts` or `services/api/index.ts`; `types/index.ts` uses `export *`, but a consumer would still have to name the symbol at the import site, and none does. | **RECOMMENDED, NOT DELETED** — source code. See §7. |

### Junk classes explicitly searched for and **not found**

`find` across the whole repository (excluding `.git/` and `node_modules/`) for
`.DS_Store`, `Thumbs.db`, `desktop.ini`, `*.swp`, `*.swo`, `*~`, `*.log`, `*.zip`, `*.tar*`,
`*.bak`, `*.old`, `*.orig`, `*.rej`, `*.tmp`, `*copy*`, `*.dmp`, `*.png`, `*.jpg`, `*.pdf`
returned **zero matches**. Zero empty files. Zero empty directories. No `dist/` or build output on
disk. No `.vite`/cache directories outside `node_modules`.

`git log --all --name-only` confirms none of these classes — nor `node_modules`, nor a real `.env` —
has **ever** been committed. Pack size is 547.56 KiB across 129 objects; the largest blob in history
is `frontend/package-lock.json` (132 KB). The history is clean.

---

## 4. Dead code — exported symbols with no consumer

Method: 814 exported symbols were extracted from `frontend/src`, then each was counted across a
corpus of every repository file except `.git/` and `node_modules/`. Results were split three ways:
consumed by another module, used only inside its own file, or referenced nowhere but its definition.
The ten below are in the last group and were re-verified individually with ripgrep.

| Symbol | File | Note |
| --- | --- | --- |
| `ACTIVE_ORDER_STATUSES` | `frontend/src/utils/orderStatus.ts:11` | |
| `nextItemStatus` | `frontend/src/utils/orderStatus.ts:53` | |
| `parseAmount` | `frontend/src/utils/money.ts:30` | |
| `TENDER_METHODS` | `frontend/src/types/billing.ts:7` | Plausibly intentional API contract |
| `PERMISSION_LABELS` | `frontend/src/config/permissions.ts:114` | Plausibly intended for the roles UI |
| `EASE` | `frontend/src/config/motion.ts:40` | Design token set |
| `chartThemeFor` | `frontend/src/config/chartTheme.ts:170` | |
| `DECLARED_PAPER_ROUTES` | `frontend/src/config/surfaces.ts:191` | |
| `permissionsOf` | `frontend/src/services/api/mock/engine/auth.ts:175` | Thin wrapper over `userPermissions` |
| `userBranchIds` | `frontend/src/services/api/mock/engine/p2/branches.ts:17` | |

A further ~95 exported symbols are used only inside their own file. The large majority are
TypeScript `Props`/`type` exports from the shared component library (`BadgeProps`, `CardProps`,
`ModalProps`, `InputProps`, …) and `Db*` row shapes in the mock database — deliberate public surface,
not dead code. Four are components that `Shell.tsx` defines, exports and consumes itself
(`BranchSwitcher`, `NotificationBell`, `ThemeToggle`, `UserMenu`). **None was deleted.**

---

## 5. Duplicates

No duplicated implementations exist.

* No `.old`, `.bak`, `.orig`, `.copy` or `-copy` variant of any file exists anywhere in the tree.
* Cross-file symbol-name collisions were checked across all 814 exports. The only collisions are
  same-named *methods on different modules* — `listItems`/`saveItem`/`deleteItem`/`listCategories`/
  `saveCategory` in `mock/engine/menu.ts` (menu items) versus `mock/engine/p2/inventory.ts`
  (inventory items), and `dashboard` in `p2/inventory.ts` versus `engine/reports.ts`. These are
  distinct domains behind distinct module namespaces, both live, both imported by `mockClient.ts`.
  Not duplication.
* `frontend/.env` and `frontend/.env.example` are byte-identical, but that is the intended
  relationship (the example *is* the default configuration) and only the example is tracked.

---

## 6. Deleted

**Nothing.** No file in this repository met the deletion bar: unambiguous junk (OS/editor trash,
stray log, temporary artefact) *and* proved unreferenced by every check. The only file proved
unreferenced is the root `package-lock.json`, whose name is on the protected list, and which is
already untracked.

---

## 7. Recommended, not performed

| # | Item | Why it is a candidate | Why it was not done |
| --- | --- | --- | --- |
| R1 | Delete the root `package-lock.json` (90 B) | Empty stub with no corresponding root `package.json`; unreferenced by every check in row 1 of §3; the root `.gitignore` exists partly to hide it | `package-lock.json` is on the explicit do-not-delete list. It is untracked, so it never reaches a clone and removing it gains nothing. A human should confirm before removing. |
| R2 | Remove or wire up the 10 dead exports in §4 | Each is referenced only at its own definition | They are **source code**, which this audit does not delete. Several (`TENDER_METHODS`, `PERMISSION_LABELS`, `EASE`) look like deliberate contract or token surface rather than accidents; removing them is a design decision, not cleanup. |
| R3 | Commit the 26 untracked files (see H1) | They are real source, docs and scripts that a fresh clone would not receive | Committing is outside a cleanup audit's remit and changes project history. Flagged as the single most serious hygiene problem. |
| R4 | Link `docs/MANAGER_BOARDS.md` and `docs/REFERENCE_BOARDS.md` from `README.md` | Both are substantial deliverables that nothing points at | An additive documentation change, not a cleanup action. |
| R5 | Extend `.gitignore` coverage for `*~`, `*.swo`, `coverage/`, `*.tsbuildinfo`, `.vite/`, `desktop.ini` | Not currently covered by either ignore file | Additive change; no such files exist today, so it is preventative rather than corrective. |

---

## 8. Tracking hygiene

| ID | Finding | Severity |
| --- | --- | --- |
| H1 | **26 files exist on disk, are not ignored, and are not tracked.** A fresh clone would be missing `database/11_migration_loyalty_configure.sql`, three docs (`MANAGER_BOARDS.md`, `REFERENCE_BOARDS.md`, `REFERENCE_MAPPING.md` — the last of which `README.md` links), all six `frontend/scripts/*` files, and 16 `frontend/src` modules including all six `components/graphics/*`, `components/motion/index.tsx`, `components/ui/ReadOnly.tsx`, `components/layout/DashboardHero.tsx`, `config/motion.ts`, `config/surfaces.ts`, `config/workspace.ts` + its test, `hooks/useMediaQuery.ts`, `hooks/useSurface.ts` and `mock/engine/loyaltyPermissions.test.ts`. **A clone would not build** — tracked files import untracked ones directly: `components/ui/index.ts` → `ReadOnly.tsx`; `components/ui/Card.tsx` → `graphics/Indicators.tsx`; `features/dashboard/DashboardPage.tsx`, `features/cashier/CashierHomePage.tsx` and `features/waiter/WaiterHomePage.tsx` → `layout/DashboardHero.tsx`; `config/chartTheme.ts`, `features/auth/ProfilePage.tsx` and `features/billing/RoomChargesPage.tsx` → `hooks/useSurface.ts`. | **High** |
| H2 | 40 tracked files carry uncommitted modifications. | Medium |
| H3 | Root `package-lock.json` is an empty stub with no root `package.json` (ignored, so harmless in git; see R1). | Low |
| H4 | `.gitignore` does not cover `*~`, `*.swo`, `coverage/`, `*.tsbuildinfo`, `.vite/`, `desktop.ini`. No such files exist today. | Low |

**Nothing that should not be tracked is tracked.** Verified: `git ls-files -i -c --exclude-standard`
returns empty; no `node_modules`, `dist`, build output, cache, log, real `.env`, database dump, OS or
editor junk, nested archive or temporary screenshot appears in `git ls-files` or anywhere in
`git log --all --name-only`.

---

## 9. Root-level project files

| File | Present | Contents |
| --- | --- | --- |
| `.gitignore` | **Yes** (252 B) | See §10 |
| `.gitattributes` | No | — |
| `.editorconfig` | No | — |
| `LICENSE` | No | — |
| `CHANGELOG.md` | No | — |
| `CONTRIBUTING.md` | No | — |
| `SECURITY.md` | No | — |
| `.github/workflows/` | No | The `.github` directory does not exist; there is no CI workflow of any kind |

Also absent: `LICENCE`, `COPYING`, `CODE_OF_CONDUCT.md`, `.nvmrc`, and any ESLint or Prettier
configuration. *(None of these were created — this audit reports only.)*

---

## 10. Licence situation

Reported precisely; **no licence was added or changed.**

* **Licence file:** none. No `LICENSE`, `LICENSE.md`, `LICENCE`, or `COPYING` exists at the
  repository root or anywhere else in the tree.
* **`package.json` licence field:** `frontend/package.json` — the only `package.json` in the
  repository — has **no `license` key**. It declares `"name": "nexovo-pos-frontend"`,
  `"private": true`, `"version": "1.0.0"`. The root `package-lock.json` stub has no licence key
  either.
* **Copyright headers in source:** none. A case-insensitive search for `copyright`, `SPDX-License`,
  `MIT License`, `Apache License`, `GPL`, `All rights reserved` and `Proprietary` across every
  `.ts`, `.tsx`, `.sql`, `.css`, `.html`, `.mjs`, `.bat` and `.md` file in `database/`, `docs/`,
  `frontend/src/`, `frontend/scripts/`, `frontend/index.html`, `start.bat` and `README.md` returned
  **zero matches**.

**Net effect:** the project is currently unlicensed. `"private": true` prevents accidental npm
publication but grants no rights to anyone. Choosing a licence is the owner's decision.

---

## 11. `.gitignore` contents and coverage

### Root `.gitignore` (252 B, tracked)

```
# Dependencies and builds
node_modules/
dist/
*.local

# Env (keep .env.example)
.env
.env.*
!.env.example

# Logs and OS
*.log
.DS_Store
Thumbs.db

# Editor
.idea/
.vscode/
*.swp

# Accidental root lockfile (app lives in frontend/)
/package-lock.json
```

### `frontend/.gitignore` (50 B, tracked)

```
node_modules
dist
.env
.env.local
*.log
.DS_Store
```

### Coverage assessment

| Class | Covered? | By what |
| --- | --- | --- |
| `node_modules` | **Yes** | Both files |
| `dist` / build output | **Yes** | Both files |
| `.env` (real), while keeping `.env.example` | **Yes** | Root `.env` + `.env.*` with a `!.env.example` negation; `frontend/.gitignore` adds `.env`. Verified working: `frontend/.env` is ignored (`git check-ignore` → `frontend/.gitignore:3`) while `frontend/.env.example` is tracked. |
| Logs | **Yes** | `*.log` in both |
| OS junk | **Partly** | `.DS_Store` and `Thumbs.db` covered (root rules apply repo-wide); `desktop.ini` not covered |
| Editor junk | **Partly** | `.idea/`, `.vscode/`, `*.swp` covered; `*~` and `*.swo` not covered |
| Caches | **Partly** | `node_modules/` covers the Vite pre-bundle cache; a stray top-level `.vite/`, `.cache/`, `coverage/` or `*.tsbuildinfo` would **not** be ignored |
| Archives / dumps | **No** | `*.zip`, `*.dmp`, `*.sql` dumps are not ignored. No such file exists today. |

The `*.local` rule at the root additionally covers `*.env.local`-style files repository-wide.
