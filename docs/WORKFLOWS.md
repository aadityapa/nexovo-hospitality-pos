# Workflows

## End-to-end order lifecycle

```mermaid
sequenceDiagram
  participant C as Customer
  participant M as QR Menu (public)
  participant W as Waiter app
  participant API as ORDS / PL-SQL
  participant K as Kitchen Display
  participant B as Bar Display
  participant CA as Cashier
  C->>M: Scan QR /menu/{branch}/{tableCode}
  M->>API: GET /public/menu
  API-->>M: menu + active offers
  W->>API: POST /orders (DRAFT, items with price snapshots)
  W->>API: POST /orders/{id}/confirm
  API->>API: ORDER_PKG.route_items → KITCHEN_TICKETS / BAR_TICKETS
  API-->>K: event order.confirmed (KITCHEN items)
  API-->>B: event order.confirmed (BAR items)
  K->>API: PUT /kitchen/order-items/{id}/status PREPARING→READY
  B->>API: PUT /bar/order-items/{id}/status PREPARING→READY
  API->>API: derive order status (IN_PROGRESS / PARTIALLY_READY / READY)
  W->>API: PUT /orders/{id}/items/{itemId}/status SERVED
  W->>API: POST /orders/{id}/request-bill
  CA->>API: POST /bills {orderId}  (BILLING_PKG.calculate)
  CA->>API: POST /bills/{id}/discount (cap check / approval)
  CA->>API: POST /bills/{id}/finalize → order BILLED
  CA->>API: POST /bills/{id}/payments (split allowed, no overpayment)
  API->>API: paymentStatus PAID → order PAID
  CA->>API: POST /bills/{id}/close → order COMPLETED, table AVAILABLE
  CA->>API: GET /bills/{id}/receipt → print
```

## Order status state machine
```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> CONFIRMED: confirm (routes tickets)
  CONFIRMED --> IN_PROGRESS: any item PREPARING
  IN_PROGRESS --> PARTIALLY_READY: some items READY
  PARTIALLY_READY --> READY: all items READY
  IN_PROGRESS --> READY
  CONFIRMED --> READY
  READY --> SERVED: all items SERVED
  CONFIRMED --> BILL_REQUESTED
  IN_PROGRESS --> BILL_REQUESTED
  PARTIALLY_READY --> BILL_REQUESTED
  READY --> BILL_REQUESTED
  SERVED --> BILL_REQUESTED: waiter requests bill
  BILL_REQUESTED --> BILLED: cashier finalizes bill
  BILLED --> PAID: balance = 0
  PAID --> COMPLETED: cashier closes
  DRAFT --> CANCELLED
  CONFIRMED --> CANCELLED: manager
  IN_PROGRESS --> CANCELLED: manager
  READY --> CANCELLED: manager
  SERVED --> CANCELLED: manager
  BILL_REQUESTED --> CANCELLED: manager
  COMPLETED --> [*]
  CANCELLED --> [*]
```
Adding items to an existing order is allowed in any status ≤ SERVED; the new batch (`ORDER_ITEMS.BATCH_NO` + 1) is routed immediately if the order is already confirmed. Adding items after BILL_REQUESTED requires the cashier to reopen (bill must be OPEN, not finalized).

## Item cancellation
```
Waiter requests cancel ─► item NEW and order DRAFT? ── yes ─► cancelled, reason stored
                                   │ no
                                   ▼
                    manager approval (approvedByUserId + PIN in mock / manager session in ORDS)
                                   ▼
          item → CANCELLED, cancelled_by, approved_by, reason, timestamp; ticket line struck out
```

## Billing
```
Bill created (OPEN) ─► items snapshot from ORDER_ITEMS (non-cancelled) ─► offers auto-applied as item discounts
   ─► cashier adds order discount (cap check) ─► finalize (FINALIZED, order BILLED)
   ─► payments (CASH/UPI/CARD/COMPLIMENTARY; Σ ≤ grandTotal) ─► PAID ─► close (order COMPLETED, table AVAILABLE)
Reversal: POST /payments/{id}/reverse creates a REVERSED flag + reversal row; paid amount recomputed; never deleted.
```
