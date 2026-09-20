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
| G1 | Inventory dashboard, **360 px only** | 8 px of page-wide horizontal scroll (doc 368 px in a 360 px viewport). The card in the exception-list grid measures 352 px inside a 328 px track despite `min-width: 0` on the item and no fixed-width descendant | Does not occur at 390, 768, 1024 or 1440 px. Four probes narrowed it to a grid-track sizing quirk rather than any single element; closing it properly needs more time than the remaining defects warranted. Recorded rather than papered over with `overflow-x: hidden`, which would hide future real overflows |
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
| Page-level horizontal overflow | 39 routes × 390 / 768 / 1024 / 1440 px | **0** |
| Unnamed interactive controls | same | **0** |
| Inputs without an associated label | 39 routes | **0** |
| Last control reachable after scrolling to the end | 13 representative screens at 390 px | **13 / 13 pass** |
| TypeScript | whole project | **0 errors** |
| Tests | 8 files | **67 / 67 pass** |
| Production build | `tsc --noEmit && vite build` | **succeeds** |
| Clean-environment install | `npm ci` from committed manifests into an empty directory | **succeeds**, then typecheck + tests + build all pass there |

**Not verified:** interaction with a real on-screen keyboard, real printer output for the 80 mm
receipt, and behaviour on physical touch hardware. The touch-target rule is verified present in the
built CSS and correct by construction, but it has not been exercised on a device.
