# Design and motion specification — "The Night Collection"

This is the record of the luxury visual system as implemented. Token names are the ones in
`frontend/tailwind.config.ts`; values are the ones in `frontend/src/styles/index.css`. Where the
concept images and the code disagreed, the code was the authority for function and permissions
and the images for visuals — and where an image showed a control the code cannot back, the
control was not drawn (see `ROUTE_CHECKLIST.md`, "Concept element not drawn").

## 1. Colour

### Dark theme (default; `:root`, `[data-theme='dark']`, `.chrome-dark`)

| Role | Token | Value | Notes |
|---|---|---|---|
| Page ground | `surface` | `#0B0E11` obsidian | body background, `--app-wash` adds a 5 % champagne radial at the top |
| Raised card | `surface-raised` | `#171C21` smoked charcoal | cards, header, sheets |
| Higher plane | `surface-high` | `#1E242A` | popovers, selected rows |
| Rail / sunken | `surface-sunken` | `#080A0D` | navigation rail, floor-plan ground, receipt desk |
| Board | `surface-board` | `#0B0E11` (theme-independent) | kitchen and bar displays, both themes |
| Hairline | `neutral-200` | `rgb(52 46 38)` warm | card borders, dividers |
| Control border | `neutral-300` | `rgb(74 66 54)` | inputs, chips |
| Icon | `neutral-400` | `rgb(142 134 119)` | |
| Secondary text | `neutral-500` | `rgb(163 155 140)` | ≥ 4.5:1 on raised |
| Primary text | `neutral-900` | `#F3EFE6` warm ivory | |
| Brand / primary action | `primary-500` | `#D6BA83` champagne | buttons, active rail bar, selection ring |
| Brand text | `primary-700` | `#E8D4A8` | links, gold labels on dark |
| Text on gold | `on-primary` | `#140E03` | **every gold button has dark text** |
| Premium edge | `bronze` | `rgb(122 96 56)` | hairlines on hero cards, thumbnails, selected tender; `shadow-vip` ring |
| VIP | `accent-500/700` | violet `rgb(142 123 224)` / `rgb(180 166 238)` | **VIP only** — chips, selected VIP booth edge |
| Success | `success-500/700` | emerald `rgb(47 191 138)` / `rgb(110 220 176)` | paid, ready, in stock, active |
| Pending | `warning-500/700` | amber `rgb(229 169 61)` / `rgb(240 199 122)` | awaiting, low stock, elapsed past warn |
| Error / late | `danger-500/700` | muted red `rgb(201 88 79)` / `rgb(228 138 130)` | errors, cancelled, elapsed past late, NEW column rule |
| Info | `info-500/700` | `rgb(92 154 230)` / `rgb(148 190 240)` | neutral status |

### Light theme (`[data-theme='light']`, `.chrome-light`)

| Role | Token | Value |
|---|---|---|
| Page ground | `surface` | `#F3EFE6` warm ivory |
| Raised card | `surface-raised` | `#FBF9F4` |
| Higher plane | `surface-high` | `#FFFFFF` |
| Sunken | `surface-sunken` | `#EAE4D8` |
| Hairline / control | `neutral-200` / `neutral-300` | `rgb(223 214 198)` / `rgb(201 190 169)` |
| Icon / secondary / primary text | `neutral-400` / `-500` / `-900` | `rgb(110 100 87)` / `rgb(98 89 76)` / `rgb(26 22 17)` |
| Brand | `primary-500` | `#D6BA83` (same champagne) |
| Brand text | `primary-700` | `rgb(122 92 30)` — 5.5:1 on raised ivory |
| Bronze | `bronze` | `rgb(168 138 88)` |
| Success / warning / danger `-700` | | `rgb(9 104 68)` / `rgb(128 86 14)` / `rgb(128 40 34)` |

The neutral ramp is **inverted by meaning, not lightness**: `neutral-900` is always the primary
text colour and `neutral-200` always the hairline, in both themes. A feature file never branches
on the theme; it uses the token and the theme resolves it.

### Where each colour is allowed

- Champagne fill: the ONE primary action per screen (or per work unit on a board — each NEW ticket's
  "Start preparing"), the active rail bar, the brand mark, chart primary series.
- Bronze hairline: one hero card per screen, 36 px thumbnails, the selected tender row, bottle cards,
  the venue card, the login card. Not on every card.
- Violet: VIP chips, selected VIP booth edge, `fill-vip` wash on VIP table tiles. Nothing else.
- No glowing text, no neon, no crowns as ornament (the VIP chip carries its small crown glyph as
  an icon beside the word, never alone).

### Surfaces per route

`config/surfaces.ts` declares which routes are ivory "paper" islands under the dark theme (documents
you print and file: supplier account, purchase order, inventory item, guest detail, and a set of
management lists). The layout applies `.chrome-light` to the region; the theme toggle wins (light
theme = everything light). The manager workspace has its own overlay (`MANAGER_OVERRIDES`),
consulted only when the signed-in role resolves to `manager` — never from the URL. A route's surface
holds at every viewport width.

## 2. Type

| Use | Face | Size / weight | Where set |
|---|---|---|---|
| Major page titles | `font-serif` (Cormorant Garamond → Georgia / Iowan Old Style) | 28 px phone / 34 px desktop, weight 500 | `PageHeader`, `DashboardHero` (non-compact) |
| Welcome / hospitality line | serif | 34–48 px | Login "Welcome back", login hero sentence, host desk room name, guest menu venue name, forgot-password, not-found. Once per screen. |
| Brand mark | serif N on champagne + tracked small-caps "NEXOVO" with quiet "POS" suffix | | `BrandMark` |
| Everything else | Inter → system sans | 13 px body, 11 px table header, 12.5–14 px controls | shared components |
| Figures | Inter with `tnum` (tabular numerals) | | every column, total, timer, price |
| Compact heads (live queues) | sans 19 px semibold | | `DashboardHero compact` |

The serif is never used on tables, forms, navigation, tickets, bills or prices.

## 3. Imagery

**Photographs are local files** under `frontend/public/img/`, fetched once from licensed sources
(Pexels, Unsplash — free for commercial use) by `scripts/fetch-assets.mjs`, which Vite runs at
the start of `dev`/`build`. The manifest `frontend/assets.manifest.json` records every file's
source, licence and what it depicts; `docs/IMAGERY.md` records the audit (nine of the seed's
original hot-linked pictures were wrong or dead and were replaced). The running app never loads
an image from the internet.

| Slot | File | Understudy (drawn SVG, shown while loading and if the file is absent) |
|---|---|---|
| Login backdrop, rail venue card, manager/host/club banner | `venue/hero.jpg` — dark bar under brass pendant globes | `LoungeScene` / `VenueArt` |
| Floor cards (Main Dining, Bar Area, VIP Lounge) | `venue/<code>.jpg` | `VenueArt` |
| Menu tiles, waiter order entry, guest menu, inventory and recipe thumbnails | `menu/<code>.jpg` (36 items) | `DishArt` via `ItemImage` |
| Bottle-service cards | `bottles/bs-jd.jpg`, `bottles/bs-gg.jpg` | `BottleArt` |
| Categories, offers, avatars | — (no image field) | `CategoryGlyph`, `DishArt`, initials |

Every photograph renders through `Photo` (`components/graphics/Photo.tsx`) or `ItemImage`: cover
fit, a 240 ms opacity fade over the drawing once loaded, and the drawing left in place on error —
never a broken-image glyph. Rules: no external URLs at runtime; no picture presented as a real
venue, dish or bottle unless it was checked against that record; nothing behind dense financial
tables, bills, kitchen or bar tickets.

## 4. Motion

Timings live in `config/motion.ts` (`DUR`) and the utilities in `styles/index.css`.

| Moment | Duration / easing | Utility | Rule |
|---|---|---|---|
| Controls (hover, press, focus, chip select) | 110–150 ms | `duration-fast`, `duration-control` (default `transition` 140 ms) | colour / transform / box-shadow only |
| Navigation (rail, tabs, page content) | 180–240 ms | `anim-enter-soft` 180 ms, `anim-page` 210 ms, `anim-enter` 220 ms | opacity + ≤ 8 px rise |
| Drawers, dialogs, sheets | 240 ms | `duration-overlay` | opacity + transform |
| Staged reveal | 30 ms step, capped at 300 ms | `anim-reveal` + `--d: staggerDelay(i)` | `i` is a POSITION in a row, never a value; lists that poll do not replay |
| Success | 480 ms, `cubic-bezier(0.34, 1.56, 0.64, 1)` | `anim-pop` on `SuccessMark` | once, only after confirmed server success |
| Login lighting reveal | 900 ms, `cubic-bezier(0.22, 1, 0.36, 1)` | `anim-light-reveal` | on the decorative scene layer only; runs once on mount; the form never dims or scales |
| Selected VIP booth | 150 ms | `shadow-vip` + violet edge | no pulse, no glow loop |
| Add to order | 220 ms | `anim-enter` on the new line, keyed by line id | the total prints final |
| Ticket state change | 180 ms | `anim-enter-soft` on the ticket in its new column, keyed by ticket id | polling and the 1 s clock never remount it |

Prohibitions, all enforced in code: monetary totals never animate through intermediate values
(`CountUp` removed from both dashboards' sales figure and barred on bills, settlement, reports);
entrance animations never key on polled data; no perpetual particles, moving backgrounds,
flashing, autoplaying audio, cursor effects. Everything is `transform`/`opacity`/`filter` on a
decorative layer. Under `prefers-reduced-motion: reduce` the global rule collapses every
`anim-*` utility (including `anim-light-reveal`, with `filter: none`) and every transition to zero
duration; the page renders at its final state.

## 5. Layout, touch and accessibility

- Viewports designed for: 360, 390, 768, 1024, 1440. Base grids are `grid-cols-1`; tracks are
  `minmax(0,1fr)`; text-bearing flex children are `min-w-0`; page titles wrap, never truncate.
- Touch: every control ≥ 44 px (`min-h-touch`, `min-w-touch`) on phones; role-appropriate bottom
  navigation per shell (admin/manager, waiter, cashier), with a `More` page for the overflow.
- Overflow is fixed at its cause. There is no global `overflow-x: hidden`. The one systemic cause
  found in this pass (absolutely-positioned `sr-only` text escaping an unpositioned scroll wrapper)
  is fixed in `.table-scroll` product-wide.
- Keyboard: every interactive element is a real `button`/`a`/input; `focus-visible` rings come
  from the shared controls; dialogs from `Modal`/`Drawer` trap focus, label themselves and close
  on Escape.
- Status is never colour alone: every tone carries its word (badge label, `StatusDot` + text,
  elapsed chip with the word "min", VIP chip with "VIP").
- Every field is labelled (`Input label=`); errors are inline and announced.

## 6. Shell

- Rail: `surface-sunken`, 260 px / 72 px collapsed; brand mark (serif N + tracked wordmark);
  grouped navigation with a champagne active bar; **venue card** at the foot (drawn room, venue,
  branch) — the answer to "which venue am I changing?"; demo notice when the mock backend is on.
- Header: 60 px raised, search slot in the centre (pages portal their search into it), branch
  chip, connection status, theme toggle, notification bell, user menu.
- Login renders outside the shell: no rail, no header, no bottom nav, no branch name before
  sign-in. A signed-in user is redirected to their role home before paint.

## 7. Theme persistence

`localStorage['nexovo.theme']` is read by a bootstrap script in `index.html` before first paint and
mirrored by `applyTheme()` in `store/uiStore.ts`; `data-theme` on `<html>` drives the token blocks,
and `meta[name=theme-color]` follows (`#0B0E11` / `#F3EFE6`). The setting is per browser, applies
to every route and role, and no longer varies with viewport width (the phone-ivory rule was the
cause of the "dark mobile shows light surfaces" report and is removed).

## 8. What the concept shows that the product does not

Collected across the route checklist: social sign-in, a venue name before authentication,
"Guests in venue" headcount, bottle-service revenue tile, spirit categories and vintages on bottles,
"Add to order" from the admin bottle page, waitlist, reservation-level check-in and reschedule,
guest photos / member-since / visit history, service charge in the waiter cart, order-level notes,
covers on kitchen tickets, cross-station board chips, gift-card and house-account tenders, split
tender allocation, email receipt, users/roles as one tabbed page, View/Create/Edit/Delete columns.
Each is absent because there is no endpoint, field or handler behind it; none was faked.
