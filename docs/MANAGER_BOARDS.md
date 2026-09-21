# Manager reference boards → Nexovo routes

Six presentation boards define the **manager workspace**. As with the admin set, the posters
themselves are not part of the product: the cream background, the numbered headings, the phone
frames, the captions and the promotional footers are presentation furniture and appear nowhere in
the application.

All six were inspected panel by panel before any file was edited. This document is the completion
checklist.

| Board | Title | Panels |
|---|---|---|
| 01 | Manager command center | 00–07 |
| 02 | Floor, kitchen & billing | 07–13 + mobile billing |
| 03 | Stock & purchasing | 14–20 + mobile stock |
| 04 | Guests & hospitality | 21–28 |
| 05 | Insights & workspace | 28–34 + mobile More |
| 06 | Detail views & access | 35–40 + mobile order / access denied |

---

## 1. The §4 boundary: how admin stays untouched

The admin design is signed off. The manager boards paint **fourteen shared screens differently
from the admin boards** — in both directions. So presentation is selected by a *workspace*, not by
a URL prefix.

`frontend/src/config/workspace.ts` derives the workspace from the signed-in role
(`admin` · `manager` · `operations` · `guest`) and never from the path, because `/admin/suppliers`
is a route both an admin and a manager open. `frontend/src/config/surfaces.ts` keeps the admin
table **frozen** and declares every manager difference in a separate overlay that is only
consulted for the manager workspace. Nothing an admin sees can be changed by editing that overlay.

A workspace grants nothing. Every capability still comes from `hasPermission`, which mirrors what
the server enforces.

### The fourteen differences, enumerated

| Route | Admin board | Manager board |
|---|---|---|
| `/admin` | charcoal dashboard | **ivory overview** (panel 03) |
| `/admin/floors` | charcoal | **ivory** (panel 08) |
| `/admin/menu/items` | charcoal | **ivory** (panel 12) |
| `/admin/menu/categories` | ivory | **charcoal** (panel 13) |
| `/admin/recipes` | charcoal | **ivory** (panel 15) |
| `/admin/club` | charcoal | **ivory** (panel 24) |
| `/admin/bottle-service` | ivory | **charcoal** (panel 26) |
| `/admin/settings` | charcoal | **ivory** (panel 31) |
| `/admin/orders/:id` | ivory | **charcoal** (panel 34) |
| `/admin/inventory/items/:id` | ivory shell | **charcoal** (panel 35) |
| `/admin/recipes/:menuItemId` | charcoal | **ivory** (panel 36) |
| `/admin/suppliers/:id` | ivory shell | **charcoal** (panel 37) |
| `/admin/purchases/:id` | ivory shell | **charcoal** (panel 38) |
| `/admin/purchases/new` | ivory shell | **charcoal** |

The pattern behind it is consistent rather than arbitrary: the admin **files** documents, so their
document screens are paper; the manager **works** them mid-service, on the same charcoal ground as
the rest of their shift. Everything else the manager sees matches the admin exactly and is absent
from the overlay.

**Two dashboards, both real.** `/manager` is the command centre (panel 01) and `/admin` is the
overview a manager also reaches (panel 03) — `dashboard:view` already permits both, which is why
the board set draws two. Phones are ivory in both workspaces, as every mobile panel shows.

---

## 2. Board 01 — Manager command center

| # | Panel | Route | File | Surface |
|---|---|---|---|---|
| 00 | Login | `/login` | `features/auth/LoginPage.tsx` | image panel + charcoal form |
| 01 | Manager dashboard | `/manager` | `features/manager/ManagerDashboardPage.tsx` | charcoal |
| 02 | Live operations | `/manager/live` | `features/manager/LiveOrdersPage.tsx` | charcoal |
| 03 | Overview dashboard | `/admin` | `features/dashboard/DashboardPage.tsx` | **ivory** |
| 04 | Host desk | `/host` | `features/host/HostHomePage.tsx` | charcoal |
| 05 | Notifications | `/admin/notifications` | `features/notifications/NotificationsPage.tsx` | charcoal |
| 06 | Orders | `/admin/orders` | `features/orders/OrdersListPage.tsx` | charcoal |
| 07 | Mobile dashboard | `/manager` @ 390 | — | ivory |

**01 Manager dashboard.** Greeting and clock, one gold *Start new order*. Four action tiles —
ready, in progress, delayed, bills pending — each a real count that navigates to the work.
Today's sales bar chart. A live order feed with per-order state. An operational-alerts strip
(delayed orders, low stock, a table awaiting clearing) ending in *View all alerts*.

**02 Live operations.** Filter chips with counts across the real live states. A table carrying
order, time, items, table, waiter, **separate Kitchen and Bar columns** showing each station's own
progress, a status badge and one next action per row. Auto-refresh is stated in words.

**03 Overview dashboard (ivory).** Four comparison tiles, a sales-trend chart, a category donut, a
payment-method breakdown as labelled bars, and a settlement summary.

**04 Host desk.** Next arrival with a gold *Seat guest*; today's arrivals split completed /
upcoming / waiting; table availability as a fraction with occupied / available / reserved; the
upcoming list with a seat action per row; VIP guests currently in house.

**05 Notifications.** Category chips with counts, rows carrying severity, title, body, age and a
real per-row action, plus an alert-thresholds panel with a gold *Save changes*.

**06 Orders.** Type chips, date control, a dense table and server pagination stating the true
total.

---

## 3. Board 02 — Floor, kitchen & billing

| # | Panel | Route | File | Surface |
|---|---|---|---|---|
| 07 | Tables | `/admin/tables` | `features/tables/TablesPage.tsx` | charcoal |
| 08 | Floors & areas | `/admin/floors` | `features/tables/FloorsPage.tsx` | **ivory** |
| 09 | Kitchen display | `/kitchen` | `features/kitchen/KitchenDisplayPage.tsx` | board dark |
| 10 | Bar display | `/bar` | `features/bar/BarDisplayPage.tsx` | board dark |
| 11 | Billing | `/cashier` | `features/cashier/CashierHomePage.tsx` | charcoal |
| 12 | Menu items | `/admin/menu/items` | `features/menu/MenuItemsPage.tsx` | **ivory** |
| 13 | Menu categories | `/admin/menu/categories` | `features/menu/CategoriesPage.tsx` | **charcoal** |
| — | Mobile billing | `/cashier` @ 390 | — | ivory |

**07 Tables.** Area tabs, a status legend, a floor plan of drawn table shapes with seat counts, and
a selected-table panel carrying guests, order number, the order's lines and total, with *View
order* and a gold *Add items*.

**08 Floors & areas (ivory).** Photographic area cards, each with a real occupancy ring and
occupied / available / reserved counts.

**09 / 10 Kitchen and bar displays.** Three columns — NEW, PREPARING, READY — with large ticket
identifiers, table and cover counts, elapsed time, item quantities with their real modifiers, and
one state-transition action per ticket.

**11 Billing.** A settlement queue ordered oldest-first with a per-table *Generate bill*, a
still-dining list, and a settled-today panel with its real count and average.

**12 Menu items (ivory).** Category chips and a four-across image-led grid.

**13 Menu categories (charcoal).** A reorderable list with thumbnail, item count, description and
an active switch.

---

## 4. Board 03 — Stock & purchasing

| # | Panel | Route | Surface |
|---|---|---|---|
| 14 | Offers | `/admin/offers` | charcoal |
| 15 | Recipes & costing | `/admin/recipes` | **ivory** |
| 16 | Inventory | `/admin/inventory` | charcoal |
| 17 | Stock items | `/admin/inventory/items` | ivory |
| 18 | Stock movements | `/admin/inventory/movements` | charcoal |
| 19 | Suppliers | `/admin/suppliers` | charcoal |
| 20 | Purchase orders | `/admin/purchases` | ivory |
| — | Mobile stock items | `/admin/inventory/items` @ 390 | ivory |

Offers are image-led lifecycle cards with real schedule, channel and redemption figures. Inventory
leads with stock value, low-stock and out-of-stock counts, then value by category and recent
movements. Stock items show an in-stock bar against the reorder level. Purchase orders carry three
lifecycle summary tiles above the tabs.

---

## 5. Board 04 — Guests & hospitality

| # | Panel | Route | Surface |
|---|---|---|---|
| 21 | Customers | `/admin/customers` | charcoal |
| 22 | Loyalty | `/admin/loyalty` | ivory, **read-only** |
| 23 | Reservations | `/admin/reservations` | charcoal |
| 24 | Club | `/admin/club` | **ivory** |
| 25 | VIP tables | `/admin/vip` | charcoal |
| 26 | Bottle service | `/admin/bottle-service` | **charcoal** |
| 27 | Room charges | `/admin/room-charges` | ivory |
| 28 | Mobile reservations | `/admin/reservations` @ 390 | ivory |

Reservations lead with a seven-day strip and a per-row *Seat*. Club shows guests in house, entries
tonight, VIP occupancy as a fraction and evening revenue. VIP tables keep the existing separation
of **current service** from **reservation** — the two are never merged.

---

## 6. Board 05 — Insights & workspace

| # | Panel | Route | Surface |
|---|---|---|---|
| 28 | Reports | `/admin/reports` | charcoal |
| 29 | Advanced reports | `/admin/reports/advanced` | ivory |
| 30 | Branches & outlets | `/admin/branches` | charcoal, **read-only** |
| 31 | Settings | `/admin/settings` | **ivory**, **read-only** |
| 32 | My profile | `/profile` | charcoal |
| 33 | More | `/admin/more` | charcoal |
| 34 | Order detail | `/admin/orders/:id` | **charcoal** |

Branches shows the organisation tree with outlets per branch and states plainly that structure is
administered elsewhere. Settings shows branch, billing, tax and system configuration behind a lock
banner. Profile keeps *Change password* — which is real — and nothing else.

---

## 7. Board 06 — Detail views & access

| # | Panel | Route | Surface |
|---|---|---|---|
| 35 | Inventory item detail | `/admin/inventory/items/:id` | **charcoal** |
| 36 | Recipe editor | `/admin/recipes/:menuItemId` | **ivory** |
| 37 | Supplier detail | `/admin/suppliers/:id` | **charcoal** |
| 38 | Purchase order detail | `/admin/purchases/:id` | **charcoal** |
| 39 | Customer detail | `/admin/customers/:id` | ivory |
| 40 | Permission wall | any denied route | charcoal |

The permission wall is a large disc, a heading, one line and one gold action — implemented in
`routes/guards.tsx` as `Forbidden`.

---

## 8. Read-only: what the permission model actually says

§7 of the brief says to implement the boards' read-only screens *where consistent with the current
permission model*, and to inspect rather than assume. Inspected — `frontend/src/config/permissions.ts`,
`ROLE_PERMISSIONS.MANAGER`:

| Board shows read-only | Manager holds | Verdict |
|---|---|---|
| **Settings** (panel 31) | `settings:view`, **not** `settings:manage` | **Already true.** Implemented as presentation only |
| **Branches** (panel 30) | `branches:view`, **not** `branches:manage` | **Already true.** Implemented as presentation only |
| **Loyalty** (panel 22) | `loyalty:view` **and** `loyalty:manage` **and** `loyalty:redeem` | **Not true today — not silently changed.** See below |

The read-only treatment (`components/ui/ReadOnly.tsx`) is driven by the *absence of the manage
permission*, never by the workspace. An admin holding `settings:manage` gets the editable form on
the same screen; a manager gets the banner. If server policy changes, the screen follows without
anyone editing a component.

### The loyalty question — needs a decision, not an assumption

The board captions loyalty *"Changes can only be made by Nexovo support"*. The seeded MANAGER role
**does** hold `loyalty:manage`, so rendering that screen read-only today would either be a lie
about the permission or a silent removal of a granted capability — both of which §7 forbids.

It also cannot be a blanket change: board 06 panel 39 shows a manager using **Adjust points** on a
customer, so point adjustment must survive whatever is decided about programme rules. The system
has no permission that separates *edit the programme's rules* from *adjust a member's points*.

Three options, none of which should be chosen without the product owner:

1. Leave as is — a manager edits programme rules. The screen then differs from the board.
2. Split the permission: add `loyalty:configure` for the rules, keep `loyalty:manage` for member
   operations, grant the manager the second only. Requires a seed change in
   `database/10_phase2_seed.sql`, the `permissions.ts` mirror and `docs/RBAC.md`.
3. Remove `loyalty:manage` from MANAGER entirely — simplest, but it takes point adjustment away
   with it, contradicting panel 39.

**Option 2 is the one that matches the boards**, and it is a permission-policy change that must
land on the server and the client together. It is recorded here rather than performed quietly.

---

## 9. Controls the boards show that the manager cannot use

Checked against `ROLE_PERMISSIONS.MANAGER`. These must stay permission-gated and simply not render
for a manager — adding them would be exactly the fake control §7 forbids:

| Board | Control | Manager holds | Result |
|---|---|---|---|
| 12 | *+ Add item* on Menu items | `menu:view`, `menu:availability` — **not** `menu:manage` | Hidden. Availability toggles stay, and they are real |
| 13 | *+ Add category* | as above | Hidden |
| 19 | *+ Add supplier* | `suppliers:view` — **not** `suppliers:manage` | Hidden. The directory and balances stay |

Controls that **are** real for a manager and must work: *+ New offer*, *+ Add area*, *+ Add stock
item*, *Adjust stock*, *Save recipe*, *+ New purchase order*, *Approve*, *Record payment*,
*+ New customer*, *Adjust points*, *+ New reservation*, *+ Check in*, *Add to order*,
*+ Post charge*, *Generate bill*, *Update password*, and every kitchen/bar state transition.
