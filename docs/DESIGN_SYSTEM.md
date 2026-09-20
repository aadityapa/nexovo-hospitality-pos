# Nexovo Design System

The single source of truth is `frontend/tailwind.config.ts` (tokens) and
`frontend/src/styles/index.css` (primitives). Never introduce a hex value in a component —
extend the token file instead.

## Palette

| Role | Token | Value |
|---|---|---|
| Page canvas | `bg-surface` | `#F6F7F9` |
| Card / panel surface | `bg-white` | `#FFFFFF` |
| Chrome (sidebar, displays) | `bg-neutral-900` | `#101828` |
| Primary action | `bg-primary-600` | `#087F8C` |
| Primary hover | `bg-primary-700` | `#066773` |
| Primary tint | `bg-primary-50` | `#E8F5F5` |
| Body text | `text-neutral-800` | `#182230` |
| Secondary text | `text-neutral-500` | `#667085` |
| Borders | `border-neutral-200` | `#E4E7EC` |
| Hospitality accent | `accent-*` | amber, `#DB9A2E` at 500 |

Semantic ramps (`success`, `warning`, `danger`, `info`) stay visually distinct from the teal
primary so "success" never reads as "action".

### Verified contrast

| Pairing | Ratio | |
|---|---|---|
| white on `primary-600` | 4.75:1 | AA |
| `primary-700` on white | 6.42:1 | AA |
| `neutral-500` on white | 4.92:1 | AA |
| `neutral-500` on `surface` | 4.64:1 | AA |
| `neutral-800` on white | 14.8:1 | AAA |

Amber and warning reach AA only from `-700`, so use `-700` for text and `-500` for fills.

## Type

Inter with a full system fallback. Scale: `display` `heading` `subheading` `label` `caption`
`metric` `kds` `kds-lg`. Money, quantities and timers always use `tabular-nums`
(applied automatically to `th`, `td`, `time`, `output`).

## Shape, elevation, motion

Radii 8 / 10 / 14 / 18 px. Elevation is deliberately restrained — borders carry most of the
separation (`shadow-card` → `panel` → `pop` → `modal`). All animation collapses to its final
state under `prefers-reduced-motion`.

## Controls

Heights: `min-h-control` 40px (forms), `min-h-touch` 44px (minimum touch target),
`min-h-pos` 56px (primary POS actions). Focus uses a single `outline` token so the indicator
never needs to know the background behind it; `.chrome-dark` brightens it on navy.

## Components

`frontend/src/components/ui` — Button/IconButton, Form controls (Input, PasswordInput, Select,
FilterSelect, Textarea, Checkbox, Switch, SearchInput), Card/StatCard, Modal/Drawer/ConfirmDialog,
Badge/StatusBadge/StatusDot, DataTable, States (Skeleton/Loading/Empty/Error/Alert), ItemImage,
and Misc (PageHeader, Breadcrumbs, Tabs, SegmentedControl, QuantitySelector, Tooltip, Toaster,
KeyValue, Avatar).

Rules that matter:
- Status is never colour alone — always colour **and** an icon **and** a text label.
- Dialogs trap focus and restore it to the trigger on close.
- Every control has a visible label or an explicit `ariaLabel`.
- `ConnectionStatus` reports the real transport state; there is no decorative "Live" badge.
