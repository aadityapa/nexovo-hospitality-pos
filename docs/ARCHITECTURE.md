# Nexovo Hospitality POS — Phase 1 Architecture

## 0. Phase A — Workspace analysis

| Item | Finding |
|---|---|
| Existing codebase | None. `Bill system/` was empty — greenfield project. |
| Existing stack | None. Stack fixed by requirements: React 18 + TypeScript + Vite + Tailwind + React Router + TanStack Query + Zustand + React Hook Form + Zod; Oracle DB + PL/SQL + ORDS. |
| Reusable components | None existing; a design system is created in `frontend/src/components/ui`. |
| Potential problems identified | (1) Frontend must run before Oracle/ORDS is provisioned → solved with a swappable API layer (`mock` / `ords`). (2) Concurrent order/bill numbering → solved with DB sequence-per-day table + `SELECT … FOR UPDATE` in `NUMBERING_PKG`. (3) Price drift → snapshots in `ORDER_ITEMS`/`BILL_ITEMS`. (4) Real-time → abstracted `RealtimeProvider` (BroadcastChannel in mock, polling/SSE in ORDS). (5) Billing correctness → single pure calculation engine (`utils/billing.ts`) mirrored by `BILLING_PKG`, unit-tested. |

## 1. System overview

```
Customer phone ──► /menu/:branchCode/:tableCode (public, no login)
Staff devices  ──► React SPA (role-based routes)
                        │
                        ▼
              services/api (typed endpoint modules)
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
   MockClient (in-memory,        OrdsClient (fetch, JWT bearer)
   localStorage-persisted)              │
                                        ▼
                               Oracle ORDS  /ords/pos/v1/…
                                        │
                                        ▼
                               PL/SQL packages (business rules, RBAC, numbering,
                               routing, billing, payments, audit)
                                        │
                                        ▼
                               Oracle Database (normalized schema, soft delete,
                               history tables)
```

The frontend never contains billing/permission logic that the backend does not also enforce. Frontend logic exists for UX (instant totals, disabled buttons); PL/SQL is the source of truth.

## 2. Frontend architecture

```
frontend/src
├── app/            App shell, providers (Query, Router, Toast), router
├── config/         env, permissions matrix, status metadata, role home routes
├── types/          Domain types shared by UI, API layer and mock backend
├── services/
│   ├── api/
│   │   ├── client.ts         ApiClient interface (get/post/put/delete) + ApiError
│   │   ├── http/ordsClient   Real HTTP client (ORDS)
│   │   ├── mock/             In-memory backend implementing ALL workflows
│   │   │   ├── db.ts         Seed + persistence (localStorage)
│   │   │   ├── engine/       auth, menu, tables, orders, billing, reports…
│   │   │   └── mockClient.ts Route table → engine
│   │   ├── endpoints/        Typed endpoint modules (authApi, ordersApi …)
│   │   └── index.ts          getApiClient() — chooses by VITE_API_MODE
│   └── realtime/             RealtimeProvider abstraction + implementations
├── store/          Zustand stores (auth, cart, ui)
├── hooks/          useAuth, usePermission, useRealtimeInvalidate, useDebounce…
├── components/ui   Design system
├── layouts/        AdminLayout, PosLayout, DisplayLayout, PublicLayout
├── routes/         ProtectedRoute, RequirePermission, role redirect
├── features/       auth, dashboard, users, roles, menu, offers, tables, qr,
│                   public-menu, waiter, orders, kitchen, bar, manager,
│                   cashier, billing, reports, settings
└── utils/          money, dates, billing engine, order status machine, cn
```

### Data flow
1. Page → `useQuery({queryKey, queryFn: ordersApi.list})`.
2. Endpoint module → `api.get('/orders', params)` → `ApiClient`.
3. `ApiClient` returns `data` from the standard envelope or throws `ApiError {status, message, errors}`.
4. Mutations invalidate query keys; `RealtimeProvider` events invalidate the same keys on other devices/tabs.

### Replaceability
Only `services/api/http/ordsClient.ts` knows about ORDS URLs. Switching to Node/Spring/.NET means writing a new `ApiClient` implementation — endpoint modules, hooks and pages do not change.

## 3. Backend architecture (Oracle)

* **ORDS** exposes `/ords/pos/v1/*` modules; each handler calls one PL/SQL procedure and returns the standard JSON envelope built by `API_PKG`.
* **Packages**: `SEC_PKG` (auth, sessions, permissions), `NUMBERING_PKG`, `MENU_PKG`, `TABLE_PKG`, `OFFER_PKG`, `ORDER_PKG` (create/add items/confirm/route/status/cancel), `TICKET_PKG` (kitchen/bar), `BILLING_PKG` (calc, discounts, finalize), `PAYMENT_PKG`, `REPORT_PKG`, `AUDIT_PKG`, `API_PKG` (envelope + error mapping).
* **Security**: session token table (`USER_SESSIONS`); every ORDS handler calls `SEC_PKG.authenticate(token)` then `SEC_PKG.assert_permission(user_id, 'orders:create')`. Password hashes use `DBMS_CRYPTO` SHA-512 with per-user salt (PBKDF-style iteration count configurable).
* **Numbering**: `DOC_SEQUENCES(doc_type, seq_date, last_no)` row locked with `FOR UPDATE` → `ORD-YYYYMMDD-0001` safe under concurrency.
* **History**: `ORDER_STATUS_HISTORY`, `ORDER_ITEM_STATUS_HISTORY`, `AUDIT_LOGS`; no physical deletes on transactional tables.

## 4. Real-time abstraction

```ts
interface RealtimeProvider {
  connect(): void; disconnect(): void;
  subscribe(topic: RealtimeTopic, handler: (evt: RealtimeEvent) => void): () => void;
  publish?(evt: RealtimeEvent): void; // only for mock
}
```
Implementations: `BroadcastRealtime` (mock, cross-tab via `BroadcastChannel`), `PollingRealtime` (ORDS, interval-based `GET /events?since=`), future `SseRealtime`/`WebSocketRealtime`. Components only use `useRealtimeInvalidate(topics, queryKeys)`.

## 5. Status machines

**Order item**: `NEW → PREPARING → READY → SERVED`; any non-SERVED → `CANCELLED` (waiter needs manager approval once item is not NEW or order is confirmed).

**Order** (derived while ≤ SERVED, explicit afterwards):
```
DRAFT → CONFIRMED → IN_PROGRESS → PARTIALLY_READY → READY → SERVED
      → BILL_REQUESTED → BILLED → PAID → COMPLETED
Any ≤ BILLED → CANCELLED (manager)
```
Derivation rule (`utils/orderStatus.ts` ≡ `ORDER_PKG.derive_status`): ignore cancelled items; all NEW → CONFIRMED; all SERVED → SERVED; all READY/SERVED → READY; some READY/SERVED → PARTIALLY_READY; any PREPARING → IN_PROGRESS; else CONFIRMED.

**Table**: derived from its active order: no order → AVAILABLE; DRAFT/CONFIRMED → ORDERING; IN_PROGRESS/PARTIALLY_READY → PREPARING; READY → READY; SERVED → OCCUPIED; BILL_REQUESTED/BILLED → BILLING; PAID (balance>0) → PAYMENT_PENDING; COMPLETED → AVAILABLE. Manual override allowed for admin/manager (`tables:status:override`).

## 6. Billing engine

```
lineTotal = unitPrice × qty (snapshot price)
subtotal = Σ lineTotal (non-cancelled)
itemDiscounts = Σ offer discounts per line
orderDiscount = Σ bill-level discounts (allocated to lines pro-rata for tax)
netAmount = subtotal − itemDiscounts − orderDiscount
serviceCharge = netAmount × serviceChargePercent
taxBase(line) = line taxable share (+ service charge share if taxOnServiceCharge)
taxLines = Σ per tax component (CGST/SGST/…) per tax group
rawTotal = netAmount + serviceCharge + taxTotal
grandTotal = round(rawTotal, roundingMode); roundOff = grandTotal − rawTotal
```
Implemented once in `frontend/src/utils/billing.ts` (used by mock + UI preview + tests) and once in `BILLING_PKG.calculate`.

## 7. Implementation plan (executed in this order)

| Step | Deliverable |
|---|---|
| A | This document, `API_SPEC.md`, `DATABASE.md`, `WORKFLOWS.md`, `RBAC.md` |
| C | `database/` — DDL, constraints, indexes, packages, ORDS, seed |
| B | Frontend foundation: scaffold, types, API layer, auth, RBAC, routing, design system |
| D1 | Mock backend engine implementing every endpoint in `API_SPEC.md` |
| D2 | Admin: dashboard, users, roles, categories, items, offers, floors, tables, QR, settings |
| D3 | Public QR menu |
| D4 | Waiter, Kitchen Display, Bar Display, Manager live orders |
| D5 | Cashier dashboard, billing screen, payments, receipt, reports |
| E | Vitest tests (billing, transitions, discounts, RBAC), README, `.env.example` |

## 8. Phase-2 readiness
* `BRANCHES` is first-class on every table → multi-branch/SaaS tenancy (add `TENANT_ID` later without refactor).
* `ORDERS.ORDER_TYPE` (DINE_IN now; ROOM_SERVICE, TAKEAWAY later) and `ORDERS.REFERENCE_TYPE/ID` (hotel room, reservation, club entry).
* `MENU_ITEMS` ↔ future `INVENTORY_ITEMS` via `RECIPES` table (not created yet, no blocking constraints).
* `PAYMENTS.METHOD` is a lookup value, not a check-constrained enum, to allow `ROOM_CHARGE`, `WALLET`.
* Permissions are data (`PERMISSIONS`, `ROLE_PERMISSIONS`), not code.
