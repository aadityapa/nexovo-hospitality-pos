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
          <div key={i} className="px-4 py-3.5 border-t border-neutral-100 flex items-center gap-4">
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

export interface EmptyStateProps { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string; compact?: boolean }

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-10 px-4' : 'py-16 px-6', className)}>
      <span className="h-12 w-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mb-4" aria-hidden>
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <h3 className="text-subheading text-neutral-800">{title}</h3>
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
      <span className={cn('h-12 w-12 rounded-full flex items-center justify-center mb-4', err.isForbidden ? 'bg-warning-50 text-warning-700' : 'bg-danger-50 text-danger-600')} aria-hidden>
        {icon}
      </span>
      <h3 className="text-subheading text-neutral-800">{heading}</h3>
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
