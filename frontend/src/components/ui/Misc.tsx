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
    <div className={cn('inline-flex items-center rounded-sm border border-neutral-300 bg-white overflow-hidden', disabled && 'opacity-50', className)} role="group" aria-label="Quantity">
      <button
        type="button"
        disabled={disabled || (value <= min && !onRemove)}
        onClick={dec}
        aria-label={removing ? 'Remove item' : 'Decrease quantity'}
        className={cn('flex items-center justify-center transition-colors disabled:opacity-40', dims, removing ? 'text-danger-600 hover:bg-danger-50' : 'text-neutral-700 hover:bg-neutral-100')}
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
        className={cn('flex items-center justify-center text-neutral-700 hover:bg-neutral-100 transition-colors disabled:opacity-40', dims)}
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
              'min-h-touch px-3.5 rounded-full border text-sm font-medium transition-colors press',
              on ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400',
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
    <div ref={ref} role="group" aria-label={ariaLabel} onKeyDown={onKey} className={cn('inline-flex rounded-md bg-neutral-100 p-1 gap-1 max-w-full overflow-x-auto no-scrollbar', className)}>
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
              'rounded-sm font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1.5',
              size === 'sm' ? 'px-2.5 h-8 text-xs' : size === 'lg' ? 'px-4 h-11 text-base' : 'px-3 h-9 text-sm',
              on ? 'bg-white text-neutral-900 shadow-card' : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums font-semibold', on ? 'bg-primary-600 text-white' : 'bg-neutral-200 text-neutral-700')}>
                {o.count}
              </span>
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
              'px-3.5 h-11 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5',
              on ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:border-neutral-300',
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
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-neutral-300 shrink-0" aria-hidden />}
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
          <div className="min-w-0">
            <h1 className="text-heading text-neutral-900 line-clamp-2">{title}</h1>
            {subtitle && <p className="text-sm text-neutral-500 mt-1 leading-snug">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Avatar
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm';
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full bg-primary-50 text-primary-700 font-semibold shrink-0 ring-1 ring-inset ring-primary-100', dims, className)} aria-hidden>
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
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-modal whitespace-nowrap rounded-sm bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white',
          'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- Toaster
const toastStyles = {
  success: { icon: CheckCircle2, cls: 'border-success-200', iconCls: 'text-success-600' },
  error:   { icon: AlertCircle,  cls: 'border-danger-200',  iconCls: 'text-danger-600' },
  warning: { icon: AlertTriangle, cls: 'border-warning-200', iconCls: 'text-warning-700' },
  info:    { icon: Info, cls: 'border-info-200', iconCls: 'text-info-600' },
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
      className={cn('pointer-events-auto flex items-start gap-3 rounded-md border bg-white shadow-pop px-4 py-3 w-full max-w-sm animate-scale-in', S.cls)}
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
        className="-mr-1 -mt-1 h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-sm text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
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
