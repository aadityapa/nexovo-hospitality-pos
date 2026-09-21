import type { ReactNode } from 'react';
import { CheckCircle2, Clock, ChefHat, Bell, Utensils, XCircle, FileText, CreditCard, Circle, Receipt, Hourglass, Lock, PenLine, Package, AlertTriangle, Send, ThumbsUp, Truck, PackageCheck, CalendarCheck, Armchair, UserX, LogIn, LogOut, Ban, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Tone, StatusMeta } from '@/config/statuses';
import { ORDER_STATUS, ORDER_ITEM_STATUS, TABLE_STATUS, BILL_STATUS, PAYMENT_STATUS, STOCK_STATUS, PO_STATUS, RESERVATION_STATUS, VIP_STATUS, ENTRY_STATUS, SUPPLIER_STATUS } from '@/config/statuses';
import type { OrderStatus, OrderItemStatus, TableStatus, BillStatus, PaymentStatus, StockStatus, PoStatus, ReservationStatus, VipStatus, EntryStatus, SupplierStatus } from '@/types';

/**
 * Every tone is built the same way on the dark ground, so a row of mixed badges reads as one
 * family rather than seven unrelated chips:
 *   `-50`  the tinted fill  — dark enough to sit calmly on `surface-raised` (#11151A)
 *   `-200` the hairline     — one step up from the fill, so the chip has an edge at any zoom
 *   `-700` the label        — the legible rung, 7.7:1 or better on its own fill
 * `neutral` shifts one rung up the ramp (100 / 300 / 700) because `neutral-50` is *darker* than
 * the card it sits on and would read as a hole rather than a chip.
 * `accent` is violet and means VIP — never "important in general".
 */
const toneClasses: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 border-neutral-300',
  primary: 'bg-primary-50 text-primary-700 border-primary-200',
  success: 'bg-success-50 text-success-700 border-success-200',
  warning: 'bg-warning-50 text-warning-700 border-warning-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
  info: 'bg-info-50 text-info-700 border-info-200',
  accent: 'bg-accent-50 text-accent-700 border-accent-200',
};

export interface BadgeProps { tone?: Tone; children: ReactNode; className?: string; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; dot?: boolean }

export function Badge({ tone = 'neutral', children, className, size = 'md', icon, dot }: BadgeProps) {
  const dims = size === 'sm' ? 'text-[11px] px-1.5 py-0.5 gap-1' : size === 'lg' ? 'text-sm px-3 py-1 gap-1.5' : 'text-xs px-2 py-0.5 gap-1';
  return (
    <span className={cn('inline-flex items-center rounded-full border font-medium whitespace-nowrap', toneClasses[tone], dims, className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', toneBg[tone])} aria-hidden />}
      {icon}{children}
    </span>
  );
}

/** Colour dot for legends and dense rows. Always pair it with a text label. */
export function StatusDot({ tone = 'neutral', className }: { tone?: Tone; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', toneBg[tone], className)} aria-hidden />;
}

/** Status → icon so meaning never relies on colour alone. */
const STATUS_ICONS: Record<string, LucideIcon> = {
  DRAFT: PenLine, CONFIRMED: FileText, IN_PROGRESS: ChefHat, PARTIALLY_READY: Hourglass, READY: Bell, SERVED: Utensils,
  BILL_REQUESTED: Receipt, BILLED: Receipt, PAID: CreditCard, COMPLETED: CheckCircle2, CANCELLED: XCircle,
  NEW: Circle, PREPARING: ChefHat,
  AVAILABLE: CheckCircle2, OCCUPIED: Utensils, ORDERING: PenLine, BILLING: Receipt, PAYMENT_PENDING: Clock, CLOSED: Lock,
  OPEN: FileText, FINALIZED: Lock, VOID: XCircle,
  UNPAID: Clock, PARTIALLY_PAID: Hourglass, REFUNDED: XCircle,
  // Phase 2
  OK: Package, REORDER: AlertTriangle, LOW: AlertTriangle, OUT: XCircle,
  SENT: Send, APPROVED: ThumbsUp, ORDERED: Truck, PARTIALLY_RECEIVED: Hourglass, RECEIVED: PackageCheck,
  PENDING: Clock, SEATED: Armchair, NO_SHOW: UserX, BOOKED: CalendarCheck,
  CHECKED_IN: LogIn, CHECKED_OUT: LogOut, ACTIVE: CheckCircle2, INACTIVE: Circle, BLOCKED: Ban,
};

type AnyStatus = OrderStatus | OrderItemStatus | TableStatus | BillStatus | PaymentStatus | StockStatus | PoStatus | ReservationStatus | VipStatus | EntryStatus | SupplierStatus;
type Kind = 'order' | 'item' | 'table' | 'bill' | 'payment' | 'stock' | 'po' | 'reservation' | 'vip' | 'entry' | 'supplier';

const META: Record<Kind, Record<string, StatusMeta>> = {
  order: ORDER_STATUS, item: ORDER_ITEM_STATUS, table: TABLE_STATUS, bill: BILL_STATUS, payment: PAYMENT_STATUS,
  stock: STOCK_STATUS, po: PO_STATUS, reservation: RESERVATION_STATUS, vip: VIP_STATUS, entry: ENTRY_STATUS, supplier: SUPPLIER_STATUS,
};

export interface StatusBadgeProps { status: AnyStatus; kind: Kind; size?: 'sm' | 'md' | 'lg'; className?: string; hideIcon?: boolean }

export function StatusBadge({ status, kind, size = 'md', className, hideIcon }: StatusBadgeProps) {
  const meta = META[kind][status] ?? { label: status, tone: 'neutral' as Tone };
  const Icon = STATUS_ICONS[status];
  const iconSize = size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <Badge tone={meta.tone} size={size} className={className} icon={!hideIcon && Icon ? <Icon className={iconSize} aria-hidden /> : undefined}>
      {meta.label}
    </Badge>
  );
}

export function statusMeta(kind: Kind, status: string): StatusMeta {
  return META[kind][status] ?? { label: status, tone: 'neutral' };
}

/**
 * Solid tone fills for dots and status stripes (e.g. the 4 px rule on a table tile). These use the
 * `-500` rung — the designated fill/stroke value — so they carry ≥ 5:1 against every surface and
 * stay readable at 2 px. `neutral` uses `-400`: it must still be a visible mark, not a hairline.
 */
export const toneBg: Record<Tone, string> = {
  neutral: 'bg-neutral-400', primary: 'bg-primary-500', success: 'bg-success-500', warning: 'bg-warning-500',
  danger: 'bg-danger-500', info: 'bg-info-500', accent: 'bg-accent-500',
};
export const toneBorder: Record<Tone, string> = {
  neutral: 'border-neutral-400', primary: 'border-primary-500', success: 'border-success-500', warning: 'border-warning-500',
  danger: 'border-danger-500', info: 'border-info-500', accent: 'border-accent-500',
};
