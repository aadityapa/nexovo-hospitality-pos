import type { ReactNode } from 'react';
import { Inbox, AlertCircle, RefreshCw, WifiOff, ShieldAlert, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from './Button';
import { ApiError } from '@/services/api/client';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function LoadingState({ rows = 3, variant = 'list', className }: { rows?: number; variant?: 'list' | 'cards' | 'table' | 'stats' | 'page'; className?: string }) {
  const shell = (children: ReactNode) => (
    <div className={cn(className)} role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
  if (variant === 'stats') {
    return shell(<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)}</div>);
  }
  if (variant === 'cards') {
    return shell(<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">{Array.from({ length: rows * 2 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>);
  }
  if (variant === 'page') {
    return shell(
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)}</div>
        <Skeleton className="h-64" />
      </div>,
    );
  }
  if (variant === 'table') {
    return shell(
      <div className="card p-0 overflow-hidden">
        <Skeleton className="h-11 rounded-none" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 border-t border-neutral-200 flex items-center gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20 hidden sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>,
    );
  }
  return shell(<div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>);
}

/**
 * Illustration slot shared by the empty and error states.
 *
 * It is sized by its CONTENT (a 3 rem floor plus padding) rather than locked to a 48 px circle:
 * every existing caller passes a 24 px lucide glyph and gets exactly the 48 px tile it had before,
 * while a larger illustrated empty state can be dropped into the same `icon` prop and the tile
 * grows around it instead of cropping it. The squircle radius degrades to a rounded rectangle for
 * a wide illustration, where `rounded-full` would have drawn an ellipse.
 */
const SLOT = 'mb-4 inline-flex items-center justify-center min-h-[3rem] min-w-[3rem] max-w-full rounded-2xl p-3';

export interface EmptyStateProps { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string; compact?: boolean }

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-10 px-4' : 'py-16 px-6', className)}>
      {/*
        The tile is one step *above* the card it sits in, so an empty panel still has structure
        instead of collapsing into a flat rectangle of charcoal. `.fill-surface` opens that flat
        step into the system's neutral high → raised wash, so the tile reads as a lit recess
        rather than a lighter square. It keeps its inset `ring` as its edge and takes no
        `.material-edge`: the ring is a `box-shadow`, `.material-edge` is a `box-shadow`, and the
        second would simply replace the first.

        MOTION. The illustration draws itself in — one 700 ms stroke, once, holding its finished
        state. An empty state is the one screen in the product where nothing is happening and
        nobody is waiting on a task, so a little life there costs nobody anything; and because it
        is a stroke-dash reveal it never reflows, never moves the heading below it, and never
        delays the action button. `--len` (320) deliberately OVER-estimates every glyph and house
        illustration this slot is given — under reduced motion `.anim-draw` keeps the dash array
        and only zeroes the offset, so a `--len` shorter than the real path would leave the line
        permanently dashed for the operator who asked for no motion. The `ErrorState` below shares
        the tile but NOT this: an error is not a moment to decorate.
      */}
      <span
        className={cn(
          SLOT,
          'bg-surface-high fill-surface text-neutral-500 ring-1 ring-inset ring-neutral-200',
          '[&>svg]:[--len:320] [&>svg>*]:anim-draw',
        )}
        aria-hidden
      >
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <h3 className="text-subheading text-neutral-900">{title}</h3>
      {description && <p className="text-sm text-neutral-500 mt-1.5 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps { error: unknown; onRetry?: () => void; title?: string; className?: string; compact?: boolean }

export function ErrorState({ error, onRetry, title, className, compact }: ErrorStateProps) {
  const err = ApiError.from(error);
  const icon = err.isNetworkError ? <WifiOff className="h-6 w-6" /> : err.isForbidden ? <ShieldAlert className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />;
  const heading = title ?? (
    err.isNetworkError ? 'Connection problem'
      : err.isForbidden ? 'You do not have access'
        : err.isNotFound ? 'Not found'
          : 'Something went wrong'
  );
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-10 px-4' : 'py-16 px-6', className)}>
      <span className={cn(SLOT, err.isForbidden ? 'bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-200' : 'bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-200')} aria-hidden>
        {icon}
      </span>
      <h3 className="text-subheading text-neutral-900">{heading}</h3>
      <p className="text-sm text-neutral-500 mt-1.5 max-w-md leading-relaxed">{err.message}</p>
      {onRetry && !err.isForbidden && (
        <Button variant="outline" className="mt-5" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mt-3 flex items-start gap-2 rounded-sm border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const alertTones: Record<AlertTone, { wrap: string; icon: ReactNode }> = {
  info:    { wrap: 'border-info-200 bg-info-50 text-info-700',        icon: <Info className="h-4 w-4" /> },
  success: { wrap: 'border-success-200 bg-success-50 text-success-700', icon: <CheckCircle2 className="h-4 w-4" /> },
  warning: { wrap: 'border-warning-200 bg-warning-50 text-warning-700', icon: <AlertTriangle className="h-4 w-4" /> },
  danger:  { wrap: 'border-danger-200 bg-danger-50 text-danger-700',   icon: <AlertCircle className="h-4 w-4" /> },
};

/** Persistent inline notice for page-level context (not a transient toast). */
export function Alert({ tone = 'info', title, children, action, className }: {
  tone?: AlertTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string;
}) {
  const t = alertTones[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-md border px-4 py-3 text-sm', t.wrap, className)}>
      <span className="mt-0.5 shrink-0" aria-hidden>{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('leading-relaxed', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
