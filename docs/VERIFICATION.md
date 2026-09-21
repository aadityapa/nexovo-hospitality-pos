# Verification record

Everything below was executed. Where something was **not** run, it says so and why — an
unverified claim is worse than an absent one.

Environment: Node 22.23.2, a clean `npm ci` from the committed `frontend/package-lock.json`,
headless Chromium (Playwright, installed ad hoc — it is deliberately **not** a project
dependency).

---

## 1. Build gate

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit 0**, no diagnostics |
| Unit / engine tests | `npx vitest run` | **156 passed / 156**, 11 files |
| Production build | `npx vite build` | **exit 0** |

> Read the exit code, not the log. `npx vite build \| tail -3 && echo OK` reports the exit status
> of `tail`, so a failing build prints "OK" and the next measurement silently runs against the
> previous bundle. That happened twice during this work and cost two rounds of wrong conclusions.

### Test files

| File | Cases | Protects |
|---|---|---|
| `services/api/mock/engine/productionBehaviour.test.ts` | 60 | Auth, cross-module authorisation, branch isolation, order transitions, stock reversal, rounding, discount caps, split payments, idempotence |
| `services/api/mock/engine/phase2.test.ts` | 19 | Inventory, purchasing, CRM, reservations, club |
| `services/api/mock/engine/loyaltyPermissions.test.ts` | 17 | The `loyalty:configure` boundary, both directions |
| `services/realtime/realtime.test.tsx` | 14 | Connection lifecycle, sync vs business event |
| `config/workspace.test.ts` | 11 | The admin/manager presentation boundary; multi-role accounts |
| `services/api/mock/engine/regressions.test.ts` | 9 | The three historical functional defects |
| `utils/orderStatus.test.ts` | 7 | Derived status, mirroring `ORDER_PKG.derive_status` |
| `utils/billing.test.ts` | 6 | Bill arithmetic and rounding modes |
| `services/api/mock/engine/workflow.test.ts` | 5 | Order → kitchen → bill happy path |
| `features/billing/vipShortfall.test.tsx` | 4 | VIP minimum-spend shortfall, rendered |
| `utils/offers.test.ts` | 3 | Offer selection |

---

## 2. Responsive, contrast and accessible-name sweep

`frontend/scripts/verify-themes.mjs` against the production build: six roles, **81 routes per
combination**, ten combinations — **810 route inspections**. Each route is checked for
page-level horizontal overflow (ignoring genuine scroll regions), every visible text node's real
WCAG 2.1 contrast against its actually-painted background, and interactive controls with no
accessible name.

| Theme | 360 | 390 | 768 | 1024 | 1440 |
|---|---|---|---|---|---|
| dark | 1 / 0 / 0 | 1 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| light | 1 / 0 / 0 | 1 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

*(overflow / contrast / unnamed controls)*

**Contrast: 0 failures in all ten combinations. Unnamed controls: 0 in all ten.**
**Overflow: one route, `/admin/roles`, at 360 and 390 px — see §5.**

### The probe was wrong twice, and both were fixed

A measurement tool that reports false failures is worse than none: it trains you to skim the list
the real failure is in. Two defects were found in the audit itself and corrected:

1. **SVG text is painted by `fill`, not `color`.** Reading `color` on an `<svg><text>` returns
   whatever tone the parent `<svg>` carries for its strokes — which reported a near-black table
   number inside a green-stroked table shape as green-on-white at 2.62:1.
2. **A gradient has no `background-color`.** Walking past it reported the card *behind* a
   picture, so white text on a dark scrim measured as white-on-white at 1.00:1. The probe now
   parses the gradient's own colour stops and takes the most opaque one; only a gradient made
   entirely of near-transparent stops (a gloss) is skipped, and anything genuinely unmeasurable is
   counted in its own bucket rather than passed or failed.

`frontend/scripts/explain-contrast.mjs` was added to name the element behind a failure, because
"a bare `1` at 2.62:1" is not enough to fix anything.

---

## 3. Real defects the sweep found and closed

| # | Found | Cause | Fix |
|---|---|---|---|
| V1 | `/admin/reports` light theme, gold text at 3.31:1 | **The theme toggle did not win.** `surfaceClass` returned `chrome-dark` for a dark-declared route under the light theme, so every operational screen stayed charcoal in light mode while light-theme tokens painted on it | Islands are now only ever `chrome-light`, only under the dark theme. Locked by 3 tests |
| V2 | 14 overflows across 6 screens at 390 px | The page-head action slot was `shrink-0`, making its max-content width a floor the page could not go under (457 px in a 390 px viewport) | `min-w-0` on the slot in `DashboardHero` and `PageHeader`. Six local `max-w-[13rem]` workarounds became unnecessary |
| V3 | 9 px overflow on every screen mounting the date filter | A nested row inside `DateRangeFilter` had no `min-w-0` | Added |
| V4 | `/cashier/*` 1065 px document at 1024 px | The header's right-hand group was `shrink-0`, so the POS inline navigation could not compress | The group is `min-w-0`; identity and status controls stay `shrink-0`; the navigation yields, because below `lg` it has somewhere else to live |
| V5 | `/admin/purchases/1` 772 px at 768 px | A full-bleed sticky bar used `sm:-mx-6` against a 20 px gutter — 4 px too much each side. Its `top-16` was also the old 64 px header | Margins match the real `p-4 sm:p-5 lg:p-6` gutter; offset is `top-[60px]` |
| V6 | `neutral-400` at 4.43:1 on ivory | Under AA by seven hundredths, on real text | Darkened to 4.70:1 |
| V7 | Area names unmeasurable over a gradient | A fade cannot be measured or defended | A solid `bg-neutral-950/95` caption band. `/92` is not on Tailwind's opacity scale — that class is dropped silently, which is how the first attempt appeared to change nothing |

---

## 4. Branch isolation — a real gap, found and closed

The production-behaviour suite found that **isolation was enforced on list paths only**.
`findBill`, `findOrder`, `getTable` and `getItem` looked a row up by id with no branch predicate.
Because `addPayment`, `addDiscount` and `reversePayment` all resolve their bill through
`findBill`, a cashier signed in to branch 2 who knew a branch-1 bill id could **take money against
another branch's bill**. The dispatcher checked only that the caller *may use the branch they
claim*; nothing re-checked that the row belonged to it.

All four lookups now carry the predicate, and the response is **404, not 403** — a caller with no
business seeing a row should not learn from the error that it exists. Two tests pin it: one for
the reads, one for the writes, asserting the bill is byte-identical afterwards.

Filtering the list and trusting the id on the write is the classic shape of this bug, and it is
worth checking for wherever a by-id helper exists.

---

## 5. Open — known, measured, not closed

| # | Screen | Measurement | Status |
|---|---|---|---|
| O1 | `/admin/roles` at 360 and 390 px | `document.scrollWidth` = 436 in a 390 px viewport | **Open.** Every candidate element is inside a genuine scroll region — the permission matrix's `.table-scroll` and the role chip row — and nothing is visibly outside the viewport. The 46 px belongs to a scroll container that is itself growing rather than scrolling. `min-w-0` on the page root, `w-full min-w-0` on the chip row and removing its negative margin did not resolve it. Not reproduced at 768 px and above, and no content is unreachable |

---

## 6. Admin preservation

A baseline of 20 admin routes was captured **before** any shared-component work
(`outputs/admin-baseline/`, hashed).

**md5 is the wrong instrument here** and that was established empirically rather than assumed:
capturing twice from *identical* code showed five screens differ run to run, because they embed
the wall clock (relative times, "busiest hour", "2 minutes ago"). Two more were later shown to
drift the same way and were compared image-to-image instead — identical in layout, tiles, charts,
copy and legends; only `Peak 12:00 → 13:00` and the hourly bar bucket move.

**Result at the point the manager boards landed: 19 of 20 admin screens unchanged.** The single
genuine difference was `/admin/roles`, where the permission matrix now offers `loyalty:configure`
— required by the approved split, not a regression.

**Admin pixels did change afterwards, deliberately**, through the shared fixes in §3: the darker
`neutral-400` (V6), the shrinkable page-head action slot (V2), the shrinkable header group (V4)
and `min-w-0` on the roles root. These are accessibility and overflow corrections that §14 of the
brief requires; they are not restyling, and no admin composition, control, copy or colour intent
was altered.

---

## 7. NOT RUN — do not infer these

| Area | Status |
|---|---|
| **Oracle / ORDS integration** | **NOT RUN.** No Oracle instance was available. The SQL was edited and reviewed but never executed. Nothing about the PL/SQL packages, the router or the migration has been proven against a database |
| `database/11_migration_loyalty_configure.sql` | **NOT EXECUTED.** Written to be idempotent with a reporting block and a rollback, reviewed, never run |
| Physical thermal printing (80 mm) | **NOT VERIFIED.** No printer |
| Touch hardware, on-screen keyboards | **NOT VERIFIED.** Touch targets were checked by rule (`.touch-target` under `pointer: coarse`), not on a device |
| External payment providers | **NOT VERIFIED.** No provider is integrated; the payment engine is the mock backend |
| PMS / room-charge posting | **NOT VERIFIED.** No PMS |
| Real-device browsers (iOS/Android) | **NOT VERIFIED.** All measurement was headless Chromium at emulated widths |
| Load, concurrency, long-run stability | **NOT TESTED** |

---

## 8. Reproducing this

```bash
cd frontend
npm ci
npm run typecheck
npm test
npm run build

# the browser sweep (Playwright is not a dependency — install it ad hoc)
npm i -D playwright && npx playwright install chromium
npx vite preview --port 4173 --host 127.0.0.1 &
node scripts/verify-themes.mjs dark 1440 900      # repeat for light, and 360/390/768/1024
node scripts/explain-contrast.mjs waiter1 light /waiter/tables "rgb(18, 183, 106)" '^[0-9]$'
```
