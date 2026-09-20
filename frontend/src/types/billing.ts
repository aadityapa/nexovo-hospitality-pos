import type { ID, PrepLocation } from './common';

export type BillStatus = 'OPEN' | 'FINALIZED' | 'PAID' | 'CLOSED' | 'VOID';
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
/** CASH/UPI/CARD/COMPLIMENTARY are tendered by the cashier; LOYALTY, COVER_CREDIT and ROOM_CHARGE are created by their own modules (Phase 2). */
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'COMPLIMENTARY' | 'LOYALTY' | 'COVER_CREDIT' | 'ROOM_CHARGE';
export const TENDER_METHODS: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'COMPLIMENTARY'];
export type DiscountType = 'PERCENTAGE' | 'FLAT' | 'OFFER';

export interface BillItem {
  id: ID;
  orderItemId: ID;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** item-level (offer) discount */
  discountAmount: number;
  taxableAmount: number;
  taxGroupId: ID;
  taxPercent: number;
  taxAmount: number;
  offerId?: ID | null;
  notes?: string | null;
  prepLocation?: PrepLocation;
}

export interface TaxLine {
  code: string;
  name: string;
  percent: number;
  taxableAmount: number;
  amount: number;
}

export interface Discount {
  id: ID;
  billId: ID;
  discountType: DiscountType;
  value: number;
  amount: number;
  reason: string;
  offerId?: ID | null;
  appliedBy: ID;
  appliedByName: string;
  approvedBy?: ID | null;
  approvedByName?: string | null;
  isVoided: boolean;
  createdAt: string;
}

export interface Payment {
  id: ID;
  paymentNumber: string;
  billId: ID;
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
  status: 'SUCCESS' | 'REVERSED';
  receivedBy: ID;
  receivedByName: string;
  createdAt: string;
  reversedAt?: string | null;
  reversalReason?: string | null;
}

export interface Bill {
  id: ID;
  billNumber: string;
  branchId: ID;
  orderId: ID;
  orderNumber: string;
  tableId: ID;
  tableName: string;
  tableNumber: string;
  waiterName: string;
  cashierId: ID;
  cashierName: string;
  status: BillStatus;
  paymentStatus: PaymentStatus;
  items: BillItem[];
  subtotal: number;
  itemDiscountTotal: number;
  orderDiscountTotal: number;
  discountTotal: number;
  serviceChargePercent: number;
  serviceChargeAmount: number;
  taxLines: TaxLine[];
  taxTotal: number;
  /** Phase 2: VIP minimum-spend shortfall charged per branch rule (non-taxable) */
  minSpendShortfall?: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  discounts: Discount[];
  payments: Payment[];
  /** Phase 2 */
  customerId?: ID | null;
  customerName?: string | null;
  loyaltyPointsEarned?: number;
  notes?: string | null;
  createdAt: string;
  finalizedAt?: string | null;
  paidAt?: string | null;
  closedAt?: string | null;
}

export interface AddDiscountRequest {
  discountType: 'PERCENTAGE' | 'FLAT';
  value: number;
  reason: string;
  approvedByUserId?: ID;
  approvalPin?: string;
}

export interface AddPaymentRequest {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface ReceiptBusiness {
  name: string;
  branchName: string;
  address?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  logoUrl?: string | null;
  footer?: string | null;
  currency: string;
}

export interface Receipt {
  business: ReceiptBusiness;
  bill: Bill;
  printedAt: string;
}

/** Object type (not interface) so it satisfies the QueryParams index signature. */
export type BillListParams = {
  status?: BillStatus;
  paymentStatus?: PaymentStatus;
  search?: string;
  from?: string;
  to?: string;
};
