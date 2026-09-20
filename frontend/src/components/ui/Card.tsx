import type { HTMLAttributes, ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';

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

/** Section divider inside a card — quieter than a new card. */
export function CardDivider({ className }: { className?: string }) {
  return <hr className={cn('border-neutral-100 -mx-5 my-4', className)} />;
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
}

const iconTones: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'bg-neutral-100 text-neutral-600',
  primary: 'bg-primary-50 text-primary-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger:  'bg-danger-50 text-danger-600',
  info:    'bg-info-50 text-info-700',
  accent:  'bg-accent-50 text-accent-700',
};

export function StatCard({ label, value, icon, delta, tone = 'neutral', hint, onClick, className, size = 'md' }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div';
  const flat = delta && Math.abs(delta.value) < 0.05;
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'card p-3.5 sm:p-5 flex items-center xs:items-start gap-3 sm:gap-4 text-left w-full min-w-0',
        onClick && 'transition-[border-color,box-shadow] hover:border-neutral-300 hover:shadow-panel press',
        className,
      )}
    >
      {icon && <span className={cn('shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-md flex items-center justify-center', iconTones[tone])} aria-hidden>{icon}</span>}
      {/*
       * Below 420 px the card is a full-width ROW: label on the left (free to wrap onto a
       * second line), figure on the right. Truncating the label to "T…" is never acceptable —
       * an operator cannot act on a metric they cannot name — so nothing here truncates.
       */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 xs:block">
          <p className="text-label text-neutral-500 uppercase leading-tight break-words min-w-0">{label}</p>
          <p className={cn(
            'text-neutral-900 font-semibold tabular-nums whitespace-nowrap shrink-0 xs:mt-1.5',
            size === 'lg' ? 'text-xl xs:text-metric' : 'text-xl xs:text-2xl leading-7 xs:leading-8 tracking-[-0.02em]',
          )}>
            {value}
          </p>
        </div>
        {delta && (
          <p className={cn(
            'text-caption mt-1.5 inline-flex items-center gap-1 font-medium',
            flat ? 'text-neutral-500' : delta.value > 0 ? 'text-success-700' : 'text-danger-700',
          )}>
            {flat ? <Minus className="h-3 w-3" aria-hidden /> : delta.value > 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
            {Math.abs(delta.value).toFixed(1)}%
            {delta.label && <span className="text-neutral-500 font-normal">{delta.label}</span>}
          </p>
        )}
        {hint && <p className="text-caption text-neutral-500 mt-1.5 line-clamp-2">{hint}</p>}
      </div>
    </Comp>
  );
}
