/**
 * Phase 2 domain types — mirror of database/08_phase2_schema.sql and the JSON produced by the 09* packages.
 */
import type { ID, PrepLocation } from './common';
import type { PaymentMethod } from './billing';
import type { OrderStatus } from './order';
import type { TableStatus } from './table';

// ---------------------------------------------------------------- multi-branch
export interface BranchSummary {
  id: ID; code: string; businessName: string; name: string; city?: string | null; orgName: string;
  isActive: boolean; outletCount: number; tableCount: number; isCurrent: boolean;
}
export interface BranchCreateInput { code: string; businessName: string; name: string; city?: string; address?: string; phone?: string; gstNumber?: string; isActive?: boolean }
export type OutletType = 'RESTAURANT' | 'BAR' | 'CLUB' | 'CAFE' | 'LOUNGE' | 'ROOM_SERVICE' | 'BANQUET';
export interface Outlet { id: ID; branchId: ID; code: string; name: string; outletType: OutletType; isActive: boolean; floorCount: number }
export interface OutletInput { code: string; name: string; outletType: OutletType; isActive?: boolean }

// ---------------------------------------------------------------- inventory
export interface InventoryUnit { id: ID; code: string; name: string; baseUnit: string; factorToBase: number }
export type InventoryKind = 'INGREDIENT' | 'RAW_MATERIAL' | 'BEVERAGE' | 'BOTTLE' | 'PACKAGING' | 'CONSUMABLE';
export interface InventoryCategory { id: ID; name: string; kind: InventoryKind; isActive: boolean; itemCount: number }
export interface InventoryCategoryInput { name: string; kind: InventoryKind; isActive?: boolean }
export type StockStatus = 'OK' | 'REORDER' | 'LOW' | 'OUT';
export interface InventoryItem {
  id: ID; branchId: ID; categoryId: ID; categoryName: string; categoryKind: InventoryKind;
  code: string; name: string; unitId: ID; unitCode: string; packSize?: number | null;
  currentQty: number; minQty: number; maxQty?: number | null; reorderLevel: number;
  costPrice: number; avgCost: number; stockValue: number;
  supplierId?: ID | null; supplierName?: string | null; allowNegative: boolean; isActive: boolean;
  stockStatus: StockStatus; lastMovementAt?: string | null; createdAt?: string; updatedAt?: string | null;
}
export interface InventoryItemInput {
  name: string; code?: string; categoryId: ID; unitId: ID; packSize?: number | null; minQty: number; maxQty?: number | null; reorderLevel: number;
  costPrice: number; supplierId?: ID | null; allowNegative: boolean; isActive: boolean; openingQty?: number;
}
export type MovementType = 'PURCHASE' | 'SALE_CONSUMPTION' | 'WASTAGE' | 'DAMAGE' | 'RETURN' | 'TRANSFER' | 'ADJUSTMENT' | 'OPENING_STOCK' | 'CONSUMPTION_REVERSAL';
export type ManualMovementType = 'ADJUSTMENT' | 'WASTAGE' | 'DAMAGE' | 'OPENING_STOCK' | 'RETURN' | 'TRANSFER';
export interface StockMovement {
  id: ID; invItemId: ID; itemName: string; itemCode: string; unitCode: string; type: MovementType; qty: number; qtyBefore: number; qtyAfter: number;
  unitCost: number; totalCost: number; refType?: string | null; refId?: ID | null; reason?: string | null; createdBy?: ID | null; createdByName?: string | null; createdAt: string;
}
export interface ManualMovementInput { invItemId: ID; type: ManualMovementType; qty: number; unitCost?: number; reason: string }
export interface InventoryDashboard {
  stockValue: number; itemCount: number; lowStockCount: number; outOfStockCount: number;
  wastage30d: number; consumption30d: number; purchases30d: number; lowStock: InventoryItem[]; recentMovements: StockMovement[];
}

// ---------------------------------------------------------------- recipes
export interface RecipeIngredient { id?: ID; invItemId: ID; itemName?: string; itemCode?: string; qty: number; unitId: ID; unitCode?: string; wastagePct: number; stockUnitCode?: string; avgCost?: number; lineCost?: number }
export interface Recipe {
  menuItemId: ID; menuItemName: string; sellingPrice: number; prepLocation: PrepLocation; recipeId?: ID | null; variantCode: string; portionLabel: string; yieldQty: number; isActive: boolean;
  ingredients: RecipeIngredient[]; recipeCost: number; foodCostPercent: number; grossMargin: number; suggestedPrice?: number | null;
}
export interface RecipeInput { portionLabel?: string; yieldQty: number; isActive?: boolean; ingredients: { invItemId: ID; qty: number; unitId: ID; wastagePct: number }[] }
export interface RecipeCostRow { menuItemId: ID; menuItemName: string; categoryName: string; prepLocation: PrepLocation; sellingPrice: number; recipeCost: number; ingredientCount: number; foodCostPercent: number; grossMargin: number }

// ---------------------------------------------------------------- suppliers & purchasing
export type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export interface Supplier {
  id: ID; branchId: ID; code: string; name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null; gstNumber?: string | null;
  paymentTermsDays: number; status: SupplierStatus; totalPurchased: number; totalPaid: number; outstanding: number; poCount: number; openPoCount: number; lastReceiptAt?: string | null; createdAt?: string;
}
export interface SupplierInput { name: string; code?: string; contactPerson?: string; phone?: string; email?: string; address?: string; gstNumber?: string; paymentTermsDays: number; status: SupplierStatus }
export interface SupplierPayment { id: ID; amount: number; method: string; reference?: string | null; poNumber?: string | null; notes?: string | null; paidAt: string }
export interface SupplierHistory {
  supplier: Supplier;
  purchaseOrders: { id: ID; poNumber: string; status: PoStatus; grandTotal: number; createdAt: string; expectedDate?: string | null }[];
  receipts: { id: ID; grnNumber: string; poNumber: string; invoiceNo?: string | null; amount: number; receivedAt: string }[];
  payments: SupplierPayment[];
}
export type PoStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
export type PoAction = 'SEND' | 'APPROVE' | 'ORDER' | 'CANCEL';
export interface PurchaseOrderItem { id: ID; invItemId: ID; itemName: string; itemCode: string; qty: number; unitId: ID; unitCode: string; unitPrice: number; taxPercent: number; lineTotal: number; receivedQty: number; pendingQty: number }
export interface GoodsReceipt { id: ID; grnNumber: string; invoiceNo?: string | null; receivedAt: string; receivedByName?: string | null; totalAmount: number; notes?: string | null; items: { poItemId: ID; itemName: string; receivedQty: number; damagedQty: number; unitCost: number }[] }
export interface PurchaseOrder {
  id: ID; poNumber: string; branchId: ID; supplierId: ID; supplierName: string; supplierCode: string; status: PoStatus; expectedDate?: string | null;
  subtotal: number; taxTotal: number; grandTotal: number; notes?: string | null; createdByName?: string | null; approvedByName?: string | null;
  createdAt: string; sentAt?: string | null; approvedAt?: string | null; orderedAt?: string | null; receivedAt?: string | null; cancelledAt?: string | null; cancelReason?: string | null;
  items: PurchaseOrderItem[]; receipts: GoodsReceipt[];
}
export interface PurchaseOrderInput { supplierId: ID; expectedDate?: string; notes?: string; items: { invItemId: ID; qty: number; unitId?: ID; unitPrice: number; taxPercent: number }[] }
export interface ReceiveGoodsInput { invoiceNo?: string; notes?: string; items: { poItemId: ID; receivedQty: number; damagedQty: number; unitCost?: number }[] }

// ---------------------------------------------------------------- CRM & loyalty
export interface Customer {
  id: ID; fullName: string; phone: string; email?: string | null; birthday?: string | null; anniversary?: string | null; tags?: string | null; notes?: string | null;
  consentMarketing: boolean; consentAt?: string | null; totalVisits: number; totalSpend: number; averageSpend: number; lastVisitAt?: string | null;
  loyaltyPoints: number; loyaltyTier?: string | null; createdAt?: string;
}
export interface CustomerInput { fullName: string; phone: string; email?: string; birthday?: string; anniversary?: string; tags?: string; notes?: string; consentMarketing: boolean }
export type LoyaltyTxnType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'PROMO' | 'REVERSAL';
export interface LoyaltyTransaction { id: ID; type: LoyaltyTxnType; points: number; amountRef?: number | null; billId?: ID | null; notes?: string | null; expiresAt?: string | null; createdAt: string }
export interface LoyaltyAccount { accountId: ID; customerId: ID; pointsBalance: number; lifetimePoints: number; tier: string; pointValue: number; balanceValue: number; minRedeemPoints: number; maxRedeemPercent: number }
export interface LoyaltyProgram { id: ID; name: string; pointsPer100: number; pointValue: number; minRedeemPoints: number; maxRedeemPercent: number; expiryDays: number; isActive: boolean; memberCount: number; outstandingPoints: number; outstandingValue: number }
export type LoyaltyProgramInput = Partial<Pick<LoyaltyProgram, 'name' | 'pointsPer100' | 'pointValue' | 'minRedeemPoints' | 'maxRedeemPercent' | 'expiryDays' | 'isActive'>>;
export interface CustomerHistory {
  customer: Customer;
  visits: { id: ID; orderId?: ID | null; orderNumber?: string | null; billId?: ID | null; billNumber?: string | null; amount: number; visitedAt: string }[];
  favouriteItems: { itemName: string; quantity: number }[];
  loyalty: LoyaltyAccount;
  loyaltyTransactions: LoyaltyTransaction[];
}

// ---------------------------------------------------------------- reservations
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type ReservationAction = 'CONFIRM' | 'SEAT' | 'COMPLETE' | 'CANCEL' | 'NO_SHOW';
export interface Reservation {
  id: ID; resNumber: string; branchId: ID; customerId?: ID | null; guestName: string; phone: string; date: string; time: string; durationMin: number; guests: number;
  tablePref?: string | null; tableId?: ID | null; tableName?: string | null; occasion?: string | null; notes?: string | null; status: ReservationStatus; depositAmount: number;
  seatedAt?: string | null; orderId?: ID | null; orderNumber?: string | null; createdByName?: string | null; createdAt: string;
}
export interface ReservationInput { customerId?: ID | null; guestName: string; phone: string; date: string; time: string; durationMin: number; guests: number; tablePref?: string; tableId?: ID | null; occasion?: string; notes?: string; depositAmount?: number }
export interface ReservationAvailability {
  date: string; tableCount: number; bookedSlots: number;
  tables: { tableId: ID; tableName: string; capacity: number; floorName: string; isVip: boolean; currentStatus: TableStatus; reservations: { resId: ID; resNumber: string; guestName: string; time: string; durationMin: number; guests: number; status: ReservationStatus }[] }[];
}

// ---------------------------------------------------------------- club
export interface CoverChargeType { id: ID; code: string; name: string; amount: number; redeemableAmount: number; guestsIncluded: number; isActive: boolean }
export interface CoverChargeTypeInput { code: string; name: string; amount: number; redeemableAmount: number; guestsIncluded: number; isActive?: boolean }
export type EntryType = 'WALK_IN' | 'GUEST_LIST' | 'PREBOOKED' | 'VIP';
export type EntryStatus = 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
export interface ClubEntry {
  id: ID; entryNumber: string; branchId: ID; customerId?: ID | null; guestName: string; phone?: string | null; guests: number; entryType: EntryType;
  coverTypeId?: ID | null; coverName?: string | null; coverAmount: number; redeemableAmount: number; redeemedAmount: number; remainingCredit: number; paymentMethod?: PaymentMethod | null;
  hostUserId?: ID | null; hostName?: string | null; tableId?: ID | null; tableName?: string | null; status: EntryStatus; enteredAt: string; exitedAt?: string | null; notes?: string | null;
}
export interface CheckInInput { guestName: string; phone?: string; guests: number; entryType: EntryType; coverTypeId?: ID | null; coverUnits?: number; paymentMethod?: PaymentMethod; hostUserId?: ID; tableId?: ID | null; customerId?: ID | null; notes?: string }
export interface ClubDashboard {
  businessDate: string; entries: number; guestsTotal: number; guestsInside: number; coverRevenue: number; coverCreditUsed: number; coverCreditOpen: number; vipEntries: number; fnbRevenue: number;
  byEntryType: { entryType: EntryType; entries: number; guests: number; coverRevenue: number }[]; vipTables: VipReservation[]; recentEntries: ClubEntry[];
}

// ---------------------------------------------------------------- VIP
export type VipStatus = 'BOOKED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type VipAction = 'SEAT' | 'COMPLETE' | 'CANCEL' | 'NO_SHOW';
export interface VipReservation {
  id: ID; vipNumber: string; branchId: ID; tableId: ID; tableName: string; customerId?: ID | null; guestName: string; phone?: string | null; date: string; guests: number;
  minSpend: number; depositAmount: number; depositPaid: boolean; hostUserId?: ID | null; hostName?: string | null; status: VipStatus; orderId?: ID | null; orderNumber?: string | null; orderStatus?: OrderStatus | null;
  currentSpend: number; remainingSpend: number; shortfallAmount: number; notes?: string | null; createdAt: string;
  /** spend endpoint extras */
  shortfallMode?: 'CHARGE_DIFFERENCE' | 'WAIVE' | 'FLAT_FEE'; projectedShortfall?: number; percentReached?: number;
}
export interface VipReservationInput { tableId: ID; customerId?: ID | null; guestName: string; phone?: string; date: string; guests: number; minSpend?: number; depositAmount?: number; depositPaid: boolean; hostUserId?: ID | null; notes?: string }
export interface VipTable { tableId: ID; tableName: string; floorName: string; capacity: number; status: TableStatus; minSpendDefault: number; depositDefault: number; booking: VipReservation | null }

// ---------------------------------------------------------------- bottle service
export interface BottleServiceItem { id: ID; menuItemId: ID; menuItemName: string; price: number; isAvailable: boolean; bottleSizeMl: number; invItemId?: ID | null; invItemName?: string | null; bottlesInStock?: number | null; includes?: string | null; isActive: boolean }
export interface BottleServiceInput { bottleSizeMl: number; invItemId?: ID | null; includes?: string; isActive?: boolean }

// ---------------------------------------------------------------- room charges
export interface RoomVerification { found: boolean; roomNo: string; guestName?: string | null; checkedIn: boolean; error?: string }
export interface RoomCharge { id: ID; billId: ID; billNumber: string; roomNo: string; guestName: string; amount: number; status: 'PENDING' | 'POSTED' | 'FAILED' | 'REVERSED'; pmsProvider: string; pmsReference?: string | null; postedAt?: string | null; failureReason?: string | null }

// ---------------------------------------------------------------- notifications
export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export interface AppNotification { id: ID; type: string; severity: NotificationSeverity; title: string; body?: string | null; entity?: string | null; entityId?: ID | null; isRead: boolean; createdAt: string }
export interface NotificationList { items: AppNotification[]; unreadCount: number }
export interface AlertThreshold { key: string; label: string; defaultValue: number; value: number }

// ---------------------------------------------------------------- advanced reports
export interface SalesPeriodReport { groupBy: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'; rows: { bucket: string; bills: number; sales: number; tax: number; discounts: number; serviceCharge: number; averageBill: number }[]; totalSales: number; totalBills: number; averageBill: number }
export interface BranchComparisonRow { branchId: ID; code: string; name: string; city?: string | null; bills: number; sales: number; averageBill: number; cancelledOrders: number; cogs: number; grossProfit: number }
export interface CategoryPerformanceRow { categoryName: string; prepLocation: PrepLocation; quantity: number; revenue: number; bills: number; sharePercent: number }
export interface InventoryValuation { totalValue: number; byCategory: { categoryName: string; kind: InventoryKind; items: number; value: number }[]; topItems: { itemName: string; unitCode: string; qty: number; avgCost: number; value: number; status: StockStatus }[] }
export interface WastageReport { totalCost: number; rows: { itemName: string; unitCode: string; type: MovementType; qty: number; cost: number; entries: number }[] }
export interface ConsumptionRow { itemName: string; unitCode: string; categoryName: string; qty: number; cost: number }
export interface ProfitabilityReport { revenue: number; foodRevenue: number; beverageRevenue: number; cogs: number; foodCogs: number; beverageCogs: number; grossProfit: number; grossMarginPercent: number; foodCostPercent: number; beverageCostPercent: number; wastageCost: number; discountsGiven: number }
export interface StaffPerformanceRow { userId: ID; fullName: string; ordersHandled: number; tablesServed: number; sales: number; bills: number; averageBill: number; cancelledOrders: number; cancelledItems: number }
