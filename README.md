# Nexovo Hospitality POS — Phase 1 + Phase 2

Restaurant / bar / club / café / lounge / hotel-F&B point of sale with QR digital menu, order routing (kitchen + bar), billing, split payments, receipts and reports — plus inventory, recipes, purchasing, CRM & loyalty, reservations, club door & VIP tables, hotel room posting, multi-branch and advanced analytics.

```
frontend/   React 18 · TypeScript · Vite · Tailwind · React Router · TanStack Query · Zustand · RHF + Zod
database/   Oracle schema · PL/SQL packages · ORDS REST module · seed data
docs/       Architecture, API spec, RBAC, workflows, assumptions, Phase 2 plan
```

## 1. Quick start (no database needed)

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_MODE=mock (default)
npm run dev                   # http://localhost:5173
```

The **mock backend** runs inside the browser (`src/services/api/mock`), implements every endpoint with the same business rules as the PL/SQL packages, persists to `localStorage`, and broadcasts realtime events across tabs. Open the waiter, kitchen, bar and cashier screens in separate tabs to see the end-to-end flow live.

### Demo credentials (seed data — rotate before production)
| Role | Username | Password | Lands on |
|---|---|---|---|
| Super Admin | `superadmin` | `Super@123` | /admin |
| Admin | `admin` | `Admin@123` | /admin |
| Manager (PIN 1234) | `manager` | `Manager@123` | /manager |
| Waiter | `waiter1`, `waiter2` | `Waiter@123` | /waiter |
| Cashier | `cashier` | `Cashier@123` | /cashier |
| Kitchen | `kitchen` | `Kitchen@123` | /kitchen |
| Bar | `bar` | `Bar@123` | /bar |
| Host (Phase 2) | `host` | `Host@123` | /host |

Customer QR menu: Admin → **QR codes** → open any table's link (`/menu/MAIN/<publicCode>`), no login.

#### Scanning a QR code from a phone
QR codes embed whatever address you are browsing on, so `http://localhost:5173` produces codes that only
work on the same computer — on a phone, "localhost" is the phone itself. To test with a real phone:

1. Put the phone on the **same Wi-Fi** as the computer.
2. Open the app on the computer's network address — `start.bat` prints it (e.g. `http://192.168.1.5:5173`),
   or run `ipconfig` and take the IPv4 address.
3. Print or display the QR codes from **that** address. The QR page warns you when the codes are not reachable.
4. If Windows Firewall prompts on first launch, allow Node.js on private networks.

In mock mode each browser keeps its own database in `localStorage`, so the seeded demo tables use fixed
public codes and scan correctly from any device. Tables you create yourself — and any code you
**Regenerate** — exist only in the browser that made them; use the Oracle backend (`VITE_API_MODE=ords`)
for codes that are shared across devices. For a deployed venue set `VITE_PUBLIC_APP_URL` to the real
public URL so printed codes never change.

### Scripts
```bash
npm run dev         # dev server
npm run typecheck   # tsc --noEmit
npm run test        # vitest: billing engine, status machine, offers, full workflow + RBAC
npm run build       # production build → dist/
```

## 2. Oracle + ORDS backend

Prerequisites: Oracle 19c+ (XE works), ORDS 22+, a schema (e.g. `POS_APP`) with `CREATE TABLE/VIEW/PROCEDURE/SEQUENCE` and `EXECUTE ON DBMS_CRYPTO`.

```sql
-- as SYS
CREATE USER pos_app IDENTIFIED BY "<strong password>" QUOTA UNLIMITED ON users;
GRANT CREATE SESSION, CREATE TABLE, CREATE VIEW, CREATE PROCEDURE, CREATE SEQUENCE, CREATE TRIGGER TO pos_app;
GRANT EXECUTE ON DBMS_CRYPTO TO pos_app;
```
```bash
cd database
sql pos_app/<password>@//localhost:1521/XEPDB1 @run_all.sql     # SQLcl (or sqlplus)
```
`run_all.sql` runs in this order: Phase 1 tables (`01`), Phase 2 tables (`08`), Phase 1 packages (`02`–`05`), Phase 2 packages (`09a`–`09e`), the ORDS module + router (`06`), the Phase 2 router body (`09f`), two recompile passes, then seed data (`07` Phase 1, `10` Phase 2).

ORDS exposes `http(s)://<host>:8080/ords/pos/v1/…`. Point the frontend at it:
```
VITE_API_MODE=ords
VITE_API_BASE_URL=http://localhost:8080/ords/pos/v1
VITE_REALTIME_MODE=polling
```
CORS: `06_ords_modules.sql` allows `http://localhost:5173`; adjust `ORDS.SET_MODULE_ORIGINS_ALLOWED` for production.

Smoke test:
```bash
curl -s -X POST http://localhost:8080/ords/pos/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin@123"}'
curl -s http://localhost:8080/ords/pos/v1/tables -H 'Authorization: Bearer <token>'
```

## 3. Configuration (`frontend/.env`)
| Variable | Purpose |
|---|---|
| `VITE_API_MODE` | `mock` (in-browser) or `ords` |
| `VITE_API_BASE_URL` | ORDS module base URL |
| `VITE_PUBLIC_APP_URL` | Public URL embedded in QR codes (must be reachable from phones). Leave empty to use the address you're browsing on |
| `VITE_REALTIME_MODE` | `broadcast` (mock), `polling` (ORDS `/events`), `none` |
| `VITE_REALTIME_POLL_MS` | Polling interval |
| `VITE_MOCK_LATENCY_MS` | Simulated latency in mock mode |

## 4. What's in Phase 1
Authentication & sessions · RBAC (7 roles, 38 permissions, enforced server-side) · Admin dashboard with date filters · Public QR menu (mobile-first, offers, item sheet, "show waiter" selection) · Menu categories/items (soft delete, price history, availability) · Offers (percentage, flat, BOGO, combo, happy hour with schedules) · Floors & tables (visual map, live status, manual override, waiter assignment) · QR management (download/print/regenerate) · Waiter app (table grid, POS-style order entry, notes chips, drafts, add-on batches, ready list) · Kitchen & Bar displays (NEW/PREPARING/READY columns, delay indication, queue mode) · Manager live operations & alerts · Cashier dashboard, billing screen, discount caps with PIN approval, split payments (cash/UPI/card/complimentary), reversal, receipt (80 mm) · Reports (sales, payments, orders, items, CSV) · Audit log.

## 4b. What's in Phase 2
**Inventory** — items with units & pack sizes, categories, moving-average costing, stock movements as the only way stock changes (idempotency keys), manual adjustments/wastage, low-stock and out-of-stock alerts, dashboard. **Recipes** — per menu item with yield and wastage %, live food-cost % and margin; confirming an order deducts ingredients (converted to the stock unit), cancelling reverses them. The moment of deduction is a branch setting: `ON_CONFIRM` / `ON_BILL_CLOSE` / `MANUAL`. **Suppliers & purchasing** — supplier ledger with payments and outstanding balance, purchase orders (DRAFT → SENT → APPROVED → ORDERED → PARTIALLY_RECEIVED → RECEIVED / CANCELLED), goods receipts that post `PURCHASE` movements at the receipt cost. **CRM & loyalty** — guest profiles with explicit marketing consent and privacy-safe deletion, visit history and favourites, a points program (earn on tender, redeem as a payment method within caps, expiry, tiers, full ledger). **Reservations** — day / week views, table availability, overlap protection, seat-into-order. **Club** — cover charge types with redeemable credit, door check-in/out, business day from 06:00, dashboard; the redeemable part is applied on the bill as a `COVER_CREDIT` payment. **VIP tables** — bookings with minimum spend and deposit, live spend tracking, shortfall charged / waived / flat-fee per branch rule. **Bottle service** — whole-bottle menu items linked to stock. **Hotel room billing** — PMS adapter seam (`SIMULATED` demo provider), verify-then-post with failures recorded. **Multi-branch** — organization → branch → outlet → floor → table, per-user branch access, header switcher, every query scoped server-side. **Advanced reports** — sales by period, branch comparison, category performance, profitability (COGS from recipes), inventory valuation, wastage, consumption, staff performance, all exportable as CSV. **Notifications** — de-duplicated alerts with per-branch thresholds and an in-app centre.

## 5. Docs
* `docs/ARCHITECTURE.md` — layers, data flow, state machines, billing formula
* `docs/API_SPEC.md` — every endpoint, permissions, payloads
* `docs/RBAC.md` — role/permission matrix, discount caps
* `docs/WORKFLOWS.md` — sequence & state diagrams
* `docs/DATABASE.md` — schema overview
* `docs/TESTING.md` — test strategy & manual E2E script
* `docs/ASSUMPTIONS.md` — documented assumptions
* `docs/PHASE2_PLAN.md` — design system, navigation, Phase 2 schema & roadmap

## 6. Project layout (frontend)
```
src/app            providers, router, error boundary, query client
src/config         env, permissions matrix, status metadata, navigation, role homes
src/types          domain types (mirror of API_SPEC.md)
src/services/api   ApiClient interface · OrdsClient (HTTP) · MockClient (in-browser) · endpoint modules
src/services/realtime  RealtimeProvider abstraction (broadcast / polling)
src/store          zustand: auth, cart, ui/toasts
src/hooks          useAuth, usePermission, useRealtimeInvalidate, useNow, useDebounce
src/components/ui  design system (Button, Form, Modal, Badge/StatusBadge, Card, DataTable, States…)
src/layouts        AdminLayout (sidebar) · PosLayout (bottom nav) · DisplayLayout (KDS)
src/features       auth · public-menu · dashboard · menu · offers · tables · orders · waiter · kitchen · bar · manager · cashier · billing · reports · users · settings
                   phase 2: inventory · recipes · purchasing · crm · reservations · club · notifications · branches · host
src/utils          billing engine · order status machine · offers · money · dates · csv
```

Phase 2 backend files: `database/08_phase2_schema.sql` (tables), `09a`–`09e` (packages: branch/inventory, purchasing, CRM/loyalty, reservations/club/VIP/PMS, notifications/reports v2), `09f` (router), `10_phase2_seed.sql`. Mock equivalents live in `frontend/src/services/api/mock/engine/p2/`.
