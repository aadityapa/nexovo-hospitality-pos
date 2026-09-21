import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { Tone } from '@/config/statuses';

/**
 * ORIGINAL TABLE SHAPES FOR THE FLOOR VIEW.
 *
 * WHAT THIS IS NOT: a floor plan. `DiningTable` carries no x/y coordinates — only a floor, a
 * number, a capacity and a status — so there is nothing to place anything against. Drawing a
 * pretend room would invent data an operator might then trust. These are SCHEMATIC shapes for a
 * grid: each one says "this is a four-top, it is occupied, two of its covers are drawn on the
 * long sides". Nothing here implies where the table stands, and there is deliberately no drag
 * and drop.
 *
 * STATUS IS NEVER COLOUR ALONE. Three independent signals, matching `TableGrid` exactly:
 *   1. the tone colour on the body stroke and its wash (`-500`, the designated fill/stroke rung),
 *   2. the status WORDS printed under the shape (`-700`, the legible rung),
 *   3. the accessible name, which spells out identifier, status and covers.
 * SELECTION is a separate gold ring around the whole tile — not a fill change, so it survives a
 * table whose status tone is already gold.
 */

export type TableShapeKind = 'round' | 'square' | 'rectangular' | 'booth';

/** Seats drawn before the count collapses to “+N”. Past eight, individual marks stop informing. */
const SEAT_CAP = 8;

/** Stroke rung — mirrors `toneBg` in components/ui/Badge so a shape matches its badge exactly. */
const TONE_STROKE: Record<Tone, string> = {
  neutral: 'text-neutral-400', primary: 'text-primary-500', success: 'text-success-500',
  warning: 'text-warning-500', danger: 'text-danger-500', info: 'text-info-500', accent: 'text-accent-500',
};

/** Text rung — `-500` is a fill value; anything carrying words uses `-700`. */
const TONE_LABEL: Record<Tone, string> = {
  neutral: 'text-neutral-500', primary: 'text-primary-700', success: 'text-success-700',
  warning: 'text-warning-700', danger: 'text-danger-700', info: 'text-info-700', accent: 'text-accent-700',
};

interface Seat { x: number; y: number; rot: number }

/** Covers evenly spaced around a circular top, first one at twelve o'clock. */
function roundSeats(n: number, cx: number, cy: number, r: number): Seat[] {
  return Array.from({ length: n }, (_, i) => {
    const deg = -90 + (360 / n) * i;
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), rot: deg + 90 };
  });
}

/**
 * Covers distributed around a rectangular top.
 * `long` tops seat the ends only once there are six or more covers, which is how a rectangular
 * table is actually laid; square tops share evenly across all four sides.
 */
function rectSeats(n: number, x: number, y: number, w: number, h: number, long: boolean): Seat[] {
  let top: number, bottom: number, left: number, right: number;
  if (long) {
    const ends = n >= 6 ? 1 : 0;
    const rest = n - ends * 2;
    top = Math.ceil(rest / 2); bottom = rest - top; left = ends; right = ends;
  } else {
    const base = Math.floor(n / 4); const rem = n % 4;
    top = base + (rem > 0 ? 1 : 0); bottom = base + (rem > 1 ? 1 : 0);
    left = base + (rem > 2 ? 1 : 0); right = base;
  }
  const gap = 8.5;
  const along = (k: number, a: number, b: number) =>
    Array.from({ length: k }, (_, i) => a + ((b - a) * (i + 0.5)) / k);

  return [
    ...along(top, x, x + w).map((px) => ({ x: px, y: y - gap, rot: 0 })),
    ...along(bottom, x, x + w).map((px) => ({ x: px, y: y + h + gap, rot: 0 })),
    ...along(left, y, y + h).map((py) => ({ x: x - gap, y: py, rot: 90 })),
    ...along(right, y, y + h).map((py) => ({ x: x + w + gap, y: py, rot: 90 })),
  ];
}

/** One cover. A rounded bar, rotated to face the top it belongs to. */
function SeatMark({ x, y, rot }: Seat) {
  return <rect x={-8} y={-4.5} width={16} height={9} rx={4.5} transform={`translate(${x} ${y}) rotate(${rot})`} />;
}

/**
 * Pick a shape from the covers when the data carries no hint.
 * Exported so a caller that DOES have a shape column can bypass it entirely.
 */
export function tableShapeFor(capacity: number, hint?: TableShapeKind | null): TableShapeKind {
  if (hint) return hint;
  if (capacity <= 2) return 'round';
  if (capacity <= 4) return 'square';
  if (capacity <= 8) return 'rectangular';
  return 'booth';
}

export interface TableShapeProps {
  /** The identifier drawn inside the top — `table.name` or `table.number`. */
  label: string;
  capacity: number;
  /** `TABLE_STATUS[table.status].tone`. Drives the stroke and the wash only. */
  tone?: Tone;
  /** `TABLE_STATUS[table.status].label`. The words are what actually name the state. */
  statusLabel?: string;
  /** Shape hint if the data ever grows one; otherwise derived from capacity. */
  shape?: TableShapeKind | null;
  selected?: boolean;
  /** VIP classification — the one violet in the system, and always written out as well. */
  vip?: boolean;
  /** Override the composed accessible name (e.g. to add a running total). */
  ariaLabel?: string;
  /** Suppress the status line when the caller already renders a `StatusBadge` beside it. */
  hideStatusLabel?: boolean;
  className?: string;
  /** Class for the SVG itself — default `h-24 w-24`. */
  shapeClassName?: string;
}

export function TableShape({
  label, capacity, tone = 'neutral', statusLabel, shape, selected, vip,
  ariaLabel, hideStatusLabel, className, shapeClassName,
}: TableShapeProps) {
  const kind = tableShapeFor(capacity, shape);
  const shown = Math.max(0, Math.min(capacity, SEAT_CAP));
  const overflow = Math.max(0, capacity - SEAT_CAP);

  let body: ReactNode;
  let seats: Seat[];
  const cx = 60;
  let cy = 60;

  if (kind === 'round') {
    body = <circle cx={60} cy={60} r={31} />;
    seats = roundSeats(shown, 60, 60, 41);
  } else if (kind === 'square') {
    body = <rect x={28} y={28} width={64} height={64} rx={10} />;
    seats = rectSeats(shown, 28, 28, 64, 64, false);
  } else if (kind === 'rectangular') {
    body = <rect x={18} y={36} width={84} height={48} rx={10} />;
    seats = rectSeats(shown, 18, 36, 84, 48, true);
  } else {
    /* Booth: the banquette is the seating on one side, so half the covers are marks along the
       bench and half are loose chairs on the open side. */
    body = <rect x={26} y={50} width={68} height={40} rx={8} />;
    const bench = Math.ceil(shown / 2);
    const loose = shown - bench;
    const spread = (k: number, a: number, b: number) =>
      Array.from({ length: k }, (_, i) => a + ((b - a) * (i + 0.5)) / k);
    seats = [
      ...spread(bench, 26, 94).map((x) => ({ x, y: 42, rot: 0 })),
      ...spread(loose, 26, 94).map((x) => ({ x, y: 98.5, rot: 0 })),
    ];
    cy = 70;
  }

  const name = ariaLabel
    ?? [label, statusLabel, `seats ${capacity}`, vip ? 'VIP table' : null].filter(Boolean).join(', ');

  /* Long identifiers step down rather than overflowing the top. */
  const size = label.length > 5 ? 14 : label.length > 3 ? 17 : 21;

  return (
    <div className={cn('inline-flex flex-col items-center gap-1 text-center', className)} role="img" aria-label={name}>
      <svg
        viewBox="0 0 120 120"
        width={120}
        height={120}
        className={cn('block h-24 w-24', TONE_STROKE[tone], shapeClassName)}
        aria-hidden
        focusable="false"
      >
        {/* Selection is a ring around the whole tile, clear of the body, so it still reads on a
            table whose own tone is gold. */}
        {selected && (
          <rect
            x={2} y={2} width={116} height={116} rx={16}
            className="text-primary-500" fill="none" stroke="currentColor" strokeWidth={2.5}
          />
        )}

        {/* Covers: quieter than the top, so the shape stays the subject. */}
        <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" opacity={0.6}>
          {seats.map((s, i) => <SeatMark key={i} {...s} />)}
        </g>

        {/* Booth banquette — drawn behind the table top. */}
        {kind === 'booth' && (
          <path
            d="M18 36 V26 a10 10 0 0 1 10 -10 H92 a10 10 0 0 1 10 10 V36"
            fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.45}
          />
        )}

        {/* The top itself: tone stroke over a wash of the same tone, so it has weight on the
            dark ground without becoming a coloured block. */}
        <g fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
          {body}
        </g>

        <text
          x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={size} fontWeight={700} letterSpacing="-0.02em"
          className="fill-neutral-900"
        >
          {label}
        </text>

        {/* Two corner marks, both clear of every seat position in every shape: the covers that
            did not fit bottom-right, the VIP classification bottom-left. VIP sits here rather
            than top-right because a booth's banquette runs straight through that corner. */}
        {overflow > 0 && (
          <text x={110} y={112} textAnchor="end" fontSize={13} fontWeight={600} fill="currentColor">
            +{overflow}
          </text>
        )}

        {vip && (
          <text x={10} y={112} textAnchor="start" fontSize={11} fontWeight={700} letterSpacing="0.06em" className="fill-accent-500">
            VIP
          </text>
        )}
      </svg>

      {/* The words. Colour is never the only signal. */}
      {!hideStatusLabel && statusLabel && (
        <span className={cn('text-caption font-medium leading-tight', TONE_LABEL[tone])}>
          {statusLabel}
          <span className="text-neutral-500 font-normal"> · {capacity} seat{capacity === 1 ? '' : 's'}</span>
        </span>
      )}
    </div>
  );
}
