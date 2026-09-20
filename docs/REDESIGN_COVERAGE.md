# Nexovo POS — redesign coverage checklist

Status of every route, dialog and role surface after the redesign, the completion pass, the
workflow pass, and the final art-direction + defect pass.

**Four distinct states — do not read one as another**

| State | Meaning |
|---|---|
| **Implemented** | The code is written and the screen has screen-specific layout, hierarchy, filters, actions and states. |
| **Checked** | Covered by automated checks that actually ran: TypeScript, Vitest, production build. |
| **Visually inspected** | Loaded in a real browser and looked at, at the viewport named. |
| **Interactively verified** | Driven in a real browser — scrolled to the end, controls measured against the nav and sticky bars. |

**Current status: every screen is Implemented and Checked. All 39 routes are Visually inspected at
390 / 768 / 1024 / 1440 px; 13 representative screens are Interactively verified for
scroll-to-end reachability.** Remaining unverified areas are named at the end.

Defect evidence, root causes and the open list live in `docs/UI_ISSUE_LOG.md`.

**Coverage legend**

| Code | Meaning |
|---|---|
| **S** | **Shared styling only** — inherits tokens and shared components, no screen-specific work. Token changes alone never count as a redesigned screen. |
| **D** | **Screen-specific work done** — layout, hierarchy, primary action, filters, loading/error/empty states and mobile behaviour designed for this screen's workflow. |

**No route is still marked S.** The remaining entries in the "Remaining / notes" column are either
new product scope (listed separately in §14) or genuinely optional polish.

---

## 1. Public and authentication

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/login` | `auth/LoginPage` | **D** | Real auth errors inline; demo credentials only in mock mode |
| `/forgot-password` | `auth/ForgotPasswordPage` | **D** | States the real behaviour (an administrator resets the password); no fake "email sent" |
| `/menu/:branchCode/:tableCode/*` | `public-menu/PublicMenuPage` | **D** | Category rail, item photos with fallback, sticky basket, 390 px-first |
| `*` | `shared/NotFoundPage` | **D** | — |
| `/profile` | `auth/ProfilePage` | **D** | Profile and Security split; real password change, nothing shown before the mutation resolves |

## 2. Service floor — waiter

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/waiter` | `waiter/WaiterHomePage` | **D** | Shift summary, my tables, ready queue |
| `/waiter/tables` | `waiter/WaiterTablesPage` + `tables/TableGrid` | **D** | Status by colour + text, section filter, 56 px targets |
| `/waiter/tables/:tableId` | `waiter/TableOrderPage` | **D** | Summary strip (table, guests, live "open for", items, running total); one state-driven primary action so it never competes with the order panel's Send |
| order entry panel | `waiter/OrderEntry` | **D** | "Already sent · N" separated from "New items · not sent yet"; confirm before clearing |
| `/waiter/orders` | `waiter/WaiterOrdersPage` | **D** | Ready-first then longest-waiting sort; ready clock toned by `DELAY_THRESHOLDS`; readable row cards |
| `/waiter/orders/:id` | `orders/OrderDetailPage` | **D** | Current-state card with the single advancing action, then items, then a real status timeline |
| `/waiter/ready` | `waiter/ReadyItemsPage` | **D** | One flat queue across all tables, oldest plate first, one `pos`-size Served action per row, station filter |
| `/waiter/more` | `shared/MorePage` | **D** | — |
| dialog | `orders/CancelItemDialog` | **D** | Consequences match the engine exactly (station told, line struck from the KOT, **stock reversed only when `stockDeducted`**); reason is a real required input |
| partials | `orders/OrderItemsList`, `orders/OrderCustomerCard` | **D** | Quantity chip, status badge + separate station word, notes callout, latest-milestone time; guest card leads with identity and the actionable loyalty position |

## 3. Kitchen and bar displays

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/kitchen` | `kitchen/KitchenDisplayPage` → `DisplayBoard` | **D** | Wall board: dark chrome, `kds`/`kds-lg` type, stable oldest-first sort, delay state as colour + icon + word |
| `/bar` | `bar/BarDisplayPage` → `DisplayBoard` | **D** | Same board, bar routing |
| phone width | `DisplayBoard` below `sm` | **D** | Deliberate single-column stacked prep queue: one ticket per row, hand-sized type, one full-width `pos` action per row, 44 px per-item controls, `.safe-bottom` so the last action clears the home indicator |
| `layouts/DisplayLayout` | — | **D** | Header fits 360–390 px; `ConnectionStatus` keeps its full label |

## 4. Cashier and billing

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/cashier` | `cashier/CashierHomePage` | **D** | Single settlement queue merging bill-requested orders and unsettled bills, oldest first on a fixed timestamp so a tick never reshuffles; takings demoted to context |
| `/cashier/tables` | `cashier/CashierTablesPage` | **D** | Three lanes — Ready to settle / Still dining / Nothing to settle — with drafts marked "not sent" rather than looking actionable |
| `/cashier/bills`, `/cashier/paid` | `cashier/BillsListPage` | **D** | The two modes now differ: unpaid leads with table, waiting time and balance due; paid leads with settled time, tender and receipt access |
| `/cashier/orders/:orderId/bill`, `/cashier/bills/:id` | `billing/BillingScreenPage` | **D** | Desktop rail; on phone a collapsible dock using the shared `.save-bar` rule (offset by `--app-bottom-nav`), so it parks above the tab bar instead of covering content |
| bill summary | `billing/BillSummary` | **D** | Renders the VIP shortfall row, payment progress when partially paid, loyalty points earned |
| `/cashier/bills/:id/pay` | `billing/PaymentPage` | **D** | Full-width tenders, `max-w-sm` keypad, same dock pattern; confirm stays beside the amount and the error, **never optimistic** |
| alternative tenders | `billing/AltTenders` | **D** | Each tender states what is checked and what came back; room charge is an explicit two-step verify-then-post with the precondition stated, and the confirmation is built from the server's response |
| discount | `billing/DiscountDialog` | **D** | Within-limit and approval-required paths look and read differently; names the cap and who can approve; shows the effect on the bill before submitting |
| `/cashier/bills/:id/receipt` | `billing/ReceiptPage` → `ReceiptView` | **D** | 80 mm print block unchanged; on phone the action row becomes full-width touch targets with an "80 mm thermal preview" caption |
| `/admin/room-charges` | `billing/RoomChargesPage` | **D** | Posted / Rejected / Awaiting PMS / Reversed stated plainly; rejected leads the page |

## 5. Manager and dashboards

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/admin` | `dashboard/DashboardPage` | **D** | Real figures only, no fabricated deltas |
| `/manager` | `manager/ManagerDashboardPage` | **D** | — |
| `/manager/live` | `manager/LiveOrdersPage` | **D** | "Waiting for what" as the lead column (colour + icon + words), escalation badges, sort pinned to the immutable timestamp so rows never jump |

## 6. Menu, offers, floor plan, QR

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/admin/menu/items` | `menu/MenuItemsPage` | **D** | Availability is the spine: counted filter, dedicated column, 86'd-count alert with one-click "Show them", only the mutating row disables; category filter moved to `?category=` for deep links |
| `/admin/menu/categories` | `menu/CategoriesPage` | **D** | Item tally (from the query already made) linking into a filtered item list, station and active badges, inline active toggle, edited row carries ring + `aria-current` |
| `/admin/offers` | `offers/OffersPage` | **D** | Life-cycle sections — Running now / Scheduled / Not running / Finished — with an effect block stating what the offer does and to what |
| `/admin/tables` | `tables/TablesPage` | **D** | Detail modal controls reworked |
| `/admin/floors` | `tables/FloorsPage` | **D** | Card grid with table count as the metric, labelled Edit, delete disabled with its precondition stated, links into tables |
| `/admin/qr` | `tables/QrPage` | **D** | Print sheet + reachability notice. Print CSS unverified on a real printer |
| `/admin/orders`, `/admin/orders/:id` | `orders/OrdersListPage`, `OrderDetailPage` | **D** | Age column for active orders, ready-ageing badge, result count with clear-filters, proper mobile cards |

## 7. Inventory and purchasing

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/admin/inventory` | `inventory/InventoryDashboardPage` | **D** | Exception-first worklist; stock value demoted to reference |
| `/admin/inventory/items` | `inventory/InventoryItemsPage` | **D** | Status second column; quantity stated in words ("short 3 of min 10") |
| `/admin/inventory/items/:id` | `inventory/InventoryItemDetailPage` | **D** | Shortfall alert with a route to raise a PO; before→after balances |
| `/admin/inventory/movements` | `inventory/StockMovementsPage` | **D** | In/Out stated with signed quantity; CSV exports exactly the filtered rows |
| forms | `inventory/InventoryForms` | **D** | Movement form previews before→after and warns below-minimum / negative |
| `/admin/recipes` | `recipes/RecipesPage` | **D** | Costing first, worst-first, missing recipes flagged three ways |
| `/admin/recipes/:menuItemId` | `recipes/RecipeEditorPage` | **D** | Sticky costing panel stays visible while editing |
| `/admin/purchases` | `purchasing/PurchaseOrdersPage` | **D** | Triage tiles; overdue flagged with icon + text |
| `/admin/purchases/new`, `/:id` | `purchasing/PurchaseOrderPage` | **D** | Pinned facts bar with the single next-state action, disabled with its precondition stated |
| `/admin/suppliers` | `purchasing/SuppliersPage` | **D** | Outstanding and last order lead; `tel:` links |
| `/admin/suppliers/:id` | `purchasing/SupplierDetailPage` | **D** | Contact card, outstanding with inline Record payment, histories in tabs |

## 8. Guests and hospitality

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/admin/customers` | `crm/CustomersPage` | **D** | Search-led, live result count, no-match opens create pre-filled |
| `/admin/customers/:id` | `crm/CustomerDetailPage` | **D** | Identity header; points with the concrete next step |
| `/admin/loyalty` | `crm/LoyaltyPage` | **D** | Configuration and activity separated |
| `/admin/reservations` | `reservations/ReservationsPage` | **D** | Day sheet with next arrival called out, late detection, week strip demoted to navigation |
| `/host` | `host/HostHomePage` | **D** | "Arriving next" hero with Seat/Assign as the primary action |
| `/admin/club` | `club/ClubDashboardPage` | **D** | Door/floor status separated from takings |
| `/admin/vip` | `club/VipTablesPage` | **D** | Progress bar only when seated *and* a minimum exists |
| `/admin/bottle-service` | `club/BottleServicePage` | **D** | Browsable menu with a single derived availability badge |

## 9. Reports

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/admin/reports` | `reports/ReportsPage` | **D** | Headline figures per tab, one Export CSV bound to the visible tab, hour-of-day breakdown that was fetched but never rendered |
| `/admin/reports/advanced` | `reports/AdvancedReportsPage` | **D** | Per-tab export; valuation tab states it is a live snapshot |
| shared | `shared/DateRangeFilter` | **D** | — |

## 10. Administration

| Route | Component | Coverage | Notes |
|---|---|---|---|
| `/admin/branches` | `branches/BranchesPage` | **D** | Current branch unmistakable and sorted first |
| `/admin/users` | `users/UsersPage` | **D** | Access filter with counts; deactivate states its consequences |
| `/admin/roles` | `users/RolesPage` | **D** | Per-module "granted x / y"; sticky save bar naming the actual diff |
| `/admin/audit` | `users/AuditPage` | **D** | when / who / what; before→after as distinct value chips |
| `/admin/settings` | `settings/SettingsPage` | **D** | Named sections; hints that say what each setting does; validation summary |
| `/admin/notifications` | `notifications/NotificationsPage` | **D** | Unread by rule + tint + dot + the word; titles route to the entity |
| `/admin/more` | `shared/MorePage` | **D** | — |

## 11. Shell, layouts and shared components

| Surface | Coverage | Notes |
|---|---|---|
| `layout/Shell` — sidebar, header, branch switcher, user menu, bell | **D** | Navigation regrouped into seven sections |
| `layout/ConnectionStatus` | **D** | Real transport state; no hardcoded "Live" badge; status comes from transport outcomes, the two timestamps are displayed only |
| `layout/Shell` — branch switcher | **D** | Responsive width (13 → 22 → 32 rem) in a `flex-1 min-w-0` region, so the venue and branch names are not truncated when there is room |
| Bottom nav + sticky action bars | **D** | One system: `--app-bottom-nav` on `.has-bottom-nav`, `.save-bar`, `.pb-nav`. No screen matches padding to an offset by hand |
| `ui/StatCard` | **D** | Mobile row variant below 420 px — label wraps, figure right-aligned, nothing truncated |
| Touch targets | **D** | `.touch-target` raises small controls to 44 × 44 under `@media (pointer: coarse)` only, so desktop density is untouched |
| `AdminLayout`, `PosLayout`, `DisplayLayout` | **D** | — |
| Bottom navigation (waiter / cashier / manager / host / admin) | **D** | — |
| `ui/Modal`, `Drawer`, `ConfirmDialog` | **D** | Escape, scroll lock, focus trap, focus restore |
| `ui/DataTable` | **D** | `aria-sort`, keyboard rows, sticky header, mobile card mode |
| `ui/Form` | **D** | `aria-describedby`; `Switch` on a real checkbox |
| `ui/Misc` | **D** | Arrow-key roving, `aria-pressed` |

## 12. Mobile states (390 px) — implemented and visually inspected

Every row below is **Implemented**, **Checked** and **Visually inspected at 390 px** (screenshots in `screenshots-after/`).

| Surface | Treatment |
|---|---|
| Public menu | Designed mobile-first |
| Waiter home / tables / order entry sheet | Sheet with dialog semantics; 56 px targets |
| Bottom navigation, mobile sidebar | — |
| Admin list screens | Explicit `mobileCard` layouts throughout |
| Reservations day sheet + week strip | Horizontally scrollable strip, 44 px targets |
| Kitchen / bar display | Stacked single-column prep queue below `sm`, longest-waiting first |
| Cashier billing / payment | Collapsible dock on the shared `.save-bar` rule; `main` carries `.pb-nav`. Verified interactively: the last control clears both the dock and the tab bar after scrolling to the end |
| Receipt | 80 mm column fits 390 px without horizontal scroll |

## 13. Realtime transport

| Item | State |
|---|---|
| Status source | Transport outcomes only — poll resolves → `connected`; two consecutive failures → `offline`; connect/disconnect and the browser's `online`/`offline` events. **No timestamp is compared against `now`**, so an idle connection cannot age into stale or offline. |
| `lastSyncAt` | Last successful exchange (a 200 poll, even empty; or the channel opening). Displayed as "checked 12s ago". |
| `lastEventAt` | Last business event actually received. Displayed as "last activity 40m ago", or "no activity yet on this shift". |
| Disconnect race | **Fixed.** A `generation` counter is bumped on every connect and disconnect; a poll that resolves (or rejects) after its generation is superseded dispatches nothing, advances no cursor, and cannot mark the provider connected. `inFlight` is only cleared by the run that set it, so a stale request cannot block a new one. `BroadcastRealtime` gained an equivalent `open` gate covering late channel messages, queued `storage` events and `publish()` after disconnect. |
| Tests | `src/services/realtime/realtime.test.tsx` — 14 tests: disconnect during a pending request (success and failure), reconnect with a stale run answering first, stale request not blocking the new run, empty-200 idle behaviour, the two-failure rule, failure-count reset, `online` ignored while disconnected, broadcast publish-after-disconnect, and the two independent clocks. |

## 14. Not built — these need new product scope, not design work

These were deliberately **not** implemented. Each would need new endpoints, new persisted state or
new data, so building a UI for them would have created a control that cannot work.

| Item | Why it is product scope |
|---|---|
| **Split bill / per-seat settlement** | No API for splitting a bill or assigning items to seats. Needs schema, PL/SQL and endpoints. |
| **Drag-and-drop reordering that persists** | Categories have a real `reorderCategories` endpoint (kept). Floors, menu items and offers have no ordering endpoint — only `displayOrder` on a full save, which cannot be made atomic across rows. |
| **Waitlist** | No waitlist entity exists. The host screen shows reservations only. |
| **Dietary / allergen data** | Not in the menu schema. Cannot be shown on the public menu or the item sheet without it. |
| **Bulk availability ("86 all filtered")** | Only a single-item `setAvailability` mutation exists. A loop would fire N requests with no partial-failure story. |
| **Bulk "serve all ready items"** | Same: N mutations, partial failure, no transactional endpoint. |
| **Claim / snooze / assign on the cashier queue and the live board** | Needs a server-side field to persist the claim. |
| **Offline operation or queued sync** | Not implemented anywhere; claiming it in the UI would be false. |
| **Bump-bar / hardware KDS controls** | No hardware integration layer. |
| **Guest phone / visits on a linked order** | The order payload carries only `customerId` and `customerName`; showing more would mean an extra fetch per order. |
| **Post-discount grand total inside the discount dialog** | Would duplicate the server's tax and service-charge engine in the client. The dialog shows the discountable amount before and after and states that the server recalculates. |
| **Floor-filtered deep link into `/admin/tables`** | `TablesPage` keeps its floor filter in local state and reads no URL parameter. |
| **Order-age colour thresholds** | Only `DELAY_THRESHOLDS` (item prep waits) is configured. There is no "order open too long" threshold, so order age is rendered neutral. |

Two smaller pieces of genuine design polish also remain, and are **not** blocked by scope:
a spatial floor-plan view for the table grid (today it is a status grid), and split-bill-free
per-item selection affordances on the billing screen. Both are optional.

---

## Verification status

| Check | Scope | Result |
|---|---|---|
| TypeScript (`npm run typecheck`) | whole project | **0 errors** |
| Tests (`npm test`) | 8 files | **67 / 67 pass** — includes 14 realtime-lifecycle tests and 4 rendered VIP-shortfall tests |
| Production build (`npm run build`) | `tsc --noEmit && vite build` | **succeeds** |
| Clean-environment install | `npm ci` from the committed `package.json` + `package-lock.json` into an empty directory | **succeeds**; typecheck, tests and build then all pass in that tree |
| Cross-platform manifests | — | no OS-specific dependency is pinned; platform binaries resolve from the lockfile's optional entries |
| Page-level horizontal overflow | 39 routes × 4 widths | **0** |
| Unnamed interactive controls | 39 routes × 4 widths | **0** |
| Inputs without an associated label | 39 routes | **0** |
| Last control reachable after scrolling to the end | 13 screens at 390 px | **13 / 13** |
| Screenshots | 103 captures across 390 / 768 / 1024 / 1440 px, before and after | in `screenshots-before/` and `screenshots-after/` |

### How the browser verification was done

The sandbox that runs the build could not reach the browser pane on the operator's machine, and
desktop automation was intermittently blocked by Windows UIPI. Verification therefore runs
**inside the build environment**: `npm run build` → `vite preview` → headless Chromium driven by
Playwright, signing in as each role and walking every route at each width. That is a real browser
rendering the real production bundle, which is what makes the results above evidence rather than
inference. Rendered-HTML inspection is not used anywhere and is not claimed as layout verification.

### Still unverified

| Area | Why |
|---|---|
| On-screen keyboard behaviour | Headless Chromium has no virtual keyboard; the layout is built for it (sticky-in-flow bars, no fixed save bar) but it has not been exercised |
| Real touch hardware | The 44 px floor is applied under `@media (pointer: coarse)` and confirmed present in the built CSS, but not tapped on a device |
| 80 mm thermal printer output | The print stylesheet is correct by construction; no physical print was made |
| Inventory dashboard at exactly 360 px | 8 px of horizontal scroll remains — see `UI_ISSUE_LOG.md` G1. Clean at every required width |

