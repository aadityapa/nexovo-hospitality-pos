# REST API Specification — v1

Base URL (ORDS): `{VITE_API_BASE_URL}` e.g. `https://host/ords/pos/v1`
Auth: `Authorization: Bearer <session token>` on every non-public route.

## Envelope
```json
{ "success": true,  "message": "Order created successfully", "data": { } }
{ "success": false, "message": "Validation failed", "errors": [ { "field": "quantity", "message": "must be > 0", "code": "MIN" } ] }
```
HTTP codes: 200 OK · 201 Created · 400 validation · 401 unauthenticated · 403 forbidden · 404 not found · 409 conflict / invalid transition · 422 business rule · 500 server.

All list endpoints accept `page`, `pageSize`, `search` where meaningful and return `{ items, total, page, pageSize }`.

## Auth
| Method | Path | Permission | Body / Query | Returns |
|---|---|---|---|---|
| POST | /auth/login | public | `{username, password, rememberMe}` | `{token, expiresAt, user}` |
| POST | /auth/logout | any | – | – |
| GET | /auth/me | any | – | `User` |
| POST | /auth/forgot-password | public | `{email}` | – (always 200) |

## Users & roles
| GET | /users | users:view | `search`, `role`, `status` | `User[]` |
| GET | /users/approvers | any | – | `Approver[]` (id, name, role, cap — for PIN approval pickers) |
| POST | /users | users:manage | `UserInput` | `User` |
| PUT | /users/{id} | users:manage | `UserInput` | `User` |
| PUT | /users/{id}/status | users:manage | `{isActive}` | `User` |
| PUT | /users/{id}/password | users:manage | `{password}` | – |
| GET | /roles | roles:view | – | `Role[]` |
| GET | /permissions | roles:view | – | `PermissionDef[]` |
| PUT | /roles/{id} | roles:manage | `{permissions, maxDiscountPercent}` | `Role` |

## Branch / settings
| GET | /branches/current | any | – | `Branch` |
| PUT | /branches/current | settings:manage | `BranchInput` | `Branch` |
| GET | /settings/taxes | settings:view | – | `TaxGroup[]` |
| PUT | /settings/taxes/{id} | settings:manage | `TaxGroupInput` | `TaxGroup` |
| POST | /settings/taxes | settings:manage | `TaxGroupInput` | `TaxGroup` |

## Floors & tables
| GET | /floors | tables:view | – | `Floor[]` |
| POST | /floors | tables:manage | `FloorInput` | `Floor` |
| PUT | /floors/{id} | tables:manage | `FloorInput` | `Floor` |
| DELETE | /floors/{id} | tables:manage | – (soft) | – |
| GET | /tables | tables:view | `floorId`, `status`, `search`, `waiterId` | `DiningTable[]` |
| GET | /tables/{id} | tables:view | – | `DiningTable` |
| POST | /tables | tables:manage | `TableInput` | `DiningTable` |
| PUT | /tables/{id} | tables:manage | `TableInput` | `DiningTable` |
| DELETE | /tables/{id} | tables:manage | – (soft; blocked if active order) | – |
| PUT | /tables/{id}/status | tables:status:override | `{status, reason}` | `DiningTable` |
| PUT | /tables/{id}/assign | tables:manage | `{waiterId}` | `DiningTable` |
| POST | /tables/{id}/regenerate-qr | qr:manage | – | `DiningTable` (new `publicCode`) |

## Menu
| GET | /menu/categories | menu:view | `includeInactive` | `MenuCategory[]` |
| POST | /menu/categories | menu:manage | `CategoryInput` | `MenuCategory` |
| PUT | /menu/categories/{id} | menu:manage | `CategoryInput` | `MenuCategory` |
| DELETE | /menu/categories/{id} | menu:manage | – (soft; blocked if active items) | – |
| PUT | /menu/categories/reorder | menu:manage | `{orderedIds:number[]}` | `MenuCategory[]` |
| GET | /menu/items | menu:view | `categoryId`, `search`, `prepLocation`, `includeInactive` | `MenuItem[]` |
| POST | /menu/items | menu:manage | `MenuItemInput` | `MenuItem` |
| PUT | /menu/items/{id} | menu:manage | `MenuItemInput` (price change → `MENU_ITEM_PRICES` history + audit) | `MenuItem` |
| DELETE | /menu/items/{id} | menu:manage | – (soft) | – |
| PUT | /menu/items/{id}/availability | menu:availability | `{isAvailable}` | `MenuItem` |

## Offers
| GET | /offers | offers:view | `includeInactive` | `Offer[]` (with computed `isCurrentlyActive`) |
| POST | /offers | offers:manage | `OfferInput` | `Offer` |
| PUT | /offers/{id} | offers:manage | `OfferInput` | `Offer` |
| DELETE | /offers/{id} | offers:manage | – (soft) | – |

## Public
| GET | /public/menu/{branchCode}/{tableCode} | public | – | `PublicMenu` |
`tableCode` is the table's opaque `publicCode` (regenerable) — never the DB id.

## Orders
| GET | /orders | orders:view | `status[]`, `tableId`, `waiterId`, `location`, `active=true`, `from`, `to`, `search` | `Order[]` |
| POST | /orders | orders:create | `CreateOrderRequest {tableId, guestCount?, notes?, items[]}` | `Order` (DRAFT) |
| GET | /orders/{id} | orders:view | – | `Order` |
| PUT | /orders/{id} | orders:create | `{guestCount?, notes?}` | `Order` |
| POST | /orders/{id}/items | orders:create | `{items: NewOrderItemInput[]}` — new batch, routed if order confirmed | `Order` |
| PUT | /orders/{id}/items/{itemId} | orders:create | `{quantity?, notes?}` — only while item NEW & order DRAFT | `Order` |
| POST | /orders/{id}/items/{itemId}/cancel | orders:cancel:item (waiter → needs `approvedBy` if item not NEW / order not DRAFT) | `{reason, approvedByUserId?, approvalPin?}` | `Order` |
| POST | /orders/{id}/confirm | orders:confirm | – → routes items to KITCHEN/BAR tickets | `Order` |
| POST | /orders/{id}/cancel | orders:cancel | `{reason}` | `Order` |
| POST | /orders/{id}/request-bill | orders:request-bill | – | `Order` (BILL_REQUESTED) |
| PUT | /orders/{id}/items/{itemId}/status | orders:item:status | `{status}` (waiter: SERVED only) | `Order` |
| GET | /orders/{id}/history | orders:view | – | `OrderStatusHistory[]` |

## Kitchen / Bar
| GET | /kitchen/orders | kitchen:view | `status` | `Ticket[]` (items with prepLocation KITCHEN only; no prices) |
| PUT | /kitchen/order-items/{id}/status | kitchen:update | `{status: PREPARING\|READY\|SERVED}` | `Ticket` |
| GET | /bar/orders | bar:view | `status` | `Ticket[]` |
| PUT | /bar/order-items/{id}/status | bar:update | `{status}` | `Ticket` |

## Billing
| GET | /bills | billing:view | `status`, `paymentStatus`, `search`, `from`, `to` | `Bill[]` |
| POST | /bills | billing:create | `{orderId}` (idempotent: returns existing open bill) | `Bill` |
| GET | /bills/{id} | billing:view | – | `Bill` |
| POST | /bills/{id}/discount | billing:discount | `{discountType, value, reason, approvedByUserId?}` — capped by role `maxDiscountPercent` unless approved | `Bill` |
| DELETE | /bills/{id}/discount/{discountId} | billing:discount | – (only while OPEN) | `Bill` |
| POST | /bills/{id}/finalize | billing:create | – (locks items/discounts; order → BILLED) | `Bill` |
| POST | /bills/{id}/payments | billing:pay | `{method, amount, reference?}` — rejects overpayment | `Bill` |
| POST | /bills/{id}/payments/{paymentId}/reverse | billing:refund | `{reason}` | `Bill` |
| POST | /bills/{id}/close | billing:close | – (requires PAID; order → COMPLETED; table → AVAILABLE) | `Bill` |
| GET | /bills/{id}/receipt | billing:view | – | `Receipt` |

## Reports & dashboard
| GET | /dashboard/summary | dashboard:view | `from`, `to` | `DashboardSummary` |
| GET | /reports/sales | reports:view | `from`, `to` | `SalesReport` |
| GET | /reports/payments | reports:view | `from`, `to` | `PaymentReport` |
| GET | /reports/orders | reports:view | `from`, `to` | `OrderReport` |
| GET | /reports/items | reports:view | `from`, `to`, `limit` | `ItemSalesReport` |
| GET | /audit-logs | audit:view | `entity`, `from`, `to` | `Paginated<AuditLog>` |
| GET | /events | any | `since` (ISO) | `RealtimeEvent[]` (polling transport) |

---

# Phase 2 — inventory, purchasing, CRM, guests, multi-branch

Every Phase 2 route is dispatched by `api_router2_pkg.dispatch` (see `database/09f_pkg_router2.sql`) behind the same catch-all ORDS handler, uses the same envelope and error codes, and is scoped to the branch in the `X-Branch-Id` header (falling back to the user's default branch).

## Branches & outlets
| Method | Path | Permission | Body / Query | Returns |
|---|---|---|---|---|
| GET | /branches | any | – | `BranchSummary[]` (only branches the caller may access — feeds the header switcher) |
| POST | /branches | branches:manage | `BranchCreateInput` | `BranchSummary[]` |
| PUT | /branches/{id} | branches:manage | `BranchCreateInput` | `BranchSummary[]` |
| GET | /outlets | branches:view | – | `Outlet[]` (current branch) |
| POST | /outlets | branches:manage | `OutletInput` | `Outlet[]` |
| PUT | /outlets/{id} | branches:manage | `OutletInput` | `Outlet[]` |
| PUT | /users/{id}/branches | branches:manage | `{branchIds}` | `User` |
| GET | /users/staff | any | `role?` | `StaffMember[]` (host / promoter pickers) |

`GET|PUT /branches/current` (Phase 1) now also carries `stockDeductionMode`, `minSpendShortfallMode`, `minSpendFlatFee`, `pmsProvider`.

## Inventory
| GET | /inventory/units | inventory:view | – | `InventoryUnit[]` |
| GET | /inventory/categories | inventory:view | – | `InventoryCategory[]` |
| POST/PUT | /inventory/categories[/{id}] | inventory:manage | `InventoryCategoryInput` | `InventoryCategory[]` |
| GET | /inventory/items | inventory:view | `search`, `categoryId`, `status` | `InventoryItem[]` |
| GET | /inventory/items/{id} | inventory:view | – | `InventoryItem` |
| POST/PUT | /inventory/items[/{id}] | inventory:manage | `InventoryItemInput` | `InventoryItem` |
| DELETE | /inventory/items/{id} | inventory:manage | – (soft) | – |
| GET | /inventory/items/{id}/movements | inventory:view | `type`, `from`, `to`, `limit` | `StockMovement[]` |
| GET | /inventory/movements | inventory:view | `invItemId`, `type`, `from`, `to`, `limit` | `StockMovement[]` |
| POST | /inventory/movements | inventory:adjust | `ManualMovementInput` | `InventoryItem` |
| GET | /inventory/dashboard | inventory:view | – | `InventoryDashboard` |
| GET | /inventory/low-stock | inventory:view | – | `InventoryItem[]` |
| POST | /orders/{id}/deduct-stock | inventory:adjust | – (only when the branch mode is MANUAL) | `Order` |

Stock only ever changes through a movement row. Each movement carries an **idempotency key** so a repeat call is a no-op: `ORDER_ITEM:<orderItemId>:<invItemId>` (and `:BOTTLE`), `REVERSE:<movementId>`, `GRN:<grnId>:<poItemId>`, `OPENING:<invItemId>`. Negative stock is rejected (422) unless the item sets `allowNegative`.

## Recipes
| GET | /recipes | recipes:view | – | `RecipeCostRow[]` (costing list) |
| GET | /recipes/{menuItemId} | recipes:view | – | `Recipe` |
| PUT | /recipes/{menuItemId} | recipes:manage | `RecipeInput` | `Recipe` |
| DELETE | /recipes/{menuItemId} | recipes:manage | – | – |

## Suppliers & purchasing
| GET | /suppliers | suppliers:view | `search`, `status` | `Supplier[]` |
| GET | /suppliers/{id} | suppliers:view | – | `SupplierHistory` |
| POST/PUT | /suppliers[/{id}] | suppliers:manage | `SupplierInput` | `Supplier` |
| DELETE | /suppliers/{id} | suppliers:manage | – (soft) | – |
| POST | /suppliers/{id}/payments | purchases:manage | `{amount, method, reference?, poId?, notes?}` | `SupplierHistory` |
| GET | /purchases | purchases:view | `status`, `supplierId`, `search` | `PurchaseOrder[]` |
| GET | /purchases/{id} | purchases:view | – | `PurchaseOrder` |
| POST/PUT | /purchases[/{id}] | purchases:manage | `PurchaseOrderInput` (editable while DRAFT/SENT) | `PurchaseOrder` |
| POST | /purchases/{id}/transition | see below | `{action, reason?}` | `PurchaseOrder` |
| POST | /purchases/{id}/receive | purchases:receive | `ReceiveGoodsInput` | `PurchaseOrder` |

Transitions: `SEND` (purchases:manage, DRAFT→SENT) · `APPROVE` (purchases:approve, SENT→APPROVED) · `ORDER` (purchases:manage, APPROVED→ORDERED) · `CANCEL` (purchases:manage, requires a reason). Receiving is allowed from APPROVED/ORDERED/PARTIALLY_RECEIVED and creates a GRN plus `PURCHASE` movements at the receipt cost (moving average).

## CRM & loyalty
| GET | /customers | customers:view | `search`, `limit` | `Customer[]` |
| GET | /customers/{id} | customers:view | – | `Customer` |
| GET | /customers/{id}/history | customers:view | – | `CustomerHistory` (visits, favourites, loyalty ledger) |
| POST/PUT | /customers[/{id}] | customers:manage | `CustomerInput` | `Customer` |
| DELETE | /customers/{id} | customers:manage | – (anonymises the profile, keeps the visit history) | – |
| PUT | /orders/{id}/customer | customers:view | `{customerId}` (null unlinks) | `Order` |
| GET | /loyalty/program | loyalty:view | – | `LoyaltyProgram` |
| PUT | /loyalty/program | loyalty:manage | `LoyaltyProgramInput` | `LoyaltyProgram` |
| GET | /loyalty/accounts/{customerId} | loyalty:view | – | `LoyaltyAccount` |
| POST | /loyalty/accounts/{customerId}/adjust | loyalty:manage | `{points, notes}` | `LoyaltyAccount` |
| POST | /bills/{id}/redeem-points | loyalty:redeem | `{points}` | `Bill` (adds a `LOYALTY` payment) |

Points are earned when the bill closes, on the amount actually tendered (loyalty and complimentary excluded). Redemption is capped by the balance, `minRedeemPoints`, `maxRedeemPercent` of the bill and the balance due. Reversing a `LOYALTY` payment returns the points as a `REVERSAL` entry.

## Reservations
| GET | /reservations | reservations:view | `from`, `to`, `status`, `search` | `Reservation[]` |
| GET | /reservations/availability | reservations:view | `date` | `ReservationAvailability` |
| GET | /reservations/{id} | reservations:view | – | `Reservation` |
| POST/PUT | /reservations[/{id}] | reservations:manage | `ReservationInput` | `Reservation` |
| POST | /reservations/{id}/transition | reservations:manage | `{action, tableId?, reason?}` | `Reservation` |

Actions: `CONFIRM` · `SEAT` (opens an order on the table and links it) · `COMPLETE` · `CANCEL` · `NO_SHOW`. Overlapping bookings on one table are rejected with 409.

## Club, VIP & bottle service
| GET | /club/cover-types | club:view | – | `CoverChargeType[]` |
| POST/PUT | /club/cover-types[/{id}] | club:manage | `CoverChargeTypeInput` | `CoverChargeType[]` |
| GET | /club/entries | club:view | `date`, `status` | `ClubEntry[]` |
| POST | /club/entries | club:manage | `CheckInInput` | `ClubEntry` |
| POST | /club/entries/{id}/checkout | club:manage | – | `ClubEntry` |
| POST | /club/entries/{id}/cancel | club:manage | `{reason}` | `ClubEntry` |
| GET | /club/dashboard | club:view | – | `ClubDashboard` (business day starts 06:00) |
| POST | /bills/{id}/redeem-cover | billing:pay | `{entryId, amount?}` | `Bill` (adds a `COVER_CREDIT` payment, capped at the unused credit) |
| GET | /vip/tables | vip:view | – | `VipTable[]` |
| GET | /vip/reservations | vip:view | `date`, `status` | `VipReservation[]` |
| GET | /vip/reservations/{id}[/spend] | vip:view | – | `VipReservation` (spend adds shortfall projection) |
| POST/PUT | /vip/reservations[/{id}] | vip:manage | `VipReservationInput` | `VipReservation` |
| POST | /vip/reservations/{id}/transition | vip:manage | `{action, reason?}` — SEAT / COMPLETE / CANCEL / NO_SHOW | `VipReservation` |
| GET | /bottle-service | menu:view | – | `BottleServiceItem[]` |
| PUT | /bottle-service/{menuItemId} | club:manage | `BottleServiceInput` | `BottleServiceItem[]` |
| DELETE | /bottle-service/{menuItemId} | club:manage | – | `BottleServiceItem[]` |

A VIP table that finishes under its minimum spend adds a non-taxable `minSpendShortfall` line to the bill, per the branch rule `CHARGE_DIFFERENCE` / `WAIVE` / `FLAT_FEE`.

## Hotel room charges (PMS seam)
| POST | /room-charges/verify | room-charge:post | `{roomNo}` | `RoomVerification` |
| POST | /bills/{id}/room-charge | room-charge:post | `{roomNo, guestName, amount?}` | `Bill` (adds a `ROOM_CHARGE` payment) |
| GET | /room-charges | billing:view | `from`, `to` | `RoomCharge[]` |

The provider comes from the branch setting `pmsProvider`. `SIMULATED` is the built-in demo adapter (rooms 100–599; numbers ending in 0 are vacant). Real adapters need server-side credentials — none are shipped. A failed posting is stored as `FAILED` and never marks the bill paid.

## Notifications
| GET | /notifications | notifications:view | `unread`, `limit` | `NotificationList` (runs the alert checks first) |
| PUT | /notifications/{id}/read | notifications:view | – | `NotificationList` |
| PUT | /notifications/read-all | notifications:view | – | `NotificationList` |
| GET | /notifications/thresholds | notifications:view | – | `AlertThreshold[]` |
| PUT | /notifications/thresholds | notifications:manage | `{thresholds:[{key,value}]}` | `AlertThreshold[]` |

Alerts are de-duplicated by key (e.g. `LOW_STOCK:<invItemId>`, `PO_APPROVAL:<poId>`) and auto-resolve when the condition clears.

## Advanced reports
| GET | /reports/v2/sales | reports:advanced | `from`, `to`, `groupBy=DAY\|WEEK\|MONTH\|YEAR` | `SalesPeriodReport` |
| GET | /reports/v2/branches | reports:advanced | `from`, `to` | `BranchComparisonRow[]` (branches the caller may access) |
| GET | /reports/v2/categories | reports:advanced | `from`, `to` | `CategoryPerformanceRow[]` |
| GET | /reports/v2/profitability | reports:advanced | `from`, `to` | `ProfitabilityReport` |
| GET | /reports/v2/staff | reports:advanced | `from`, `to` | `StaffPerformanceRow[]` |
| GET | /reports/v2/inventory/valuation | reports:advanced | – | `InventoryValuation` |
| GET | /reports/v2/inventory/low-stock | reports:advanced | – | `InventoryItem[]` |
| GET | /reports/v2/inventory/wastage | reports:advanced | `from`, `to` | `WastageReport` |
| GET | /reports/v2/inventory/consumption | reports:advanced | `from`, `to` | `ConsumptionRow[]` |
| GET | /reports/v2/inventory/movements | reports:advanced | `from`, `to`, `type` | `StockMovement[]` |

Type definitions: `frontend/src/types/*.ts` (Phase 2 in `phase2.ts`). Mock implementation: `frontend/src/services/api/mock` (`engine/p2/*`). ORDS definitions: `database/06_ords_modules.sql` and `database/09f_pkg_router2.sql`.
