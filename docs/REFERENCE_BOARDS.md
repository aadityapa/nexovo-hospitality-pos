# Reference boards → Nexovo screens

Five presentation boards were supplied as the primary visual specification. Each board is a
poster containing eight or nine application screenshots. **The posters themselves are not part of
the product**: their cream background, numbered headings, captions and footers are presentation
furniture and appear nowhere in the application.

This document is the screen-to-route checklist, and it is also the build brief every screen was
implemented against. It records what each reference panel actually shows, which route and file
implements it, and which panels asked for something the application cannot truthfully support.

| Board | Title | Panels |
|---|---|---|
| 01 | Service & operations | 8 |
| 02 | Menu & inventory | 8 |
| 03 | Purchasing & guests | 8 |
| 04 | Hospitality & insights | 8 |
| 05 | Administration & mobile | 6 desktop + 3 phone |

All five were inspected panel by panel before any file was edited.

---

## 1. The surface system

The boards paint some screens charcoal and others warm ivory, and they do it per screen rather
than per theme. Two of the ivory screens carry the ivory out to the navigation rail as well; the
rest keep the charcoal rail. That is declared once, in `frontend/src/config/surfaces.ts`, on two
independent axes:

- `shell` — the navigation rail
- `content` — the header and the content region

`AdminLayout` reads the declaration and paints each region with a `.chrome-light` or
`.chrome-dark` island. An island re-declares the whole palette for its subtree, so every component
inside resolves its tokens against the right ground with **no per-screen colour code anywhere in a
feature file**.

**The theme toggle still wins.** These declarations describe the dark theme, which is the
product's default and the one the boards depict. Under the light theme the whole application is
light and the distinction collapses — someone who asked for a light interface has not asked for
two thirds of it to stay black.

**Phones are ivory end to end.** The boards draw the phone application as ivory (dashboard,
orders and More are the three shown). Below `lg` the whole management shell takes the ivory
treatment rather than only those three routes, because the header and the bottom navigation are
shared chrome — a rail that turned from cream to charcoal as you moved between tabs would read as
a fault. The in-service tools are unaffected at every width: the waiter and cashier shells and
the kitchen and bar boards stay charcoal, because they are used in a dim room.

---

## 2. Board 01 — Service & operations

| # | Reference panel | Route | File | Surface |
|---|---|---|---|---|
| 1 | Login | `/login` | `features/auth/LoginPage.tsx` | dark form + drawn hospitality panel |
| 2 | Dashboard | `/admin` | `features/dashboard/DashboardPage.tsx` | dark |
| 3 | Live operations | `/manager/live` | `features/manager/LiveOrdersPage.tsx` | dark |
| 4 | Orders | `/admin/orders` | `features/orders/OrdersListPage.tsx` | dark |
| 5 | Tables | `/admin/tables` | `features/tables/TablesPage.tsx` | dark |
| 6 | Floors & areas | `/admin/floors` | `features/tables/FloorsPage.tsx` | dark |
| 7 | QR codes | `/admin/qr` | `features/tables/QrPage.tsx` | **ivory** |
| 8 | Order detail | `/admin/orders/:id` | `features/orders/OrderDetailPage.tsx` | **ivory** |

**Login.** A full-height image panel on the left, the form on the right over the deepest charcoal.
"Welcome back", a line naming the venue, email and password fields, remember-me and a forgot-
password link on one row, a full-width gold Sign in, and a reassurance line at the foot.

**Dashboard.** Greeting line and a date-range control; a single row of four compact KPI tiles with
a delta under each; then a wide hourly-sales bar chart beside a category-mix donut with a legend
list; then a recent-orders table with #, time, table, items, amount and status.

**Live operations.** A queue with filter chips carrying counts, and rows showing order, time,
table, items, a progress bar with elapsed minutes, a status badge, the waiter and a row action.

**Orders.** Type tabs with counts, a date control and a filter button, then a dense table —
order number, time, type, table, items, amount, status, waiter, row action — and one gold
New order.

**Tables.** A floor plan of drawn table shapes with seat markers, a status legend, area tabs, and
a detail panel for the selected table showing seats, area, how long it has been occupied, the
guest, item count and the running total.

**Floors & areas.** Cards led by a drawn image of the room, with table count, seat count, an
active badge, the floor and a short description, and an Edit action.

**QR codes (ivory).** Area tabs with counts, a grid of printable QR cards each showing the table
name and a download link, and a download-all action.

**Order detail (ivory).** An items table with quantity, item, price and amount; a bill summary
with items total, service charge, tax and total; a guest-and-table panel; and a kitchen timeline
built only from events the order actually recorded.

---

## 3. Board 02 — Menu & inventory

| # | Reference panel | Route | File | Surface |
|---|---|---|---|---|
| 1 | Menu items | `/admin/menu/items` | `features/menu/MenuItemsPage.tsx` | dark |
| 2 | Menu categories | `/admin/menu/categories` | `features/menu/CategoriesPage.tsx` | **ivory** |
| 3 | Offers | `/admin/offers` | `features/offers/OffersPage.tsx` | dark |
| 4 | Inventory | `/admin/inventory` | `features/inventory/InventoryDashboardPage.tsx` | dark |
| 5 | Stock items | `/admin/inventory/items` | `features/inventory/InventoryItemsPage.tsx` | **ivory** |
| 6 | Stock movements | `/admin/inventory/movements` | `features/inventory/StockMovementsPage.tsx` | dark |
| 7 | Recipes & costing | `/admin/recipes` | `features/recipes/RecipesPage.tsx` | dark |
| 8 | Inventory item detail | `/admin/inventory/items/:id` | `features/inventory/InventoryItemDetailPage.tsx` | **ivory shell** |

**Menu items.** A four-across image-led grid. Each card is a 4:3 picture, then the name, the
category, the price and an availability pill. Category filter chips with counts run above it.

**Categories (ivory).** A four-across grid of cards, each carrying one outline glyph from a single
drawn family, the category name and a real item count.

**Offers.** Compact image-led rows: thumbnail, name, one line of terms, the schedule, a status
badge and a switch.

**Inventory.** Four KPI tiles (total, low, out of stock, healthy), a stock-health donut whose
segments are counted from the real items, and a recent-alerts list with severity and age.

**Stock items (ivory).** Item with a thumbnail, category, current stock, reorder point, status and
unit cost.

**Stock movements.** A ledger: date and time, item, an incoming/outgoing badge, a signed quantity,
the reference document, a note and the user.

**Recipes & costing.** Dish with a thumbnail, category, total cost, selling price, food-cost
percentage and margin, with a profitability badge.

**Inventory item detail (ivory shell).** A picture-led identity header, four stock facts, tabs,
the movement history and the supplier where one is linked.

---

## 4. Board 03 — Purchasing & guests

| # | Reference panel | Route | File | Surface |
|---|---|---|---|---|
| 1 | Suppliers | `/admin/suppliers` | `features/purchasing/SuppliersPage.tsx` | dark |
| 2 | Purchase orders | `/admin/purchases` | `features/purchasing/PurchaseOrdersPage.tsx` | **ivory** |
| 3 | Customers | `/admin/customers` | `features/crm/CustomersPage.tsx` | dark |
| 4 | Loyalty program | `/admin/loyalty` | `features/crm/LoyaltyPage.tsx` | **ivory** |
| 5 | Reservations | `/admin/reservations` | `features/reservations/ReservationsPage.tsx` | dark |
| 6 | Recipe editor | `/admin/recipes/:menuItemId` | `features/recipes/RecipeEditorPage.tsx` | dark |
| 7 | Supplier detail | `/admin/suppliers/:id` | `features/purchasing/SupplierDetailPage.tsx` | **ivory shell** |
| 8 | Purchase order detail | `/admin/purchases/:id` | `features/purchasing/PurchaseOrderPage.tsx` | **ivory shell** |

**Suppliers.** A directory: an initials tile, the supplier, the contact with a phone number, the
category, the outstanding balance, a payment state and a row action.

**Purchase orders (ivory).** Lifecycle tabs with counts, a filter row, then PO number, supplier,
order date, expected delivery, amount, status and a row action.

**Customers.** Guest, contact, visits, total spend, loyalty tier and status.

**Loyalty (ivory).** Tabs; a premium membership card with drawn botanical ornament carrying the
member's real name, number and tier; the programme's real earn and redeem rules beside it; and a
row of counted metrics beneath.

**Reservations.** A week strip of day chips with availability, filters, a list-or-plan switch, a
time-slot column and the day's bookings.

**Recipe editor.** The dish picture and identity, meta chips, an ingredient editor and a persistent
cost panel with a target-range verdict.

**Supplier detail (ivory shell).** Identity, outstanding balance and a settle action; tabs; and
cards for contact details, categories, six-month statistics and payment terms.

**Purchase order detail (ivory shell).** PO number and status, print and actions, the supplier
panel, a lifecycle stepper reflecting the order's real state, the items received against ordered,
and totals.

---

## 5. Board 04 — Hospitality & insights

| # | Reference panel | Route | File | Surface |
|---|---|---|---|---|
| 1 | Club operations | `/admin/club` | `features/club/ClubDashboardPage.tsx` | dark |
| 2 | VIP tables | `/admin/vip` | `features/club/VipTablesPage.tsx` | dark |
| 3 | Bottle service | `/admin/bottle-service` | `features/club/BottleServicePage.tsx` | **ivory** |
| 4 | Room charges | `/admin/room-charges` | `features/billing/RoomChargesPage.tsx` | **ivory** |
| 5 | Reports | `/admin/reports` | `features/reports/ReportsPage.tsx` | dark |
| 6 | Advanced reports | `/admin/reports/advanced` | `features/reports/AdvancedReportsPage.tsx` | **ivory** |
| 7 | Branches & outlets | `/admin/branches` | `features/branches/BranchesPage.tsx` | dark |
| 8 | Customer detail | `/admin/customers/:id` | `features/crm/CustomerDetailPage.tsx` | **ivory shell** |

**Club.** Four operational metrics, the door queue with waiting times and a seat action, and VIP
table status.

**VIP tables.** A drawn club plan — booth positions, dance floor, bar, DJ position — with each
table tile carrying its status and minimum spend, and a detail panel for the selected table.

**Bottle service (ivory).** A product grid of drawn bottles with category chips, price, stock and
an add action.

**Room charges (ivory).** Room, guest, check-in, check-out, amount and a real posting state.

**Reports.** Revenue tiles, an hourly bar chart in gold, a payment-mix donut and a ranked
popular-items list.

**Advanced reports (ivory).** A filter workspace, analysis tabs, and a comparison chart drawn from
two separately fetched periods.

**Branches.** Venue cards led by a drawn interior, with the branch's real metrics.

**Customer detail (ivory shell).** Identity and tier, loyalty progress, recent visits, favourite
dishes and guest notes.

---

## 6. Board 05 — Administration & mobile

| # | Reference panel | Route | File | Surface |
|---|---|---|---|---|
| 1 | Users & access | `/admin/users` | `features/users/UsersPage.tsx` | dark |
| 2 | Roles & permissions | `/admin/roles` | `features/users/RolesPage.tsx` | dark |
| 3 | Audit log | `/admin/audit` | `features/users/AuditPage.tsx` | dark |
| 4 | Settings | `/admin/settings` | `features/settings/SettingsPage.tsx` | dark |
| 5 | Notifications | `/admin/notifications` | `features/notifications/NotificationsPage.tsx` | dark |
| 6 | My profile | `/profile` | `features/auth/ProfilePage.tsx` | dark |
| 7 | Mobile dashboard | `/admin` @ 390 | `features/dashboard/DashboardPage.tsx` | **ivory** |
| 8 | Mobile orders | `/admin/orders` @ 390 | `features/orders/OrdersListPage.tsx` | **ivory** |
| 9 | Mobile More | `/admin/more` | `features/shared/MorePage.tsx` | **ivory** |

---

## 7. Controls the boards show that the product does not support

§7 of the brief is explicit: verify a control before drawing it, and omit rather than fake. Each
of these was checked against the API surface, the mock engine, the Oracle package and the
permission matrix before a decision was taken.

| Depicted | Verdict | What was done |
|---|---|---|
| "Continue with Google / Microsoft" on login | No OAuth client, no IdP config, no server route | **Omitted.** The form is username and password, which is what `AUTH_PKG` implements |
| "Invite user" on Users | No invitation token, no mail transport | **Substituted** with the real *Add user* flow, which creates the account directly |
| "Enable 2FA" on Profile | No enrolment, no secret storage, no verification step | **Omitted** |
| "Manage sessions" / "Active sessions" on Profile | Sessions are a single bearer token; there is no session list to manage | **Omitted.** Sign out is real and stays |
| "Change password" on Profile | Supported | **Implemented** |
| Header global search | Nothing searches across modules | **Substituted.** The header owns a slot and each screen portals its own real search into it, which is what the boards actually show — the placeholder differs on every panel |
| "Import" on Stock items | No import parser or endpoint | **Omitted.** *Export* is real and stays |
| Delivery tracking stepper ("Dispatched → Out for delivery") on a purchase order | The PO lifecycle is draft → sent → approved → ordered → part-received → received. There are no carrier events | **Substituted** with the real lifecycle, labelled with the states the record actually holds |
| "Settle balance" on a supplier | **This entry was wrong when first written.** Supplier payment posting *does* exist: `suppliersApi.addPayment` → `POST /suppliers/:id/payments`, gated on `purchases:manage`, with a working dialog already on the page | **Implemented, under its real name.** The button is "Record payment", which is what it does — it posts a payment against the account. It is not called "Settle balance", because it does not have to settle anything: a part payment is a normal thing to record. The outstanding figure in the identity header carries no action of its own |
| Loyalty "Campaigns" tab | No campaign entity | **Omitted.** Overview, rules and members are real |
| Comparison figures ("+12% vs last week") | Real, but only when fetched | Rendered **only** from a second fetch of the preceding equal-length period. A period with no prior data prints "no data for …", never "+100%" |
| "Live" pill in the header | Real | Driven by the realtime connection's actual state, and it distinguishes last sync from last business event |

Nothing in the product prints a figure, a trend, a ranking, a reservation or a delivery event that
was not returned by the API.

### Fields the boards show that this venue's records do not hold

These are a different category from the table above: not controls that would have been fake, but
*columns and figures* the reference draws which have nothing behind them here. Each was dropped
rather than filled with an approximation, and each is listed with what took its place.

| Board shows | Record holds | Rendered instead |
|---|---|---|
| Supplier **category** column | `Supplier` has no category field | The real facet the rows do have: any balance / balance due / settled |
| Customer **status** column | `Customer` has no status | The real marketing-consent state, which the page already held |
| Membership **number** on the loyalty card | No membership-number field exists anywhere | The venue's business name, the programme name, the real member count and the real tier list |
| Room charges **check-in / check-out** | Stay dates live in the PMS and are never fetched | Columns omitted; the real bill, posting time and PMS reference are shown |
| Reports **food / beverage revenue split** | `reports/sales` returns one grand total | Total revenue, bills paid, average bill and tax — all returned. The prep-location split exists on Advanced → Profitability and stays there |
| Branch **revenue, rating, covers** | `BranchSummary` returns none of them | Outlets, tables, branch code and active state |
| Branch **"Main"** badge | No primary-branch flag exists | The real `isCurrent` flag, labelled "Current branch" |
| VIP table **seated-at** time | Neither `VipTable` nor `VipReservation` carries one | No occupancy clock is drawn; the reservation block prints its real booked-at time |
| Club **average wait** and queue position | An entry is created *after* the guest is through the door; there is no queued state | Titled honestly as a door register, with real time-inside from `enteredAt` and the real entry number |
| Recipe **prep time, veg/non-veg, instructions** | `Recipe` has none of these fields | Prep location, portion label, yield, variant and active state — all real |
| Purchase order **"part received" date** | The record keeps no timestamp for that stage | The stage is shown as reached, with no date under it |
| Roles matrix **View / Create / Edit / Delete** | There is no `:create`, `:edit` or `:delete` permission in the system — the real codes are `view`, `manage` and module-specific actions | Columns derived from the real permission codes, with every remaining permission still a named switch. Four fixed columns would have meant four inert controls on the one screen where that is most dangerous |
| Login **venue name** | The branch endpoint is authenticated — the venue is not knowable before sign-in | The product's own identity |

Two purely visual elements of the boards are also absent by design: the poster background with its
numbered headings and captions, and the promotional footer. They are presentation furniture, not
application chrome.

---

## 8. Imagery

The venue has no photography and none was invented. Menu items, recipes, offers, bottles, rooms
and the login panel are carried by **original drawings** in
`frontend/src/components/graphics/Artwork.tsx`, keyed deterministically off each record's own
name so a dish is the same picture everywhere it appears, and typed from the record's station and
category so the picture never contradicts the data. They are unmistakably illustrations. A real
`imageUrl` always takes precedence, and a broken one falls back to the drawing with no layout
shift.

Category glyphs are a single drawn family (`CategoryGlyph.tsx`) rather than assorted pack icons,
because the reference's category cards are carried entirely by the mark.

QR codes are generated from the real public-menu URL for the real table and branch code, and they
scan. No decorative QR pattern appears anywhere.
