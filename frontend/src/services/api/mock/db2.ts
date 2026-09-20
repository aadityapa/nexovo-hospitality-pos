/**
 * ============================================================================
 *  MOCK BACKEND — Phase 2 collections + SEED DATA (mirror of database/10_phase2_seed.sql).
 * ============================================================================
 */
import type { Branch, Outlet, InventoryUnit, InventoryCategory, InventoryItem, StockMovement, Supplier, SupplierPayment, PurchaseOrder, Customer, LoyaltyProgram, LoyaltyTransaction, Reservation, CoverChargeType, ClubEntry, VipReservation, RoomCharge, AppNotification, RecipeIngredient, ID } from '@/types';

export interface DbUserBranch { userId: ID; branchId: ID; isDefault: boolean }
export interface DbRecipe { id: ID; menuItemId: ID; variantCode: string; portionLabel: string; yieldQty: number; isActive: boolean; ingredients: RecipeIngredient[]; updatedAt: string }
export interface DbLoyaltyAccount { accountId: ID; customerId: ID; pointsBalance: number; lifetimePoints: number; tier: string }
export type DbLoyaltyTxn = LoyaltyTransaction & { accountId: ID; paymentId?: ID | null; refLtxId?: ID | null };
export interface DbCoverRedemption { id: ID; entryId: ID; billId: ID; paymentId: ID; amount: number }
export interface DbBottleService { id: ID; menuItemId: ID; bottleSizeMl: number; invItemId?: ID | null; includes?: string | null; isActive: boolean }
export type DbNotification = AppNotification & { branchId: ID | null; targetRole?: string | null; targetUserId?: ID | null; dedupeKey?: string | null };
export type DbRoomCharge = RoomCharge & { paymentId?: ID | null };
export type DbMovement = StockMovement & { branchId: ID; idemKey?: string | null };
export interface DbCustomerVisit { id: ID; customerId: ID; branchId: ID; orderId?: ID | null; billId?: ID | null; visitedAt: string; amount: number }

export interface Phase2Db {
  organizations: { id: ID; code: string; name: string }[];
  branches: Branch[];                 // additional branches (branch 1 stays in db.branch)
  outlets: Outlet[];
  userBranches: DbUserBranch[];
  units: InventoryUnit[];
  unitConversions: { fromUnitId: ID; toUnitId: ID; factor: number }[];
  invCategories: (InventoryCategory & { branchId: ID })[];
  invItems: (InventoryItem & { isDeleted: boolean })[];
  movements: DbMovement[];
  recipes: DbRecipe[];
  suppliers: (Supplier & { isDeleted: boolean })[];
  supplierPayments: (SupplierPayment & { supplierId: ID; poId?: ID | null })[];
  purchaseOrders: PurchaseOrder[];
  customers: (Customer & { orgId: ID; isDeleted: boolean })[];
  customerVisits: DbCustomerVisit[];
  loyaltyProgram: LoyaltyProgram;
  loyaltyAccounts: DbLoyaltyAccount[];
  loyaltyTxns: DbLoyaltyTxn[];
  reservations: Reservation[];
  coverTypes: (CoverChargeType & { branchId: ID })[];
  clubEntries: ClubEntry[];
  coverRedemptions: DbCoverRedemption[];
  vipReservations: VipReservation[];
  bottleService: DbBottleService[];
  roomCharges: DbRoomCharge[];
  notifications: DbNotification[];
  thresholds: { branchId: ID; key: string; value: number }[];
}

const now = () => new Date().toISOString();

export const UNITS: InventoryUnit[] = [
  { id: 1, code: 'G', name: 'Gram', baseUnit: 'G', factorToBase: 1 },
  { id: 2, code: 'KG', name: 'Kilogram', baseUnit: 'G', factorToBase: 1000 },
  { id: 3, code: 'ML', name: 'Millilitre', baseUnit: 'ML', factorToBase: 1 },
  { id: 4, code: 'L', name: 'Litre', baseUnit: 'ML', factorToBase: 1000 },
  { id: 5, code: 'PIECE', name: 'Piece', baseUnit: 'PIECE', factorToBase: 1 },
  { id: 6, code: 'BOTTLE', name: 'Bottle', baseUnit: 'PIECE', factorToBase: 1 },
  { id: 7, code: 'BOX', name: 'Box', baseUnit: 'PIECE', factorToBase: 1 },
  { id: 8, code: 'PACK', name: 'Pack', baseUnit: 'PIECE', factorToBase: 1 },
  { id: 9, code: 'CASE', name: 'Case', baseUnit: 'PIECE', factorToBase: 1 },
];

function invItem(id: number, categoryId: number, code: string, name: string, unitId: number, packSize: number | null, minQty: number, reorderLevel: number, costPrice: number, supplierId: number, cats: Phase2Db['invCategories']): Phase2Db['invItems'][number] {
  const cat = cats.find((c) => c.id === categoryId)!;
  const unit = UNITS.find((u) => u.id === unitId)!;
  return { id, branchId: 1, categoryId, categoryName: cat.name, categoryKind: cat.kind, code, name, unitId, unitCode: unit.code, packSize, currentQty: 0, minQty, maxQty: null, reorderLevel, costPrice, avgCost: costPrice, stockValue: 0, supplierId, supplierName: null, allowNegative: false, isActive: true, stockStatus: 'OK', lastMovementAt: null, createdAt: now(), updatedAt: null, isDeleted: false };
}

/** Base Phase 2 data — no transactions; opening stock etc. are generated through the engine in seedTransactions. */
export function createPhase2Seed(): Phase2Db {
  const invCategories: Phase2Db['invCategories'] = [
    { id: 1, branchId: 1, name: 'Meat & Poultry', kind: 'INGREDIENT', isActive: true, itemCount: 0 },
    { id: 2, branchId: 1, name: 'Dairy & Bakery', kind: 'INGREDIENT', isActive: true, itemCount: 0 },
    { id: 3, branchId: 1, name: 'Produce', kind: 'RAW_MATERIAL', isActive: true, itemCount: 0 },
    { id: 4, branchId: 1, name: 'Spirits', kind: 'BOTTLE', isActive: true, itemCount: 0 },
    { id: 5, branchId: 1, name: 'Beer & Mixers', kind: 'BEVERAGE', isActive: true, itemCount: 0 },
    { id: 6, branchId: 1, name: 'Packaging', kind: 'PACKAGING', isActive: true, itemCount: 0 },
  ];
  const suppliers: Phase2Db['suppliers'] = [
    { id: 1, branchId: 1, code: 'SUP-FRESH', name: 'FreshFarm Foods', contactPerson: 'Manoj Kumar', phone: '+91 98100 22334', email: 'orders@freshfarm.in', address: 'Yeshwanthpur Market, Bengaluru', gstNumber: '29AAACF1234A1Z1', paymentTermsDays: 15, status: 'ACTIVE', totalPurchased: 0, totalPaid: 0, outstanding: 0, poCount: 0, openPoCount: 0, lastReceiptAt: null, createdAt: now(), isDeleted: false },
    { id: 2, branchId: 1, code: 'SUP-BEV', name: 'Metro Beverages', contactPerson: 'Sunita Reddy', phone: '+91 98220 55667', email: 'sales@metrobev.in', address: 'Peenya Industrial Area, Bengaluru', gstNumber: '29AAACM5678B1Z2', paymentTermsDays: 30, status: 'ACTIVE', totalPurchased: 0, totalPaid: 0, outstanding: 0, poCount: 0, openPoCount: 0, lastReceiptAt: null, createdAt: now(), isDeleted: false },
  ];
  const invItems: Phase2Db['invItems'] = [
    invItem(1, 1, 'CHK-BRST', 'Chicken breast', 2, null, 10, 15, 320, 1, invCategories),
    invItem(2, 2, 'BUN-BRIO', 'Brioche bun', 5, null, 40, 60, 12, 1, invCategories),
    invItem(3, 2, 'CHS-SLC', 'Cheddar slice', 5, null, 50, 80, 8, 1, invCategories),
    invItem(4, 3, 'ONION', 'Onion', 2, null, 5, 8, 35, 1, invCategories),
    invItem(5, 3, 'LETTUCE', 'Iceberg lettuce', 2, null, 2, 4, 90, 1, invCategories),
    invItem(6, 2, 'MAYO', 'Mayonnaise', 4, null, 2, 3, 260, 1, invCategories),
    invItem(7, 3, 'POTATO', 'Potato (fries grade)', 2, null, 10, 20, 28, 1, invCategories),
    invItem(8, 3, 'MINT', 'Fresh mint', 1, null, 200, 400, 0.4, 1, invCategories),
    invItem(9, 3, 'LIME', 'Lime', 5, null, 30, 50, 4, 1, invCategories),
    invItem(10, 5, 'SODA', 'Soda water 750ml', 6, 750, 24, 36, 30, 2, invCategories),
    invItem(11, 4, 'RUM-WHT', 'White rum 750ml', 6, 750, 4, 6, 1400, 2, invCategories),
    invItem(12, 4, 'JD-750', "Jack Daniel's 750ml", 6, 750, 3, 6, 3200, 2, invCategories),
    invItem(13, 4, 'VODKA-GG', 'Grey Goose 750ml', 6, 750, 2, 4, 4200, 2, invCategories),
    invItem(14, 5, 'KF-650', 'Kingfisher Premium 650ml', 6, 650, 48, 72, 140, 2, invCategories),
    invItem(15, 5, 'IPA-330', 'Craft IPA 330ml', 6, 330, 24, 48, 150, 2, invCategories),
    invItem(16, 2, 'BUTTER', 'Butter', 2, null, 3, 5, 480, 1, invCategories),
    invItem(17, 1, 'CHK-CURRY', 'Chicken curry cut', 2, null, 8, 12, 260, 1, invCategories),
    invItem(18, 6, 'BOX-TKA', 'Takeaway box', 8, 50, 5, 10, 180, 2, invCategories),
  ];
  invItems.forEach((i) => { i.supplierName = suppliers.find((s) => s.id === i.supplierId)?.name ?? null; });

  return {
    organizations: [{ id: 1, code: 'NEXOVO', name: 'Nexovo Hospitality' }],
    branches: [],
    outlets: [
      { id: 1, branchId: 1, code: 'REST', name: 'Restaurant', outletType: 'RESTAURANT', isActive: true, floorCount: 1 },
      { id: 2, branchId: 1, code: 'CLUB', name: 'Club & Lounge', outletType: 'CLUB', isActive: true, floorCount: 2 },
    ],
    userBranches: [],
    units: UNITS,
    unitConversions: [{ fromUnitId: 9, toUnitId: 6, factor: 24 }, { fromUnitId: 7, toUnitId: 8, factor: 10 }],
    invCategories,
    invItems,
    movements: [],
    recipes: [],
    suppliers,
    supplierPayments: [],
    purchaseOrders: [],
    customers: [],
    customerVisits: [],
    loyaltyProgram: { id: 1, name: 'Saffron Rewards', pointsPer100: 10, pointValue: 1, minRedeemPoints: 100, maxRedeemPercent: 50, expiryDays: 365, isActive: true, memberCount: 0, outstandingPoints: 0, outstandingValue: 0 },
    loyaltyAccounts: [],
    loyaltyTxns: [],
    reservations: [],
    coverTypes: [
      { id: 1, branchId: 1, code: 'STAG', name: 'Stag entry', amount: 2000, redeemableAmount: 1500, guestsIncluded: 1, isActive: true },
      { id: 2, branchId: 1, code: 'SOLO', name: 'Solo entry', amount: 1000, redeemableAmount: 1000, guestsIncluded: 1, isActive: true },
      { id: 3, branchId: 1, code: 'COUPLE', name: 'Couple entry', amount: 3000, redeemableAmount: 2000, guestsIncluded: 2, isActive: true },
      { id: 4, branchId: 1, code: 'GUESTLIST', name: 'Guest list (free)', amount: 0, redeemableAmount: 0, guestsIncluded: 1, isActive: true },
    ],
    clubEntries: [],
    coverRedemptions: [],
    vipReservations: [],
    bottleService: [],
    roomCharges: [],
    notifications: [],
    thresholds: [
      { branchId: 1, key: 'ORDER_DELAY_MIN', value: 20 }, { branchId: 1, key: 'KITCHEN_BACKLOG', value: 8 }, { branchId: 1, key: 'BAR_BACKLOG', value: 8 },
      { branchId: 1, key: 'BILL_PENDING_MIN', value: 10 }, { branchId: 1, key: 'LARGE_BILL_AMOUNT', value: 10000 },
    ],
  };
}
