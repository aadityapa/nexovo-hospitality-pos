/**
 * ============================================================================
 *  MOCK BACKEND — in-memory database (SEED DATA). Not used when VITE_API_MODE=ords.
 *  Mirrors database/07_seed.sql. Persisted to localStorage so multiple tabs
 *  (waiter / kitchen / cashier) share one state during demos.
 * ============================================================================
 */
import type { Branch, Floor, DiningTable, TaxGroup, MenuCategory, MenuItem, Offer, Order, Bill, RoleCode, AuditLog, OrderStatusHistory } from '@/types';
import type { Permission } from '@/config/permissions';
import { ROLE_PERMISSIONS, ROLE_MAX_DISCOUNT } from '@/config/permissions';
import { createPhase2Seed, type Phase2Db } from './db2';

export interface DbUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phone: string;
  branchId: number;
  roles: RoleCode[];
  /** MOCK ONLY — plain text. Real backend stores salted SHA-512 (SEC_PKG). */
  password: string;
  approvalPin?: string;
  isActive: boolean;
  isDeleted: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface DbRole {
  id: number;
  code: RoleCode;
  name: string;
  description: string;
  maxDiscountPercent: number;
  isSystem: boolean;
  permissions: Permission[];
}

export interface DbSession { token: string; userId: number; expiresAt: string; revoked: boolean }

export interface DbTicket {
  id: number;
  ticketNumber: string;
  orderId: number;
  batchNo: number;
  location: 'KITCHEN' | 'BAR';
  createdAt: string;
}

export interface DbEvent { id: number; topic: string; type: string; entityId?: number | null; at: string }

export interface MockDb {
  version: number;
  branch: Branch;
  roles: DbRole[];
  users: DbUser[];
  sessions: DbSession[];
  floors: (Floor & { isDeleted: boolean })[];
  tables: (DiningTable & { isDeleted: boolean })[];
  taxGroups: TaxGroup[];
  categories: MenuCategory[];
  items: MenuItem[];
  priceHistory: { itemId: number; price: number; from: string; to?: string | null }[];
  offers: (Offer & { isDeleted: boolean })[];
  orders: Order[];
  orderHistory: OrderStatusHistory[];
  tickets: DbTicket[];
  bills: Bill[];
  audit: AuditLog[];
  events: DbEvent[];
  seq: Record<string, number>;
  docSeq: Record<string, { date: string; last: number }>;
  /** Phase 2 collections */
  p2: Phase2Db;
}

export const DB_VERSION = 5;   // 5: seeded tables use deterministic public QR codes
export const DB_KEY = 'nexovo.mockdb';

const now = () => new Date().toISOString();
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const rnd = (len = 12) => Array.from({ length: len }, () => ALPHABET[Math.floor(Math.random() * 36)]).join('');

/**
 * Deterministic opaque code (FNV-1a derived) for SEEDED rows.
 *
 * In mock mode the database lives in each browser's localStorage, so a random public code would be
 * different on every device: a QR printed from the office laptop would fail when a guest's phone
 * scans it, because the phone seeds its own database. Deriving the demo codes from a fixed seed
 * string makes them identical everywhere, so the printed QR codes resolve on any device.
 * Tables created at runtime still get a random code (rnd) — those QR codes only work on the browser
 * that created them until a real backend (VITE_API_MODE=ords) stores the code centrally.
 */
export function stableCode(seed: string, len = 12): string {
  let h = 2166136261 >>> 0;
  let out = '';
  for (let i = 0; i < len; i += 1) {
    for (let j = 0; j < seed.length; j += 1) {
      h ^= seed.charCodeAt(j) + i;
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += ALPHABET[h % 36];
  }
  return out;
}

function role(id: number, code: RoleCode, name: string, description: string): DbRole {
  return { id, code, name, description, maxDiscountPercent: ROLE_MAX_DISCOUNT[code], isSystem: true, permissions: ROLE_PERMISSIONS[code] };
}

function user(id: number, username: string, fullName: string, email: string, password: string, roles: RoleCode[], approvalPin?: string): DbUser {
  return { id, username, fullName, email, phone: `+91 98${String(id * 1234567).padStart(8, '0')}`, branchId: 1, roles, password, approvalPin, isActive: true, isDeleted: false, createdAt: now() };
}

function table(id: number, floorId: number, floorName: string, number: string, name: string, capacity: number, waiterId: number): DiningTable & { isDeleted: boolean } {
  return { id, branchId: 1, floorId, floorName, number, name, capacity, publicCode: stableCode(`MAIN|${id}|${number}`), qrVersion: 1, status: 'AVAILABLE', statusOverride: false, assignedWaiterId: waiterId, assignedWaiterName: waiterId === 4 ? 'Rahul Verma' : 'Sneha Iyer', activeOrderId: null, activeOrderNumber: null, activeOrderStatus: null, activeOrderTotal: null, occupiedSince: null, isActive: true, isDeleted: false, createdAt: now() };
}

function cat(id: number, name: string, prep: 'KITCHEN' | 'BAR'): MenuCategory {
  return { id, branchId: 1, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: null, imageUrl: null, prepLocation: prep, displayOrder: id, isActive: true, isDeleted: false, createdAt: now() };
}

let itemSeq = 0;
function item(code: string, categoryId: number, name: string, description: string, price: number, prep: 'KITCHEN' | 'BAR', taxGroupId: number, isVeg: boolean, isPopular: boolean, img: string | null): MenuItem {
  itemSeq += 1;
  return { id: itemSeq, branchId: 1, categoryId, code, name, description, imageUrl: img, price, prepLocation: prep, taxGroupId, isVeg, isPopular, isAvailable: true, isActive: true, isDeleted: false, displayOrder: itemSeq, tags: null, createdAt: now(), updatedAt: null };
}

const u = (id: string) => `https://images.unsplash.com/${id}?w=600&q=70&auto=format`;

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function daysFromNow(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }

export function createSeedDb(): MockDb {
  itemSeq = 0;
  const floors: MockDb['floors'] = [
    { id: 1, branchId: 1, code: 'MAIN', name: 'Main Dining', displayOrder: 1, isActive: true, isDeleted: false },
    { id: 2, branchId: 1, code: 'BAR', name: 'Bar Area', displayOrder: 2, isActive: true, isDeleted: false },
    { id: 3, branchId: 1, code: 'VIP', name: 'VIP Lounge', displayOrder: 3, isActive: true, isDeleted: false },
  ];
  const tables: MockDb['tables'] = [];
  let tid = 0;
  for (let i = 1; i <= 12; i++) tables.push(table(++tid, 1, 'Main Dining', String(i), `Table ${i}`, i % 3 === 0 ? 6 : 4, i <= 6 ? 4 : 5));
  for (let i = 10; i <= 15; i++) tables.push(table(++tid, 2, 'Bar Area', `B${i}`, `Bar ${i}`, 2, 5));
  for (let i = 1; i <= 4; i++) tables.push(table(++tid, 3, 'VIP Lounge', `VIP${i}`, `VIP ${i}`, 8, 4));

  const taxGroups: TaxGroup[] = [
    { id: 1, code: 'GST5', name: 'GST 5% (Food)', isActive: true, totalPercent: 5, rates: [{ code: 'CGST', name: 'CGST', percent: 2.5 }, { code: 'SGST', name: 'SGST', percent: 2.5 }] },
    { id: 2, code: 'GST18', name: 'GST 18%', isActive: true, totalPercent: 18, rates: [{ code: 'CGST', name: 'CGST', percent: 9 }, { code: 'SGST', name: 'SGST', percent: 9 }] },
    { id: 3, code: 'VAT20', name: 'Liquor VAT 20%', isActive: true, totalPercent: 20, rates: [{ code: 'VAT', name: 'VAT', percent: 20 }] },
    { id: 4, code: 'NOTAX', name: 'Tax exempt', isActive: true, totalPercent: 0, rates: [] },
  ];

  const categories: MenuCategory[] = [
    cat(1, 'Starters', 'KITCHEN'), cat(2, 'Main Course', 'KITCHEN'), cat(3, 'Chinese', 'KITCHEN'), cat(4, 'Indian', 'KITCHEN'),
    cat(5, 'Pizza', 'KITCHEN'), cat(6, 'Burgers', 'KITCHEN'), cat(7, 'Desserts', 'KITCHEN'), cat(8, 'Beverages', 'BAR'),
    cat(9, 'Mocktails', 'BAR'), cat(10, 'Cocktails', 'BAR'), cat(11, 'Beer', 'BAR'), cat(12, 'Wine', 'BAR'), cat(13, 'Spirits', 'BAR'),
  ];

  const items: MenuItem[] = [
    item('ST01', 1, 'Paneer Tikka', 'Char-grilled cottage cheese, mint chutney', 320, 'KITCHEN', 1, true, true, u('photo-1567188040759-fb8a883dc6d8')),
    item('ST02', 1, 'Chicken Wings', 'Six pieces, peri-peri glaze', 380, 'KITCHEN', 1, false, true, u('photo-1608039755401-742074f0548d')),
    item('ST03', 1, 'French Fries', 'Crispy, salted, served with ketchup', 250, 'KITCHEN', 1, true, true, u('photo-1573080496219-bb080dd4f877')),
    item('ST04', 1, 'Nachos Grande', 'Cheese, salsa, jalapeños, sour cream', 340, 'KITCHEN', 1, true, false, u('photo-1513456852971-30c0b8199d4d')),
    item('MC01', 2, 'Grilled Salmon', 'Lemon butter, sautéed greens', 890, 'KITCHEN', 1, false, false, u('photo-1467003909585-2f8a72700288')),
    item('MC02', 2, 'Pasta Alfredo', 'Creamy parmesan, penne', 460, 'KITCHEN', 1, true, false, u('photo-1645112411341-6c4fd023714a')),
    item('MC03', 2, 'Mushroom Risotto', 'Arborio rice, wild mushrooms', 520, 'KITCHEN', 1, true, false, u('photo-1476124369491-e7addf5db371')),
    item('CH01', 3, 'Hakka Noodles', 'Wok-tossed vegetables', 290, 'KITCHEN', 1, true, false, u('photo-1585032226651-759b368d7246')),
    item('CH02', 3, 'Chilli Chicken', 'Indo-Chinese classic, dry', 380, 'KITCHEN', 1, false, true, u('photo-1603133872878-684f208fb84b')),
    item('CH03', 3, 'Veg Manchurian', 'Vegetable dumplings, soy garlic sauce', 310, 'KITCHEN', 1, true, false, u('photo-1626804475297-41608ea09aeb')),
    item('IN01', 4, 'Butter Chicken', 'Tandoori chicken in tomato-butter gravy', 480, 'KITCHEN', 1, false, true, u('photo-1603894584373-5ac82b2ae398')),
    item('IN02', 4, 'Dal Makhani', 'Slow-cooked black lentils', 340, 'KITCHEN', 1, true, false, u('photo-1546833999-b9f581a1996d')),
    item('IN03', 4, 'Garlic Naan', 'Tandoor baked, butter garlic', 90, 'KITCHEN', 1, true, false, u('photo-1601050690597-df0568f70950')),
    item('IN04', 4, 'Chicken Biryani', 'Hyderabadi dum, raita', 420, 'KITCHEN', 1, false, true, u('photo-1563379091339-03b21ab4a4f8')),
    item('PZ01', 5, 'Margherita Pizza', 'San Marzano tomato, buffalo mozzarella', 450, 'KITCHEN', 1, true, true, u('photo-1574071318508-1cdbab80d002')),
    item('PZ02', 5, 'Pepperoni Pizza', 'Pork pepperoni, mozzarella', 560, 'KITCHEN', 1, false, false, u('photo-1628840042765-356cda07504e')),
    item('BG01', 6, 'Chicken Burger', 'Crispy fillet, slaw, brioche bun', 350, 'KITCHEN', 1, false, true, u('photo-1568901346375-23c9450c58cd')),
    item('BG02', 6, 'Classic Beef Burger', 'Double patty, cheddar', 420, 'KITCHEN', 1, false, false, u('photo-1550547660-d9450f859349')),
    item('BG03', 6, 'Veggie Burger', 'Beetroot-quinoa patty', 320, 'KITCHEN', 1, true, false, u('photo-1520072959219-c595dc870360')),
    item('DS01', 7, 'Chocolate Brownie', 'Warm, with vanilla ice cream', 260, 'KITCHEN', 1, true, true, u('photo-1607920591413-4ec007e70023')),
    item('DS02', 7, 'Gulab Jamun', 'Two pieces, rose syrup', 180, 'KITCHEN', 1, true, false, u('photo-1601303516534-bf0b1eb70c0d')),
    item('DS03', 7, 'Tiramisu', 'Espresso soaked, mascarpone', 320, 'KITCHEN', 1, true, false, u('photo-1571877227200-a0d98ea607e9')),
    item('BV01', 8, 'Fresh Lime Soda', 'Sweet / salted', 120, 'BAR', 1, true, false, u('photo-1523677011781-c91d1bbe2f9e')),
    item('BV02', 8, 'Cold Coffee', 'Blended with ice cream', 220, 'BAR', 1, true, false, u('photo-1461023058943-07fcbe16d735')),
    item('BV03', 8, 'Mineral Water 1L', 'Chilled', 60, 'BAR', 4, true, false, null),
    item('MK01', 9, 'Virgin Mojito', 'Mint, lime, soda', 260, 'BAR', 1, true, true, u('photo-1551024709-8f23befc6f87')),
    item('MK02', 9, 'Blue Lagoon', 'Blue curaçao syrup, lemonade', 280, 'BAR', 1, true, false, u('photo-1536935338788-846bb9981813')),
    item('CK01', 10, 'Mojito', 'White rum, mint, lime', 450, 'BAR', 3, true, true, u('photo-1551538827-9c037cb4f32a')),
    item('CK02', 10, 'Long Island Iced Tea', 'Five spirits, cola', 620, 'BAR', 3, true, false, u('photo-1470337458703-46ad1756a187')),
    item('CK03', 10, 'Whiskey Sour', 'Bourbon, lemon, egg white', 550, 'BAR', 3, false, false, u('photo-1514362545857-3bc16c4c7d1b')),
    item('BR01', 11, 'Kingfisher Premium 650ml', 'Lager', 400, 'BAR', 3, true, true, u('photo-1608270586620-248524c67de9')),
    item('BR02', 11, 'Craft IPA 330ml', 'Local brewery', 380, 'BAR', 3, true, false, u('photo-1535958636474-b021ee887b13')),
    item('WN01', 12, 'House Red (glass)', 'Cabernet Sauvignon', 520, 'BAR', 3, true, false, u('photo-1510812431401-41d2bd2722f3')),
    item('WN02', 12, 'House White (glass)', 'Sauvignon Blanc', 520, 'BAR', 3, true, false, u('photo-1566754436893-98224ee05be8')),
    item('SP01', 13, 'Single Malt 30ml', 'Glenfiddich 12', 750, 'BAR', 3, true, false, u('photo-1527281400683-1aae777175f8')),
    item('SP02', 13, 'Premium Vodka 30ml', 'Grey Goose', 550, 'BAR', 3, true, false, null),
  ];
  const byCode = (c: string) => items.find((i) => i.code === c)!.id;

  const offers: MockDb['offers'] = [
    { id: 1, branchId: 1, name: 'Happy Hours — 20% off cocktails', description: 'Every day 4–7 PM on all cocktails', offerType: 'HAPPY_HOUR', discountValue: 20, maxDiscountAmount: null, appliesTo: 'CATEGORIES', categoryIds: [10], itemIds: [], startDate: daysFromNow(-30), endDate: daysFromNow(365), startTime: '16:00', endTime: '19:00', daysOfWeek: [], isActive: true, isCurrentlyActive: false, isDeleted: false, createdAt: now() },
    { id: 2, branchId: 1, name: 'Buy 1 Get 1 — Craft IPA', description: 'BOGO on Craft IPA all week', offerType: 'BOGO', discountValue: 0, maxDiscountAmount: null, appliesTo: 'ITEMS', categoryIds: [], itemIds: [byCode('BR02')], startDate: daysFromNow(-7), endDate: daysFromNow(60), startTime: null, endTime: null, daysOfWeek: [], isActive: true, isCurrentlyActive: true, isDeleted: false, createdAt: now() },
    { id: 3, branchId: 1, name: '10% off Pizzas', description: 'Weekday pizza treat (max ₹100)', offerType: 'PERCENTAGE', discountValue: 10, maxDiscountAmount: 100, appliesTo: 'CATEGORIES', categoryIds: [5], itemIds: [], startDate: daysFromNow(-1), endDate: daysFromNow(30), startTime: null, endTime: null, daysOfWeek: [], isActive: true, isCurrentlyActive: true, isDeleted: false, createdAt: now() },
    { id: 4, branchId: 1, name: 'Flat ₹50 off desserts', description: 'Expired sample offer', offerType: 'FLAT', discountValue: 50, maxDiscountAmount: null, appliesTo: 'CATEGORIES', categoryIds: [7], itemIds: [], startDate: daysFromNow(-60), endDate: daysFromNow(-30), startTime: null, endTime: null, daysOfWeek: [], isActive: false, isCurrentlyActive: false, isDeleted: false, createdAt: now() },
  ];

  return {
    version: DB_VERSION,
    branch: {
      id: 1, code: 'MAIN', businessName: 'The Saffron Lounge', name: 'Main Branch', address: '14 Residency Road', city: 'Bengaluru 560025',
      phone: '+91 80 4123 4567', email: 'hello@saffronlounge.in', gstNumber: '29ABCDE1234F1Z5', logoUrl: null,
      welcomeMessage: 'Welcome! Scan, browse and let our staff take your order.', currency: 'INR', timezone: 'Asia/Kolkata',
      serviceChargePercent: 5, taxOnServiceCharge: false, roundingMode: 'NEAREST', allowMultipleOrdersPerTable: false,
      receiptFooter: 'Thank you for dining with us. Visit again!',
      orgId: 1, stockDeductionMode: 'ON_CONFIRM', minSpendShortfallMode: 'CHARGE_DIFFERENCE', minSpendFlatFee: 0, pmsProvider: 'SIMULATED',
    },
    roles: [
      role(1, 'SUPER_ADMIN', 'Super Admin', 'Platform owner, unrestricted'),
      role(2, 'ADMIN', 'Admin', 'Full branch administration'),
      role(3, 'MANAGER', 'Manager', 'Floor operations, approvals, reports'),
      role(4, 'WAITER', 'Waiter', 'Takes and serves orders'),
      role(5, 'CASHIER', 'Cashier', 'Billing and payments'),
      role(6, 'KITCHEN', 'Kitchen Staff', 'Kitchen display'),
      role(7, 'BAR', 'Bar Staff', 'Bar display'),
      role(8, 'HOST', 'Host / Door', 'Reservations, guest list, club entry, VIP tables'),
    ],
    users: [
      user(1, 'superadmin', 'Karan Singh', 'karan.singh@nexovo.in', 'Super@123', ['SUPER_ADMIN'], '1234'),
      user(2, 'admin', 'Aarav Mehta', 'admin@saffronlounge.in', 'Admin@123', ['ADMIN'], '1234'),
      user(3, 'manager', 'Priya Nair', 'priya@saffronlounge.in', 'Manager@123', ['MANAGER'], '1234'),
      user(4, 'waiter1', 'Rahul Verma', 'rahul@saffronlounge.in', 'Waiter@123', ['WAITER']),
      user(5, 'waiter2', 'Sneha Iyer', 'sneha@saffronlounge.in', 'Waiter@123', ['WAITER']),
      user(6, 'cashier', 'Vikram Rao', 'vikram@saffronlounge.in', 'Cashier@123', ['CASHIER']),
      user(7, 'kitchen', 'Chef Arjun', 'kitchen@saffronlounge.in', 'Kitchen@123', ['KITCHEN']),
      user(8, 'bar', 'Neha Kapoor', 'bar@saffronlounge.in', 'Bar@123', ['BAR']),
      user(9, 'host', 'Ishaan Malhotra', 'host@saffronlounge.in', 'Host@123', ['HOST']),
    ],
    sessions: [],
    floors,
    tables,
    taxGroups,
    categories,
    items,
    priceHistory: items.map((i) => ({ itemId: i.id, price: i.price, from: now(), to: null })),
    offers,
    orders: [],
    orderHistory: [],
    tickets: [],
    bills: [],
    audit: [],
    events: [],
    seq: { user: 9, floor: 3, table: tid, category: 13, item: itemSeq, offer: 4, taxGroup: 4, order: 0, orderItem: 0, history: 0, ticket: 0, bill: 0, billItem: 0, discount: 0, payment: 0, audit: 0, event: 0,
      branch: 1, outlet: 2, invCategory: 6, invItem: 18, movement: 0, recipe: 0, supplier: 2, supplierPayment: 0, po: 0, poItem: 0, grn: 0, customer: 0, visit: 0, loyaltyAccount: 0, loyaltyTxn: 0, reservation: 0, coverType: 4, entry: 0, redemption: 0, vip: 0, bottle: 0, roomCharge: 0, notification: 0 },
    docSeq: {},
    p2: (() => {
      const p2 = createPhase2Seed();
      // VIP flags mirror 10_phase2_seed.sql
      tables.filter((t) => t.number.startsWith('VIP')).forEach((t) => { t.isVip = true; t.minSpendDefault = 25000; t.depositDefault = 5000; });
      p2.userBranches = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((userId) => ({ userId, branchId: 1, isDefault: true }));
      return p2;
    })(),
  };
}

export function loadDb(): MockDb | null {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockDb;
    return parsed.version === DB_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDb(db: MockDb): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded or private mode — keep in memory only */
  }
}

export function resetDb(): void {
  localStorage.removeItem(DB_KEY);
}
