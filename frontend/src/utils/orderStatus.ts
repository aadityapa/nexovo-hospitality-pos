/**
 * Order / item state machine — mirrored by ORDER_PKG.derive_status & set_item_status (Oracle).
 */
import type { OrderStatus, OrderItemStatus, TableStatus, TicketStatus } from '@/types';

export const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  DRAFT: 0, CONFIRMED: 1, IN_PROGRESS: 2, PARTIALLY_READY: 3, READY: 4, SERVED: 5,
  BILL_REQUESTED: 6, BILLED: 7, PAID: 8, COMPLETED: 9, CANCELLED: 10,
};

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY', 'READY', 'SERVED', 'BILL_REQUESTED', 'BILLED', 'PAID',
];

export const isOrderActive = (s: OrderStatus): boolean => s !== 'COMPLETED' && s !== 'CANCELLED';
export const isAtLeast = (s: OrderStatus, target: OrderStatus): boolean => ORDER_STATUS_RANK[s] >= ORDER_STATUS_RANK[target];

/** Derive parent order status from its items (only while order ≤ SERVED). */
export function deriveOrderStatus(current: OrderStatus, itemStatuses: OrderItemStatus[]): OrderStatus {
  if (current === 'DRAFT' || isAtLeast(current, 'BILL_REQUESTED')) return current;
  const active = itemStatuses.filter((s) => s !== 'CANCELLED');
  if (active.length === 0) return itemStatuses.length > 0 ? 'CANCELLED' : current;
  const count = (s: OrderItemStatus) => active.filter((x) => x === s).length;
  if (count('SERVED') === active.length) return 'SERVED';
  if (count('READY') + count('SERVED') === active.length) return 'READY';
  if (count('READY') + count('SERVED') > 0) return 'PARTIALLY_READY';
  if (count('PREPARING') > 0) return 'IN_PROGRESS';
  return 'CONFIRMED';
}

export function deriveTicketStatus(itemStatuses: OrderItemStatus[]): TicketStatus {
  const active = itemStatuses.filter((s) => s !== 'CANCELLED');
  if (active.length === 0) return 'CANCELLED';
  const count = (s: OrderItemStatus) => active.filter((x) => x === s).length;
  if (count('SERVED') === active.length) return 'SERVED';
  if (count('READY') + count('SERVED') === active.length) return 'READY';
  if (count('PREPARING') + count('READY') + count('SERVED') > 0) return 'PREPARING';
  return 'NEW';
}

const ITEM_TRANSITIONS: Record<OrderItemStatus, OrderItemStatus[]> = {
  NEW: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: [],
  CANCELLED: [],
};

export function canTransitionItem(from: OrderItemStatus, to: OrderItemStatus): boolean {
  return ITEM_TRANSITIONS[from].includes(to);
}

export function nextItemStatus(s: OrderItemStatus): OrderItemStatus | null {
  if (s === 'NEW') return 'PREPARING';
  if (s === 'PREPARING') return 'READY';
  if (s === 'READY') return 'SERVED';
  return null;
}

export function tableStatusForOrder(orderStatus: OrderStatus | null | undefined, balanceDue = 0): TableStatus {
  switch (orderStatus) {
    case 'DRAFT':
    case 'CONFIRMED': return 'ORDERING';
    case 'IN_PROGRESS':
    case 'PARTIALLY_READY': return 'PREPARING';
    case 'READY': return 'READY';
    case 'SERVED': return 'OCCUPIED';
    case 'BILL_REQUESTED': return 'BILLING';
    case 'BILLED': return balanceDue > 0 ? 'PAYMENT_PENDING' : 'BILLING';
    case 'PAID': return 'BILLING';
    case 'COMPLETED':
    case 'CANCELLED':
    case null:
    case undefined: return 'AVAILABLE';
    default: return 'OCCUPIED';
  }
}

export const canAddItems = (s: OrderStatus): boolean => !isAtLeast(s, 'BILL_REQUESTED');
export const canRequestBill = (s: OrderStatus): boolean => s !== 'DRAFT' && !isAtLeast(s, 'BILL_REQUESTED');
export const canCancelOrder = (s: OrderStatus): boolean => !isAtLeast(s, 'PAID');
