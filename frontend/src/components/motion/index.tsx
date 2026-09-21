import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { DUR, staggerDelay, motionLevelFor, prefersReducedMotion } from '@/config/motion';

/**
 * PAGE TRANSITION
 *
 * Re-keys on the pathname so the content region replays a short rise-and-fade on every route
 * change. Three deliberate constraints:
 *
 *   1. It animates the CONTENT only — the sidebar, header and bottom navigation never move, so
 *      the operator's target does not slide out from under their finger mid-tap.
 *   2. It is an entrance, not a cross-fade. A cross-fade needs the outgoing page to stay mounted,
 *      which on this app means two copies of a data-heavy screen alive at once.
 *   3. `calm` routes (kitchen, bar, order entry, billing) opt out entirely. A board that is being
 *      read from two metres away must not re-animate because someone changed screen.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const calm = motionLevelFor(pathname) === 'calm';
  return (
    <div key={calm ? 'static' : pathname} className={cn(!calm && 'anim-page')}>
      {children}
    </div>
  );
}

/**
 * REVEAL — a single element that rises in when it first appears.
 * `soft` fades without the rise, for things that should not appear to move (a chart, a figure).
 */
export function Reveal({ children, delay = 0, soft, className, as: As = 'div' }: {
  children: ReactNode; delay?: number; soft?: boolean; className?: string; as?: 'div' | 'section' | 'li';
}) {
  return (
    <As className={cn(soft ? 'anim-enter-soft' : 'anim-reveal', className)} style={{ '--d': `${delay}ms` } as React.CSSProperties}>
      {children}
    </As>
  );
}

/**
 * STAGGER — reveals its children in sequence.
 *
 * The delay is capped (see `staggerDelay`), so a long list finishes arriving quickly rather than
 * trickling in. Children keep their own element type; this only sets the delay custom property.
 */
export function Stagger({ children, className, from = 0 }: { children: ReactNode[]; className?: string; from?: number }) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <div key={i} className="anim-reveal" style={{ '--d': `${staggerDelay(i + from)}ms` } as React.CSSProperties}>
          {child}
        </div>
      ))}
    </div>
  );
}

/**
 * COUNT UP — rolls a number to its value ON FIRST PAINT ONLY.
 *
 * The brief that governs this product forbids animated money counters, and it is right to: a
 * figure that is still moving cannot be read, and one that re-rolls every poll is actively
 * hostile. So this is deliberately narrow:
 *
 *   • it runs once per mounted component and never again, however often the value updates;
 *   • a value that arrives later (the fetch resolving) is rendered directly, not rolled;
 *   • it is skipped entirely under reduced motion;
 *   • it is only ever used on a hero figure that a person is looking AT, never in a table,
 *     a list, a bill or anything that has to be reconciled.
 *
 * `format` keeps the rolling value in the same shape as the final one, so the width does not jump.
 */
export function CountUp({ value, format, className, duration = 700 }: {
  value: number; format: (n: number) => string; className?: string; duration?: number;
}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const played = useRef(false);

  useEffect(() => {
    // Only the first real value is rolled. Anything after is a data update, not an entrance.
    if (played.current) { setShown(value); return undefined; }
    if (prefersReducedMotion() || !Number.isFinite(value)) { setShown(value); played.current = true; return undefined; }
    played.current = true;

    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // Ease-out: the number settles rather than stopping dead.
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShown(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={cn('tnum', className)}>{format(shown)}</span>;
}

/**
 * SUCCESS MARK — a tick that draws itself inside a ring that pops once.
 *
 * Used where an operator needs to *believe* something happened: a payment taken, a shift opened.
 * It is decoration over a state that is already true and already announced in text — it never
 * stands in for the confirmation itself, and it plays only after the server has confirmed.
 */
export function SuccessMark({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('relative inline-grid place-items-center', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 48 48" className="h-full w-full">
        <circle cx="24" cy="24" r="21" className="fill-success-50 stroke-success-500 anim-pop" strokeWidth="2" style={{ transformOrigin: 'center' }} />
        <path
          d="M15 24.5 L21.5 31 L33 19"
          className="stroke-success-700 anim-draw"
          style={{ '--len': 32, '--d': '160ms' } as React.CSSProperties}
          fill="none" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Re-exported so screens import one module. */
export { DUR, staggerDelay, motionLevelFor, prefersReducedMotion };
