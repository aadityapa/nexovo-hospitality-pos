import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { fmtDate } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { DateRange } from '@/types';

/**
 * THE PAGE HEAD.
 *
 * A strong title, one short line saying what the screen is for, and the screen's actions aligned
 * to the right of them. That is all. It sits directly on the workspace with no surface of its own.
 *
 * It used to be a slab: a full-width `.material-premium` band carrying the venue name, the title,
 * the period and a gold hairline. The reference boards do not have one, and working through them
 * makes the reason obvious — the band was costing about 120 px at the top of every screen and
 * putting the loudest material in the product directly above the content it was introducing. On a
 * dashboard whose job is four figures and two charts, the introduction was outranking the thing.
 *
 * The identity the band used to carry has not been dropped, it has moved to where it belongs and
 * is now permanent rather than per-screen: the venue's business name and branch sit at the foot of
 * the navigation rail, and the branch is a chip in the header. Both print in full at every width
 * that shows them, so defect E1 (`The Saffron L… · Main Br…`) stays closed.
 *
 * `compact` tightens the spacing for the live queues — waiter home and the cashier settlement
 * list — where the first row of the queue is the point of the screen. It no longer needs to fight
 * a band for the space, so the difference between the two variants is now only the margin.
 *
 * MOTION. The head never animates. It arrives inside `PageTransition`'s content rise, and a second
 * entrance on the one fixed landmark of a screen makes the reader's eye start from a moving target.
 */
export function DashboardHero({ title, subtitle, range, actions, children, compact }: {
  title: string;
  subtitle?: string;
  range?: DateRange;
  actions?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  const sameDay = range ? range.from.slice(0, 10) === range.to.slice(0, 10) : true;

  const period = range && (
    <span className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-surface-raised px-2.5 h-9 text-[13px] text-neutral-700">
      <CalendarDays className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
      <time dateTime={range.from.slice(0, 10)} className="tnum">{fmtDate(range.from)}</time>
      {!sameDay && (
        <>
          <span className="text-neutral-400" aria-hidden>–</span>
          <time dateTime={range.to.slice(0, 10)} className="tnum">{fmtDate(range.to)}</time>
        </>
      )}
    </span>
  );

  return (
    <div className={cn('min-w-0', compact ? 'mb-3.5' : 'mb-5')}>
      {/*
       * The title and the actions share one row and wrap as a unit. `items-start` rather than
       * `items-center`, so a two-line title keeps its action button level with the FIRST line —
       * a button that drifts to the vertical centre of a wrapped title looks unanchored.
       */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {/* Never truncated. A page title that ends in an ellipsis tells the operator nothing,
              and there is no width at which wrapping costs more than that. */}
          <h1 className={cn(
            'text-neutral-900 font-semibold tracking-[-0.02em] leading-tight break-words',
            compact ? 'text-[19px] sm:text-heading' : 'text-heading sm:text-display',
          )}>
            {title}
          </h1>
          {subtitle && <p className="text-[13px] text-neutral-500 mt-1 leading-snug">{subtitle}</p>}
        </div>

        {/*
         * `min-w-0`, NOT `shrink-0`.
         *
         * A `shrink-0` flex item keeps its max-content width whatever happens, so an action slot
         * holding a date chip and two buttons sets a floor the whole page cannot go under — at
         * 390 px that floor was 457 px and the document scrolled sideways. It was the single
         * cause of fourteen overflows across six screens, and every screen that hit it had been
         * "fixed" locally with a hard-coded `max-w-[13rem]`, which is a symptom being taped over.
         * `min-w-0` lets the slot shrink and `flex-wrap` lets it wrap onto its own line instead.
         */}
        <div className="min-w-0 flex flex-wrap items-center gap-2">
          {period}
          {actions}
        </div>
      </div>

      {children && <div className={cn(compact ? 'mt-3' : 'mt-4')}>{children}</div>}
    </div>
  );
}
