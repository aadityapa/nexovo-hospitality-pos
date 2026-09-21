import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Sparkline, canSparkline } from '@/components/graphics/Indicators';

export interface CardProps extends HTMLAttributes<HTMLDivElement> { padded?: boolean; interactive?: boolean }

export function Card({ className, padded = true, interactive, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'card',
        padded && 'p-5',
        interactive && 'cursor-pointer transition-[border-color,box-shadow] hover:border-neutral-300 hover:shadow-panel',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  // `flex-wrap` so a long title plus a header action drops to a second line on a narrow
  // phone instead of forcing the whole card wider than its column.
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 mb-4', className)}>
      <div className="min-w-0">
        <h3 className="text-subheading text-neutral-900">{title}</h3>
        {subtitle && <p className="text-sm text-neutral-500 mt-1 leading-snug">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * Section divider inside a card — quieter than a new card.
 * `neutral-200` is the app's hairline; `neutral-100` is only one step off `surface-raised` and
 * effectively disappears on a dark ground.
 */
export function CardDivider({ className }: { className?: string }) {
  return <hr className={cn('border-neutral-200 -mx-5 my-4', className)} />;
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Only pass a delta when a real comparison period was fetched — never synthesise one. */
  delta?: { value: number; label?: string };
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  hint?: string;
  onClick?: () => void;
  className?: string;
  size?: 'md' | 'lg';
  /**
   * REAL measured points, already fetched and in order — `sales.byHour`, `sales.byDay`, or a
   * figure derived from them point-for-point (sales ÷ orders per hour). Never padded, never
   * interpolated, never a series for a different metric than the one printed above it. The
   * `Sparkline` itself refuses to draw fewer than four genuine points, so a thin period simply
   * shows no line rather than a shape that implies a direction.
   */
  series?: number[];
  /**
   * A genuine comparison against a second, separately fetched period.
   *
   * `previous` is that period's figure. `current` is this period's raw number: `value` is a
   * formatted node (usually `money(...)`), so the comparable figure has to arrive separately —
   * when `value` is already a plain number it is used and `current` may be omitted. `label` names
   * the period being compared against ("previous 7 days"), because a bare "+12%" says nothing
   * about what it is 12% of.
   *
   * Pass this ONLY once the comparison period has actually resolved. While it is loading the
   * caller leaves the prop off and the card shows no delta at all — a placeholder zero would be
   * a statement about the business that nothing has measured.
   */
  compare?: { previous: number; label: string; current?: number };
  /**
   * Inline style, for ONE purpose: carrying the `--d` beat of a staged reveal when a row of these
   * is revealed in sequence (see `staggerDelay` in config/motion). It is not a styling escape
   * hatch — colour and spacing stay in `className` and in the tokens.
   */
  style?: CSSProperties;
}

/**
 * The icon tile is the only colour on a stat card, so it is a tinted fill with an inset hairline
 * rather than a solid block — a saturated 40 px square would out-shout the figure it labels.
 * Same construction as `Badge` (`-50` fill, `-200` ring, `-700` glyph), with the flat fill opened
 * into a two-rung gradient in the tile's OWN hue: `-100` at the top-left where the card's gloss
 * lands, falling to the familiar `-50`. It is the same amount of colour, lit from the same
 * direction as the surface it sits on, so the tile reads as part of the material rather than a
 * sticker on it. Both rungs exist on every ramp in the palette, so both themes are correct.
 */
const iconTones: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'bg-gradient-to-br from-neutral-200 to-neutral-100 text-neutral-600 ring-1 ring-inset ring-neutral-300',
  primary: 'bg-gradient-to-br from-primary-100 to-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200',
  success: 'bg-gradient-to-br from-success-100 to-success-50 text-success-700 ring-1 ring-inset ring-success-200',
  warning: 'bg-gradient-to-br from-warning-100 to-warning-50 text-warning-700 ring-1 ring-inset ring-warning-200',
  danger:  'bg-gradient-to-br from-danger-100 to-danger-50 text-danger-700 ring-1 ring-inset ring-danger-200',
  info:    'bg-gradient-to-br from-info-100 to-info-50 text-info-700 ring-1 ring-inset ring-info-200',
  accent:  'bg-gradient-to-br from-accent-100 to-accent-50 text-accent-700 ring-1 ring-inset ring-accent-200',
};

/**
 * Sparkline stroke per tone. The `-600` rung is the one value on each ramp that is legible on
 * BOTH grounds — in dark it is the bright fill rung, in light it is a deepened one — so the trend
 * line never has to know which theme is painted.
 */
const sparkTones: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'text-neutral-400',
  primary: 'text-primary-600',
  success: 'text-success-600',
  warning: 'text-warning-600',
  danger:  'text-danger-600',
  info:    'text-info-600',
  accent:  'text-accent-600',
};

/**
 * The delta chip. Direction is carried by an icon AND by the sign of the printed figure, never by
 * colour alone, and the period it compares against is always spelled out beside it.
 */
function DeltaChip({ pct, label }: { pct: number; label?: ReactNode }) {
  const flat = Math.abs(pct) < 0.05;
  return (
    <p className={cn(
      'text-caption inline-flex items-center gap-1 font-medium',
      flat ? 'text-neutral-500' : pct > 0 ? 'text-success-700' : 'text-danger-700',
    )}>
      {flat ? <Minus className="h-3 w-3" aria-hidden /> : pct > 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
      <span className="tnum">{Math.abs(pct).toFixed(1)}%</span>
      {label && <span className="text-neutral-500 font-normal">{label}</span>}
    </p>
  );
}

/**
 * Renders the comparison, or says plainly why it cannot.
 *
 * A percentage change measured from zero is not a percentage — "+100%" against a period that sold
 * nothing is a fabricated statement — so that case prints what actually happened instead.
 */
function CompareChip({ compare, value }: { compare: NonNullable<StatCardProps['compare']>; value: ReactNode }) {
  const current = compare.current ?? (typeof value === 'number' ? value : null);
  if (current == null || !Number.isFinite(current) || !Number.isFinite(compare.previous)) return null;
  if (compare.previous <= 0) {
    return (
      <p className="text-caption text-neutral-500 inline-flex items-center gap-1">
        <Minus className="h-3 w-3" aria-hidden />
        no data for {compare.label}
      </p>
    );
  }
  return <DeltaChip pct={((current - compare.previous) / compare.previous) * 100} label={`vs ${compare.label}`} />;
}

export function StatCard({ label, value, icon, delta, tone = 'neutral', hint, onClick, className, style, size = 'md', series, compare }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div';
  /* Four genuine points or no line at all — and the slot is not reserved either, so a metric
     whose period is too thin to chart simply has no empty gap under it. */
  const spark = canSparkline(series);
  const foot = (delta || compare || spark) ? (
    <div className="mt-1.5 flex items-center justify-between gap-2 min-w-0">
      <div className="min-w-0">
        {delta && <DeltaChip pct={delta.value} label={delta.label} />}
        {compare && <CompareChip compare={compare} value={value} />}
      </div>
      {/* Hidden below 420 px, where the card is a single full-width row and the named comparison
          is the more useful of the two in the space available. */}
      {spark && (
        <span className={cn('shrink-0 hidden xs:block', sparkTones[tone])}>
          <Sparkline points={series ?? []} width={80} height={22} />
        </span>
      )}
    </div>
  ) : null;

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={style}
      className={cn(
        /*
         * MATERIAL. A metric tile is a small, repeated surface, so it gets the two cheap
         * treatments and not the third: `.material-gloss` puts one specular band across the top
         * so the tile catches light, and `.material-edge` gives it the hairline bevel that makes
         * it read as lifted off the page. The grain is deliberately NOT here — it belongs to the
         * one large slab per screen (the hero); on a 90 px tile it is noise, and twelve grained
         * tiles would flatten the hierarchy the hero exists to set.
         *
         * A caller may add a `.fill-*` wash on top for a tile whose VALUE is the point (an
         * all-clear count, a write-off). That stays rare by convention: if every tile glows
         * equally, none of them reads as important.
         */
        'card material-gloss material-edge p-3.5 sm:p-5 flex items-center xs:items-start gap-3 sm:gap-4 text-left w-full min-w-0',
        /*
         * A tappable tile brightens its border and takes the shared press scale. It deliberately
         * does NOT swap in a drop shadow the way a plain card does: that would have to replace the
         * `.material-edge` bevel (one `box-shadow` property, not two), so the tile's bevel would
         * blink out the moment the pointer touched it.
         */
        onClick && 'transition-colors duration-control hover:border-neutral-300 press',
        className,
      )}
    >
      {icon && <span className={cn('shrink-0 h-9 w-9 rounded-md flex items-center justify-center', iconTones[tone])} aria-hidden>{icon}</span>}
      {/*
       * FIGURE FIRST, then the label under it — the reference order, and the right one: the
       * figure is what the tile exists to say, and a label above it makes the eye read a
       * caption before the thing it captions.
       *
       * Below 420 px the card becomes a full-width ROW instead: label on the left (free to
       * wrap onto a second line), figure on the right. Truncating the label to "T…" is never
       * acceptable — an operator cannot act on a metric they cannot name — so nothing here
       * truncates at any width.
       */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 xs:block">
          <p className="text-label text-neutral-500 uppercase leading-tight break-words min-w-0 xs:order-2 xs:mt-0.5">{label}</p>
          <p className={cn(
            'text-neutral-900 font-semibold tabular-nums whitespace-nowrap shrink-0 xs:order-1',
            size === 'lg' ? 'text-xl xs:text-metric' : 'text-xl xs:text-[26px] leading-7 xs:leading-8 tracking-[-0.02em]',
          )}>
            {value}
          </p>
        </div>
        {foot}
        {hint && <p className="text-caption text-neutral-500 mt-1.5 line-clamp-2">{hint}</p>}
      </div>
    </Comp>
  );
}
