# Nexovo POS — redesign coverage checklist

Status of every route, dialog and role surface after the redesign and the completion pass.

**Legend**

| Code | Meaning |
|---|---|
| **S** | **Shared styling only.** Inherits the new tokens, shared components, focus ring and spacing. No screen-specific layout or interaction work was done. Token changes alone are *not* counted as a redesigned screen. |
| **D** | **Screen-specific work done.** Layout, information hierarchy, primary action, empty/loading/error states and mobile behaviour reworked for this screen's actual workflow. |
| **R** | **Remaining design work** named explicitly. |
| **V** | **Browser verification.** `—` = not verified in a browser. See "Verification status" at the bottom. |

No route in this build has been visually verified in a browser. Every `V` column entry is `—`.
This is stated once rather than repeated per row.

---

## 1. Public and authentication

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/login` | `auth/LoginPage` | **D** — single-column card, real auth errors surfaced inline, demo credentials shown only in mock mode | Field-level error copy review |
| `/forgot-password` | `auth/ForgotPasswordPage` | **D** — states the real behaviour (an administrator resets the password); no fake "email sent" success | — |
| `/menu/:branchCode/:tableCode/*` | `public-menu/PublicMenuPage` | **D** — guest-facing menu: category rail, item photos with fallback, sticky basket, 390 px-first | Allergen/dietary presentation not designed |
| `*` | `shared/NotFoundPage` | **D** | — |
| `/profile` | `auth/ProfilePage` | **D** — split into Profile and Security; real password change wired to `usersApi.setPassword` with no success shown before the call resolves; accounts without `users:manage` get a plain statement instead of a dead control | — |

## 2. Service floor — waiter

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/waiter` | `waiter/WaiterHomePage` | **D** — shift summary, my tables, ready-to-serve queue | — |
| `/waiter/tables` | `waiter/WaiterTablesPage` + `tables/TableGrid` | **D** — status-coloured grid with text labels, section filter, 56 px touch targets | Floor-plan (spatial) view not designed |
| `/waiter/tables/:tableId` | `waiter/TableOrderPage` | **S** | Header does not summarise the open order (guests, elapsed time, running total); actions compete for prominence |
| order entry panel | `waiter/OrderEntry` | **D** — "Already sent · N" read-only section separated from "New items · not sent yet"; confirm before clearing; mobile sheet with dialog semantics | — |
| `/waiter/orders` | `waiter/WaiterOrdersPage` | **S** | No grouping by state; ageing not surfaced |
| `/waiter/orders/:id` | `orders/OrderDetailPage` | **S** | Item timeline and status history are a flat list; per-item actions not prioritised |
| `/waiter/ready` | `waiter/ReadyItemsPage` | **S** | Should be a queue sorted by wait time with a single "served" action per row |
| `/waiter/more` | `shared/MorePage` | **D** | — |
| dialog | `orders/CancelItemDialog` | **S** | Reason selection and stock consequence not explained |
| partials | `orders/OrderItemsList`, `orders/OrderCustomerCard` | **S** | — |

## 3. Kitchen and bar displays

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/kitchen` | `kitchen/KitchenDisplayPage` → `DisplayBoard` | **D** — dark chrome, `kds`/`kds-lg` type scale, stable sort so cards do not jump, delay thresholds, layout toggle | Bump-bar / keyboard-only operation not designed |
| `/bar` | `bar/BarDisplayPage` → `DisplayBoard` | **D** — same board, bar routing | As above |

## 4. Cashier and billing

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/cashier` | `cashier/CashierHomePage` | **S** | Should lead with tables awaiting payment |
| `/cashier/tables` | `cashier/CashierTablesPage` | **S** | Same grid as waiter; billing-specific state not emphasised |
| `/cashier/bills`, `/cashier/paid` | `cashier/BillsListPage` | **S** | No ageing column, no balance-due emphasis |
| `/cashier/orders/:orderId/bill`, `/cashier/bills/:id` | `billing/BillingScreenPage` | **D** — line panel plus sticky bill summary | Split-bill interaction not designed |
| bill summary | `billing/BillSummary` | **D** — **now renders the VIP minimum-spend shortfall row**, a payment-progress bar when partially paid, and loyalty points earned | — |
| `/cashier/bills/:id/pay` | `billing/PaymentPage` | **D** — tender selection, running balance, **no optimistic success**: the paid state is only shown after the server confirms | — |
| alternative tenders | `billing/AltTenders` | **S** | Room-charge and credit paths need their own verification step in the UI |
| discount | `billing/DiscountDialog` | **S** | Approval-required path is not visually distinct from within-limit |
| `/cashier/bills/:id/receipt` | `billing/ReceiptPage` → `ReceiptView` | **D** — 80 mm print block, guest line, **min-spend shortfall line**, loyalty points earned | — |
| `/admin/room-charges` | `billing/RoomChargesPage` | **D** — posting outcome unmistakable (Posted / Rejected / Awaiting PMS / Reversed), rejected charges lead the page, explicit warning that pending posts are not settled | — |

## 5. Manager and dashboards

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/admin` | `dashboard/DashboardPage` | **D** — real figures only, no fabricated deltas | — |
| `/manager` | `manager/ManagerDashboardPage` | **D** | — |
| `/manager/live` | `manager/LiveOrdersPage` | **S** | Needs ageing/escalation emphasis |

## 6. Menu, offers, floor plan, QR

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/admin/menu/items` | `menu/MenuItemsPage` | **S** | Bulk availability toggling and category reordering not designed |
| `/admin/menu/categories` | `menu/CategoriesPage` | **S** | Ordering/drag affordance not designed |
| `/admin/offers` | `offers/OffersPage` | **S** | Active/scheduled/expired grouping missing |
| `/admin/tables` | `tables/TablesPage` | **D** — detail modal controls reworked | — |
| `/admin/floors` | `tables/FloorsPage` | **S** | Floor/section editing is still a plain list |
| `/admin/qr` | `tables/QrPage` | **D** — print sheet, reachability notice explaining that codes point at the address you are browsing | Print CSS unverified on a real printer |
| `/admin/orders`, `/admin/orders/:id` | `orders/OrdersListPage`, `OrderDetailPage` | **S** | See waiter rows above |

## 7. Inventory and purchasing

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/admin/inventory` | `inventory/InventoryDashboardPage` | **D** — exception-first: verdict banner, out-of-stock and below-reorder worklists as tappable rows, stock value demoted to reference | — |
| `/admin/inventory/items` | `inventory/InventoryItemsPage` | **D** — stock status second column, quantity stated in words ("short 3 of min 10"), labelled per-row Adjust, clear-filters affordance | — |
| `/admin/inventory/items/:id` | `inventory/InventoryItemDetailPage` | **D** — current position + shortfall alert with a route to raise a PO, movement history with before→after balances | — |
| `/admin/inventory/movements` | `inventory/StockMovementsPage` | **D** — direction stated as In/Out with signed quantity, direction filter with counts from already-fetched rows, running balance, CSV exports exactly the filtered rows | — |
| forms | `inventory/InventoryForms` | **D** — fieldset sections; movement form previews before→after and warns when the result goes below minimum or negative | — |
| `/admin/recipes` | `recipes/RecipesPage` | **D** — costing first, sorted worst-first, missing recipes flagged three ways | — |
| `/admin/recipes/:menuItemId` | `recipes/RecipeEditorPage` | **D** — sticky costing panel stays visible while editing; scrollable ingredient table; unsaved-changes badge | — |
| `/admin/purchases` | `purchasing/PurchaseOrdersPage` | **D** — triage tiles (awaiting approval / awaiting delivery / overdue), overdue dates flagged with icon + text | — |
| `/admin/purchases/new`, `/admin/purchases/:id` | `purchasing/PurchaseOrderPage` | **D** — pinned facts bar with the single next-state action, disabled with its precondition stated rather than hidden | — |
| `/admin/suppliers` | `purchasing/SuppliersPage` | **D** — outstanding and last-order as the lead columns, `tel:` links, sorted by outstanding | — |
| `/admin/suppliers/:id` | `purchasing/SupplierDetailPage` | **D** — contact card, outstanding balance with inline Record payment, histories in tabs | — |

## 8. Guests and hospitality

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/admin/customers` | `crm/CustomersPage` | **D** — search-led with a live result count and a no-match state that opens create pre-filled | — |
| `/admin/customers/:id` | `crm/CustomerDetailPage` | **D** — identity header, points balance with the concrete next step ("N more to redeem"), visits and ledger in tabs | — |
| `/admin/loyalty` | `crm/LoyaltyPage` | **D** — configuration and activity separated into two columns; warning when the programme is off | — |
| `/admin/reservations` | `reservations/ReservationsPage` | **D** — day sheet with next arrival called out, late detection on a 60 s tick, week strip demoted to navigation, scrollable at 390 px | Table-assignment interaction still a select |
| `/host` | `host/HostHomePage` | **D** — "Arriving next" hero with Seat/Assign as the primary action; real VIP-free count | Waitlist not implemented, so not designed |
| `/admin/club` | `club/ClubDashboardPage` | **D** — door/floor status separated from takings | — |
| `/admin/vip` | `club/VipTablesPage` | **D** — per-table commitment card; progress bar only rendered when the table is seated *and* a minimum exists | — |
| `/admin/bottle-service` | `club/BottleServicePage` | **D** — browsable bottle menu with a single derived availability badge | — |

## 9. Reports

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/admin/reports` | `reports/ReportsPage` | **D** — headline figures lead each tab, one obvious Export CSV bound to the visible tab, hour-of-day breakdown that was fetched but never rendered, legends + axis formatters + empty states on every chart | — |
| `/admin/reports/advanced` | `reports/AdvancedReportsPage` | **D** — per-tab export including group-by, honest headline rows, valuation tab states that it is a live snapshot | — |
| shared | `shared/DateRangeFilter` | **D** | — |

## 10. Administration

| Route | Component | Coverage | Remaining work |
|---|---|---|---|
| `/admin/branches` | `branches/BranchesPage` | **D** — current branch unmistakable (rule, chip, tint, badge, sorted first); operating facts as chips | — |
| `/admin/users` | `users/UsersPage` | **D** — access filter with counts, deactivate as a labelled danger action whose dialog states the consequences | — |
| `/admin/roles` | `users/RolesPage` | **D** — per-module "granted x / y", explicit SUPER_ADMIN and read-only banners, sticky save bar naming the actual diff | — |
| `/admin/audit` | `users/AuditPage` | **D** — when / who / what columns, before→after as distinct value chips, client-side filter over the page already fetched | — |
| `/admin/settings` | `settings/SettingsPage` | **D** — named sections, hints that say what each setting actually does, sticky save bar counting unsaved fields, validation summary | — |
| `/admin/notifications` | `notifications/NotificationsPage` | **D** — unread by rule + tint + dot + the word "Unread"; titles route to the entity; bulk action names its scope | — |
| `/admin/more` | `shared/MorePage` | **D** | — |

## 11. Shell, layouts and dialogs (shared surfaces)

| Surface | Coverage | Notes |
|---|---|---|
| `layout/Shell` — sidebar, header, branch switcher, user menu, notification bell | **D** | Navigation regrouped into Overview / Service / Menu / Stock & purchasing / Guests & hospitality / Reports / Administration |
| `layout/ConnectionStatus` | **D** | Real transport state; **no hardcoded "Live" badge** |
| `AdminLayout`, `PosLayout`, `DisplayLayout` | **D** | — |
| Bottom navigation (waiter / cashier / manager / host / admin) | **D** | — |
| `ui/Modal`, `Drawer`, `ConfirmDialog` | **D** | Escape, scroll lock, focus trap, focus restore to the trigger |
| `ui/DataTable` | **D** | `aria-sort`, keyboard-activatable rows, sticky header, mobile card mode |
| `ui/Form` | **D** | `aria-describedby` wiring; `Switch` rebuilt on a real checkbox input |
| `ui/Misc` — SegmentedControl, Tabs, PageHeader, Breadcrumbs, Tooltip | **D** | Arrow-key roving, `aria-pressed` |

## 12. Mobile states (390 px)

| Surface | Coverage | Remaining work |
|---|---|---|
| Public menu | **D** — designed mobile-first | Not verified in a browser |
| Waiter home / tables / order entry sheet | **D** | Not verified in a browser |
| Bottom navigation, mobile sidebar | **D** | Not verified in a browser |
| Admin list screens (inventory, purchasing, CRM, users, audit, room charges) | **D** — explicit `mobileCard` layouts | Not verified in a browser |
| Reservations day sheet, week strip | **D** — horizontally scrollable strip | Not verified in a browser |
| Kitchen / bar display | **S** at phone width | The board is designed for a wall screen; phone layout not designed |
| Cashier billing / payment | **S** at phone width | Sticky summary height at 390 px unverified |

---

## Verification status

| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | **Passed** — 0 errors, in a clean install from committed manifests |
| Unit / engine tests (`npm test`) | **Passed** — 50/50, 6 files |
| Production build (`npm run build`) | **Passed** — `vite build` completed |
| Clean-environment install (`npm ci` into an empty directory from `package.json` + `package-lock.json`) | **Passed** — 216 packages, exit 0, no extra packages needed |
| Browser rendering at 390 / 768 / 1024 / 1440 px | **Not done.** See the limitation below. |

### The exact limitation

The application must be served from the machine the browser runs on. Three attempts failed:

1. **Sandbox-hosted dev server + in-app browser pane** — the Linux sandbox that runs my shell and the browser pane are different hosts; `navigate` to the sandbox's `localhost:5173` timed out after 180 s.
2. **Dev server on the Windows machine** — `start.bat` was launched successfully, but Vite crashed during dependency pre-bundling. `node_modules/.vite/` contained a half-written `deps_temp_*` directory (13 MB of optimised deps) that was never renamed to `deps`, left behind by earlier sandbox-side runs of Vitest against the same Windows-mounted `node_modules`. Port 5173 never opened. **This has been fixed**: the stale `node_modules/.vite` cache has been deleted, so the next run of `start.bat` will re-optimise cleanly.
3. **Relaunching after the fix** — desktop screen capture stopped returning sources and input was blocked (`UIPI`), so `start.bat` could not be re-run from this session.

Rendered-HTML capture and static auditing were used as partial substitutes earlier in the project. **Those are not pixel-level or responsive-layout verification** and are not counted as such anywhere in this document.

### Screenshot capture checklist

Run `start.bat`, wait for `http://localhost:5173`, then capture each of these at **390, 768, 1024 and 1440 px** (Chrome DevTools → toggle device toolbar → set the width):

| # | Sign in as | URL | What to look at |
|---|---|---|---|
| 1 | — | `/login` | Card width, field spacing, demo-credentials block |
| 2 | `admin` / `Admin@123` | `/admin` | Stat row wrapping, chart legends, no clipped labels |
| 3 | admin | `/admin/inventory` | Verdict banner, worklist rows, touch target height |
| 4 | admin | `/admin/purchases` | Triage tiles, overdue flags, table horizontal scroll |
| 5 | admin | `/admin/reports` | Axis labels, legend, chart height at 390 px |
| 6 | admin | `/admin/roles` | Permission matrix scroll, sticky save bar |
| 7 | admin | `/admin/settings` | Section grouping, sticky save bar overlap at 390 px |
| 8 | `waiter1` / `Waiter@123` | `/waiter/tables` → open a table | Table grid density, order-entry sheet height |
| 9 | `cashier` / `Cashier@123` | a bill → `/pay` | Sticky bill summary, tender buttons, balance readability |
| 10 | `kitchen` / `Kitchen@123` | `/kitchen` | Card type size at 1440 px, delay colours + text |
| 11 | admin | `/admin/qr` → Print preview | 80 mm / A4 print sheet |
| 12 | — | a table QR URL | Public menu at 390 px, sticky basket |

Also worth capturing: one open dialog at 390 px (e.g. Adjust stock) to confirm dialog height and scroll, and one long table (`/admin/audit`) to confirm horizontal scrolling rather than page-level overflow.
