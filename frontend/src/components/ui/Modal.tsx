import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button, IconButton, type ButtonVariant } from './Button';

const FOCUSABLE = 'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,object,embed,[tabindex]:not([tabindex="-1"]),[contenteditable]';

/**
 * Shared dialog behaviour: Escape to close, background scroll lock, initial focus,
 * a Tab focus trap, and focus restored to whatever opened the dialog.
 * Without the trap, Tab walks into the page behind the overlay — invisible to a
 * keyboard or screen-reader user, who then has no idea where they are.
 */
function useDialogBehaviour(open: boolean, onClose: () => void, ref: RefObject<HTMLElement>) {
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); ref.current.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first meaningful control, skipping the close button so the dialog does
    // not open with "Close" selected.
    const t = window.setTimeout(() => {
      const node = ref.current;
      if (!node) return;
      const target = node.querySelector<HTMLElement>('[data-autofocus]')
        ?? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => el.getAttribute('aria-label') !== 'Close')
        ?? node;
      target.focus();
    }, 40);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      // Return focus to the trigger so keyboard users resume where they left off.
      restoreTo.current?.focus?.();
    };
  }, [open, onClose, ref]);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** bottom sheet on mobile, centered dialog on ≥ sm */
  sheet?: boolean;
  closeOnBackdrop?: boolean;
  /** Override the accessible name when the visible title lives in the body. */
  ariaLabel?: string;
}

const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl', full: 'sm:max-w-[95vw]' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md', sheet = true, closeOnBackdrop = true, ariaLabel }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useDialogBehaviour(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center" role="presentation">
      {/*
        The scrim is app-black at 70%, not a neutral at 60%. On a dark theme a light scrim is
        impossible — the ramp is inverted, so `neutral-900` is now the *brightest* value — and a
        thin scrim leaves the page behind competing with the dialog for attention.
      */}
      <div className="absolute inset-0 bg-neutral-950/70 animate-fade-in" onClick={closeOnBackdrop ? onClose : undefined} aria-hidden />
      {/*
        TWO ELEMENTS, for the same reason `DashboardHero` is two: `.material-edge` is a single
        `box-shadow` declaration emitted AFTER `.shadow-modal` at equal specificity, so putting it
        on the panel would REPLACE the deep modal shadow that lifts the dialog off its own scrim.
        A dialog needs both — the bevel at its edge and the shadow underneath it — so the outer
        element carries `shadow-modal` at the panel's own radius plus the entrance and the width,
        and the panel itself carries the material. The outer element is `aria`-transparent: the
        `role="dialog"`, the focus trap's `ref`, every label and the tab order all stay on the
        panel, unchanged.

        DURATION. The entrance lives on the wrapper and is pinned to the OVERLAY token (220 ms) —
        `animate-scale-in` ships at 180 ms — so the sheet and the centred dialog arrive on the one
        beat the motion system reserves for something entering over the page. It is an entrance,
        not a gate: the dialog is interactive and focusable from the first frame, and the focus
        timer is untouched.
      */}
      <div
        className={cn(
          'relative w-full shadow-modal [animation-duration:theme(transitionDuration.overlay)]',
          sheet ? 'rounded-t-xl sm:rounded-lg animate-slide-up sm:animate-scale-in' : 'rounded-lg m-4 animate-scale-in',
          sizes[size],
        )}
      >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={!title ? ariaLabel : undefined}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className={cn(
          /* `surface-high` + a hairline: the dialog is the topmost layer, so it is the lightest
             surface in the stack and still needs an edge to separate it from its own shadow.
             MATERIAL: a dialog floats above a scrim with nothing between it and the light, so it
             is exactly the surface that should catch some — one specular band (gloss) and the
             hairline bevel (edge). No grain: the grain belongs to the one large slab per screen,
             and a dialog is a temporary object, not the ground. */
          'relative w-full bg-surface-high border border-neutral-300 material-gloss material-edge flex flex-col outline-none',
          'max-h-[92dvh] sm:max-h-[85dvh]',
          sheet ? 'rounded-t-xl sm:rounded-lg' : 'rounded-lg',
        )}
      >
        {(title || description) && (
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-neutral-200">
            <div className="flex-1 min-w-0">
              {title && <h2 id={titleId} className="text-subheading text-neutral-900">{title}</h2>}
              {description && <p id={descId} className="text-sm text-neutral-500 mt-1">{description}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} size="sm" className="-mr-1 -mt-1"><X className="h-5 w-5" /></IconButton>
          </div>
        )}
        <div className="px-5 py-5 overflow-y-auto overscroll-contain flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-neutral-200 bg-neutral-50/60 rounded-b-lg flex flex-col-reverse sm:flex-row sm:justify-end gap-2 safe-bottom">
            {footer}
          </div>
        )}
      </div>
      </div>
    </div>,
    document.body,
  );
}

export interface DrawerProps { open: boolean; onClose: () => void; title?: string; children: ReactNode; side?: 'left' | 'right'; width?: string; footer?: ReactNode }

export function Drawer({ open, onClose, title, children, side = 'right', width = 'max-w-md', footer }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehaviour(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-drawer flex" role="presentation">
      <div className="absolute inset-0 bg-neutral-950/70 animate-fade-in" onClick={onClose} aria-hidden />
      {/* Same two-element construction as `Modal`, for the same reason: the wrapper keeps
          `shadow-modal` (which `.material-edge` would otherwise replace), the width and the
          slide, and the panel carries the material and every accessibility attribute. */}
      <div
        className={cn(
          'relative h-full w-full shadow-modal animate-slide-in-right [animation-duration:theme(transitionDuration.overlay)]',
          side === 'right' ? 'ml-auto' : 'mr-auto',
          width,
        )}
      >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          /* Only the edge that faces the page carries the hairline — the other three are against
             the viewport, where a border would read as a stray line. */
          'relative bg-surface-high h-full w-full material-gloss material-edge flex flex-col outline-none',
          side === 'right' ? 'border-l border-neutral-300' : 'border-r border-neutral-300',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-200">
          <h2 id={titleId} className="text-subheading text-neutral-900 truncate">{title}</h2>
          <IconButton label="Close" onClick={onClose} size="sm" className="-mr-1"><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-neutral-200 bg-neutral-50/60 flex justify-end gap-2 safe-bottom">{footer}</div>}
      </div>
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  loading?: boolean;
  children?: ReactNode;
}

/** Use only for irreversible / significant actions (delete, cancel order, complete payment, close order). */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'primary', loading, children }: ConfirmDialogProps) {
  const tone: ButtonVariant = variant === 'danger' ? 'danger' : variant === 'warning' ? 'warning' : 'primary';
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      ariaLabel={title}
      closeOnBackdrop={!loading}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
        <Button variant={tone} onClick={() => void onConfirm()} loading={loading} data-autofocus>{confirmLabel}</Button>
      </>}
    >
      <div className="flex gap-4">
        <span className={cn(
          'shrink-0 h-11 w-11 rounded-full flex items-center justify-center',
          'ring-1 ring-inset',
          variant === 'danger' ? 'bg-danger-50 text-danger-700 ring-danger-200'
            : variant === 'warning' ? 'bg-warning-50 text-warning-700 ring-warning-200'
              : 'bg-primary-50 text-primary-700 ring-primary-200',
        )}>
          {variant === 'primary' ? <Info className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-subheading text-neutral-900">{title}</h2>
          {message && <div className="text-sm text-neutral-600 mt-1.5 leading-relaxed">{message}</div>}
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </Modal>
  );
}
