import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, X, CheckCircle2, AlertCircle, AlertTriangle, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUiStore, type Toast } from '@/store/uiStore';

// ---------------------------------------------------------------- QuantitySelector
export interface QuantitySelectorProps { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; className?: string; onRemove?: () => void }

export function QuantitySelector({ value, onChange, min = 0, max = 999, size = 'md', disabled, className, onRemove }: QuantitySelectorProps) {
  const dims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  const dec = () => { if (value - 1 < min) { onRemove?.(); return; } onChange(value - 1); };
  const removing = !!onRemove && value <= Math.max(min, 1);
  return (
    /* `bg-surface` rather than the card surface: the stepper is a control, and controls in this
       system sit *below* the panel they are on, exactly like `.input-base`. */
    <div className={cn('inline-flex items-center rounded-sm border border-neutral-300 bg-surface overflow-hidden', disabled && 'opacity-50', className)} role="group" aria-label="Quantity">
      <button
        type="button"
        disabled={disabled || (value <= min && !onRemove)}
        onClick={dec}
        aria-label={removing ? 'Remove item' : 'Decrease quantity'}
        className={cn('flex items-center justify-center transition-colors duration-fast disabled:opacity-40', dims, removing ? 'text-danger-700 hover:bg-danger-50' : 'text-neutral-700 hover:bg-neutral-100')}
      >
        {removing ? <X className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </button>
      <span
        className={cn('tabular-nums font-semibold text-center select-none border-x border-neutral-200', size === 'sm' ? 'w-9 text-sm leading-8' : size === 'lg' ? 'w-14 text-lg leading-[3rem]' : 'w-11 text-base leading-10')}
        aria-live="polite"
        aria-atomic="true"
      >
        {value}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
        className={cn('flex items-center justify-center text-neutral-700 hover:bg-neutral-100 transition-colors duration-fast disabled:opacity-40', dims)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- QuickChips
export function QuickChips({ options, selected, onToggle, className }: { options: string[]; selected: string[]; onToggle: (v: string) => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="group">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o)}
            className={cn(
              'min-h-touch px-3.5 rounded-full border text-sm font-medium transition-colors duration-control press',
              /* A selected chip is a gold fill, so its label is `on-primary` — white on gold is
                 1.9:1 and is never used anywhere in this system. */
              on ? 'bg-primary-500 border-primary-400 text-on-primary' : 'bg-surface border-neutral-300 text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400',
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- SegmentedControl / Tabs
export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  count?: number;
  /** Required when `label` is an icon — otherwise the button has no accessible name. */
  ariaLabel?: string;
}

/**
 * Filter switcher. Implemented as a group of toggle buttons rather than a `tablist`:
 * these switch a filter in place, not a tab panel, and `aria-pressed` describes that
 * honestly without requiring panel wiring.
 * Left/Right arrows move between options, matching the toolbar pattern.
 */
export function SegmentedControl<V extends string>({ options, value, onChange, className, size = 'md', ariaLabel }: {
  options: SegmentOption<V>[]; value: V; onChange: (v: V) => void; className?: string; size?: 'sm' | 'md' | 'lg'; ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  };
  return (
    /*
     * Sunken track, raised pill. On a dark ground the selected segment cannot be "white on grey";
     * it has to be the *lighter* surface, so the track drops to `neutral-50` (below every card)
     * and the active pill rises to `neutral-200`.
     */
    <div ref={ref} role="group" aria-label={ariaLabel} onKeyDown={onKey} className={cn('inline-flex rounded-md bg-neutral-50 border border-neutral-200 p-1 gap-1 max-w-full overflow-x-auto no-scrollbar', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-sm font-medium whitespace-nowrap transition-colors duration-control inline-flex items-center gap-1.5 touch-target',
              size === 'sm' ? 'px-2.5 h-8 text-xs' : size === 'lg' ? 'px-4 h-11 text-base' : 'px-3 h-9 text-sm',
              on ? 'bg-neutral-200 text-neutral-900 shadow-card ring-1 ring-inset ring-neutral-300' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums font-semibold', on ? 'bg-primary-500 text-on-primary' : 'bg-neutral-200 text-neutral-700')}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * FILTER CHIPS — a single-select row of counted chips.
 *
 * The reference boards use this wherever a collection is filtered by one facet with the sizes
 * visible: "All items 48 · Food 28 · Beverages 12 · Desserts 6". The selected chip is the only
 * gold thing in the row, which is why the count inside it can stay legible without a second fill.
 *
 * Distinct from `SegmentedControl` on purpose. A segmented control is a sunken track holding a
 * raised pill — it reads as one control with a position. This reads as a row of tags, which is
 * what a facet list is, and it wraps onto a second line at a narrow width instead of scrolling a
 * track sideways.
 */
export function FilterChips<V extends string>({ options, value, onChange, className, ariaLabel }: {
  options: SegmentOption<V>[]; value: V; onChange: (v: V) => void; className?: string; ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-[13px] font-medium whitespace-nowrap border transition-colors duration-control touch-target',
              on
                ? 'bg-primary-500/12 border-primary-500/35 text-primary-700'
                : 'bg-surface-raised border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn('tabular-nums text-[11px] font-semibold', on ? 'text-primary-700/80' : 'text-neutral-400')}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<V extends string>({ options, value, onChange, className, ariaLabel }: {
  options: SegmentOption<V>[]; value: V; onChange: (v: V) => void; className?: string; ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  };
  return (
    <div ref={ref} role="group" aria-label={ariaLabel} onKeyDown={onKey} className={cn('flex gap-1 border-b border-neutral-200 overflow-x-auto no-scrollbar', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-3.5 h-11 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors duration-control inline-flex items-center gap-1.5',
              on ? 'border-primary-500 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:border-neutral-300',
            )}
          >
            {o.label}
            {o.count != null && <span className="rounded-full bg-neutral-100 px-1.5 text-[11px] tabular-nums text-neutral-700">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Breadcrumbs
export interface Crumb { label: string; to?: string }

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex items-center gap-1 text-caption text-neutral-500 flex-wrap">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1 min-w-0">
              {/* `neutral-300` is a *border* value on this ramp — as a glyph it all but vanishes. */}
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-neutral-400 shrink-0" aria-hidden />}
              {c.to && !last
                ? <Link to={c.to} className="hover:text-neutral-800 hover:underline underline-offset-2 truncate">{c.label}</Link>
                : <span className={cn('truncate', last && 'text-neutral-700 font-medium')} aria-current={last ? 'page' : undefined}>{c.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------- PageHeader
export function PageHeader({ title, subtitle, actions, back, className, children, breadcrumbs }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: () => void; className?: string; children?: ReactNode; breadcrumbs?: Crumb[];
}) {
  return (
    <div className={cn('mb-5', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} className="mb-2" />}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {back && (
            <button
              type="button"
              onClick={back}
              aria-label="Go back"
              className="mt-0.5 h-9 w-9 -ml-1 rounded-sm hover:bg-neutral-100 flex items-center justify-center text-neutral-600 shrink-0 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {/* Same treatment as `DashboardHero` — one page-head language across the product.
              Never clamped: a title that ends in an ellipsis tells the operator nothing. */}
          <div className="min-w-0">
            <h1 className="text-heading sm:text-display text-neutral-900 font-semibold tracking-[-0.02em] leading-tight break-words">{title}</h1>
            {subtitle && <p className="text-[13px] text-neutral-500 mt-1 leading-snug">{subtitle}</p>}
          </div>
        </div>
        {/* `min-w-0` rather than `shrink-0` — see the note in DashboardHero: a non-shrinking
            action slot makes its max-content width the page's minimum width. */}
        {actions && <div className="flex flex-wrap items-center gap-2 min-w-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Avatar
/**
 * Initials tile.
 *
 * `brand` is gold and belongs to ONE person — whoever is signed in. Every other avatar in the
 * product is a record (a supplier, a guest, a member of staff in a list) and takes `record`, a
 * quiet neutral tile. When the gold was used for all of them, a table of eight suppliers had
 * eight gold discs down its left edge, each as loud as the page's primary action.
 *
 * `square` matches the reference's supplier and product tiles, which are rounded squares rather
 * than discs; people stay circular.
 */
export function Avatar({ name, size = 'md', variant = 'brand', square, className }: {
  name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; variant?: 'brand' | 'record'; square?: boolean; className?: string;
}) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  /* `xl` is the identity tile at the top of a document screen — a supplier's account, a purchase
     order — where the tile is the subject of the page rather than a marker beside a name. */
  const dims = size === 'sm' ? 'h-8 w-8 text-xs'
    : size === 'lg' ? 'h-14 w-14 text-lg'
      : size === 'xl' ? 'h-[72px] w-[72px] text-2xl'
        : 'h-10 w-10 text-[13px]';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-semibold shrink-0 ring-1 ring-inset',
        square ? 'rounded-md' : 'rounded-full',
        variant === 'brand'
          ? 'bg-primary-50 text-primary-700 ring-primary-200'
          : 'bg-neutral-100 text-neutral-700 ring-neutral-200',
        dims, className,
      )}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}

// ---------------------------------------------------------------- Tooltip
/**
 * CSS-only tooltip: shows on hover and on keyboard focus. Purely supplementary —
 * never put information here that is not also available another way.
 */
export function Tooltip({ label, children, side = 'top', className }: { label: string; children: ReactNode; side?: 'top' | 'bottom'; className?: string }) {
  return (
    <span className={cn('relative inline-flex group', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          /* Inverted ramp: `bg-neutral-900` is now the BRIGHTEST value, so the old dark chip with
             white text would have been white-on-white. The chip is `neutral-200` (a raised
             charcoal) with the brightest text on it — 13:1 — and a hairline so it separates from
             whatever surface it floats over. */
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-modal whitespace-nowrap rounded-sm px-2 py-1 text-[11px] font-medium',
          'bg-neutral-200 text-neutral-900 ring-1 ring-inset ring-neutral-300 shadow-pop',
          'opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- Toaster
/*
 * A toast is a popover, so it uses the popover surface. The tone lives in the border, the icon and
 * a WASH that fades out by 70% of the card — never a fully tinted block, which would compete with
 * the screen behind it, and there are four of them.
 *
 * `fill` is the material keyed to the tone. `.fill-success` and `.fill-danger` are the two washes
 * the system defines for an outcome, and they are the two tones a toast reports an outcome in.
 * Warning and info are not outcomes — they are context — so they take `.fill-surface`, the neutral
 * high → raised gradient, which gives the card the same depth without claiming a result. Every
 * one is a token-driven two-stop gradient at ≤ 16% over the toast's own surface, so the title and
 * body keep the contrast they measure at today in both themes.
 */
const toastStyles = {
  success: { icon: CheckCircle2, cls: 'border-success-200', iconCls: 'text-success-500', fill: 'fill-success' },
  error:   { icon: AlertCircle,  cls: 'border-danger-200',  iconCls: 'text-danger-500',  fill: 'fill-danger' },
  warning: { icon: AlertTriangle, cls: 'border-warning-200', iconCls: 'text-warning-500', fill: 'fill-surface' },
  info:    { icon: Info, cls: 'border-info-200', iconCls: 'text-info-500', fill: 'fill-surface' },
};

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  useEffect(() => {
    const h = window.setTimeout(() => dismiss(t.id), t.durationMs);
    return () => window.clearTimeout(h);
  }, [t, dismiss]);
  const S = toastStyles[t.type];
  return (
    <div
      role={t.type === 'error' ? 'alert' : 'status'}
      /*
       * MOTION. One `scale-in` on mount and nothing else, ever. The toast does not animate out
       * (it is dismissed on a timer or by a tap, and an exit animation would hold a dead card on
       * screen), it does not re-animate when another toast joins the stack — each card owns its
       * own entrance — and nothing about it loops or pulses while it waits.
       *
       * MATERIAL. Gloss, because a toast floats over the whole application and is the one card on
       * screen with light above it, plus the tone wash. `.material-edge` is deliberately absent:
       * it is a `box-shadow`, and it would replace `shadow-pop` — the toast would lose the lift
       * that separates it from whatever screen it is covering.
       */
      className={cn('pointer-events-auto flex items-start gap-3 rounded-md border bg-surface-high shadow-pop px-4 py-3 w-full max-w-sm animate-scale-in material-gloss', S.cls, S.fill)}
    >
      <S.icon className={cn('h-5 w-5 shrink-0 mt-0.5', S.iconCls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900">{t.title}</p>
        {t.description && <p className="text-sm text-neutral-600 mt-0.5 break-words leading-snug">{t.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss notification"
        /* The toast surface *is* `neutral-100`, so its hover has to step one rung further up. */
        className="-mr-1 -mt-1 h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-sm text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200 transition-colors duration-fast"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div
      className="fixed z-toast inset-x-0 top-3 sm:top-auto sm:bottom-4 sm:right-4 sm:inset-x-auto flex flex-col items-center sm:items-end gap-2 px-3 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}

// ---------------------------------------------------------------- KeyValue
export function KeyValue({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm', className)}>
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-neutral-500">{i.label}</dt>
          <dd className="text-neutral-900 text-right min-w-0 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
