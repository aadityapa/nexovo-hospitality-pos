import type { Config } from 'tailwindcss';

/** Builds a token ramp that reads from the CSS custom properties set per theme. */
const v = (name: string, rungs: number[]): Record<string, string> =>
  Object.fromEntries(rungs.map((r) => [String(r), `rgb(var(--c-${name}-${r}) / <alpha-value>)`]));

/**
 * NEXOVO DESIGN TOKENS — single source of truth for colour, type, radius, elevation and motion.
 *
 * DIRECTION: premium, in TWO complete themes. Charcoal-and-gold dark, and a warm off-white light
 * that shares every token name. A violet is reserved for VIP classification, and the semantics stay
 * clearly separate from the gold so "warning" never reads as "primary action".
 *
 * COLOUR VALUES LIVE IN src/styles/index.css as CSS custom properties, one set per theme. This file
 * only names the tokens. Switching `data-theme` on <html> repaints the product; no component knows
 * which theme is active.
 *
 * THE NEUTRAL RAMP KEEPS ITS MEANING IN BOTH THEMES, not its lightness:
 *   neutral-50  … the quiet fill that sits *below* a surface
 *   neutral-200 … hairline borders
 *   neutral-400 … icons, disabled text, separators
 *   neutral-500 … secondary text
 *   neutral-900 … primary text
 * In dark that runs near-black → near-white; in light, near-white → near-black. Components are
 * written against the meaning, so `bg-neutral-50`, `text-neutral-500`, `border-neutral-200` and
 * `text-neutral-900` are correct in both themes with no per-theme branches. The same applies to
 * success/warning/danger/info: `-50` tinted fill, `-200` border, `-500` fill/stroke, `-700` text.
 *
 * CONTRAST — measured in a browser against the surfaces each token is actually painted on
 * (frontend/scripts/verify-contrast.mjs), in BOTH themes. Every text rung clears WCAG AA:
 *   dark  · neutral-900 15.9:1 · neutral-500 6.3:1 · neutral-400 5.1:1 · primary-500 8.6:1
 *   light · neutral-900 18.5:1 · neutral-500 6.0:1 · neutral-400 5.0:1 · primary-700 5.5:1
 *   on-primary #140E03 on gold #D6A84F .... 8.8:1 (white on gold is 1.9:1 and is never used)
 *
 * Do not introduce ad-hoc hex values inside components — extend this file instead.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /*
         * Every value resolves to a CSS custom property defined in src/styles/index.css, so one
         * `data-theme` attribute on <html> repaints the entire product. `<alpha-value>` keeps
         * Tailwind's opacity modifiers working (`bg-primary-500/20`, `bg-neutral-950/70`).
         */
        primary: v('primary', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        neutral: v('neutral', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        accent:  v('accent',  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        success: v('success', [50, 100, 200, 500, 600, 700]),
        warning: v('warning', [50, 100, 200, 500, 600, 700]),
        danger:  v('danger',  [50, 100, 200, 500, 600, 700]),
        info:    v('info',    [50, 100, 200, 500, 600, 700]),
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          raised:  'rgb(var(--c-surface-raised) / <alpha-value>)',
          high:    'rgb(var(--c-surface-high) / <alpha-value>)',
          sunken:  'rgb(var(--c-surface-sunken) / <alpha-value>)',
          /* Theme-independent: the kitchen and bar displays are dark chrome in both themes. */
          board:   '#06080A',
        },
        /* Text on a bright fill (gold, danger, success, warning) — dark in both themes. */
        'on-primary': '#140E03',
        /* Paper — receipts and print output stay dark-on-white whatever the screen theme is. */
        paper: '#FFFFFF',
        ink: '#101828',
        'ink-soft': '#475467',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'Geist', 'Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        /* Restrained scale — premium comes from rhythm, not oversized headings */
        display:    ['1.75rem',  { lineHeight: '2.25rem', fontWeight: '600', letterSpacing: '-0.02em' }],
        heading:    ['1.375rem', { lineHeight: '1.875rem', fontWeight: '600', letterSpacing: '-0.015em' }],
        subheading: ['1.0625rem',{ lineHeight: '1.5rem',  fontWeight: '600', letterSpacing: '-0.01em' }],
        label:      ['0.75rem',  { lineHeight: '1rem',    fontWeight: '600', letterSpacing: '0.04em' }],
        caption:    ['0.75rem',  { lineHeight: '1.125rem' }],
        /* Large operational readouts: money totals, KDS tickets, timers */
        metric:     ['1.75rem',  { lineHeight: '2.125rem', fontWeight: '650', letterSpacing: '-0.02em' }],
        kds:        ['1.375rem', { lineHeight: '1.75rem',  fontWeight: '650' }],
        'kds-lg':   ['1.75rem',  { lineHeight: '2.125rem', fontWeight: '700', letterSpacing: '-0.01em' }],
      },
      /* Controls stay tight; panels get the softer 16–20px corner of the direction. */
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '28px' },
      boxShadow: {
        /* Tint and strength come from the theme: a black drop on dark, a soft neutral one on light. */
        card:  '0 1px 2px rgb(var(--shadow-tint) / calc(var(--shadow-strength) * 0.9))',
        panel: '0 2px 10px -2px rgb(var(--shadow-tint) / calc(var(--shadow-strength) * 1.2)), 0 8px 24px -8px rgb(var(--shadow-tint) / var(--shadow-strength))',
        modal: '0 24px 64px -16px rgb(var(--shadow-tint) / calc(var(--shadow-strength) * 1.6)), 0 8px 20px -8px rgb(var(--shadow-tint) / calc(var(--shadow-strength) * 1.2))',
        pop:   '0 12px 32px -8px rgb(var(--shadow-tint) / calc(var(--shadow-strength) * 1.4)), 0 2px 8px -2px rgb(var(--shadow-tint) / var(--shadow-strength))',
        'bar-top':    '0 1px 0 rgb(var(--shadow-tint) / calc(var(--shadow-strength) * 0.4))',
        'bar-bottom': '0 -8px 24px -8px rgb(var(--shadow-tint) / calc(var(--shadow-strength) * 1.4))',
        inset: 'inset 0 1px 2px rgb(var(--shadow-tint) / var(--shadow-strength))',
        /* Reserved for the single primary action on a screen. Never used for decoration. */
        gold: '0 1px 0 rgba(255, 255, 255, 0.14) inset, 0 6px 18px -8px rgba(214, 168, 79, 0.55)',
      },
      backgroundImage: {
        /* Restrained tonal washes for premium surfaces — no rainbow gradients anywhere. */
        'surface-sheen': 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0) 42%)',
        'gold-sheen':    'linear-gradient(180deg, #E4BC6B 0%, #D6A84F 55%, #C5973F 100%)',
        'vip-sheen':     'linear-gradient(135deg, rgba(154,123,255,0.16) 0%, rgba(154,123,255,0) 60%)',
      },
      minHeight:  { touch: '44px', control: '40px', pos: '56px' },
      minWidth:   { touch: '44px' },
      spacing:    { 4.5: '1.125rem', 18: '4.5rem', 'safe-b': 'env(safe-area-inset-bottom)' },
      screens:    { xs: '420px', kds: '1280px' },
      zIndex:     { nav: '30', sticky: '35', drawer: '40', modal: '50', toast: '60' },
      /* MOTION — controls 120–180ms, overlays 180–240ms, page entry ≤250ms. Nothing loops. */
      transitionDuration: { DEFAULT: '150ms', fast: '120ms', control: '160ms', overlay: '220ms', page: '240ms' },
      transitionTimingFunction: { 'out-soft': 'cubic-bezier(0.16, 1, 0.3, 1)' },
      keyframes: {
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'translateY(4px) scale(0.985)' }, to: { opacity: '1', transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        shimmer:    { '100%': { transform: 'translateX(100%)' } },
        /* One-shot row emphasis when a live update actually changes a row. Never loops. */
        'row-flash': {
          '0%':   { backgroundColor: 'rgba(214, 168, 79, 0.16)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'fade-in':  'fade-in 120ms ease-out',
        'scale-in': 'scale-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'row-flash': 'row-flash 1200ms ease-out 1',
      },
    },
  },
  plugins: [],
} satisfies Config;
