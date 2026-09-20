# Roles & Permissions

Permissions are data rows (`PERMISSIONS`) linked to roles (`ROLE_PERMISSIONS`). The same matrix is mirrored in `frontend/src/config/permissions.ts` for route guards and UI, and enforced server-side by `SEC_PKG.assert_permission` in every ORDS handler.

## Permission codes
```
dashboard:view        reports:view          audit:view
users:view users:manage roles:view roles:manage settings:view settings:manage
menu:view menu:manage menu:availability
offers:view offers:manage
tables:view tables:manage tables:status:override qr:view qr:manage
orders:view orders:view:all orders:create orders:confirm orders:cancel orders:cancel:item
orders:request-bill orders:item:status orders:approve-discount
kitchen:view kitchen:update bar:view bar:update
billing:view billing:create billing:discount billing:pay billing:refund billing:close billing:edit-paid
```
Phase 2 adds:
```
inventory:view inventory:manage inventory:adjust
recipes:view recipes:manage
suppliers:view suppliers:manage
purchases:view purchases:manage purchases:approve purchases:receive
customers:view customers:manage
loyalty:view loyalty:manage loyalty:redeem
reservations:view reservations:manage
club:view club:manage vip:view vip:manage
room-charge:post branches:view branches:manage
notifications:view notifications:manage reports:advanced
```

## Matrix
| Permission | SUPER_ADMIN | ADMIN | MANAGER | WAITER | CASHIER | KITCHEN | BAR |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| dashboard:view | ✔ | ✔ | ✔ | | | | |
| reports:view | ✔ | ✔ | ✔ | | | | |
| audit:view | ✔ | ✔ | | | | | |
| users:view / users:manage | ✔ | ✔ | | | | | |
| roles:view / roles:manage | ✔ | ✔ | | | | | |
| settings:view | ✔ | ✔ | ✔ | | | | |
| settings:manage | ✔ | ✔ | | | | | |
| menu:view | ✔ | ✔ | ✔ | ✔ | ✔ | | |
| menu:manage | ✔ | ✔ | | | | | |
| menu:availability | ✔ | ✔ | ✔ | | | | |
| offers:view | ✔ | ✔ | ✔ | ✔ | ✔ | | |
| offers:manage | ✔ | ✔ | ✔ | | | | |
| tables:view | ✔ | ✔ | ✔ | ✔ | ✔ | | |
| tables:manage | ✔ | ✔ | ✔ | | | | |
| tables:status:override | ✔ | ✔ | ✔ | | | | |
| qr:view / qr:manage | ✔ | ✔ | | | | | |
| orders:view | ✔ | ✔ | ✔ | ✔ | ✔ | | |
| orders:view:all | ✔ | ✔ | ✔ | | ✔ | | |
| orders:create | ✔ | ✔ | ✔ | ✔ | | | |
| orders:confirm | ✔ | ✔ | ✔ | ✔ | | | |
| orders:cancel | ✔ | ✔ | ✔ | | | | |
| orders:cancel:item | ✔ | ✔ | ✔ | ✔ (approval needed once confirmed) | | | |
| orders:request-bill | ✔ | ✔ | ✔ | ✔ | | | |
| orders:item:status | ✔ | ✔ | ✔ | ✔ (SERVED only) | | | |
| orders:approve-discount | ✔ | ✔ | ✔ | | | | |
| kitchen:view / kitchen:update | ✔ | ✔ | ✔ | | | ✔ | |
| bar:view / bar:update | ✔ | ✔ | ✔ | | | | ✔ |
| billing:view | ✔ | ✔ | ✔ | | ✔ | | |
| billing:create / billing:pay / billing:close | ✔ | ✔ | ✔ | | ✔ | | |
| billing:discount | ✔ | ✔ | ✔ | | ✔ (≤ role max) | | |
| billing:refund | ✔ | ✔ | ✔ | | | | |
| billing:edit-paid | ✔ | ✔ | | | | | |

## Phase 2 matrix
HOST is the new Phase 2 role (door / reservations / VIP desk).

| Permission | SUPER_ADMIN | ADMIN | MANAGER | WAITER | CASHIER | KITCHEN | BAR | HOST |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| inventory:view | ✔ | ✔ | ✔ | | | ✔ | ✔ | |
| inventory:adjust | ✔ | ✔ | ✔ | | | ✔ | ✔ | |
| inventory:manage | ✔ | ✔ | ✔ | | | | | |
| recipes:view / recipes:manage | ✔ | ✔ | ✔ | | | | | |
| suppliers:view | ✔ | ✔ | ✔ | | | | | |
| suppliers:manage | ✔ | ✔ | | | | | | |
| purchases:view / manage / receive | ✔ | ✔ | ✔ | | | | | |
| purchases:approve | ✔ | ✔ | ✔ | | | | | |
| customers:view / customers:manage | ✔ | ✔ | ✔ | ✔ | ✔ | | | ✔ |
| loyalty:view | ✔ | ✔ | ✔ | | ✔ | | | |
| loyalty:manage | ✔ | ✔ | ✔ | | | | | |
| loyalty:redeem | ✔ | ✔ | ✔ | | ✔ | | | |
| reservations:view | ✔ | ✔ | ✔ | ✔ | | | | ✔ |
| reservations:manage | ✔ | ✔ | ✔ | | | | | ✔ |
| club:view | ✔ | ✔ | ✔ | | ✔ | | | ✔ |
| club:manage | ✔ | ✔ | ✔ | | | | | ✔ |
| vip:view | ✔ | ✔ | ✔ | ✔ | | | | ✔ |
| vip:manage | ✔ | ✔ | ✔ | | | | | ✔ |
| room-charge:post | ✔ | ✔ | ✔ | | ✔ | | | |
| branches:view | ✔ | ✔ | ✔ | | | | | |
| branches:manage | ✔ | ✔ | | | | | | |
| notifications:view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| notifications:manage | ✔ | ✔ | ✔ | | | | | |
| reports:advanced | ✔ | ✔ | ✔ | | | | | |

HOST also holds `tables:view`, `menu:view`, `orders:view`, `orders:view:all`, `orders:create` and `orders:confirm` so a booking or a VIP table can be seated straight into an order.

## Branch scope (multi-branch)
Every request runs against exactly one branch: the `X-Branch-Id` header, validated against `USER_BRANCHES` (`branch_pkg.assert_branch_access`), falling back to the user's default branch. All queries filter on it — a user can never read another branch's orders, stock, customers or bills by changing an id. SUPER_ADMIN may access every branch; other users only those granted on the Users page. The header branch switcher clears the client cache on switch.

## Discount caps (`ROLES.MAX_DISCOUNT_PERCENT`)
SUPER_ADMIN 100 · ADMIN 100 · MANAGER 30 · CASHIER 10 · others (incl. HOST) 0. A discount above the applier's cap requires `approvedByUserId` whose role has `orders:approve-discount` and a cap ≥ the requested percent. Approval is stored on the `DISCOUNTS` row.

## Post-login home
SUPER_ADMIN/ADMIN → `/admin` · MANAGER → `/manager` · WAITER → `/waiter` · CASHIER → `/cashier` · KITCHEN → `/kitchen` · BAR → `/bar` · HOST → `/host`.

## Data-visibility rules
* Kitchen/Bar ticket payloads contain no prices, totals or payment data (`TICKET_PKG` projects only item name, qty, notes, status, table, timing).
* Waiters without `orders:view:all` only see orders for tables assigned to them or created by them.
* Customer contact details are only returned to `customers:view`; deleting a customer anonymises name, phone, email and notes while keeping the visit rows for reporting. Marketing is sent only to profiles with `consentMarketing` and a stored consent timestamp.
* Cost prices, stock values and supplier terms need `inventory:view` / `suppliers:view` — they never appear in waiter, kitchen or bar payloads.
