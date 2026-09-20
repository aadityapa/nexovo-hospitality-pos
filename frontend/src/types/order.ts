import type { ID, PrepLocation } from './common';

export type OrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_READY'
  | 'READY'
  | 'SERVED'
  | 'BILL_REQUESTED'
  | 'BILLED'
  | 'PAID'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderItemStatus = 'NEW' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export type TicketStatus = 'NEW' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export interface OrderItem {
  id: ID;
  orderId: ID;
  menuItemId: ID;
  batchNo: number;
  /** snapshot at time of ordering (Rule 4) */
  itemName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  prepLocation: PrepLocation;
  taxGroupId: ID;
  taxPercent: number;
  status: OrderItemStatus;
  notes?: string | null;
  addedAt: string;
  startedAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: ID | null;
  approvedBy?: ID | null;
  cancelReason?: string | null;
  /** Phase 2 */
  isBottleService?: boolean;
  stockDeducted?: boolean;
}

export interface Order {
  id: ID;
  orderNumber: string;
  branchId: ID;
  tableId: ID;
  tableName: string;
  tableNumber: string;
  floorName: string;
  waiterId: ID;
  waiterName: string;
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'ROOM_SERVICE' | 'DELIVERY';
  status: OrderStatus;
  guestCount: number;
  notes?: string | null;
  subtotal: number;
  itemCount: number;
  items: OrderItem[];
  billId?: ID | null;
  /** Phase 2 links */
  customerId?: ID | null;
  customerName?: string | null;
  reservationId?: ID | null;
  vipResId?: ID | null;
  createdAt: string;
  confirmedAt?: string | null;
  billRequestedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  updatedAt: string;
}

export interface NewOrderItemInput {
  menuItemId: ID;
  quantity: number;
  notes?: string;
}

export interface CreateOrderRequest {
  tableId: ID;
  guestCount?: number;
  notes?: string;
  items: NewOrderItemInput[];
}

export interface CancelItemRequest {
  reason: string;
  approvedByUserId?: ID;
  approvalPin?: string;
}

export interface OrderStatusHistory {
  id: ID;
  orderId: ID;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy?: ID | null;
  changedByName?: string | null;
  changedAt: string;
  note?: string | null;
}

/** Kitchen / Bar ticket — deliberately contains NO pricing information. */
export interface TicketItem {
  id: ID;
  orderId: ID;
  itemName: string;
  quantity: number;
  notes?: string | null;
  status: OrderItemStatus;
  prepLocation: PrepLocation;
  addedAt: string;
  startedAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  cancelReason?: string | null;
}

export interface Ticket {
  id: ID;
  ticketNumber: string;
  orderId: ID;
  orderNumber: string;
  batchNo: number;
  tableName: string;
  tableNumber: string;
  waiterName: string;
  location: PrepLocation;
  status: TicketStatus;
  orderNotes?: string | null;
  createdAt: string;
  items: TicketItem[];
}

/** Object type (not interface) so it satisfies the QueryParams index signature. */
export type OrderListParams = {
  status?: OrderStatus[];
  tableId?: ID;
  waiterId?: ID;
  location?: PrepLocation;
  active?: boolean;
  from?: string;
  to?: string;
  search?: string;
};
