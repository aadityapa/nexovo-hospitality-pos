import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { Tone } from '@/config/statuses';
import type { StockStatus } from '@/types';

/**
 * SMALL DATA MARKS.
 *
 * Three rules hold across this file:
 *   1. Colour is never the only signal. Every mark prints its own value in words beside it, and
 *      the graphic itself is `aria-hidden` (or carries a proper role and text equivalent).
 *   2. Nothing is invented. These components draw the numbers they are handed and derive no
 *      trend, forecast or history of their own.
 *   3. The track is INSET — a trough cut into the surface, not a bar laid on it — so an empty
 *      meter still reads as a measurement that happens to be at zero, rather than as nothing.
 */

/** Fill rung per tone. Mirrors `toneBg` in components/ui/Badge. */
const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-neutral-400', primary: 'bg-primary-500', success: 'bg-success-500',
  warning: 'bg-warning-500', danger: 'bg-danger-500', info: 'bg-info-500', accent: 'bg-accent-500',
};

/** Text rung per tone — `-500` is a fill value, anything carrying words uses `-700`. */
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-neutral-500', primary: 'text-primary-700', success: 'text-success-700',
  warning: 'text-warning-700', danger: 'text-danger-700', info: 'text-info-700', accent: 'text-accent-700',
};

/** The trough. Sunken surface, inset hairline, inset shadow — reads as cut in, never printed on. */
const TRACK = 'relative w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-neutral-200 shadow-inset';

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const trim = (n: number) => Number(n.toFixed(3));

// ---------------------------------------------------------------------------------------------
// STOCK LEVEL
// ---------------------------------------------------------------------------------------------

export interface StockLevelProps {
  /** Quantity on hand. `currentQty` is the `InventoryItem` field name and wins if both are given. */
  qty?: number;
  currentQty?: number;
  minQty: number;
  reorderLevel: number;
  /** The item's ceiling, when it has one. Without it the gauge scales to the figures it was given. */
  maxQty?: number | null;
  unitCode?: string;
  /**
   * The server's `stockStatus`, when the caller has it. Passing it keeps the gauge on exactly the
   * same verdict as the row's `StatusBadge` instead of a second, parallel derivation.
   */
  status?: StockStatus;
  /** Replace the derived sentence — e.g. a page's existing level note, kept verbatim. */
  note?: ReactNode;
  /** Hide the text equivalent ONLY when the same figures are already printed beside the gauge. */
  hideText?: boolean;
  className?: string;
}

const STATUS_TONE: Record<StockStatus, Tone> = { OK: 'success', REORDER: 'info', LOW: 'warning', OUT: 'danger' };

/**
 * A compact horizontal stock gauge: level against its minimum and its reorder mark.
 *
 * The two thresholds are drawn as rules across the trough, so "how far below minimum" is
 * legible at a glance — but the sentence underneath always says it in words as well, because a
 * 4 px coloured bar is not a stock report.
 *
 * SCALE: `maxQty` when the item has one, otherwise the largest real figure among on-hand,
 * reorder and minimum plus a quarter, so the marks are never pinned to the right-hand end. That
 * is a drawing decision about a real set of numbers, not an invented ceiling — and the numbers
 * printed beside it are always the raw ones.
 */
export function StockLevel({
  qty, currentQty, minQty, reorderLevel, maxQty, unitCode, status, note, hideText, className,
}: StockLevelProps) {
  const on = currentQty ?? qty ?? 0;
  const scale = maxQty && maxQty > 0
    ? maxQty
    : Math.max(on, reorderLevel, minQty, 0) * 1.25 || 1;

  const tone: Tone = status
    ? STATUS_TONE[status]
    : on <= 0 ? 'danger' : on < minQty ? 'warning' : on <= reorderLevel ? 'info' : 'success';

  const pct = clamp01(on / scale);
  const minPct = clamp01(minQty / scale);
  const reorderPct = clamp01(reorderLevel / scale);

  /* Only the computed shortfall is rounded — every figure that came from the API is printed
     exactly as it arrived. */
  const derived = on <= 0
    ? 'none on hand'
    : on < minQty ? `short ${trim(minQty - on)} of min ${minQty}`
      : on <= reorderLevel ? `at reorder level ${reorderLevel}`
        : `min ${minQty}`;

  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn(TRACK, 'h-1.5')} aria-hidden>
        <span className={cn('absolute inset-y-0 left-0 rounded-full', TONE_FILL[tone])} style={{ width: `${pct * 100}%` }} />
        {/* Minimum, then reorder. Both sit above the fill so they stay visible when it passes them. */}
        {minQty > 0 && minPct < 1 && (
          <span className="absolute inset-y-0 w-px bg-danger-500" style={{ left: `${minPct * 100}%` }} />
        )}
        {reorderLevel > 0 && reorderPct < 1 && (
          <span className="absolute inset-y-0 w-px bg-warning-500" style={{ left: `${reorderPct * 100}%` }} />
        )}
      </div>
      {!hideText && (
        <p className="mt-1 text-caption leading-tight">
          <span className={cn('font-semibold tnum', TONE_TEXT[tone])}>{on}{unitCode ? ` ${unitCode}` : ''}</span>
          <span className="text-neutral-500"> · {note ?? derived}</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// SPARKLINE
// ---------------------------------------------------------------------------------------------

export interface SparklineProps {
  /**
   * REAL measured values only, in order.
   *
   * This component must never be fed synthetic, padded, interpolated or randomly generated data.
   * A trend line is read as a fact about the business; drawing one from anything other than
   * points the API actually returned would be fabricating that fact. If a series is short, the
   * honest answer is to draw nothing — which is exactly what happens below.
   */
  points: number[];
  /** Width and height in user units. No axis, no labels, no animation — this is a glyph. */
  width?: number;
  height?: number;
  className?: string;
}

/** Fewer than this many genuine points is not a trend, so nothing is drawn. */
const MIN_POINTS = 4;

const realPoints = (points?: number[] | null) =>
  (points ?? []).filter((n) => typeof n === 'number' && Number.isFinite(n));

/**
 * Whether a series has enough genuine points for `Sparkline` to draw anything.
 *
 * Exported so a container can decide whether to RESERVE space for a trend line before it asks for
 * one — a card that always rendered the slot would leave an empty gap under every metric whose
 * period was too thin to chart. The component still applies the rule itself; this is the same
 * rule, read ahead of time, not a second one.
 */
export const canSparkline = (points?: number[] | null): boolean => realPoints(points).length >= MIN_POINTS;

/**
 * A tiny line chart. Renders `null` below four real points — deliberately, so a caller cannot
 * accidentally turn two readings into a shape that implies a direction.
 */
export function Sparkline({ points, width = 72, height = 20, className }: SparklineProps) {
  const real = realPoints(points);
  if (real.length < MIN_POINTS) return null;

  const lo = Math.min(...real);
  const hi = Math.max(...real);
  const pad = 2;
  const span = hi - lo;
  const stepX = (width - pad * 2) / (real.length - 1);

  const y = (v: number) => (span === 0 ? height / 2 : height - pad - ((v - lo) / span) * (height - pad * 2));
  const d = real.map((v, i) => `${i === 0 ? 'M' : 'L'}${trim(pad + i * stepX)} ${trim(y(v))}`).join(' ');
  const last = { x: pad + (real.length - 1) * stepX, y: y(real[real.length - 1]) };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('block overflow-visible', className)}
      aria-hidden
      focusable="false"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={1.75} fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// PROGRESS METER
// ---------------------------------------------------------------------------------------------

export interface ProgressMeterProps {
  value: number;
  max: number;
  /** What is being measured. Becomes the meter's accessible name. */
  label: string;
  min?: number;
  /** Spoken and printed equivalent. Defaults to "value of max". */
  valueText?: string;
  tone?: Tone;
  /** Drop the printed equivalent ONLY where the same figures already sit beside the meter. */
  hideText?: boolean;
  /** Track height. `sm` for dense rows, `md` where the meter is the subject. */
  size?: 'sm' | 'md';
  /**
   * Draw the fill at its width with no transition.
   *
   * For the CALM routes (the live board, the kitchen and bar displays, order entry, billing).
   * Those screens re-render on a poll, and a width transition means every bar on the board slides
   * whenever a number changes — motion nobody asked for, on the screens where motion is most
   * expensive. The transition cannot be cancelled from the caller, because `className` lands on
   * the wrapper and not on the fill, so it has to be a prop.
   */
  static?: boolean;
  className?: string;
}

/**
 * A general-purpose meter.
 *
 * `role="progressbar"` with a full set of value attributes, so a screen reader gets the number
 * without the bar; `aria-valuetext` carries the human phrasing (a bare `aria-valuenow` of 3 out
 * of 8 is announced as "3", which is useless on its own). The printed equivalent beside it is
 * what a sighted operator reads — the bar is the fast scan, never the record.
 */
export function ProgressMeter({
  value, max, label, min = 0, valueText, tone = 'primary', hideText, size = 'sm', static: noMotion, className,
}: ProgressMeterProps) {
  const span = max - min;
  const pct = span > 0 ? clamp01((value - min) / span) : 0;
  const text = valueText ?? `${trim(value)} of ${trim(max)}`;

  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Number(value.toFixed(3))}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={text}
        className={cn(TRACK, size === 'md' ? 'h-2.5' : 'h-1.5')}
      >
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full', !noMotion && 'transition-[width] duration-control', TONE_FILL[tone])}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      {!hideText && <span className={cn('text-caption tnum shrink-0 font-medium', TONE_TEXT[tone])}>{text}</span>}
    </div>
  );
}
