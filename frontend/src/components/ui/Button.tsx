import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'pos' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  block?: boolean;
  /** Renders the button on a dark surface (sidebar, kitchen display). */
  onDark?: boolean;
}

/**
 * Solid variants carry a hairline of their own colour so they keep their shape on both
 * white cards and the off-white canvas. Focus is handled globally by the outline token.
 */
const variants: Record<ButtonVariant, string> = {
  primary:   'bg-primary-600 text-white border border-primary-600 hover:bg-primary-700 hover:border-primary-700 active:bg-primary-800 shadow-card',
  secondary: 'bg-neutral-100 text-neutral-800 border border-neutral-200 hover:bg-neutral-200 hover:border-neutral-300 active:bg-neutral-300',
  outline:   'bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-50 hover:border-neutral-400 active:bg-neutral-100',
  ghost:     'bg-transparent text-neutral-700 border border-transparent hover:bg-neutral-100 active:bg-neutral-200',
  danger:    'bg-danger-600 text-white border border-danger-600 hover:bg-danger-700 hover:border-danger-700 active:bg-danger-700 shadow-card',
  success:   'bg-success-600 text-white border border-success-600 hover:bg-success-700 hover:border-success-700 active:bg-success-700 shadow-card',
  warning:   'bg-warning-600 text-white border border-warning-600 hover:bg-warning-700 hover:border-warning-700 active:bg-warning-700 shadow-card',
  link:      'bg-transparent text-primary-700 border border-transparent hover:underline underline-offset-2 px-0',
};

/** Same variants recoloured for dark chrome. */
const darkVariants: Partial<Record<ButtonVariant, string>> = {
  secondary: 'bg-neutral-800 text-neutral-100 border border-neutral-700 hover:bg-neutral-700 active:bg-neutral-600',
  outline:   'bg-transparent text-neutral-100 border border-neutral-600 hover:bg-neutral-800 hover:border-neutral-500 active:bg-neutral-700',
  ghost:     'bg-transparent text-neutral-300 border border-transparent hover:bg-neutral-800 hover:text-white active:bg-neutral-700',
  link:      'bg-transparent text-primary-300 border border-transparent hover:underline underline-offset-2 px-0',
};

const sizes: Record<ButtonSize, string> = {
  sm:   'h-8 px-3 text-xs rounded-sm touch-target',
  md:   'h-10 px-4 text-sm rounded-sm',
  lg:   'h-11 px-5 text-[0.9375rem] rounded-sm',
  /* Primary POS actions: taller than the 44px touch minimum and visually weightier. */
  pos:  'min-h-pos px-6 text-base font-semibold rounded-md',
  icon: 'h-10 w-10 p-0 rounded-sm',
};

const gaps: Record<ButtonSize, string> = {
  sm: 'gap-1.5', md: 'gap-2', lg: 'gap-2', pos: 'gap-2.5', icon: 'gap-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, block, onDark, className, children, disabled, type = 'button', ...rest }, ref,
) {
  const isIcon = size === 'icon';
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex items-center justify-center font-medium select-none whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow] press',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100',
        (onDark && darkVariants[variant]) || variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {/* The label keeps its place while loading, so the button never changes width mid-action. */}
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Loader2 className={cn('animate-spin', isIcon || size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]')} aria-hidden />
        </span>
      )}
      <span className={cn('inline-flex items-center justify-center', gaps[size], loading && 'invisible')}>
        {leftIcon}
        {children}
        {rightIcon}
      </span>
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: becomes both the accessible name and the tooltip. */
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  onDark?: boolean;
}

export function IconButton({ label, variant = 'ghost', size = 'md', loading, onDark, className, children, type = 'button', disabled, ...rest }: IconButtonProps) {
  /* sm stays a 32px box but keeps a 44px hit area via the ::before pseudo-target below. */
  const dims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex items-center justify-center rounded-sm transition-colors press shrink-0 touch-target',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        // Invisible padded hit area so small icon buttons still meet the 44px touch target.
        'before:absolute before:left-1/2 before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:h-touch before:w-touch before:content-[""]',
        (onDark && darkVariants[variant]) || variants[variant],
        dims, className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </button>
  );
}

/** Groups related buttons into a single segmented cluster (e.g. table row actions). */
export function ButtonGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-1', className)} role="group">
      {children}
    </div>
  );
}
