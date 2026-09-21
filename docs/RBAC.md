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
loyalty:view loyalty:manage loyalty:configure loyalty:redeem
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
| loyalty:configure | ✔ | ✔ | | | | | | |
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


---

## Loyalty: three permissions, not two

`loyalty:manage` used to mean two different things at once — *adjust this member's points* and
*rewrite the program's rules*. They have very different consequences, so they are separate grants.

| Code | Covers |
|---|---|
| `loyalty:view` | See the program and permitted member information |
| `loyalty:manage` | Supported member operations, including point adjustments |
| `loyalty:configure` | Edit program rules: earning, redemption, tiers, expiry, limits |
| `loyalty:redeem` | Redeem points against a bill |

Adjusting points is a daily, audited, reversible service gesture a floor manager has to be able to
make at the table. Changing the earn rate, the point value or the expiry window retrospectively
re-prices every point every member is holding — a different act, with a different blast radius.

**Managers hold `view`, `manage` and `redeem`. They do not hold `configure`.** Administrators hold
all four.

### Where it is enforced

| Layer | File | Assertion |
|---|---|---|
| Oracle package | `database/09c_pkg_crm_loyalty.sql` | `loyalty_pkg.save_program` asserts `loyalty:configure`; `loyalty_pkg.adjust` asserts `loyalty:manage` |
| ORDS router | `database/09f_pkg_router2.sql` | `PUT /loyalty/program` → `loyalty:configure`; `POST /loyalty/accounts/{id}/adjust` → `loyalty:manage` |
| Mock backend | `frontend/src/services/api/mock/engine/p2/crm.ts` | same two assertions, same order |
| Permission list | `frontend/src/config/permissions.ts` | code, role grants and human wording |
| Screen | `frontend/src/features/crm/LoyaltyPage.tsx` | the rules form is read-only without `loyalty:configure` |
| Tests | `frontend/src/services/api/mock/engine/loyaltyPermissions.test.ts` | 17 cases covering both directions |

The package assertion is the one that matters: it guards the procedure however it is reached, so a
manager sending `PUT /loyalty/program` by hand is refused with 403 regardless of what the client
renders. The router assertion is a duplicate, kept so the route table reads as a permission map.

### Upgrading an existing installation

Run `database/11_migration_loyalty_configure.sql` once, as the schema owner. It is idempotent and
carries its own rollback in a comment block. A **fresh** install gets the same end state from
`10_phase2_seed.sql` and must not run it.

| Role | What the migration does |
|---|---|
| `SUPER_ADMIN`, `ADMIN` | Gains `loyalty:configure`. No capability change |
| `MANAGER` | Keeps `view` + `manage` + `redeem`; does **not** gain `configure`. This is the one deliberate reduction, and it is the point of the change |
| `CASHIER`, `WAITER`, `KITCHEN`, `BAR`, `HOST` | Never held `loyalty:manage`. Untouched |
| **Custom (non-system) roles** | Any that hold `loyalty:manage` **gain** `loyalty:configure` |

**Why custom roles keep it.** Before the split, `loyalty:manage` already allowed program
configuration. Silently taking that away from a role somebody deliberately configured would be a
capability regression the operator never asked for — so the migration preserves it, prints every
affected role at the end of its run, and tells the operator how to revoke it if the manager-style
restriction is what they want. Nothing is broadened: only roles that could already configure the
program end up able to.
