# Testing strategy

## Automated (Vitest — `npm run test`)
| File | Covers |
|---|---|
| `src/utils/billing.test.ts` | Billing engine: subtotal → item/offer discounts → order discount (pro-rata) → service charge → tax components → rounding → grand total; caps; tax-on-service-charge; rounding modes; discount % for cap checks |
| `src/utils/orderStatus.test.ts` | Order/ticket status derivation, item transition guards, table status mapping, add-items / request-bill guards |
| `src/utils/offers.test.ts` | Offer schedule (date/time/weekday), discount per type (percentage, flat, BOGO, combo, cap), best-offer selection |
| `src/services/api/mock/engine/workflow.test.ts` | Full workflow: login → create → confirm (routing) → kitchen/bar status → add batch → PIN-approved cancellation → serve → request bill → bill → cap-limited discount + approval → finalize → split payment, overpayment rejection → close → reversal; plus RBAC (401/403) and validation (400/409/422) |
| `src/services/api/mock/engine/phase2.test.ts` | Phase 2 rules: recipe stock deduction with unit conversion and idempotency, reversal on cancellation, branch deduction mode, negative-stock guard; PO → approval → GRN → stock (and partial receipt); loyalty earn on close, redemption caps, points returned on payment reversal, privacy-safe customer deletion; cover credit capped at unused credit; VIP minimum-spend shortfall in all three branch modes; room charge accepted only for an occupied room, failures recorded; reservation overlap rejection and seat-into-order; low-stock alert de-duplication and auto-resolve; branch isolation of every list |

The mock engine mirrors the PL/SQL packages one-to-one, so these tests double as executable specifications for `ORDER_PKG`, `BILLING_PKG`, `PAYMENT_PKG`, `SEC_PKG` and the Phase 2 packages (`INVENTORY_PKG`, `PURCHASE_PKG`, `LOYALTY_PKG`, `CLUB_PKG`, `VIP_PKG`, `ROOM_CHARGE_PKG`, `NOTIFY_PKG`).

## Backend (Oracle) checks
`database/07_seed.sql` executes the same workflow through the packages (create → confirm → status → bill → discount → split payment → close). After `run_all.sql`:
```sql
SELECT order_number, status FROM orders;                    -- COMPLETED, IN_PROGRESS, BILL_REQUESTED, CONFIRMED, DRAFT
SELECT bill_number, status, payment_status, grand_total, paid_amount FROM bills;
SELECT * FROM v_active_orders;
SELECT action_code, entity_name, COUNT(*) FROM audit_logs GROUP BY action_code, entity_name;
SELECT object_name, object_type FROM user_objects WHERE status <> 'VALID';   -- must be empty
```
Phase 2 (`database/10_phase2_seed.sql` posts opening stock, recipes, purchase orders, customers, reservations, club entries and a VIP booking through the packages):
```sql
SELECT item_name, current_qty, min_qty, avg_cost FROM inventory_items ORDER BY inv_item_id;
SELECT movement_type, COUNT(*) FROM stock_movements GROUP BY movement_type;      -- OPENING_STOCK, PURCHASE, SALE_CONSUMPTION…
SELECT COUNT(*) FROM stock_movements WHERE idempotency_key IS NULL;              -- system-generated rows always carry a key
SELECT po_number, status, grand_total FROM purchase_orders;
SELECT c.full_name, la.points_balance, la.tier FROM customers c JOIN loyalty_accounts la ON la.customer_id = c.customer_id;
SELECT res_number, res_date, res_time, status FROM reservations ORDER BY res_date, res_time;
SELECT entry_number, guests, cover_amount, redeemable_amount, redeemed_amount FROM club_entries;
SELECT vip_number, min_spend, status FROM vip_reservations;
SELECT branch_code, branch_name FROM branches;                                   -- MAIN + HYD
```

## Manual end-to-end script (mock or ORDS)
1. `admin` → **QR codes** → open a table's public link on a phone: menu, offers, item sheet, "show waiter" selection.
2. Tab A `waiter1` → Tables → Table 1 → Chicken Burger ×2 (note "No onion"), Mojito ×1 → **Send order** → toast "sent to Kitchen + Bar".
3. Tab B `kitchen` → KOT card (no prices) → Start preparing → Mark ready. Tab C `bar` → BOT card → ready.
4. Tab A → order PARTIALLY_READY → READY; **Ready** tab → Served. Add 1 × French Fries → new batch appears in kitchen.
5. Tab A → cancel Fries → manager PIN required (`1234`, Priya Nair) → item struck out in KDS.
6. Tab A → **Request bill**. Tab D `cashier` → Bill request → Open → discount 20 % (manager PIN; 5 % works alone) → Finalize → Take payment: Cash 500 + UPI remainder → receipt → Close order. Table 1 back to AVAILABLE in every tab.
7. `manager` → Live operations shows backlog/delay counters; Dashboard shows the sale; Reports → Payments shows Cash + UPI.

## Manual end-to-end script — Phase 2
1. `admin` → **Inventory → Stock overview**: opening stock, values and low-stock cards. Open an item → movements history, adjust −1 with a reason → the row and the average cost update.
2. **Recipes** → a burger → set ingredients with wastage % → the food-cost % and margin update live. Now `waiter1` sends an order containing it → back in Inventory the ingredient quantities drop; cancel the item with a manager PIN → they come back.
3. **Settings → Inventory & operations**: switch stock deduction to *Manual* → confirm a new order → nothing is deducted → the order screen shows **Deduct stock (n)** → click it → stock moves.
4. **Suppliers → Purchase orders → New**: add lines, Send, Approve, Order, then **Receive** part of the quantity → status PARTIALLY_RECEIVED and stock increases at the receipt cost; receive the rest → RECEIVED. Add a supplier payment → the outstanding balance drops.
5. **Customers → New**, then on an open order use **Find customer** to link them. Take payment → **Loyalty** tender → redeem the maximum offered (capped by balance, minimum and the % rule) → settle the rest in cash → close → the profile shows the visit and the points earned.
6. **Club** → *Cover types* → add one with a redeemable amount → **Check in** two guests with it → open their bill → payment screen → **Cover credit** → the entry is offered and capped at the unused credit.
7. **VIP tables** → book a VIP table with a ₹50,000 minimum → Seat → order a small amount → generate the bill → a *minimum spend shortfall* line appears. Change the rule in Settings to *Waive* and repeat → no line.
8. **Reservations** → create two bookings that overlap on one table → the second is rejected → Confirm → Seat (pick a table) → an order opens on it; the host desk (`host` / `Host@123`) shows the same bookings, the door and VIP tables.
9. Cashier → payment screen → **Charge to room** → verify `211` (occupied) then `210` (vacant, rejected) → post → the bill is paid and appears under **Room charges**.
10. Header **bell**: drain an item below its minimum → a low-stock alert appears (once), opens the item, and clears when restocked. **Notifications** page → adjust a threshold and save.
11. Header **branch switcher** (admin/manager): switch to Hyderabad → every list is empty/independent; switch back → data returns. Users page → grant or revoke a user's branches.
12. **Reports → Advanced**: sales by week/month, branch comparison, categories, profitability (food/beverage cost %), inventory valuation, wastage, consumption, staff — each exports CSV.

## Responsive checks
Customer menu 375 px · waiter 768/1024 px · KDS ≥ 1280 px (columns) and 800 px (queue) · cashier ≥ 1024 px · admin desktop and 375 px (bottom nav + drawer) · host desk 768 px · inventory/purchasing tables collapse to cards below 768 px.

## Permission spot-checks
Sign in as each role and confirm the sidebar only shows what the matrix in `RBAC.md` allows, and that hitting a forbidden route directly (e.g. `/admin/purchases` as `waiter1`) renders the "no access" screen rather than data. The mock and PL/SQL layers both enforce this — the UI guard is only a convenience.
