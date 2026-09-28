# Route checklist — luxury redesign

Every route the router declares, the roles that can reach it, what the luxury pass changed, and
the honest state of verification. **Legend for the last column:** `R` = redesigned in this pass,
`K` = kept (already on the system, read in full, no change needed), `–` = not a screen.
**Verification** (25-09-2026, final code): every route below compiled (tsc 0), built, and passed
the automated audit — `audit` = 0 overflow, 0 contrast failures and 0 unnamed controls in both
themes at 360, 390, 768, 1024 and 1440 px; `shots` = captured before/after in both themes at 1440
and 390 px (`screenshots/`); `e2e` = driven end to end by `scripts/e2e-flows.mjs` and checked
against the database. All against the in-browser demo backend.

The "Concept element not drawn" column lists what the concept images show that the code has no
backing for. Those are omissions on purpose, not gaps: drawing them would be fabricating a
capability (§7 of the brief).

## Public

| Route | Permission | Screen | Change | Concept element not drawn | Verified |
|---|---|---|---|---|---|
| `/login` | — | Login | R — full-bleed drawn room with light-reveal, floating glass card, serif "Welcome back", no authenticated navigation | Google/Microsoft sign-in (no OAuth), venue name before sign-in (unauthenticated), the sidebar the concept draws behind the login | audit · shots · **e2e: sign-in** |
| `/forgot-password` | — | Forgot password | R — serif heading, same card language | — | audit · shots |
| `/menu/:branchCode/:tableCode/*` | — (opaque table code) | Guest QR menu | R — serif venue name once, sticky category chips, featured dish card per section, compact rows, bronze-hairline offer card; "Menu unavailable" error kept for a bad code | Menu/Food/Drinks/Search bottom nav (no routes); a featured card that switches with the chip (chips are scroll-to, not tabs) | audit · shots |
| `*` | — | Not found | R — tile, one serif line, two real actions | — | audit · shots |

## Admin / manager shell (`/admin`, `/manager`, `/host`)

Workspace appearance is derived from the signed-in role (`workspaceForRoles`), never the URL. A
manager on an `/admin/*` route gets the manager surface overlay; an admin never does.

| Route | Permission | Screen | Change | Concept element not drawn | Verified |
|---|---|---|---|---|---|
| `/admin` | `dashboard:view` | Overview dashboard | R — sales total printed final (CountUp removed from money), serif title | — | audit · shots |
| `/manager` | `dashboard:view` | Manager command centre | R — venue banner behind serif "Good evening, …" (`DashboardHero venue=`), sales total printed final | "Guests in venue 124/180" (no live headcount endpoint), "Bottle service ₹" tile (no per-period bottle report) | audit · shots |
| `/manager/live` | `orders:view:all` | Live orders | K | — | audit · shots |
| `/admin/orders` | `orders:view:all` | Orders list | K | — | audit · shots |
| `/admin/orders/:id` | `orders:view` | Order detail | R — items card is the bronze hero, total in `text-metric tnum`, VIP badge corrected to violet | — | audit · shots |
| `/admin/tables` | `tables:view` | Tables / floor | R — sunken plan ground, VIP chip (violet), selected VIP booth `shadow-vip` + violet edge, detail panel bronze only when VIP | Booth photography | audit · shots |
| `/admin/floors` | `tables:manage` | Floors & areas | K — already leads with `VenueArt` | — | audit · shots |
| `/admin/qr` | `qr:view` | QR codes | R — base `grid-cols-1`, print sheet hex removed | — | audit · shots |
| `/admin/menu/items` | `menu:view` (+`menu:manage` to create, `menu:availability` to toggle) | Menu items | R — hover, bronze rule under picture, description shown, price in ink | Photographs (records without `imageUrl` draw `DishArt`) | audit · shots |
| `/admin/menu/categories` | `menu:view` | Categories | R — `CategoryGlyph` tile, gloss on admin grid | — | audit · shots |
| `/admin/offers` | `offers:view` | Offers | R — `tnum`, gloss on manager card | Offer imagery (no image field) | audit · shots |
| `/admin/inventory` | `inventory:view` | Inventory dashboard | K | — | audit · shots |
| `/admin/inventory/items` | `inventory:view` | Inventory items | R — category chips, 36 px bronze-framed thumb (`BottleArt`/`DishArt`), `tnum`, `StatusBadge` | Chip counts (server-filtered list; no second fetch invented); "Low stock" column (kept `Reorder at`) | audit · shots |
| `/admin/inventory/items/:id` | `inventory:view` | Inventory item | R — bronze hero card with drawn picture | — | audit · shots |
| `/admin/inventory/movements` | `inventory:view` | Stock movements | K | — | audit · shots |
| `/admin/recipes` | `recipes:view` | Recipes | R — dish thumb, costing columns `tnum` | — | audit · shots |
| `/admin/recipes/:menuItemId` | `recipes:view` | Recipe editor | R — bronze hero, `tnum` costs | — | audit · shots |
| `/admin/suppliers` | `suppliers:view` | Suppliers | R — ledger `tnum`, sr-only actions header | "Suppliers / Purchase orders / Items" tab bar (three routes, three permissions) | audit · shots |
| `/admin/suppliers/:id` | `suppliers:view` | Supplier account | R — bronze hero with outstanding balance | — | audit · shots |
| `/admin/purchases` | `purchases:view` (+`approve`/`receive`) | Purchase orders | R — lifecycle chips with the REAL counts, supplier avatar, selected-PO summary card with one gold next step (Approve / Receive goods, behind their permissions) | Per-status counts the page does not compute; row checkboxes (no bulk action) | audit · shots |
| `/admin/purchases/new` | `purchases:manage` | New purchase order | R — summary card language | — | audit · shots |
| `/admin/purchases/:id` | `purchases:view` | Purchase order | R — document summary card, total large, `tnum` | — | audit · shots · **e2e: purchasing** |
| `/admin/customers` | `customers:view` | Guests | R — violet chip only for the guest's own `vip` tag | Guest photos | audit · shots |
| `/admin/customers/:id` | `customers:view` | Guest detail | R — bronze identity slab, VIP chip once | Member-since / visit history (no fields) | audit · shots |
| `/admin/loyalty` | `loyalty:view` / `manage` / `configure` | Loyalty | R — bronze membership card, `money()` everywhere, member ops and program config visibly separate with their separate gates | — | audit · shots |
| `/admin/reservations` | `reservations:view` | Reservations | R — concept reservation card below `xl` (guest, VIP chip when the booked table is VIP, facts grid, notes, existing actions) | Reschedule / call / message / preferences / guest history (no fields or handlers) | audit · shots · **e2e: reservation** |
| `/admin/club` | `club:view` | Club dashboard | R — venue hero, VIP chip in place of crown | — | audit · shots |
| `/admin/vip` | `vip:view` | VIP floor | R — sunken plan, booth shapes, violet VIP chip, selected booth `shadow-vip`, spend meter via `ProgressMeter`, bronze selected-table card | "Table since 20:15" (no seated-at field); "View order" is the existing Details/Open order | audit · shots |
| `/admin/bottle-service` | `club:view` (+`club:manage`) | Bottle service | R — bronze cards, tall `BottleArt`, size line, price `tnum`, stock dot + text, full-width edit action | Spirit-category chips (no category field), vintage (no field), "Add to order" (this admin page has no order-entry handler) | audit · shots |
| `/admin/room-charges` | `room-charge:post` | Room charges | K | — | audit · shots |
| `/admin/reports` | `reports:view` | Reports | K — already `StatCard` with real series, `useChartTheme`, real CSV export, no CountUp | Categories / Customers tabs (no such report on this endpoint) | audit · shots |
| `/admin/reports/advanced` | `reports:advanced` | Advanced reports | K | — | audit · shots |
| `/admin/users` | `users:view` (+`users:manage`) | Users | R — `StatusDot` + word, `tnum`, champagne native checkboxes in the form | Users/Roles as one tabbed page | audit · shots · **e2e: permission wall** |
| `/admin/roles` | `roles:view` | Roles & permissions | R — matrix on the shared `Checkbox`, **narrow-width overflow cause found and fixed** (see §8 record) | View/Create/Edit/Delete columns (catalogue is View/Manage + named actions) | audit · shots |
| `/admin/audit` | `audit:view` | Audit log | K | — | audit · shots |
| `/admin/settings` | `settings:view` (read-only without `settings:manage`) | Settings | R — hand-written ₹ → `money()`; read-only banner/field pattern untouched | — | audit · shots |
| `/admin/branches` | `branches:view` (read-only without `branches:manage`) | Branches | R — bronze hairline on the one hero card | — | audit · shots |
| `/admin/notifications` | `notifications:view` | Notifications | K | — | audit · shots |
| `/admin/more` | — | More | K | — | audit · shots |
| `/profile` | — | Profile | K | — | audit · shots |
| `/host` | `reservations:manage` or `club:manage` | Host desk | R — venue banner with the room name in serif, per-area "8 / 14 available", arrivals table ≥ `md` / cards below, VIP chips, existing Seat action | Arrivals/In-house/Waitlist tabs (no waitlist), "Check in" (no reservation-level check-in transition) | audit · shots |

## Waiter shell (`/waiter`)

| Route | Permission | Screen | Change | Concept element not drawn | Verified |
|---|---|---|---|---|---|
| `/waiter` | `orders:create` | Waiter home | R — pass-queue wait as a tone chip | — | audit · shots |
| `/waiter/tables` | `tables:view` | Tables | K | — | audit · shots |
| `/waiter/tables/:tableId` | `orders:create` | Order entry | R — image tiles (`ItemImage`/`DishArt`), gold "+", bronze order panel, quantity badges, `anim-enter` on new lines keyed by id, totals printed final, one gold "Send to kitchen & bar" (label data-derived), "Table · N covers" | Service charge / Total in the cart (applied on the bill), order-level note (notes are per line), header table selector (chosen on `/waiter/tables`) | audit · shots · **e2e: order entry** |
| `/waiter/orders` | `orders:view` | My orders | R — readiness chip | — | audit · shots |
| `/waiter/orders/:id` | `orders:view` | Order detail | R (shared with admin) | — | audit · shots |
| `/waiter/ready` | `orders:view` | Ready to serve | R — one tone chip (clock + word) | — | audit · shots |
| `/waiter/more` | — | More | K | — | audit · shots |

## Cashier shell (`/cashier`)

| Route | Permission | Screen | Change | Concept element not drawn | Verified |
|---|---|---|---|---|---|
| `/cashier` | `billing:view` | Settlement queue | R — bronze hero queue card, gold only on "Take payment" rows | — | audit · shots |
| `/cashier/bills` | `billing:view` | Unpaid bills | R — gold "Take payment", outline "Open bill" | — | audit · shots |
| `/cashier/paid` | `billing:view` | Paid bills | R (same component) | — | audit · shots |
| `/cashier/tables` | `billing:view` | Tables | R — surface wash on "ready to settle" lane | — | audit · shots |
| `/cashier/orders/:orderId/bill` | `billing:create` | Generate bill | R — hero bill card, `tnum` lines, totals | "Dine in" chip on a bill (no `orderType` on `Bill`) | audit · shots · **e2e: billing** |
| `/cashier/bills/:id` | `billing:view` | Bill | R — as above; gold "Take payment · ₹" | Email receipt / More options (no handlers) | audit · shots |
| `/cashier/bills/:id/pay` | `billing:pay` | Payment | R — tender ROWS for exactly the seven existing methods, selected row `shadow-vip` + champagne edge, gold "Take payment · ₹", `SuccessMark` only on confirmed success | Gift card / House account (not payment methods), Full amount / Split bill segmented control (no allocation model), amounts on unselected tenders | audit · shots · **e2e: billing** |
| `/cashier/bills/:id/receipt` | `billing:view` | Receipt | R — pending `Alert`, paper on a sunken desk; print stylesheet untouched | — | audit · shots · **e2e: billing** |
| `/cashier/more` | — | More | K | — | audit · shots |

## Display shells

| Route | Permission | Screen | Change | Concept element not drawn | Verified |
|---|---|---|---|---|---|
| `/kitchen` | `kitchen:view` | Kitchen board | R — obsidian in both themes, column heads with 3 px tone rule + count, tickets with left rule, elapsed chip (amber past warn, red past late), full-width gold "Start preparing" / emerald "Mark ready", `anim-enter-soft` keyed by ticket id | "N covers" on tickets (no guest count on `Ticket`), kebab menu (no handler), progress bar (no per-ticket progress) | audit · shots · **e2e: preparation** |
| `/bar` | `bar:view` | Bar board | R — same board | All/Kitchen/Bar cross-station chips (a board is fed by one station) | audit · shots |

## States covered on every screen

Loading (`LoadingState`/`Skeleton`), empty (`EmptyState` with the drawn illustrations), error
(`ErrorState` with retry), permission-denied (`PermissionGate` → wall), read-only
(`ReadOnlyBanner`/`ReadOnlyField` on settings and branches without the manage permission),
dialogs (`Modal`/`Drawer`/`ConfirmDialog`, focus-trapped, labelled), forms (shared `Input`/
`Select`/`Textarea`/`Checkbox`/`Switch`, every field labelled). None of these components changed
their API in this pass; their palette comes from the tokens.

## §8 investigation record

| Issue reported | Cause found | Fix | Where recorded |
|---|---|---|---|
| Guest QR page showing "Menu unavailable" in the screenshot archive | The capture script opened `/menu/MAIN/T1`. A table's public code is an opaque `stableCode(...)` hash, so the app correctly refused an invented code. **Screenshot-process bug, not an app or seed bug.** | `capture-screens.mjs` now signs in, reads the first real `/menu/...` link off `/admin/qr`, and captures that | `frontend/scripts/capture-screens.mjs` (`resolveGuestMenuUrl`) |
| Dark-mobile captures showing light surfaces | A deliberate `PHONE_SURFACE = PAPER_SHELL` rule painted the whole management shell ivory below `lg` in the dark theme (an earlier board drew phones that way). **App bug.** | Rule removed; a route's surface holds at every width and the theme toggle wins | `frontend/src/config/surfaces.ts`, `frontend/src/hooks/useSurface.ts` |
| Roles page ~436 px document width at ≤ 390 px with nothing visibly overflowing | Tailwind's `sr-only` is `position: absolute`; the `.table-scroll` wrapper was unpositioned, so the sr-only spans inside the 760 px permission matrix took their containing block from outside the scroller, escaped its clip and sat at their static x-offset (~430 px) in the unscrolled table, widening `document.scrollWidth`. Explains the fixed 436 at both 360 and 390, the 1×1 px invisible boxes, and the immunity to the three earlier `min-w-0` fixes. **App bug (layout).** | `position: relative` on `.table-scroll` (product-wide) and on the roles chip row, so the spans are clipped with the table. No `overflow-x-hidden`. | `frontend/src/styles/index.css`, `frontend/src/features/users/RolesPage.tsx` |

The third diagnosis is now confirmed: `/admin/roles` measures 0 overflow at 360 and 390 px in both themes.

A second cause for the QR symptom turned up in the final review: after the first fix, the capture
script picked the first link containing `/menu/`, which was the sidebar's `/admin/menu/items`. A
signed-out browser sent there lands on /login. The script now accepts only paths that start with
`/menu/<branch>/<code>`, and the guest menu is captured correctly in both themes.

## Outstanding

Done and measured on the final code: compile, 156 tests, build, the 810-check audit, 388
before/after screenshots and 7 end-to-end flows (`docs/VERIFICATION.md` §0).

Still open:

- **Motion has not been watched on a device.** The login light reveal, add-to-order, ticket change
  and payment confirmation are timed in code, and they collapse under `prefers-reduced-motion`,
  but screenshots are still frames.
- **Real devices.** Every width was emulated in headless Chromium; no iOS or Android handset,
  touch screen or on-screen keyboard was used.
- **Serif font offline.** Cormorant Garamond loads from Google Fonts with a Georgia fallback; it
  is not bundled locally.
- **Concept elements with no backing** stay omitted (listed per route above), not built.
- **Backend.** Everything here ran against the in-browser demo backend. Oracle/ORDS, payment
  providers, PMS and printers are unverified.
