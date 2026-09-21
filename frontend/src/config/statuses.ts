import type { OrderStatus, OrderItemStatus, TableStatus, BillStatus, PaymentStatus, TicketStatus, PaymentMethod, StockStatus, PoStatus, ReservationStatus, VipStatus, EntryStatus, SupplierStatus, MovementType, EntryType } from '@/types';

/**
 * Visual tone — every status also has a text label (and, in `StatusBadge`, an icon); colour never
 * carries meaning alone.
 *
 * On the dark palette each tone renders as a tinted `-50` fill, a `-200` hairline and `-700` text:
 *   neutral … quiet / terminal states (closed, inactive, no-show)
 *   primary … WARM GOLD. Emphasis: the state an operator is meant to notice first in its group.
 *   success … resolved well (ready, paid, in stock)
 *   warning … needs attention soon (preparing too long, low stock, part-paid)
 *   danger  … failed / destructive (cancelled, void, unpaid, out of stock)
 *   info    … in flight, no action required yet (confirmed, sent, billed)
 *   accent  … VIOLET, and reserved for VIP classification only. It is never an action colour and
 *             never a generic "highlight" — if a state is merely important, it is `primary`.
 */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface StatusMeta { label: string; tone: Tone }

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  IN_PROGRESS: { label: 'Preparing', tone: 'warning' },
  PARTIALLY_READY: { label: 'Partially ready', tone: 'warning' },
  READY: { label: 'Ready', tone: 'success' },
  SERVED: { label: 'Served', tone: 'primary' },
  BILL_REQUESTED: { label: 'Bill requested', tone: 'info' },
  BILLED: { label: 'Billed', tone: 'info' },
  PAID: { label: 'Paid', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export const ORDER_ITEM_STATUS: Record<OrderItemStatus, StatusMeta> = {
  NEW: { label: 'New', tone: 'info' },
  PREPARING: { label: 'Preparing', tone: 'warning' },
  READY: { label: 'Ready', tone: 'success' },
  SERVED: { label: 'Served', tone: 'primary' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export const TICKET_STATUS: Record<TicketStatus, StatusMeta> = ORDER_ITEM_STATUS;

export const TABLE_STATUS: Record<TableStatus, StatusMeta> = {
  AVAILABLE: { label: 'Available', tone: 'success' },
  OCCUPIED: { label: 'Occupied', tone: 'primary' },
  ORDERING: { label: 'Ordering', tone: 'info' },
  PREPARING: { label: 'Preparing', tone: 'warning' },
  READY: { label: 'Ready', tone: 'success' },
  BILLING: { label: 'Billing', tone: 'info' },
  PAYMENT_PENDING: { label: 'Payment pending', tone: 'warning' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export const BILL_STATUS: Record<BillStatus, StatusMeta> = {
  OPEN: { label: 'Open', tone: 'info' },
  FINALIZED: { label: 'Finalized', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  VOID: { label: 'Void', tone: 'danger' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  UNPAID: { label: 'Unpaid', tone: 'danger' },
  PARTIALLY_PAID: { label: 'Partially paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash', UPI: 'UPI', CARD: 'Card', COMPLIMENTARY: 'Complimentary', LOYALTY: 'Loyalty points', COVER_CREDIT: 'Cover credit', ROOM_CHARGE: 'Room charge',
};

/** Waiting-time thresholds (minutes) for KDS delay indication. Branch-level overrides live in ALERT_THRESHOLDS (Phase 2). */
/**
 * Client-side display thresholds, in minutes, for colouring waiting times.
 * `backlog` counts pending items at one station before it is called a backlog.
 * Server-side alerting uses the per-branch thresholds on the Notifications page.
 */
export const DELAY_THRESHOLDS = { warn: 10, late: 20, backlog: 8 } as const;

// ---------------------------------------------------------------- Phase 2 statuses
export const STOCK_STATUS: Record<StockStatus, StatusMeta> = {
  OK: { label: 'In stock', tone: 'success' }, REORDER: { label: 'Reorder', tone: 'info' }, LOW: { label: 'Low stock', tone: 'warning' }, OUT: { label: 'Out of stock', tone: 'danger' },
};
export const PO_STATUS: Record<PoStatus, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' }, SENT: { label: 'Sent', tone: 'info' }, APPROVED: { label: 'Approved', tone: 'primary' }, ORDERED: { label: 'Ordered', tone: 'info' },
  PARTIALLY_RECEIVED: { label: 'Partially received', tone: 'warning' }, RECEIVED: { label: 'Received', tone: 'success' }, CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const RESERVATION_STATUS: Record<ReservationStatus, StatusMeta> = {
  PENDING: { label: 'Pending', tone: 'warning' }, CONFIRMED: { label: 'Confirmed', tone: 'info' }, SEATED: { label: 'Seated', tone: 'primary' },
  COMPLETED: { label: 'Completed', tone: 'success' }, CANCELLED: { label: 'Cancelled', tone: 'danger' }, NO_SHOW: { label: 'No-show', tone: 'neutral' },
};
/**
 * VIP table bookings. `SEATED` is the one state in the whole app that means "a VIP is in the room
 * right now", so it takes the violet `accent` reserved for VIP classification — which also keeps it
 * visually distinct from an ordinary seated reservation (gold `primary`, above).
 */
export const VIP_STATUS: Record<VipStatus, StatusMeta> = {
  BOOKED: { label: 'Booked', tone: 'info' }, SEATED: { label: 'Seated', tone: 'accent' }, COMPLETED: { label: 'Completed', tone: 'success' }, CANCELLED: { label: 'Cancelled', tone: 'danger' }, NO_SHOW: { label: 'No-show', tone: 'neutral' },
};
export const ENTRY_STATUS: Record<EntryStatus, StatusMeta> = {
  CHECKED_IN: { label: 'Inside', tone: 'success' }, CHECKED_OUT: { label: 'Left', tone: 'neutral' }, CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const SUPPLIER_STATUS: Record<SupplierStatus, StatusMeta> = {
  ACTIVE: { label: 'Active', tone: 'success' }, INACTIVE: { label: 'Inactive', tone: 'neutral' }, BLOCKED: { label: 'Blocked', tone: 'danger' },
};
export const MOVEMENT_LABELS: Record<MovementType, string> = {
  PURCHASE: 'Purchase', SALE_CONSUMPTION: 'Sale consumption', WASTAGE: 'Wastage', DAMAGE: 'Damage', RETURN: 'Return', TRANSFER: 'Transfer', ADJUSTMENT: 'Adjustment', OPENING_STOCK: 'Opening stock', CONSUMPTION_REVERSAL: 'Consumption reversal',
};
export const ENTRY_TYPE_LABELS: Record<EntryType, string> = { WALK_IN: 'Walk-in', GUEST_LIST: 'Guest list', PREBOOKED: 'Pre-booked', VIP: 'VIP' };
