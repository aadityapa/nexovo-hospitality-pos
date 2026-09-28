# Luxury redesign — house rules for every screen

These rules bind every feature file touched in the luxury pass. They exist so that fifty screens
edited by several hands still read as one product, and so that a visual change can never grant a
capability or invent one.

## 1. Colour — tokens only

- No hex, `rgb()`, `hsl()` or named colours in a feature file. Only palette utilities:
  `primary-*` (champagne), `neutral-*` (inverted ramp), `success-*`, `warning-*`, `danger-*`,
  `info-*`, `accent-*` (violet), `surface`, `surface-raised`, `surface-high`, `surface-sunken`,
  `surface-board` (kitchen/bar only), `bronze`, `on-primary`.
- The neutral ramp inverts with the theme and keeps MEANING, not lightness: `neutral-200`
  hairline border, `neutral-300` control border, `neutral-400` icons, `neutral-500` secondary
  text, `neutral-900` primary text. Never `text-white`, `bg-black`, `text-gray-*`.
- Violet (`accent-*`) is VIP and nothing else. Emerald is success, amber is pending/warning,
  muted red is error/late. Champagne is the brand and the ONE primary action per screen.
- Gold buttons keep dark text (`Button` primary already does; never build a gold button with
  light text). No glowing text, no rainbow neon, no ornamental crowns, no gold outlines on
  everything — a bronze hairline (`border-bronze/30`–`/40`) is the premium edge, used on a
  hero card, a selected VIP booth (`shadow-vip`), a bottle card. Not on every card.
- Recharts colours come from `useChartTheme()` only.

## 2. Type

- The editorial serif (`font-serif`) is set in `PageHeader` and `DashboardHero` already. Do not
  add it to tables, forms, navigation, tickets, bills, prices or figures. It may be used for a
  welcome line or a hospitality hero sentence (host desk, guest menu title, VIP reservation
  headline) — once per screen at most.
- Figures: `tnum` on every number that sits in a column, total or timer.

## 3. Photography and imagery

- No external image URLs. Local artwork only: `ItemImage` (falls back to `DishArt`),
  `BottleArt`, `VenueArt`, `LoungeScene`, `CategoryGlyph`, `CardFiligree` from
  `@/components/graphics`.
- Never present an unrelated dish, drink or bottle as a real product. If the record has no
  image, the drawn fallback is correct.
- No imagery behind dense financial tables, bills, kitchen or bar tickets. Scenery belongs on a
  header, a hero card, a bottle-service card, the venue card.

## 4. Motion

- Use the utilities: `anim-enter` (220 ms), `anim-enter-soft` (180 ms), `anim-reveal` with
  `style={{ '--d': `${staggerDelay(i)}ms` }}` (30 ms step, capped at 300 ms), `anim-page`,
  `anim-pop` (success only). `DUR` in `@/config/motion` for JS timings.
- Never animate a monetary total through intermediate values. `CountUp` is barred on money.
- Never key an entrance on data that polls — the beat index is a POSITION in a row, not a value.
  Lists that refetch do not replay their entrance.
- Selected VIP table: `shadow-vip` + `border-accent-500/60`, a 150 ms transition. No pulse.
- Add-to-order: the line item takes `anim-enter`; the cart total prints final.
- Kitchen/bar ticket state change: the ticket takes `anim-enter-soft` on its new column; no
  flashing.
- Payment success: `SuccessMark` (`anim-pop`) ONCE, only after the confirmed server response.
- No perpetual particles, gradients that move, autoplaying audio, cursor effects. Transform and
  opacity only; `prefers-reduced-motion` collapses everything via the global rule.

## 5. Layout and touch

- Base `grid-cols-1`; tracks as `minmax(0,1fr)`; every flex child that holds text is `min-w-0`.
- Never `overflow-x-hidden` on a page root to hide overflow — find the intrinsic-width cause
  (a `shrink-0` action slot, a `whitespace-nowrap` chip row, a `w-max` table wrapper).
- Interactive controls ≥ 44 px on touch (`min-h-touch`); role-appropriate bottom nav already
  exists per shell. Keep visible focus (`focus-visible:ring-*` comes from the shared controls).
- Status never by colour alone: keep the text label / icon beside the tone.
- Every field labelled (`Input label=`), every dialog from `Modal`/`Drawer`/`ConfirmDialog`.

## 6. Function is untouchable

- Every hook, mutation, query key, permission check (`usePermission`, `hasPermission`,
  `useReadOnly('settings:manage')`, `useReadOnly('branches:manage')`), `useWorkspace()` branch,
  `env.isMock` gate, and error/empty/loading state stays exactly as it is.
- INR: `money()` from `@/utils/money` — never format currency by hand, never show another symbol.
- Do not draw a control that has no handler: no social login, biometrics, payment integrations,
  invitations, tracking, "email receipt" without an endpoint, "export" without an exporter.
- Loyalty member operations (`loyalty:manage`) remain separate from program configuration
  (`loyalty:configure`); menu-item / category / supplier creation stays behind its permission.

## 7. Syntax discipline (the sandbox cannot compile today)

- JSX comments (`{/* */}`) never sit in attribute position and never as the first thing inside
  `return (`.
- Tailwind opacity modifiers on the default scale (`/5 /10 /15 /20 /25 /30 /40 /50 /60 /70 /75
  /80 /90 /95`) or arbitrary `/[.88]`.
- Do not rename or re-sign shared component props. Do not add dependencies.
- Re-read every edited file end-to-end after editing and check tag balance and imports.
