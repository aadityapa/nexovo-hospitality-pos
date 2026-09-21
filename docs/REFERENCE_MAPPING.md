# Reference pack → implementation mapping

## Status of the reference pack

**The reference ZIP did not arrive with the request.** The uploads folder was empty and no
`Nexyyra_Hospitality_UI_Redesign_Reference_Pack.zip` exists anywhere in the session, so
`README.md`, `MASTER_REDESIGN_PROMPT.md`, `PER_SCREEN_PROMPTS.md` and the six PNG boards were never
available to read or inspect.

What the request itself specified in full **was** used as the source of truth:

- the complete semantic palette (§3), which is implemented verbatim as tokens;
- the typography, spacing, radius and elevation direction (§3);
- the per-area graphics requirements (§4);
- the motion rules and timings (§5);
- the scope list (§6) and the known-issue list (§8).

So the visual direction below is built from the written brief, not from the boards. The board
compositions may differ in arrangement from what was implemented. **Re-attach the ZIP and the
composition pass can be redone against the actual images** — the token layer means that is a
layout exercise, not a re-theme.

## Naming — checked, not assumed

The product remains **Nexovo Hospitality POS / Nexovo POS**. Verified across the source tree and
the rendered application:

```
grep -rin "nexyyra" frontend/src docs README.md  → 0
```

Sidebar brand, login brand, `VITE_APP_NAME`, browser title, receipt header, documentation titles,
package name, database identifiers, API namespaces, storage keys and environment-variable names are
all unchanged. Venue, branch, staff, guest, menu and table names are the application's own seed and
were not replaced with anything from the brief.

## Board → screen mapping

The six boards are named in the request; each maps to existing routes, and the same language was
extended to every module without a board.

| Reference board | Implemented on | Notes |
|---|---|---|
| `01_command_center` | `/admin` `dashboard/DashboardPage`, `/manager` `ManagerDashboardPage` | Headline figures as `StatCard` rows (one column below 420px), real charts from `chartTheme`, table-occupancy and settlement previews that link to their supporting records. No fabricated deltas — no comparison period is fetched, so `StatCard.delta` is used nowhere. |
| `02_pos` | `/waiter/tables/:id` `waiter/OrderEntry`, `/menu/...` `public-menu/PublicMenuPage` | Menu grid with `ItemImage` crops and fallbacks, clear selected treatment, visible quantity feedback, an order panel that separates "Already sent" from "New items · not sent yet", and a financial hierarchy in the summary. |
| `03_live_floor` | `/waiter/tables`, `/admin/tables`, `/cashier/tables` `tables/TableGrid` | Status by colour **and** word, section filters, 56px targets. `graphics/TableShape.tsx` provides original SVG table bodies with individually drawn seats, capacity, VIP flag and selection ring. |
| `04_kitchen_kds` | `/kitchen`, `/bar` `kitchen/DisplayBoard` | Wall board on `surface-sunken`, `kds`/`kds-lg` type, gold reserved for "ready", delay as colour + icon + word, stable oldest-first sort, and a deliberate single-column stacked queue on a phone. |
| `05_inventory` | `/admin/inventory` and its item / movement / form screens | Exception-first worklist, `graphics/Indicators.tsx` `StockLevel` gauges against minimum and reorder marks, movement direction stated in words with a running balance. |
| `06_club_vip` | `/admin/vip`, `/admin/club`, `/host` | Violet reserved for VIP. A shared minimum-spend meter shows committed minimum, current spend, remaining commitment or "minimum met", and deposit state — rendered only when a table is seated and a minimum exists. |

### Modules with no board — same language applied

Authentication and profile · orders list and detail · ready queues · cashier queues, billing,
discounts, payments, alternative tenders, receipts · menu items, categories, offers, QR ·
floors and reservations · recipes and costing · suppliers, purchasing, receiving · customers and
loyalty · bottle service · room charges · reports and advanced reports · branches, users, roles,
audit, settings, notifications · every dialog, drawer, menu, tooltip, toast and loading / error /
empty state.

## Reference features that were NOT built

The request notes the pack mentions features that may not exist. None were faked. Each needs new
endpoints, schema or persisted state:

| Feature | What is missing |
|---|---|
| Barcode workflows | No barcode field on inventory items; no scan endpoint |
| Table transfers | No transfer endpoint; orders are bound to a table id |
| Dirty / clean table states | The table status model has no cleaning state |
| Floor-plan persistence, drag-and-drop | `Table` carries no x/y coordinates. The grid is presented as a **schematic arrangement**, never as a physically accurate floor plan |
| Split bill / per-seat settlement | No endpoint |
| Waitlist | No entity |
| Dietary / allergen data | Not in the menu schema |
| Period-over-period analytics | No comparison window is fetched by any report endpoint |
| Self-service password change | Only `PUT /users/:id/password`, gated on `users:manage` |
| Offline operation / queued sync | Not implemented; claiming it would be false |

Sparklines are implemented (`Indicators.tsx`) but wired in nowhere: no series in the application has
four or more genuinely measured points that is not already a full chart, and feeding one anything
else would be inventing a trend.
