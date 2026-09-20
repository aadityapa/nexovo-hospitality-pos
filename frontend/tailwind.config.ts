import type { Config } from 'tailwindcss';

/**
 * NEXOVO DESIGN TOKENS — single source of truth for colour, type, radius, elevation and motion.
 *
 * Hospitality palette: warm off-white canvas, white surfaces, deep-navy chrome, deep-teal actions
 * and restrained amber for hospitality highlights. Semantic colours stay clearly distinct from the
 * teal primary so "success" never reads as "action".
 *
 * Contrast (WCAG 2.1, verified pairings):
 *   primary-600 #087F8C on white ............ 4.75:1  AA  (white text on primary buttons)
 *   primary-700 #066773 on white ............ 6.42:1  AA  (hover / primary text links)
 *   neutral-500 #667085 on white ............ 4.92:1  AA  (secondary text)
 *   neutral-500 #667085 on canvas #F6F7F9 ... 4.64:1  AA  (secondary text on the page background)
 *   neutral-800 #182230 on white ........... 14.8:1  AAA (body text)
 *   danger-600 / success-600 / info-600 on white ≥ 4.5:1 AA
 * Amber and warning read AA only from 700 upwards, so use -700 for text and -500 for fills.
 *
 * Do not introduce ad-hoc hex values inside components — extend this file instead.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Deep teal — primary action */
        primary: {
          50: '#E8F5F5', 100: '#C7E7E9', 200: '#9BD4D8', 300: '#6BBDC4', 400: '#34A0AA',
          500: '#0B8D9A', 600: '#087F8C', 700: '#066773', 800: '#05515C', 900: '#043D45',
        },
        /* Navy-leaning greys — chrome, text and borders */
        neutral: {
          50: '#F9FAFB', 100: '#F2F4F7', 200: '#E4E7EC', 300: '#D0D5DD', 400: '#98A2B3',
          500: '#667085', 600: '#475467', 700: '#344054', 800: '#182230', 900: '#101828',
        },
        /* Restrained amber — hospitality highlights (VIP, popular, loyalty) */
        accent: {
          50: '#FFF8EB', 100: '#FDECC8', 200: '#F9DA9B', 300: '#F5C462', 400: '#E8AC3E',
          500: '#DB9A2E', 600: '#B77A1A', 700: '#8E5D12', 800: '#6B450D', 900: '#4A2F08',
        },
        success: { 50: '#ECFDF3', 100: '#D1FADF', 200: '#A6F4C5', 500: '#12B76A', 600: '#039855', 700: '#027A48' },
        warning: { 50: '#FFFAEB', 100: '#FEF0C7', 200: '#FEDF89', 500: '#F79009', 600: '#DC6803', 700: '#B54708' },
        danger:  { 50: '#FEF3F2', 100: '#FEE4E2', 200: '#FECDCA', 500: '#F04438', 600: '#D92D20', 700: '#B42318' },
        info:    { 50: '#EFF8FF', 100: '#D1E9FF', 200: '#B2DDFF', 500: '#2E90FA', 600: '#1570EF', 700: '#175CD3' },
        /* Page canvas (warm off-white). Cards/panels sit on top of it in white. */
        surface: '#F6F7F9',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
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
      borderRadius: { sm: '8px', md: '10px', lg: '14px', xl: '18px', '2xl': '24px' },
      boxShadow: {
        /* Restrained elevation — borders carry most of the separation */
        card:  '0 1px 2px rgba(16, 24, 40, 0.05)',
        panel: '0 2px 8px -2px rgba(16, 24, 40, 0.08), 0 4px 16px -4px rgba(16, 24, 40, 0.06)',
        modal: '0 12px 32px -8px rgba(16, 24, 40, 0.20), 0 4px 12px -4px rgba(16, 24, 40, 0.10)',
        pop:   '0 8px 24px -6px rgba(16, 24, 40, 0.16), 0 2px 6px -2px rgba(16, 24, 40, 0.08)',
        /* Sticky bars that sit above scrolling content */
        'bar-top':    '0 1px 0 rgba(16, 24, 40, 0.06)',
        'bar-bottom': '0 -2px 12px -4px rgba(16, 24, 40, 0.12)',
        inset: 'inset 0 1px 2px rgba(16, 24, 40, 0.06)',
      },
      minHeight:  { touch: '44px', control: '40px', pos: '56px' },
      minWidth:   { touch: '44px' },
      spacing:    { 4.5: '1.125rem', 18: '4.5rem', 'safe-b': 'env(safe-area-inset-bottom)' },
      screens:    { xs: '420px', kds: '1280px' },
      zIndex:     { nav: '30', sticky: '35', drawer: '40', modal: '50', toast: '60' },
      transitionDuration: { DEFAULT: '150ms' },
      keyframes: {
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'translateY(4px) scale(0.985)' }, to: { opacity: '1', transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        shimmer:    { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in':  'fade-in 120ms ease-out',
        'scale-in': 'scale-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
