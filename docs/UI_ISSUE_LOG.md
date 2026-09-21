# Nexovo POS — UI issue log

Every row was found by inspecting the running application in a real browser (headless Chromium
driving a production build), not by reading source. "Verified" means re-inspected in the browser
after the fix, at the viewport named.

Verification tooling, for reproducibility:
`npm run build` → `vite preview` → Playwright at 360 / 390 / 768 / 1024 / 1440 px, running three
automated probes — page-level horizontal overflow (ignoring intentional scroll regions), visible
ellipsis truncation, and unnamed interactive controls — plus an interaction probe that scrolls each
screen to the end and asserts the last control clears the bottom navigation and any sticky bar.

---

## A. Reported defects (from the supplied screenshots)

| # | Screen / viewport | Observed | User impact | Correction | Verified |
|---|---|---|---|---|---|
| A1 | Waiter home, 390 px | Metric labels truncated to "T…", "R…", "BI…"; the table-count explanation cut off | A waiter cannot act on a metric they cannot name; the floor count was unreadable mid-service | `StatCard` gained a mobile **row** variant below 420 px — label left (free to wrap), figure right, nothing truncated. Every StatCard grid that started at two columns now starts at one below `xs` | ✅ 390 px — "Tables in service / 4 / of 22 on the floor" reads in full |
| A2 | Waiter home, 390 px | Large greeting + primary action + tall empty state pushed operational content below the fold | The waiter scrolls before seeing anything actionable | Greeting compressed to one line sharing a row with "New order"; the ready-queue empty state reduced from a ~180 px block to a single line; ready rows sort oldest-plate-first and open orders surface a "still to send" banner | ✅ 390 px — ready queue and open orders both visible in the first screen |
| B1 | Roles & permissions, 390 px | Role panel extended past the right edge (page scrolled sideways, doc 538 px in a 390 px viewport) | Content unreachable; the page felt broken | Root cause was **grid/flex automatic minimum sizing**: `.card`, `.panel` and `.table-scroll` now carry `min-width: 0`, and every prefixed `grid-cols-[…1fr]` track became `minmax(0,1fr)`. The permission matrix scrolls inside its own region | ✅ 390 px — no page-level overflow; matrix scrolls in place |
| B2 | Roles & permissions, 390 px | The full role list stacked above the editor, pushing permission editing far down | Editing a role meant scrolling past eight list rows every time | Below `lg` the list became a one-line horizontally-scrollable chip selector with the selected role filled, ticked and `aria-current`; the `lg` master/detail pane is unchanged | ✅ 390 px |
| B3 | Roles & permissions | "1 users" | Sloppy; undermines trust in the data | Correct pluralisation ("1 user holds this role") | ✅ |
| B4 | Roles & permissions | Read-only, locked, editable and unsaved states were not distinguishable | An admin could not tell why an edit would not stick | Four explicit states: "Read-only for you", "Locked — cannot be edited", editable, and "Unsaved changes" with the diff named; per-module "Granted x of y" | ✅ |
| C1 | Settings, 390 px | The save bar sat on top of the bottom navigation | Navigation and save competed for the same pixels; one was always unusable | **One system, defined once**: `--app-bottom-nav` is set by the layout root (`.has-bottom-nav`) and collapses to 0 at `lg`; `.save-bar` is sticky at `calc(var(--app-bottom-nav) + 0.75rem)`; `main` uses `.pb-nav`. No screen matches padding to an offset by hand any more | ✅ 390 px — clear gap between save bar and tab bar |
| C2 | Settings, 390 px | No proof the last field was reachable | A field you cannot scroll to is a field you cannot fill | The bar is **sticky, not fixed**, and last in the flow, so it comes to rest below the final field. Proven by an interaction probe: scroll to the end, then assert the last control's bottom edge clears both the nav and the bar — 13 screens, all pass | ✅ 390 px, interactively |
| D1 | VIP tables | "Ordering" shown beside "Free tonight"; "Available" beside "Booked" | Two different facts rendered as one contradictory status — a host could seat a party onto an occupied table | Split into two labelled axes: **Current service** (table status + what is actually happening) and **Reservation for \<date\>** (the booking record). "Free tonight" is never inferred from a missing reservation | ✅ 390 px — "Current service: Ordering — an order is open on this table, not from a VIP booking" above "Reservation for 20 Sep 2026: No VIP booking taken" |
| D2 | Host desk, club dashboard | Same conflation in the VIP tiles and metrics; "VIP tables free" counted absence-of-booking as free | Misleading capacity figure at the door | Tiles now print a "Now: \<table status\>" line beside the reservation line; metrics relabelled "VIP tables booked" (booked/total) and "VIP bookings seated" | ✅ 390 px |
| E1 | Desktop header, 1440 px | Venue and branch names truncated to "The Saffron L… · Main Br…" despite empty space | The operator could not confirm which venue/branch they were acting in | The branch control's fixed `max-w-[16rem]` became responsive (13 → 22 → 32 rem) and now sits in a `flex-1 min-w-0` region instead of beside a spacer that ate the free width | ✅ 1440 px — "The Saffron Lounge · Main Branch" in full |

## B. Defects found by the browser audit (not reported, found by looking)

| # | Screen / viewport | Observed | User impact | Correction | Verified |
|---|---|---|---|---|---|
| F1 | Admin dashboard, 390 px | Page scrolled sideways (doc 416 px) | Content cut off at the right | Same `min-width: 0` root cause as B1 — a single `truncate` heading inside a card was widening the whole grid track | ✅ |
| F2 | Branches, 390 px | Page overflow (doc 487 px) | As above | As above | ✅ |
| F3 | Cashier home, 390 px | Page overflow (doc 484 px); amounts clipped to "₹2,…" | The cashier could not read what a table owed | As above | ✅ |
| F4 | Reservations, 390 px | 2 px of page-wide horizontal scroll | A stray scrollbar on every phone view | An `sr-only` span is `position:absolute` at its static position; on the last day of the week strip that landed past the viewport edge. Pinned with `left-0` inside a `relative` button | ✅ |
| F5 | VIP tables | Two icon-only buttons with no accessible name | A screen-reader user hears "button" and cannot tell edit from cancel | Named "Edit booking VIP-…" / "Cancel booking VIP-…" | ✅ — 0 unnamed controls across 39 routes × 4 widths |
| F6 | Everywhere, touch devices | Segmented controls, small buttons, icon buttons and table sort headers were 20–32 px tall | Below the 44 px touch minimum; mis-taps during service | A `.touch-target` utility raises them to 44 × 44 **only under `@media (pointer: coarse)`**, so desktop keeps its density | ✅ rule present in the built CSS; applied to SegmentedControl, `Button size="sm"`, `IconButton` and DataTable sort headers |
| F7 | Roles matrix | The matrix's `min-w-[520px]` table widened its whole grid column instead of scrolling | The page, not the table, scrolled sideways | `.table-scroll` now carries `min-width: 0` so the scroll container does what it is for | ✅ |

## C. Open — known and deliberately not closed

| # | Screen / viewport | Observed | Why it is open |
|---|---|---|---|
| ~~G1~~ | ~~Inventory dashboard, 360 px~~ | **CLOSED at its source.** The grid declared columns only at `lg`, so below that it fell back to an *implicit* `auto` track, which sizes to min-content and pushed the card to 352 px inside a 328 px container. A base `grid-cols-1` (`repeat(1, minmax(0,1fr))`) fixes it. Applied to all 36 files carrying the same pattern. Verified: 0 overflow at 360 px across 39 routes. No `overflow-x: hidden` was used anywhere |
| G2 | Cashier lists, kitchen board, 360–390 px | Secondary meta lines truncate ("BILL-20260920-0001 · 11:35 AM · …") | The identifying part (bill/order number) is always first and complete; the truncated tail is a repeat of information shown elsewhere in the row. Acceptable under the brief's "truncation only when the full value remains practically accessible" |

## D. Needs product scope, not design work

These were **not** built. Each needs new endpoints, schema, or persisted state, so a UI for them
would be a control that cannot work.

| Item | What is missing |
|---|---|
| Split bill / per-seat settlement | No endpoint for splitting a bill or assigning items to seats |
| Self-service password change | Only `PUT /users/:id/password` exists and it asserts `users:manage`; a waiter cannot change their own password. Profile says so plainly instead of showing a control that would 403. Needs `auth:change-own-password` |
| "Sign out everywhere" | Sessions are revoked only as a side effect of deactivating an account |
| Drag-and-drop ordering that persists | Only categories have a reorder endpoint (kept and made index-safe). Floors, menu items and offers have none |
| Waitlist | No waitlist entity |
| Dietary / allergen data | Not in the menu schema |
| Bulk availability, bulk serve, bulk user actions | Only single-item mutations exist; a loop has no partial-failure story |
| Claim / snooze / assign on the cashier queue and live board | Needs a server-side field to persist the claim |
| Period-over-period deltas on any report | No comparison window is fetched. `StatCard.delta` is therefore used nowhere |
| Server-side audit filtering by actor or action | `GET /audit-logs` accepts only `entity`, `from`, `to`, `page`, `pageSize`; the narrowing controls are labelled as page-local |
| Offline operation / queued sync | Not implemented; claiming it would be false |
| Room-charge folio state inside the payment panel | The post endpoint returns only the `Bill` |

---

## Verification summary

| Check | Scope | Result |
|---|---|---|
| Page-level horizontal overflow | 39 routes × 360 / 390 / 768 / 1024 / 1440 px | **0** |
| Unnamed interactive controls | same | **0** |
| Text below its WCAG AA contrast threshold | 22 routes, every visible text node measured against its painted background | **0** |
| Inputs without an associated label | 39 routes | **0** |
| Last control reachable after scrolling to the end | 13 representative screens at 390 px | **13 / 13 pass** |
| TypeScript | whole project | **0 errors** |
| Tests | 8 files | **67 / 67 pass** |
| Production build | `tsc --noEmit && vite build` | **succeeds** |
| Clean-environment install | `npm ci` from committed manifests into an empty directory | **succeeds**, then typecheck + tests + build all pass there |

**Not verified:** interaction with a real on-screen keyboard, real printer output for the 80 mm
receipt, and behaviour on physical touch hardware. The touch-target rule is verified present in the
built CSS and correct by construction, but it has not been exercised on a device.

## E. Dark-theme redesign pass — defects found and closed

| # | Screen / viewport | Observed | Correction | Verified |
|---|---|---|---|---|
| H1 | Dashboard and every money figure | `₹1,890.5`, `₹341.9` — one decimal, which reads as a truncated number and never matches a receipt | `money()` now prints both decimals whenever an amount has a fractional part; whole amounts stay compact; `{decimals:true}` still forces the full form. Abbreviated axis labels stay in `compactMoney`, a separate function | ✅ `₹1,890.50`, `₹341.90` at 1440 px |
| H2 | Reports, single-observation ranges | One lone bar spanning the plot read as a rendering fault | Every bar capped with `maxBarSize`; a range with exactly **one** observation now states the figure in a labelled block instead of drawing a chart; zero keeps its empty state | ✅ |
| H3 | Settings, all widths | A permanent "No unsaved changes." panel occupied a whole band with two dead controls | The save bar only exists while the form is dirty or has errors | ✅ 390 px |
| H4 | Whole app, 22 routes | 26 text nodes below WCAG AA — all of them `neutral-400` (#6B7682, 3.96:1) carrying separators, counts and muted labels | The token moved to `#7E8892` (5.1:1 on a card) rather than 26 call sites | ✅ browser-measured: no text below AA |
| H5 | Engine test suite | `workflow.test.ts` failed between 16:00 and 19:00 local — the seed carries a real 16:00–19:00 happy hour, so service charge came out 53 instead of 57.5 | The **test** was wrong, not the engine: the clock is now pinned to a fixed 11:00 before the seed is built. The expectation was not altered | ✅ passes at any time of day |
| H6 | Tooltip, scrims, sidebar, several chips | Inverting the neutral ramp turned `bg-neutral-900 text-white` into white-on-white and `bg-neutral-900/60` scrims into near-white veils | Found by sweeping every file for light-only classes; tooltip, both dialog scrims, sidebar chrome, notification badge and the POS cart launcher rebuilt on surface tokens | ✅ |
| H7 | Several grid tracks | Bare `1fr` on prefixed grids (`lg:grid-cols-[1fr_320px]`) let a wide table widen its column instead of scrolling | Converted to `minmax(0,1fr)` | ✅ |
| H8 | VIP cards | `border-warning-400` / `border-info-300` — rungs that do not exist in the ramp, so those borders rendered nothing | Rebuilt on the VIP language with real rungs | ✅ |


---

## D. Found by the ten-combination sweep (this cycle)

810 route inspections — six roles, 81 routes, 360/390/768/1024/1440 × dark/light. Full record in
`docs/VERIFICATION.md`.

| # | Screen / viewport | Observed | User impact | Correction | Verified |
|---|---|---|---|---|---|
| V1 | Every dark-declared route, LIGHT theme | Gold text at 3.31:1 on charcoal | **The theme toggle did not win.** A dark-declared route kept a `.chrome-dark` island under the light theme, so operational screens stayed black in light mode while light-theme tokens painted on them | `surfaceClass` now only ever returns `chrome-light`, and only under the dark theme | ✅ light@1440, and 3 unit tests |
| V2 | 6 screens, 390 px | 14 page overflows; documents up to 457 px | The page scrolled sideways on a phone | The page-head action slot was `shrink-0`, making its max-content width the page's floor. Now `min-w-0` in `DashboardHero` and `PageHeader` | ✅ 390 px |
| V3 | Every screen with a date filter | 9 px overflow | As above | A nested row inside `DateRangeFilter` had no `min-w-0` | ✅ 390 px |
| V4 | Cashier screens, 1024 px | Document 1065 px | Sideways scroll on a tablet | The header's right group was `shrink-0`, so the POS inline nav could not compress. The nav now yields; identity and status controls stay fixed | ✅ 1024 px |
| V5 | Purchase-order detail, 768 px | Document 772 px | 4 px sideways scroll | A full-bleed sticky bar used `sm:-mx-6` against a 20 px gutter. Margins now match `p-4 sm:p-5 lg:p-6`; offset corrected from the old 64 px header to 60 px | ✅ 768 px |
| V6 | Ivory workspaces | `neutral-400` at 4.43:1 on real text | Under AA by seven hundredths | Darkened to 4.70:1 | ✅ both themes |
| V7 | Floors (manager) | Area names unmeasurable over a gradient scrim | A surface nobody can measure is one nobody can defend | Solid `bg-neutral-950/95` caption band. NOTE: `/92` is not on Tailwind's opacity scale and is dropped silently | ✅ |
| V8 | Billing engine (not visual) | A by-id lookup carried no branch predicate, so another branch could read — and take payment against — a bill | **Cross-branch write.** Isolation was enforced on list paths only | `findBill`, `findOrder`, `getTable`, `getItem` are branch-scoped and answer 404 | ✅ 2 engine tests |

### Still open

| # | Screen / viewport | Observed | Why it is open |
|---|---|---|---|
| O1 | Roles & permissions, 360 and 390 px | `document.scrollWidth` 436 in a 390 px viewport | Every candidate element is inside a genuine scroll region and nothing is visibly outside the viewport — the 46 px belongs to a scroll container that is growing instead of scrolling. `min-w-0` on the page root, `w-full min-w-0` on the chip row, and removing its negative margin all failed to move it. Not reproduced at 768 px and above; no content is unreachable. Left open and measured rather than hidden with `overflow-x: hidden` |
