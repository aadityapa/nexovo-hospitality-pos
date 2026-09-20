# Phase 2 — Design System, UI/UX & Module Roadmap

> Status: Phase 1 is being built with the design system below already applied (no separate "redesign" pass is needed). Phase 2 modules start only after Phase 1 compiles and the end-to-end flow is verified.

## 1. Architecture assessment (Phase 1 as built)
* Frontend: React 18 + TS + Vite + Tailwind + React Router 6 + TanStack Query 5 + Zustand + RHF + Zod. Feature-sliced folders; API layer swappable (`mock` / `ords`).
* Backend: Oracle schema (`database/01_schema.sql`), PL/SQL packages, single ORDS catch-all router (`api_router_pkg`) → easy to add modules (one new `WHEN` per endpoint + one package).
* Cross-cutting already in place and reusable for Phase 2: `api_pkg` envelope/errors, `sec_pkg` RBAC, `numbering_pkg`, `audit_pkg` (+ realtime outbox), soft-delete conventions, `branch_id` on every business table.

## 2. UI/UX assessment
Built from scratch against the Part A spec; checklist in §6 is used as the acceptance list for every screen.

## 3. Design system (implemented in `frontend/src/styles/index.css` + `tailwind.config.ts` + `components/ui`)
| Token group | Values |
|---|---|
| Colors | `primary` (deep indigo `#1F2A5C` scale 50–900), `neutral` (slate), `success` (emerald), `warning` (amber), `danger` (rose), `info` (sky). Surfaces: `bg-surface` (#F7F8FA), `bg-card` (#FFFFFF), borders `border-neutral-200`. |
| Typography | Inter (system fallback). `text-display` 36/44 semibold · `text-heading` 24/32 · `text-subheading` 18/28 · body 14/20 · `text-label` 12/16 medium · `text-caption` 12/16 neutral-500. KDS uses `text-kds` 22/28. |
| Spacing | Tailwind 4-pt scale only: 1,2,3,4,5,6,8,10,12 (=4…48px). |
| Radius | `rounded-sm` 6px controls · `rounded-md` 10px cards · `rounded-lg` 14px panels/modals. |
| Shadows | `shadow-card` (0 1px 2px rgba(16,24,40,.06)) · `shadow-panel` (0 4px 12px rgba(16,24,40,.08)). No glass, no gradients. |
| Icons | `lucide-react` only. |
| Touch targets | POS/KDS buttons `min-h-12` (48px), waiter grid tiles ≥ 96px. |
| Status | `StatusBadge` = icon + label + tone; colors never carry meaning alone. |

Reusable components: Button, IconButton, Input, Select, Textarea, Checkbox/Switch, FormField, Modal, Drawer, ConfirmDialog, Badge, StatusBadge, Card, StatCard, DataTable (search/sort/pagination/responsive cards), EmptyState, LoadingState (skeletons), ErrorState, QuantitySelector, QuickChips, Tabs, SegmentedControl, PageHeader, Toast.

## 4. Navigation architecture
* **AdminLayout** (desktop-first): collapsible sidebar (Dashboard · Operations · Menu · Tables · Orders · Kitchen · Bar · Billing · Reports · Management · Settings), top header (branch, search, notifications, user + role, profile menu). Mobile: drawer sidebar + bottom nav.
* **PosLayout** (waiter/cashier, tablet-first): slim top bar + **bottom navigation** (Waiter: Home · Tables · Orders · Ready · More; Cashier: Home · Bills · Paid · More).
* **DisplayLayout** (kitchen/bar): full-bleed, large type, column board (NEW / PREPARING / READY) with queue mode under 1024px.
* **PublicLayout** (customer): mobile-first, sticky category bar, bottom sheet item detail.
Sidebar items are filtered by permission; role home routes in `config/roleHome.ts`.

## 5. Phase 1 UI implementation order (as built)
Foundation → Public QR menu → Login → Admin dashboard → Waiter → Tables → Order creation → KDS → Bar → Manager → Cashier → Billing → Payment → Reports.

## 6. Screen acceptance checklist
Consistency · spacing scale only · typography tokens · button hierarchy (one primary per view) · loading skeleton · empty state with action · error state with retry · mobile/tablet/desktop layouts · ≥44px touch targets · keyboard focus rings · status = icon + label.

## 7. Phase 2 database expansion (Oracle, additive — no Phase 1 table is altered destructively)
```
ORGANIZATIONS(org_id, name, plan, status)                   BRANCHES + org_id (nullable → backfilled), OUTLETS(outlet_id, branch_id, name, type)
DINING_TABLES + outlet_id, is_vip, min_spend_default, deposit_default
INVENTORY_UNITS(unit_id, code, name, base_unit_id, factor)  UNIT_CONVERSIONS(from_unit, to_unit, factor)
INVENTORY_CATEGORIES(cat_id, branch_id, name)
INVENTORY_ITEMS(inv_item_id, branch_id, cat_id, name, unit_id, current_qty, min_qty, max_qty, reorder_level, cost_price, avg_cost, supplier_id, allow_negative, status)
STOCK_MOVEMENTS(mvt_id, inv_item_id, mvt_type[PURCHASE|SALE_CONSUMPTION|WASTAGE|DAMAGE|RETURN|TRANSFER|ADJUSTMENT|OPENING_STOCK], qty, unit_id, qty_base, prev_qty, new_qty, unit_cost, ref_type, ref_id, idempotency_key UNIQUE, created_by, created_at)
RECIPES(recipe_id, item_id, variant_code, portion_size, yield_qty)  RECIPE_ITEMS(recipe_id, inv_item_id, qty, unit_id, wastage_pct)
STOCK_DEDUCTION_CONFIG(branch_id, mode[ON_CONFIRM|ON_BILL_CLOSE|MANUAL])
SUPPLIERS(supplier_id, branch_id, name, contact, phone, email, address, gst, payment_terms, status)
PURCHASE_ORDERS(po_id, po_number, supplier_id, status[DRAFT→SENT→APPROVED→ORDERED→PARTIALLY_RECEIVED→RECEIVED|CANCELLED], expected_date, totals)  PURCHASE_ORDER_ITEMS
GOODS_RECEIPTS(grn_id, po_id, invoice_no, received_at)  GOODS_RECEIPT_ITEMS(grn_id, po_item_id, received_qty, damaged_qty, unit_cost)  SUPPLIER_PAYMENTS
CUSTOMERS(customer_id, org_id, name, phone UNIQUE, email, birthday, anniversary, consent_marketing, consent_at, tags)  CUSTOMER_VISITS(customer_id, order_id, bill_id, visited_at, amount)
LOYALTY_PROGRAMS(rules JSON: earn_rate, redeem_rate, expiry_days)  LOYALTY_ACCOUNTS(customer_id, balance)  LOYALTY_TRANSACTIONS(type[EARN|REDEEM|EXPIRE|PROMO|REVERSAL], points, ref)
RESERVATIONS(res_id, branch_id, customer_id, phone, res_date, res_time, guests, table_pref, occasion, notes, status[PENDING|CONFIRMED|SEATED|COMPLETED|CANCELLED|NO_SHOW], table_id, order_id)
COVER_CHARGE_TYPES(branch_id, code, name, amount, redeemable_amount, is_active)  CLUB_ENTRIES(entry_id, branch_id, guest_name, phone, guests, entry_type[WALK_IN|GUEST_LIST|PREBOOKED|VIP], cover_type_id, amount, redeemable_balance, host_id, entered_at, table_id, bill_id)
VIP_RESERVATIONS(vip_res_id, table_id, customer, min_spend, deposit, guests, host_id, status)  MIN_SPEND_RULES(branch_id, shortfall_mode[CHARGE_DIFFERENCE|WAIVE|FLAT_FEE], value)
BOTTLE_SERVICE_ITEMS(item_id → menu_items, bottle_size_ml, inv_item_id, includes JSON)  ORDER_ITEMS + service_bundle_id
ROOM_CHARGES(room_charge_id, bill_id, room_no, guest_name, pms_provider, pms_ref, status[PENDING|POSTED|FAILED|REVERSED], posted_at)  PAYMENTS.method 'ROOM_CHARGE'
NOTIFICATIONS(notif_id, org_id, branch_id, type, severity, title, body, entity, entity_id, target_role/user, read_at)  NOTIFICATION_CHANNELS / NOTIFICATION_LOGS
ALERT_THRESHOLDS(branch_id, key[ORDER_DELAY_MIN|KITCHEN_BACKLOG|BAR_BACKLOG|BILL_PENDING_MIN|LOW_STOCK], value)
```
Rules: every stock change is a `STOCK_MOVEMENTS` row with `idempotency_key` (`ORDER_ITEM:<id>:CONFIRM`) — duplicate deductions/reversals are impossible by unique constraint. Branch isolation enforced in `sec_pkg` (`assert_branch_access(branch_id)`) — users get `USER_BRANCHES` rows; SUPER_ADMIN bypasses.

## 8. Phase 2 implementation roadmap
| # | Module | Backend | Frontend |
|---|---|---|---|
| 20 | Inventory | `inventory_pkg` (items, units, movements) | Inventory dashboard, item screen, movements |
| 21 | Recipes | `recipe_pkg` (costing, food-cost %) | Recipe editor per menu item |
| 22 | Stock deduction | hooks in `order_pkg.confirm_order` / `billing_pkg.close_bill` via config; reversal on cancel | Deduction mode setting |
| 23 | Suppliers | `supplier_pkg` | Supplier list/detail with history |
| 24 | Purchasing | `purchase_pkg` (PO workflow, GRN → movements) | PO list, PO editor, receive goods |
| 25 | CRM | `customer_pkg` (consent fields) | Customer list/profile, attach to order |
| 26 | Loyalty | `loyalty_pkg` (earn on bill close, redeem as payment) | Loyalty panel in billing |
| 27 | Reservations | `reservation_pkg` | Day/week calendar, seat → order |
| 28 | Club entry | `club_pkg` (cover charges, redeemable balance as payment) | Club dashboard, check-in |
| 29 | VIP tables | `vip_pkg` (min-spend rules) | VIP layout, spend tracker |
| 30 | Bottle service | bundle items → inventory | Bottle service order flow |
| 31 | Room billing | `pms_adapter` interface + `room_charge_pkg` | Charge-to-room in payment UI |
| 32 | Multi-branch | organizations/outlets, `USER_BRANCHES`, branch switcher | Branch selector in header |
| 33 | Advanced reports | `report_pkg` v2 (COGS, margins, staff) | Reports v2 pages |
| 34 | Notifications | `notify_pkg` + channel abstraction | Header notification center |
