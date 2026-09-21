# Nexovo Hospitality POS — design system

Premium, in **two complete themes**: charcoal-and-gold dark, and a warm off-white light. Both share
one set of token names, so no component knows which theme is painted. Violet is reserved for VIP.

Token **names** live in `frontend/tailwind.config.ts`; token **values** live in
`frontend/src/styles/index.css` as CSS custom properties, one block per theme. Components must never
introduce ad-hoc colour values — extend the variables instead.

---

## 0. Themes

| | |
|---|---|
| Switching | `data-theme="light"` \| `"dark"` on `<html>` |
| Preference | `light` \| `dark` \| `system` (default), persisted in `localStorage` under `nexovo.theme` |
| Control | The sun / moon / monitor button in the app header cycles light → dark → system and states which is active — an icon alone cannot distinguish "dark by choice" from "dark because the system is" |
| First paint | An inline bootstrap in `index.html` applies the theme before React mounts, so neither theme flashes the other on load |
| Following the system | A `matchMedia` listener registered once at module load keeps `system` actually following the OS while the app is open |
| `theme-color` meta | Updated with the theme so phone browser chrome matches |

**Two surfaces are deliberately theme-independent:**

- `surface-board` — the kitchen and bar displays are dark chrome in both themes. A wall screen in a
  hot kitchen is not a light-mode surface, and the cooks never choose the theme. `.chrome-dark`
  re-declares the whole dark palette for that subtree, so every component inside resolves against
  the dark ramp with no per-theme branch.
- `paper` / `ink` — receipts print dark on white whatever the screen does.

`surface-sunken` (sidebar, login aside) **does** follow the theme: it is chrome the operator looks
at all day.

### Per-route surfaces

Beyond the two themes, individual screens declare their own ground. The reference boards paint
some workspaces warm ivory inside the charcoal product, and carry the ivory out to the navigation
rail on two of them. That is declared once, in `frontend/src/config/surfaces.ts`, on two
independent axes — `shell` (the rail) and `content` (the header and content region) — and applied
by `AdminLayout` as a `.chrome-light` or `.chrome-dark` island.

An island re-declares the entire palette for its subtree, so components inside resolve every token
against the right ground with **no per-screen colour code in any feature file**. Each palette is
now written exactly once, claimed by both its root selector and its island class
(`:root[data-theme='light'], .chrome-light`), which is what makes it impossible for a token to
exist in one and be missing from the other — a bug that had already happened once.

Three rules govern it:

- **The theme toggle wins.** These declarations describe the dark theme. Under the light theme the
  whole application is light and the distinction collapses.
- **Phones are ivory end to end**, for the whole management shell below `lg` rather than for the
  three routes the boards happen to draw — a rail that changed colour between tabs would read as a
  fault. The in-service tools (waiter, cashier, kitchen, bar) stay charcoal at every width.
- **Anything resolving a literal colour must ask the surface, not the theme.** `useChartTheme()`
  is the one place this matters, because Recharts paints into SVG attributes rather than classes.

---

## 1. Colour

### Surfaces

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg-surface` | `#080A0C` | `#F4F6F8` | Application background |
| `bg-surface-raised` | `#11151A` | `#FFFFFF` | Cards, panels, the header |
| `bg-surface-high` | `#171C22` | `#FFFFFF` | Popovers, menus, dialogs |
| `bg-surface-sunken` | `#06080A` | `#E9EDF2` | Sidebar, login aside |
| `bg-surface-board` | `#06080A` | `#06080A` | Kitchen and bar displays — never follows the theme |

### The neutral ramp keeps its MEANING, not its lightness

| Rung | Dark | Light | Meaning |
|---|---|---|---|
| `neutral-50` | `#0E1217` | `#F5F7F9` | Quiet fill that sits *below* its surface |
| `neutral-100` | `#171C22` | `#EDF0F4` | Raised fill, hover |
| `neutral-200` | `#252C34` | `#E1E6EC` | **Hairline borders and dividers** |
| `neutral-300` | `#333C46` | `#C9D1DA` | Stronger border, hover border |
| `neutral-400` | `#7E8892` | `#67707C` | Icons, disabled text, separators |
| `neutral-500` | `#8E98A3` | `#5A6472` | Secondary text |
| `neutral-900` | `#F4F5F6` | `#0E141A` | Primary text |
| `neutral-950` | `#080A0C` | `#080A0C` | Scrims — dark in both themes |

In dark the ramp runs near-black → near-white; in light, near-white → near-black. `bg-neutral-50`,
`text-neutral-500`, `border-neutral-200` and `text-neutral-900` are therefore correct in **both**
themes with no branch, which is why ~90 files carry no theme-specific code at all.

Two consequences to remember: `border-neutral-100` disappears against a card (use `-200`), and
`hover:bg-neutral-50` reads as a hole on dark (use `-100`).

### Accents and semantics

| Token | Value | Rule |
|---|---|---|
| `primary-500` | dark `#D6A84F` · light `#D6A84F` | **Gold.** The primary action, active navigation, emphasised figures. One gold action per view. The fill is the same in both themes — it always carries a dark label. |
| `primary-700` | dark `#E9C778` · light `#8A6212` | The gold **text** rung. Bright on dark, deep on light — `#D6A84F` as text on white is 1.9:1 and is never used. |
| `accent-500` | dark `#9A7BFF` · light `#6D4DE6` | **Violet. VIP classification only.** Never an action, never a generic highlight. |
| `success-500` | dark `#39C98A` · light `#12B76A` | |
| `warning-500` | dark `#F2B84B` · light `#E8A317` | Distinct from gold through label, icon and treatment — never a bare fill on its own |
| `danger-500` | dark `#E85D68` · light `#E0414C` | |
| `info-500` | dark `#5CA9FF` · light `#2E7DE0` | |
| `on-primary` | `#140E03` | The label colour on **any** bright fill. White on gold is 1.9:1 and is never used. |
| `paper` / `ink` / `ink-soft` | `#FFFFFF` / `#101828` / `#475467` | Receipts and print — always dark on white |

Semantic ramps follow the same inversion: `-50` tinted fill, `-200` border, `-500` fill/stroke,
`-700` the legible **text** rung. Status is always colour **and** text, usually plus an icon.

### Verified contrast

Measured in a browser against the surface each token is actually painted on, **in both themes**
(`frontend/scripts/verify-contrast.mjs`, and `verify2.mjs` in the verification harness):

| Pair | Ratio | |
|---|---|---|
| `neutral-900` on `surface-raised` | 15.9:1 | AAA |
| `neutral-500` on `surface-raised` | 6.3:1 | AA |
| `neutral-400` on `surface-raised` | 5.1:1 | AA |
| `primary-500` on `surface-raised` | 8.6:1 | AAA |
| `on-primary` on `primary-500` | 12.0:1 | AAA |
| `success-700` / `warning-700` / `info-700` on `surface-raised` | 10.2 / 11.8 / 9.4:1 | AAA |
| `danger-700` on `surface-raised` | 7.7:1 | AA |
| `accent-500` on `surface-raised` | 5.4:1 | AA |

`neutral-400` was raised from `#6B7682` (3.96:1) after a browser audit found it carrying real text —
separators, counts, muted labels — on 26 screens.

### Verification status of THIS build — read this before quoting a number

The reference-board rebuild changed the palette (warm ivory, warmer charcoal), the page head, the
table density, the navigation rail and all 41 screens. The audit was **partially re-run** against
those changes and then interrupted by an infrastructure failure. What is actually known:

| Check | Status |
|---|---|
| `tsc --noEmit` | **Passed**, before the final `chartTheme.ts` change |
| `vitest run` | **Passed — 67/67**, before the final `chartTheme.ts` change |
| `vite build` | **Passed**, before the final `chartTheme.ts` change |
| `verify-themes dark 1440` | **Run. 47 routes · overflow 0 · unnamed controls 0 · contrast 4** |
| The 4 contrast failures | Root cause found and fixed (see below). **The fix is not re-measured.** |
| The other 9 theme × width combinations | **Not run** |
| Reachability, reduced motion | **Not re-run against this build** |

The four failures were all on `/admin/reports/advanced` — a warm ivory workspace inside the dark
theme — where `useChartTheme()` was resolving against the global theme instead of against the
surface the chart is painted on, so the dark gold series (`#D6A84F`) rendered on white at 2.19:1.
`useChartTheme()` now reads `useRouteSurface().contentIsDark`. The reasoning is sound and the same
hook already drives every other token on that page, but **it has not been re-measured in a
browser, and no one should claim it has.** Re-run `verify-themes.mjs` in both themes at all five
widths before this build is described as clean.

The previous build's result — 41 routes × 2 themes × 5 widths, all clean — was real, and is what
the fix above restores the product to. It is not a claim about the current tree.

### Charts

`src/config/chartTheme.ts` holds a full spec per theme and exports `useChartTheme()`, which returns
the same shape (`CHART`, `CHART_SERIES`, `axisProps`, `gridProps`, `tooltipProps`) resolved for the
active theme. Charts repaint on the toggle without a remount. Light drops the gold series to
`primary-700` (`#8A6212`, 5.5:1 on white); grid `#E1E6EC`, axis `#5A6472`, tooltip on white.

---

## 2. Typography

Inter (with Geist and Manrope as alternates, then a full system stack). Stylistic sets `cv02 cv03
cv04 cv11` are enabled for a straight-sided 1 and open 4/6/9 — clearer at POS distance.

| Token | Size / weight | Use |
|---|---|---|
| `text-display` | 28px / 600 | Page title |
| `text-heading` | 22px / 600 | Section title |
| `text-subheading` | 17px / 600 | Card title |
| `text-label` | 12px / 600, +0.04em, uppercase | Field and metric labels |
| `text-caption` | 12px | Supporting copy |
| `text-metric` | 28px / 650 | The one number a screen is about |
| `text-kds` / `text-kds-lg` | 22 / 28px | Kitchen and bar boards |

**Tabular numerals everywhere numbers are compared**: `th`, `td`, `time` and `output` get them in
base CSS; `.tnum` is the explicit utility. Money is right-aligned in a column.

### Currency

`money()` in `src/utils/money.ts`. An amount with a fractional part always shows both decimals
(`₹1,890.50`, `₹341.90`); a whole amount stays compact (`₹3,781`); `{ decimals: true }` forces the
full form for columns that must align or agree with a receipt. Abbreviated axis labels are a
different job and live in `compactMoney` — an exact figure and an axis tick are never formatted by
the same function.

---

## 3. Shape, elevation, spacing

- **Radii**: controls `sm` 8px / `md` 12px; panels `lg` 16px, `xl` 20px, `2xl` 28px.
- **Elevation**: borders carry most of the separation. `shadow-card` → `panel` → `pop` → `modal`
  deepen in that order. `shadow-gold` exists for exactly one thing: the primary action.
- **Sheens**: `bg-surface-sheen` (a 4.5% top wash), `bg-gold-sheen` (the gold fill), `bg-vip-sheen`
  (a violet corner wash on VIP surfaces). There are no other gradients.
- **Spacing**: 4/8px increments throughout; `min-h-control` 40px, `min-h-touch` 44px, `min-h-pos`
  56px.

---

## 4. Materials

Three physical treatments, all token-driven, all correct in both themes. They are decoration in
`::before` / `::after` with `pointer-events: none`, at opacities low enough to move no contrast
measurement — re-verified across 41 routes × 2 themes after they were applied.

| Class | What it is | Where it goes |
|---|---|---|
| `.material-gloss` | A specular highlight raking across the top — the light a polished panel catches | Stat cards, dialogs, dish cards, the brand mark, toasts |
| `.material-matte` | Fine SVG-turbulence grain, so a large panel reads as a material rather than a flat fill. Rendered by the browser; no image request | Once per screen, on the largest plane only |
| `.material-edge` | A hairline of light along the top edge and a shadow along the bottom — the bevel | Surfaces that need a lifted edge |
| `.material-premium` | All three | The dashboard hero band — one slab per screen |
| `.fill-gold` `.fill-vip` `.fill-success` `.fill-danger` `.fill-surface` | Two-stop gradient washes in their own hue | Primary actions, VIP surfaces, genuinely positive/negative summary tiles |

Strengths differ per theme (`--gloss-strength`, `--grain-strength`, `--edge-light`, `--edge-shade`):
on white a white specular is invisible and grain turns to dirt, so both drop hard.

**One trap, documented in the code:** `.material-edge` is a plain `box-shadow` emitted after
`.card` / `.panel` / `shadow-modal` at equal specificity, so applying it *replaces* the ambient
shadow. Surfaces needing both use a two-element treatment — an outer element carrying the ambient
shadow and the margin, the panel itself carrying the material.

## 5. Motion

`src/config/motion.ts` is the governing document; `src/components/motion/` holds the components.

**The rule the product is built on:** motion may confirm an action, show where something came from,
or mark a moment worth marking. It may never delay an action, repeat while nothing is happening, or
make a figure harder to read.

That makes the energy deliberately unequal:

| Level | Screens | Treatment |
|---|---|---|
| **Theatrical** | login | A staged entrance: brand → headline → form → demo block, the illustration drawing itself in stroke by stroke, one sheen sweep. Nobody is mid-service here. |
| **Expressive** | dashboards, guest menu, empty states | A staged reveal so the eye finds its order. Charts fade, never slide. |
| **Calm** | kitchen and bar boards, order entry, billing, payment, live operations | Direct feedback of the control being touched. Nothing else moves. |

| Token | Duration | Use |
|---|---|---|
| `DUR.fast` | 120ms | Colour and border changes |
| `DUR.control` | 160ms | Buttons, chips, rows, inputs |
| `DUR.overlay` | 220ms | Drawers, modals, popovers |
| `DUR.page` | 240ms | Page transition |
| `DUR.reveal` | 260ms | A staged reveal |
| `DUR.celebrate` | 900ms | A moment worth marking |

**Stagger is capped** (`staggerDelay`, 40ms step, 320ms ceiling) so a long list never trickles in.

**Page transitions** re-key on the pathname and animate the **content region only** — the sidebar,
header and bottom navigation never move, so a target does not slide out from under a finger
mid-tap. `calm` routes opt out entirely.

**`CountUp` is deliberately narrow.** It rolls once per mounted component and never again however
often the value updates; a value arriving later is rendered directly; it is skipped under reduced
motion; and it is used on exactly two figures in the product (the Sales headline on the admin and
manager dashboards). It is barred from tables, lists, bills and anything reconciled against a
receipt.

**Forbidden, by rule and verified by grep:** continuous glow or pulsing, particle backgrounds, 3D
scenes, parallax, bouncing cards, animated money counters in operational contexts, chart entrance
animations (`isAnimationActive={false}` everywhere), and hover-only access to essential
information.

**Reduced motion.** `prefers-reduced-motion: reduce` collapses every animation and transition to
0.01ms, and every `.anim-*` class is additionally forced to `opacity: 1; transform: none` — a
`both`-filled entrance would otherwise be clamped at opacity 0. `.anim-draw` is forced to
`stroke-dashoffset: 0`, and every `--len` deliberately over-estimates its path so a stroke never
stays dashed. **Verified in a browser both ways: 14 checks, 0 elements left invisible after
settling.**

## 6. Layout system

- `--app-bottom-nav` is set by the layout root (`.has-bottom-nav`) and collapses to 0 at `lg`. It
  is the **only** number a sticky bar may use.
- `.save-bar` is `position: sticky; bottom: calc(var(--app-bottom-nav) + 0.75rem)`. Sticky, not
  fixed, so the last field always scrolls clear of it at the end of the document.
- `main` carries `.pb-nav`. No screen hard-codes a padding to match an offset.
- `.touch-target` raises small controls to 44 × 44 **under `@media (pointer: coarse)` only**, so
  desktop keeps its density.
- Any grid that only declares columns at a breakpoint must also declare a base
  `grid-cols-1` — an implicit `auto` track sizes to min-content and will push a card wider than the
  viewport. Prefixed multi-column tracks use `minmax(0,1fr)`, never a bare `1fr`.
- `.card`, `.panel` and `.table-scroll` carry `min-width: 0` for the same reason.

---

## 7. The dashboard band

`components/layout/DashboardHero` is the header every dashboard wears: the venue and branch from
`useBranch()`, the page title, the period, and an optional actions slot — on a `panel` with the
`surface-sheen` wash, a gold hairline and one soft gold bloom. It lives in `components/layout`, not
in a feature, so screens without charts do not pull recharts into their route chunk.

`compact` is the variant for the two live queues (waiter home, cashier settlement). It keeps the
identity, title and period on a single non-wrapping row at a smaller scale — the full band costs
~120 px above the fold at 390 px, enough to push the first queue row off screen. The title wraps
rather than truncates there, because on the waiter's band the title contains their own name.

### Comparison figures

Deltas on the two main dashboards come from a **second, real fetch** of the immediately preceding
period of equal length through the same `reportsApi.dashboard(range)` contract — never a synthesised
figure. While it loads, no delta renders at all. If the previous period has no data, the card says
so rather than printing "+100%", which is not a percentage. Every delta names the period it compares
against. Sparklines use `sales.byHour` / `sales.byDay` only, are never zero-filled, and refuse to
draw below four genuine points.

## 8. Graphics

Original SVG only, in `src/components/graphics/`:

- `Illustrations.tsx` — `HospitalityScene` (login) and eight 96×96 empty-state marks in one
  language: 1.5px strokes, `currentColor` linework, gold used exactly once per mark.
- `TableShape.tsx` — table bodies with seats drawn individually, capacity-aware, status by colour
  **and** label, VIP flag, selection ring.
- `Indicators.tsx` — `StockLevel`, `ProgressMeter` (`role="progressbar"` with a text equivalent),
  and `Sparkline`, which **returns `null` below four genuine points** and must never be fed
  synthetic data.

No raster assets, no icon font, no new dependencies. One icon family: lucide-react.
