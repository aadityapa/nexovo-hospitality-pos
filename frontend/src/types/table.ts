import type { ID } from './common';
import type { OrderStatus } from './order';

export type TableStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'ORDERING'
  | 'PREPARING'
  | 'READY'
  | 'BILLING'
  | 'PAYMENT_PENDING'
  | 'CLOSED';

export type RoundingMode = 'NEAREST' | 'UP' | 'DOWN' | 'NONE';

export interface Branch {
  id: ID;
  code: string;
  businessName: string;
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNumber?: string | null;
  logoUrl?: string | null;
  welcomeMessage?: string | null;
  currency: string;
  timezone: string;
  serviceChargePercent: number;
  taxOnServiceCharge: boolean;
  roundingMode: RoundingMode;
  allowMultipleOrdersPerTable: boolean;
  receiptFooter?: string | null;
  /** Phase 2 */
  orgId?: ID;
  stockDeductionMode?: 'ON_CONFIRM' | 'ON_BILL_CLOSE' | 'MANUAL';
  minSpendShortfallMode?: 'CHARGE_DIFFERENCE' | 'WAIVE' | 'FLAT_FEE';
  minSpendFlatFee?: number;
  pmsProvider?: string;
}

export type BranchInput = Partial<Omit<Branch, 'id' | 'code'>>;

export interface Floor {
  id: ID;
  branchId: ID;
  code: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  tableCount?: number;
}

export interface FloorInput {
  name: string;
  code?: string;
  displayOrder?: number;
  isActive: boolean;
}

export interface DiningTable {
  id: ID;
  branchId: ID;
  floorId: ID;
  floorName: string;
  number: string;
  name: string;
  capacity: number;
  publicCode: string;
  qrVersion: number;
  status: TableStatus;
  statusOverride: boolean;
  assignedWaiterId?: ID | null;
  assignedWaiterName?: string | null;
  activeOrderId?: ID | null;
  activeOrderNumber?: string | null;
  activeOrderStatus?: OrderStatus | null;
  activeOrderTotal?: number | null;
  occupiedSince?: string | null;
  isActive: boolean;
  createdAt?: string;
  /** Phase 2 */
  isVip?: boolean;
  minSpendDefault?: number;
  depositDefault?: number;
}

export interface TableInput {
  floorId: ID;
  number: string;
  name?: string;
  capacity: number;
  isActive: boolean;
  isVip?: boolean;
  minSpendDefault?: number;
  depositDefault?: number;
}
