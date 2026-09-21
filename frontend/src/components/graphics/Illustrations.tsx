import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * NEXOVO ILLUSTRATION FAMILY — original geometric interface art.
 *
 * ONE VISUAL LANGUAGE, deliberately narrow so eight marks read as one set:
 *   · 1.5 px strokes, round caps and joins, never a filled silhouette
 *   · architectural / constructed, not cartoon — every curve is an arc or a single control point
 *   · `currentColor` for ALL structural linework, so a caller tones the art with a text colour
 *     (`text-neutral-500`, `text-neutral-400` …) and the whole family follows the theme
 *   · gold appears ONCE per illustration, as a deliberate accent, via `<Gold>` — never as the
 *     main line, never as a second structural colour
 *   · one gradient in the whole file (the pendant glow); no drop shadows anywhere
 *   · every mark stands on the same implied ground line, which is what makes them a family
 *
 * All of these are DECORATIVE. They carry `aria-hidden`, because the surrounding component
 * (EmptyState, the login panel) already carries the words. Nothing here is ever the only
 * signal for anything.
 */

/** Shared linework. Applied to a `<g>` so every child inherits it. */
const LINE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/**
 * The one gold accent per illustration.
 *
 * `stroke` is re-declared here rather than inherited: `currentColor` is resolved against the
 * element's own `color`, and re-stating it is what makes the switch to gold actually take.
 */
function Gold({ children, width = 1.5 }: { children: ReactNode; width?: number }) {
  return <g className="text-primary-500" stroke="currentColor" strokeWidth={width}>{children}</g>;
}

/** A quieter rung of the same line, for elements that must recede (ground, reveals, ticks). */
function Quiet({ children, opacity = 0.42 }: { children: ReactNode; opacity?: number }) {
  return <g opacity={opacity}>{children}</g>;
}

// ---------------------------------------------------------------------------------------------
// LOGIN SIDE PANEL
// ---------------------------------------------------------------------------------------------

/** The back-bar bottle silhouette. `b` is the shelf line it stands on, `h` the body height. */
function bottle(cx: number, b: number, h: number): string {
  const t = b - h;
  return [
    `M${cx - 5} ${b}`,
    `V${t}`,
    `C${cx - 5} ${t - 4} ${cx - 2} ${t - 3} ${cx - 2} ${t - 6}`,
    `V${t - 13}`,
    `H${cx + 2}`,
    `V${t - 6}`,
    `C${cx + 2} ${t - 3} ${cx + 5} ${t - 4} ${cx + 5} ${t}`,
    `V${b}`,
    'Z',
  ].join(' ');
}

/**
 * THE ROOM BUILDS IN THIS ORDER — milliseconds from the moment the scene mounts.
 *
 * Read it as a person would build the drawing: the horizon of the room first, then the arch the
 * back bar sits in, then the counter a guest actually stands at, then the shelves and what is on
 * them, then the pendants hanging over it — and last the warm pool of light underneath, which is
 * the only thing here that is not a line.
 *
 * Used ONLY by the login entrance (`draw`). Everywhere else the scene renders finished, because
 * nothing outside that one screen has an entrance worth composing.
 */
const BUILD = {
  room: 0,
  arch: 60,
  archInner: 120,
  counter: 180,
  counterFace: 220,
  counterDetail: 260,
  /** Three ledges, 36 ms apart. */
  shelf: 300,
  shelfStep: 36,
  /** Bottles, 22 ms apart: the recessed lower ledge fills before the lit one above it. */
  bottleLow: 410,
  bottleHigh: 500,
  bottleStep: 22,
  bottleGold: 615,
  pendant: 650,
  pendantGold: 720,
  /** Last to arrive, and the only fade in the scene. One pass, then it sits there. */
  glow: 780,
} as const;

/**
 * A stroke that draws itself in.
 *
 * `len` must be an OVER-ESTIMATE of the path's own length, and every value passed below was
 * measured off the path data rather than guessed. `.anim-draw` sets `stroke-dasharray` AND
 * `stroke-dashoffset` to it, and the reduced-motion rule only resets the offset — the dash array
 * stays. So a `len` under the true length would leave the line permanently dashed, for the
 * reduced-motion operator most of all. Over-estimating costs nothing anyone can see: the stroke
 * simply completes at `length / len` of the 700 ms and holds there.
 *
 * Every stroke is a `both`-filled one-shot: it holds its finished state and never replays. Under
 * reduced motion `.anim-draw` collapses to `stroke-dashoffset: 0`, which is the completed
 * drawing, so an operator who has asked for no motion just gets the illustration.
 */
function pen(on: boolean, len: number, delay: number): { className?: string; style?: CSSProperties } {
  if (!on) return {};
  return { className: 'anim-draw', style: { '--len': len, '--d': `${delay}ms` } as CSSProperties };
}

/** A closed bottle outline is a little over twice its body height plus its neck and shoulders. */
const bottleLen = (h: number) => 2 * h + 60;

/**
 * An abstract hospitality interior for the login side panel.
 *
 * Composed at 420 × 360: an arched back bar under a soffit, three shelf ledges, a counter with
 * its front reveals and foot rail, and two pendants whose gold glow is the only warm thing on
 * the panel. It is deliberately quiet — the form beside it is the subject, and nothing here
 * should pull the eye off the username field.
 *
 * Scales down cleanly because every element is proportional linework: at 180 px wide it still
 * reads as arch / shelves / counter / two lights.
 *
 * `draw` opts the scene into drawing itself in (see `BUILD`). It is decorative and `aria-hidden`
 * either way, it never moves the layout — stroke dashing does not reflow — and it is off by
 * default, so the mark is finished the instant it is used anywhere else.
 */
export function HospitalityScene({ className, draw = false }: { className?: string; draw?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const arch = `arch-${uid}`;
  const glow = `glow-${uid}`;

  /* The inner arch, reused as the clip for the shelves so every ledge dies into the masonry. */
  const archInner = 'M126 240 V140 Q126 78 210 78 Q294 78 294 140 V240 Z';

  return (
    <svg
      viewBox="0 0 420 360"
      width={420}
      height={360}
      className={cn('block h-auto w-full', className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <clipPath id={arch}><path d={archInner} /></clipPath>
        {/* The only gradient in the family: the warm pool under each pendant. `currentColor`
            resolves against this element's own gold `color`, so the glow follows the token. */}
        <radialGradient id={glow} className="text-primary-500" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.08" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/*
       * Light pools sit behind everything so the linework reads on top of them.
       *
       * They arrive LAST and as a single 200 ms fade — `.anim-enter-soft`, which is a one-shot
       * `both`-filled fade to opacity 1 and then nothing. The delay is the one inline style in
       * this scene because `.anim-enter-soft` is the only entrance class that does not read
       * `--d`; reduced motion still kills it, because the global rule forces
       * `animation: none !important` on that class, which overrides an inline delay.
       */}
      <g className={draw ? 'anim-enter-soft' : undefined} style={draw ? { animationDelay: `${BUILD.glow}ms` } : undefined}>
        <circle cx={66} cy={162} r={38} fill={`url(#${glow})`} />
        <circle cx={354} cy={162} r={38} fill={`url(#${glow})`} />
      </g>

      <g {...LINE}>
        {/* Room — soffit above, floor below. Both recede. */}
        <Quiet opacity={0.3}>
          <path d="M16 26 H404" {...pen(draw, 420, BUILD.room)} />
          <path d="M16 330 H404" {...pen(draw, 420, BUILD.room)} />
        </Quiet>

        {/* Back bar: an arch and its reveal. */}
        <path d="M112 240 V134 Q112 64 210 64 Q308 64 308 134 V240" {...pen(draw, 525, BUILD.arch)} />
        <Quiet opacity={0.55}><path d={archInner.replace(' Z', '')} {...pen(draw, 475, BUILD.archInner)} /></Quiet>

        {/* Shelf ledges, clipped so they end exactly on the arch. */}
        <g clipPath={`url(#${arch})`}>
          <Quiet opacity={0.55}>
            <path d="M118 130 H302" {...pen(draw, 200, BUILD.shelf)} />
            <path d="M118 172 H302" {...pen(draw, 200, BUILD.shelf + BUILD.shelfStep)} />
            <path d="M118 212 H302" {...pen(draw, 200, BUILD.shelf + BUILD.shelfStep * 2)} />
          </Quiet>

          {/* Bottles on the two lower ledges; the top ledge stays bare, which is what keeps
              the composition quiet. */}
          <path d={bottle(148, 172, 26)} {...pen(draw, bottleLen(26), BUILD.bottleHigh)} />
          <path d={bottle(170, 172, 20)} {...pen(draw, bottleLen(20), BUILD.bottleHigh + BUILD.bottleStep)} />
          <path d={bottle(192, 172, 28)} {...pen(draw, bottleLen(28), BUILD.bottleHigh + BUILD.bottleStep * 2)} />
          <path d={bottle(250, 172, 18)} {...pen(draw, bottleLen(18), BUILD.bottleHigh + BUILD.bottleStep * 3)} />
          <path d={bottle(272, 172, 26)} {...pen(draw, bottleLen(26), BUILD.bottleHigh + BUILD.bottleStep * 4)} />
          <Quiet opacity={0.6}>
            <path d={bottle(152, 212, 16)} {...pen(draw, bottleLen(16), BUILD.bottleLow)} />
            <path d={bottle(174, 212, 14)} {...pen(draw, bottleLen(14), BUILD.bottleLow + BUILD.bottleStep)} />
            <path d={bottle(262, 212, 14)} {...pen(draw, bottleLen(14), BUILD.bottleLow + BUILD.bottleStep * 2)} />
            <path d={bottle(284, 212, 16)} {...pen(draw, bottleLen(16), BUILD.bottleLow + BUILD.bottleStep * 3)} />
          </Quiet>
          {/* The one gold object on the shelves, and the last thing to land on them. */}
          <Gold><path d={bottle(228, 172, 22)} {...pen(draw, bottleLen(22), BUILD.bottleGold)} /></Gold>
        </g>

        {/* Counter: slab, front face, two reveals, foot rail. */}
        <rect x={34} y={250} width={352} height={13} rx={3} {...pen(draw, 760, BUILD.counter)} />
        <path d="M46 263 V318 H374 V263" {...pen(draw, 470, BUILD.counterFace)} />
        <Quiet>
          <path d="M162 270 V311" {...pen(draw, 48, BUILD.counterDetail)} />
          <path d="M258 270 V311" {...pen(draw, 48, BUILD.counterDetail)} />
          <path d="M62 300 H358" {...pen(draw, 320, BUILD.counterDetail)} />
        </Quiet>

        {/* Pendants. */}
        <path d="M66 26 V124" {...pen(draw, 110, BUILD.pendant)} />
        <path d="M46 150 L59 122 H73 L86 150 Z" {...pen(draw, 128, BUILD.pendant)} />
        <path d="M354 26 V124" {...pen(draw, 110, BUILD.pendant)} />
        <path d="M334 150 L347 122 H361 L374 150 Z" {...pen(draw, 128, BUILD.pendant)} />
        <Gold>
          <path d="M57 156 Q66 163 75 156" {...pen(draw, 26, BUILD.pendantGold)} />
          <path d="M345 156 Q354 163 363 156" {...pen(draw, 26, BUILD.pendantGold)} />
        </Gold>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// EMPTY-STATE FAMILY — all 96 × 96, same construction, same stroke weight
// ---------------------------------------------------------------------------------------------

/**
 * Shared frame for the empty-state marks.
 *
 * Defaults to 4 rem so dropping one into `EmptyState`'s `icon` slot without a class gives a
 * tile that is a clear step up from the 24 px lucide glyph without taking over the panel.
 * Every mark shares the same ground line at y = 82, which is most of what makes them a set.
 */
function Mark({ className, ground = true, children }: { className?: string; ground?: boolean; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={96}
      height={96}
      className={cn('block h-16 w-16 shrink-0', className)}
      aria-hidden
      focusable="false"
    >
      <g {...LINE}>
        {children}
        {ground && <Quiet opacity={0.3}><path d="M14 82 H82" /></Quiet>}
      </g>
    </svg>
  );
}

/** Nothing on the pass / no orders. An empty plate between its covers. */
export function EmptyPlate({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <circle cx={48} cy={48} r={26} />
      {/* Fork */}
      <path d="M11 26 v10 a5 5 0 0 0 10 0 V26" />
      <Quiet opacity={0.55}><path d="M16 26 V36" /></Quiet>
      <path d="M16 46 V74" />
      {/* Knife */}
      <path d="M80 26 C84.5 32 84.5 39 80 44 Z" />
      <path d="M80 44 V74" />
      {/* The well of the plate. Gold here rather than on the outer rim, which the fork crosses. */}
      <Gold><circle cx={48} cy={48} r={17.5} /></Gold>
    </Mark>
  );
}

/** No tables / no reservations. A round top on its pedestal, two seats drawn back. */
export function EmptyTable({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <ellipse cx={48} cy={42} rx={24} ry={8.5} />
      <path d="M24 42 v4 a24 8.5 0 0 0 48 0 v-4" />
      <path d="M48 51 V68" />
      <ellipse cx={48} cy={71} rx={13} ry={4} />
      <Quiet opacity={0.55}>
        <rect x={6} y={34} width={12} height={18} rx={4} />
        <rect x={78} y={34} width={12} height={18} rx={4} />
      </Quiet>
      <Gold><path d="M24 42 A24 8.5 0 0 1 48 33.5" /></Gold>
    </Mark>
  );
}

/** No stock / no items. An open carton, looked into. */
export function EmptyBox({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M16 44 H64 V76 H16 Z" />
      <path d="M64 44 L78 32 V64 L64 76" />
      <path d="M16 44 L30 32 H78 L64 44 Z" />
      {/* Inside rim — the box is open and there is nothing in it. */}
      <Gold><path d="M21.5 43.5 L33 34 H74 L62.5 43.5 Z" /></Gold>
    </Mark>
  );
}

/** No bills / no payments. A torn-off docket with its total rule left blank. */
export function EmptyReceipt({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M24 18 H72 V70 l-6 6 l-6 -6 l-6 6 l-6 -6 l-6 6 l-6 -6 l-6 6 l-6 -6 Z" />
      <Quiet opacity={0.55}>
        <path d="M33 32 H63" />
        <path d="M33 41 H63" />
        <path d="M33 50 H54" />
      </Quiet>
      <Gold width={1.75}><path d="M33 60 H63" /></Gold>
    </Mark>
  );
}

/** No matches. A lens over a single empty rule. */
export function EmptySearch({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <circle cx={42} cy={42} r={20} />
      <path d="M56.5 56.5 L74 74" />
      <Quiet opacity={0.5}><circle cx={42} cy={42} r={14} /></Quiet>
      <Gold><path d="M35 42 H49" /></Gold>
    </Mark>
  );
}

/** No data for this range. Three empty troughs against an axis; nothing is plotted. */
export function EmptyChart({ className }: { className?: string }) {
  return (
    <Mark className={className} ground={false}>
      <path d="M20 18 V76 H80" />
      <Quiet opacity={0.45}>
        <path d="M20 32 H23.5" />
        <path d="M20 46 H23.5" />
        <path d="M20 60 H23.5" />
        <rect x={30} y={40} width={12} height={36} rx={2.5} />
        <rect x={66} y={48} width={12} height={28} rx={2.5} />
      </Quiet>
      <Gold><rect x={48} y={32} width={12} height={44} rx={2.5} /></Gold>
    </Mark>
  );
}

/** No guests / no customers. A single figure, constructed from a circle and one arc. */
export function EmptyGuest({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <circle cx={48} cy={34} r={11} />
      <path d="M26 72 a22 22 0 0 1 44 0" />
      {/* A second figure standing behind. Head only: stroke art cannot occlude, so drawing its
          shoulders as well would put a stray arc straight across the first silhouette. */}
      <Quiet opacity={0.4}><circle cx={73} cy={28} r={8} /></Quiet>
      <Gold><path d="M37.1 33 A11 11 0 0 1 45.1 23.4" /></Gold>
    </Mark>
  );
}

/** No bottle service. A bottle and its flute, label band left blank. */
export function EmptyBottle({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M35 78 V50 C35 43 43 40 43 32 V22 H53 V32 C53 40 61 43 61 50 V78 Z" />
      <Quiet opacity={0.55}><path d="M43 27 H53" /></Quiet>
      {/* Flute */}
      <Quiet opacity={0.7}>
        <path d="M15 34 V44 q0 7 5 7 q5 0 5 -7 V34 Z" />
        <path d="M20 51 V68" />
        <path d="M14 68 H26" />
      </Quiet>
      <Gold>
        <path d="M35 57 H61" />
        <path d="M35 69 H61" />
      </Gold>
    </Mark>
  );
}
