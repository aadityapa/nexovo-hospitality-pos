/**
 * MOTION SYSTEM — one source for every duration, curve and choreography rule.
 *
 * THE RULE THIS PRODUCT IS BUILT ON: motion may confirm an action, show where something came
 * from, or celebrate a moment that is genuinely worth celebrating. It may never delay an action,
 * repeat while nothing is happening, or make a figure harder to read.
 *
 * That is why the energy is deliberately unequal across the product:
 *
 *   THEATRICAL   login, shift start, payment success — moments where a person is waiting anyway,
 *                and where a little ceremony makes the product feel considered.
 *   EXPRESSIVE   dashboards, guest-facing menu, empty states — content that is being *read*, so
 *                a staged reveal helps the eye find its order.
 *   CALM         order entry, kitchen and bar boards, the billing and payment screens. These are
 *                used mid-service with people waiting. Nothing here animates except the direct
 *                feedback of the control being touched.
 *
 * Every value below respects `prefers-reduced-motion` through the global rule in styles/index.css,
 * which collapses all animation and transition to 0.01ms. Nothing in the product depends on motion
 * to be usable or understandable.
 */

/** Durations, in milliseconds. Mirrors the Tailwind `duration-*` tokens. */
export const DUR = {
  /** Colour and border changes on a control. */
  fast: 110,
  /** Buttons, chips, rows, inputs — the direct feedback of a touch (100–160). */
  control: 150,
  /** Drawers, modals, popovers entering or leaving (200–280). */
  overlay: 240,
  /** Navigation (180–240). On the critical path, so it sits low in its band. */
  page: 210,
  /** A one-time success mark (350–600). Plays once, after the server has confirmed. */
  success: 480,
  /** A staged reveal of a list or a grid, from first item to last. */
  reveal: 260,
  /** A moment worth marking: payment taken, shift started. */
  celebrate: 900,
} as const;

/** Curves. `outSoft` is the product's default — fast out of the gate, gentle at rest. */
export const EASE = {
  outSoft: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  /** A single controlled overshoot. Used only on a success mark, never on layout. */
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

/**
 * Stagger step between siblings in a reveal, in milliseconds.
 *
 * Capped hard: `staggerDelay` never returns more than `MAX_STAGGER`, so a fifty-row table does not
 * take two seconds to finish arriving. Past the cap every remaining row simply appears together —
 * the choreography is a nicety, and a long list must never feel slow because of it.
 */
export const STAGGER_STEP = 30;
export const MAX_STAGGER = 300;

export const staggerDelay = (index: number): number => Math.min(index * STAGGER_STEP, MAX_STAGGER);

/**
 * How much motion a surface is allowed. Screens opt in by name, so the decision is visible in one
 * place rather than scattered through ninety files.
 */
export type MotionLevel = 'theatrical' | 'expressive' | 'calm';

export const MOTION_LEVEL: Record<string, MotionLevel> = {
  '/login': 'theatrical',
  '/forgot-password': 'expressive',
  '/admin': 'expressive',
  '/manager': 'expressive',
  '/host': 'expressive',
  '/admin/club': 'expressive',
  '/admin/inventory': 'expressive',
  '/admin/reports': 'expressive',
  '/admin/reports/advanced': 'expressive',
  '/waiter': 'expressive',
  '/cashier': 'expressive',

  /* Mid-service surfaces. Direct feedback only. */
  '/kitchen': 'calm',
  '/bar': 'calm',
  '/manager/live': 'calm',
};

/** Anything not named above gets `expressive`, except the operational paths listed here. */
const CALM_PREFIXES = ['/kitchen', '/bar', '/waiter/tables/', '/cashier/bills/', '/cashier/orders/'];

export function motionLevelFor(pathname: string): MotionLevel {
  if (MOTION_LEVEL[pathname]) return MOTION_LEVEL[pathname];
  if (CALM_PREFIXES.some((p) => pathname.startsWith(p))) return 'calm';
  return 'expressive';
}

/** True when the operator has asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
