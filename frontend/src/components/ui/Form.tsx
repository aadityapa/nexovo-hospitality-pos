import { forwardRef, useId, useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { Search, X, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
  htmlFor?: string;
  /** id of the hint/error node, so the control can point at it with aria-describedby */
  describedById?: string;
}

/**
 * Label + control + hint/error.
 * Labels are always visible — a placeholder is never the only label — and the hint or error
 * is wired to the control through aria-describedby so screen readers announce it on focus.
 */
export function FormField({ label, hint, error, required, className, children, htmlFor, describedById }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-label text-neutral-700">
          {label}
          {required && <span className="text-danger-600 ml-0.5" aria-hidden>*</span>}
          {required && <span className="sr-only"> (required)</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={describedById} role="alert" className="text-caption text-danger-600 flex items-start gap-1">
          <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={describedById} className="text-caption text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; hint?: string; error?: string; leftIcon?: ReactNode; rightSlot?: ReactNode; wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, className, wrapperClassName, id, required, 'aria-describedby': describedBy, ...rest }, ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const msgId = `${inputId}-msg`;
  const described = [describedBy, (error || hint) && msgId].filter(Boolean).join(' ') || undefined;
  return (
    <FormField label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={wrapperClassName} describedById={msgId}>
      <div className="relative">
        {leftIcon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none [&>svg]:h-4 [&>svg]:w-4">{leftIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          required={required}
          className={cn('input-base', leftIcon && 'pl-9', rightSlot && 'pr-11', error && 'input-error', className)}
          {...rest}
        />
        {rightSlot && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">{rightSlot}</span>}
      </div>
    </FormField>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <Input
      ref={ref}
      {...props}
      type={show ? 'text' : 'password'}
      rightSlot={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="h-8 w-8 inline-flex items-center justify-center text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-sm transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          tabIndex={-1 /* the input itself is the tab stop; the toggle is reachable by click or shift-tab from submit */}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; hint?: string; error?: string; options: { value: string | number; label: string; disabled?: boolean }[]; placeholder?: string; wrapperClassName?: string;
}

/* Chevron drawn in neutral-500 (#667085) to match the token palette. */
const CHEVRON =
  'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3E%3Cpath stroke=%27%23667085%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27m6 8 4 4 4-4%27/%3E%3C/svg%3E")] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat';

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, wrapperClassName, id, required, 'aria-describedby': describedBy, ...rest }, ref,
) {
  const auto = useId();
  const selId = id ?? auto;
  const msgId = `${selId}-msg`;
  const described = [describedBy, (error || hint) && msgId].filter(Boolean).join(' ') || undefined;
  return (
    <FormField label={label} hint={hint} error={error} required={required} htmlFor={selId} className={wrapperClassName} describedById={msgId}>
      <select
        ref={ref}
        id={selId}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        required={required}
        className={cn('input-base appearance-none pr-9 cursor-pointer', CHEVRON, error && 'input-error', className)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    </FormField>
  );
});

export interface FilterSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Required: toolbar selects have no visible label, so this becomes the accessible name. */
  ariaLabel: string;
  options: { value: string | number; label: string; disabled?: boolean }[];
  placeholder?: string;
}

/**
 * Compact select for filter toolbars — same visual language as Select, but without the
 * stacked label block that would break a single-row toolbar. The accessible name is required.
 */
export const FilterSelect = forwardRef<HTMLSelectElement, FilterSelectProps>(function FilterSelect(
  { ariaLabel, options, placeholder, className, ...rest }, ref,
) {
  return (
    <select ref={ref} aria-label={ariaLabel} className={cn('input-base appearance-none pr-9 cursor-pointer', CHEVRON, className)} {...rest}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; hint?: string; error?: string; wrapperClassName?: string }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, wrapperClassName, id, required, rows = 3, 'aria-describedby': describedBy, ...rest }, ref,
) {
  const auto = useId();
  const taId = id ?? auto;
  const msgId = `${taId}-msg`;
  const described = [describedBy, (error || hint) && msgId].filter(Boolean).join(' ') || undefined;
  return (
    <FormField label={label} hint={hint} error={error} required={required} htmlFor={taId} className={wrapperClassName} describedById={msgId}>
      <textarea
        ref={ref}
        id={taId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        required={required}
        className={cn('input-base py-2.5 min-h-[80px] resize-y leading-relaxed', error && 'input-error', className)}
        {...rest}
      />
    </FormField>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { label: string; description?: string }

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, description, className, id, disabled, ...rest }, ref) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn('flex items-start gap-3 select-none min-h-touch py-1', disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer', className)}>
      <input
        ref={ref}
        id={cid}
        type="checkbox"
        disabled={disabled}
        className="mt-0.5 h-5 w-5 rounded-[5px] border-neutral-300 text-primary-600 transition-shadow focus:ring-0 focus:ring-offset-0"
        {...rest}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-neutral-800 leading-5">{label}</span>
        {description && <span className="text-caption text-neutral-500">{description}</span>}
      </span>
    </label>
  );
});

export interface SwitchProps {
  checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string;
  disabled?: boolean; size?: 'sm' | 'md'; className?: string;
  /** Required when no visible `label` is given, so the control still has an accessible name. */
  ariaLabel?: string;
}

/**
 * Switch built on a real checkbox input, so the label text is clickable, the control is
 * keyboard operable for free and assistive technology reads its state without extra wiring.
 */
export function Switch({ checked, onChange, label, description, disabled, size = 'md', className, ariaLabel }: SwitchProps) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const shift = size === 'sm' ? 'peer-checked:translate-x-4' : 'peer-checked:translate-x-5';
  return (
    <label className={cn('inline-flex items-start gap-3 select-none min-h-touch py-1', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer', className)}>
      <span className={cn('relative inline-flex shrink-0 mt-0.5', track)}>
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          /* The wrapping <label> names it implicitly; ariaLabel covers icon-only usage. */
          aria-label={!label ? (ariaLabel ?? description) : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-full bg-neutral-300 transition-colors',
            'peer-checked:bg-primary-600',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-500',
            track,
          )}
        />
        <span
          aria-hidden
          className={cn('pointer-events-none absolute top-1/2 left-0.5 -translate-y-1/2 rounded-full bg-white shadow-card transition-transform', knob, shift)}
        />
      </span>
      {(label || description) && (
        <span className="flex flex-col gap-0.5">
          {label && <span className="text-sm text-neutral-800 leading-5">{label}</span>}
          {description && <span className="text-caption text-neutral-500">{description}</span>}
        </span>
      )}
    </label>
  );
}

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> { value: string; onChange: (v: string) => void }

export function SearchInput({ value, onChange, className, placeholder = 'Search…', ...rest }: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={rest['aria-label'] ?? placeholder}
        /* Hide the browser's own clear affordance — we render our own, consistently. */
        className="input-base pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-sm transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
