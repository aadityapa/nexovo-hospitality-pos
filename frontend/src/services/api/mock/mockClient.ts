/**
 * ============================================================================
 *  MOCK BACKEND — route table. Implements every endpoint in docs/API_SPEC.md
 *  against the in-memory engine. Swap for OrdsClient via VITE_API_MODE=ords.
 * ============================================================================
 */
import { ApiError, buildQuery, type ApiClient, type AuthTokenProvider } from '../client';
import type { QueryParams } from '@/types';
import { createSeedDb, loadDb, saveDb, type MockDb } from './db';
import { type Ctx, errors, nextId, clone } from './engine/context';
import * as auth from './engine/auth';
import * as menu from './engine/menu';
import * as tables from './engine/tables';
import * as orders from './engine/orders';
import * as billing from './engine/billing';
import * as reports from './engine/reports';
import * as branches from './engine/p2/branches';
import * as inventory from './engine/p2/inventory';
import * as purchasing from './engine/p2/purchasing';
import * as crm from './engine/p2/crm';
import * as guests from './engine/p2/guests';
import * as notify from './engine/p2/notify';
import * as reports2 from './engine/p2/reports2';
import { seedTransactions } from './engine/seedTransactions';
import { seedPhase2Transactions } from './engine/seedPhase2';
import { realtime } from '@/services/realtime';
import type { RealtimeTopic } from '@/services/realtime/types';

type Handler = (ctx: Ctx, p: Record<string, string>, q: Record<string, string>, body: any) => unknown;
interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler; public?: boolean }

function route(method: string, path: string, handler: Handler, isPublic = false): Route {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { method, pattern, keys, handler, public: isPublic };
}

const num = (s: string) => Number(s);
const bool = (s?: string) => s === 'true' || s === '1';
const arr = (s?: string) => (s ? s.split(',') : undefined);

const ROUTES: Route[] = [
  // auth
  route('POST', '/auth/login', (c, _p, _q, b) => auth.login(c, b), true),
  route('POST', '/auth/forgot-password', (c, _p, _q, b) => auth.forgotPassword(c, b?.email), true),
  route('POST', '/auth/logout', (c) => auth.logout(c, (c as Ctx & { token?: string }).token ?? null)),
  route('GET', '/auth/me', (c) => auth.me(c)),
  // users & roles
  route('GET', '/users/approvers', (c) => auth.listApprovers(c)),
  route('GET', '/users/staff', (c, _p, q) => auth.listStaff(c, { role: q.role })),
  route('GET', '/users', (c, _p, q) => auth.listUsers(c, q)),
  route('POST', '/users', (c, _p, _q, b) => auth.saveUser(c, null, b)),
  route('PUT', '/users/:id/status', (c, p, _q, b) => auth.setUserStatus(c, num(p.id), !!b?.isActive)),
  route('PUT', '/users/:id/password', (c, p, _q, b) => auth.setPassword(c, num(p.id), b?.password)),
  route('PUT', '/users/:id', (c, p, _q, b) => auth.saveUser(c, num(p.id), b)),
  route('GET', '/roles', (c) => auth.listRoles(c)),
  route('GET', '/permissions', (c) => auth.listPermissions(c)),
  route('PUT', '/roles/:id', (c, p, _q, b) => auth.updateRole(c, num(p.id), b)),
  route('GET', '/audit-logs', (c, _p, q) => auth.listAudit(c, { entity: q.entity, from: q.from, to: q.to, page: q.page ? num(q.page) : undefined, pageSize: q.pageSize ? num(q.pageSize) : undefined })),
  // branch / settings
  route('GET', '/branches/current', (c) => tables.getBranch(c)),
  route('PUT', '/branches/current', (c, _p, _q, b) => tables.updateBranch(c, b)),
  route('GET', '/settings/taxes', (c) => menu.listTaxGroups(c)),
  route('POST', '/settings/taxes', (c, _p, _q, b) => menu.saveTaxGroup(c, null, b)),
  route('PUT', '/settings/taxes/:id', (c, p, _q, b) => menu.saveTaxGroup(c, num(p.id), b)),
  // floors & tables
  route('GET', '/floors', (c) => tables.listFloors(c)),
  route('POST', '/floors', (c, _p, _q, b) => tables.saveFloor(c, null, b)),
  route('PUT', '/floors/:id', (c, p, _q, b) => tables.saveFloor(c, num(p.id), b)),
  route('DELETE', '/floors/:id', (c, p) => tables.deleteFloor(c, num(p.id))),
  route('GET', '/tables', (c, _p, q) => tables.listTables(c, { floorId: q.floorId ? num(q.floorId) : undefined, status: q.status as never, search: q.search, waiterId: q.waiterId ? num(q.waiterId) : undefined })),
  route('POST', '/tables', (c, _p, _q, b) => tables.saveTable(c, null, b)),
  route('GET', '/tables/:id', (c, p) => tables.getTable(c, num(p.id))),
  route('PUT', '/tables/:id/status', (c, p, _q, b) => tables.overrideStatus(c, num(p.id), b?.status, b?.reason)),
  route('PUT', '/tables/:id/assign', (c, p, _q, b) => tables.assignWaiter(c, num(p.id), b?.waiterId ?? null)),
  route('POST', '/tables/:id/regenerate-qr', (c, p) => tables.regenerateQr(c, num(p.id))),
  route('PUT', '/tables/:id', (c, p, _q, b) => tables.saveTable(c, num(p.id), b)),
  route('DELETE', '/tables/:id', (c, p) => tables.deleteTable(c, num(p.id))),
  // menu
  route('GET', '/menu/categories', (c, _p, q) => menu.listCategories(c, bool(q.includeInactive))),
  route('POST', '/menu/categories', (c, _p, _q, b) => menu.saveCategory(c, null, b)),
  route('PUT', '/menu/categories/reorder', (c, _p, _q, b) => menu.reorderCategories(c, b?.orderedIds ?? [])),
  route('PUT', '/menu/categories/:id', (c, p, _q, b) => menu.saveCategory(c, num(p.id), b)),
  route('DELETE', '/menu/categories/:id', (c, p) => menu.deleteCategory(c, num(p.id))),
  route('GET', '/menu/items', (c, _p, q) => menu.listItems(c, { categoryId: q.categoryId ? num(q.categoryId) : undefined, search: q.search, prepLocation: q.prepLocation as never, includeInactive: bool(q.includeInactive) })),
  route('POST', '/menu/items', (c, _p, _q, b) => menu.saveItem(c, null, b)),
  route('PUT', '/menu/items/:id/availability', (c, p, _q, b) => menu.setAvailability(c, num(p.id), !!b?.isAvailable)),
  route('PUT', '/menu/items/:id', (c, p, _q, b) => menu.saveItem(c, num(p.id), b)),
  route('DELETE', '/menu/items/:id', (c, p) => menu.deleteItem(c, num(p.id))),
  // offers
  route('GET', '/offers', (c, _p, q) => menu.listOffers(c, bool(q.includeInactive))),
  route('POST', '/offers', (c, _p, _q, b) => menu.saveOffer(c, null, b)),
  route('PUT', '/offers/:id', (c, p, _q, b) => menu.saveOffer(c, num(p.id), b)),
  route('DELETE', '/offers/:id', (c, p) => menu.deleteOffer(c, num(p.id))),
  // public
  route('GET', '/public/menu/:branch/:table', (c, p) => menu.publicMenu(c, p.branch, p.table), true),
  // orders
  route('GET', '/orders', (c, _p, q) => orders.listOrders(c, { status: arr(q.status) as never, tableId: q.tableId ? num(q.tableId) : undefined, waiterId: q.waiterId ? num(q.waiterId) : undefined, location: q.location as never, active: bool(q.active), from: q.from, to: q.to, search: q.search })),
  route('POST', '/orders', (c, _p, _q, b) => orders.createOrder(c, b)),
  route('GET', '/orders/:id/history', (c, p) => orders.history(c, num(p.id))),
  route('GET', '/orders/:id', (c, p) => orders.getOrder(c, num(p.id))),
  route('PUT', '/orders/:id', (c, p, _q, b) => orders.updateOrder(c, num(p.id), b)),
  route('POST', '/orders/:id/items', (c, p, _q, b) => orders.addItems(c, num(p.id), b?.items ?? [])),
  route('POST', '/orders/:id/items/:itemId/cancel', (c, p, _q, b) => orders.cancelItem(c, num(p.id), num(p.itemId), b)),
  route('PUT', '/orders/:id/items/:itemId/status', (c, p, _q, b) => orders.setItemStatus(c, num(p.itemId), b?.status, null)),
  route('PUT', '/orders/:id/items/:itemId', (c, p, _q, b) => orders.updateItem(c, num(p.id), num(p.itemId), b)),
  route('POST', '/orders/:id/confirm', (c, p) => orders.confirmOrder(c, num(p.id))),
  route('POST', '/orders/:id/cancel', (c, p, _q, b) => orders.cancelOrder(c, num(p.id), b?.reason)),
  route('POST', '/orders/:id/request-bill', (c, p) => orders.requestBill(c, num(p.id))),
  // kitchen / bar
  route('GET', '/kitchen/orders', (c, _p, q) => orders.listTickets(c, 'KITCHEN', q.status as never)),
  route('PUT', '/kitchen/order-items/:id/status', (c, p, _q, b) => orders.ticketItemStatus(c, 'KITCHEN', num(p.id), b?.status)),
  route('GET', '/bar/orders', (c, _p, q) => orders.listTickets(c, 'BAR', q.status as never)),
  route('PUT', '/bar/order-items/:id/status', (c, p, _q, b) => orders.ticketItemStatus(c, 'BAR', num(p.id), b?.status)),
  // billing
  route('GET', '/bills', (c, _p, q) => billing.listBills(c, q as never)),
  route('POST', '/bills', (c, _p, _q, b) => billing.createBill(c, b?.orderId)),
  route('GET', '/bills/:id/receipt', (c, p) => billing.receipt(c, num(p.id))),
  route('GET', '/bills/:id', (c, p) => billing.getBill(c, num(p.id))),
  route('POST', '/bills/:id/discount', (c, p, _q, b) => billing.addDiscount(c, num(p.id), b)),
  route('DELETE', '/bills/:id/discount/:discountId', (c, p) => billing.removeDiscount(c, num(p.id), num(p.discountId))),
  route('POST', '/bills/:id/finalize', (c, p) => billing.finalizeBill(c, num(p.id))),
  route('POST', '/bills/:id/payments/:paymentId/reverse', (c, p, _q, b) => billing.reversePayment(c, num(p.id), num(p.paymentId), b?.reason)),
  route('POST', '/bills/:id/payments', (c, p, _q, b) => billing.addPayment(c, num(p.id), b)),
  route('POST', '/bills/:id/close', (c, p) => billing.closeBill(c, num(p.id))),
  // reports
  route('GET', '/dashboard/summary', (c, _p, q) => reports.dashboard(c, q.from, q.to)),
  route('GET', '/reports/sales', (c, _p, q) => reports.salesReport(c, q.from, q.to)),
  route('GET', '/reports/payments', (c, _p, q) => reports.paymentReport(c, q.from, q.to)),
  route('GET', '/reports/orders', (c, _p, q) => reports.orderReport(c, q.from, q.to)),
  route('GET', '/reports/items', (c, _p, q) => reports.itemReport(c, q.from, q.to, q.limit ? num(q.limit) : 20)),
  route('GET', '/events', (c, _p, q) => c.db.events.filter((e) => !q.since || e.at > q.since)),

  // ================= Phase 2 =================
  // multi-branch
  route('GET', '/branches', (c) => branches.listBranches(c)),
  route('POST', '/branches', (c, _p, _q, b) => branches.saveBranch(c, null, b)),
  route('PUT', '/branches/:id', (c, p, _q, b) => branches.saveBranch(c, num(p.id), b)),
  route('GET', '/outlets', (c) => branches.listOutlets(c)),
  route('POST', '/outlets', (c, _p, _q, b) => branches.saveOutlet(c, null, b)),
  route('PUT', '/outlets/:id', (c, p, _q, b) => branches.saveOutlet(c, num(p.id), b)),
  route('PUT', '/users/:id/branches', (c, p, _q, b) => branches.setUserBranches(c, num(p.id), b?.branchIds ?? [])),
  // inventory
  route('GET', '/inventory/units', (c) => inventory.units(c)),
  route('GET', '/inventory/categories', (c) => inventory.listCategories(c)),
  route('POST', '/inventory/categories', (c, _p, _q, b) => inventory.saveCategory(c, null, b)),
  route('PUT', '/inventory/categories/:id', (c, p, _q, b) => inventory.saveCategory(c, num(p.id), b)),
  route('GET', '/inventory/items', (c, _p, q) => inventory.listItems(c, { search: q.search, categoryId: q.categoryId ? num(q.categoryId) : undefined, status: q.status as never })),
  route('POST', '/inventory/items', (c, _p, _q, b) => inventory.saveItem(c, null, b)),
  route('GET', '/inventory/items/:id/movements', (c, p, q) => inventory.listMovements(c, { invItemId: num(p.id), type: q.type as never, from: q.from, to: q.to, limit: q.limit ? num(q.limit) : undefined })),
  route('GET', '/inventory/items/:id', (c, p) => inventory.getItem(c, num(p.id))),
  route('PUT', '/inventory/items/:id', (c, p, _q, b) => inventory.saveItem(c, num(p.id), b)),
  route('DELETE', '/inventory/items/:id', (c, p) => inventory.deleteItem(c, num(p.id))),
  route('GET', '/inventory/movements', (c, _p, q) => inventory.listMovements(c, { invItemId: q.invItemId ? num(q.invItemId) : undefined, type: q.type as never, from: q.from, to: q.to, limit: q.limit ? num(q.limit) : undefined })),
  route('POST', '/inventory/movements', (c, _p, _q, b) => inventory.manualMovement(c, b)),
  route('GET', '/inventory/dashboard', (c) => inventory.dashboard(c)),
  route('GET', '/inventory/low-stock', (c) => inventory.lowStock(c)),
  route('POST', '/orders/:id/deduct-stock', (c, p) => { inventory.deductManual(c, num(p.id)); return orders.getOrder(c, num(p.id)); }),
  // recipes
  route('GET', '/recipes', (c) => inventory.costingList(c)),
  route('GET', '/recipes/:id', (c, p) => inventory.getRecipe(c, num(p.id))),
  route('PUT', '/recipes/:id', (c, p, _q, b) => inventory.saveRecipe(c, num(p.id), b)),
  route('DELETE', '/recipes/:id', (c, p) => inventory.deleteRecipe(c, num(p.id))),
  // suppliers & purchasing
  route('GET', '/suppliers', (c, _p, q) => purchasing.listSuppliers(c, { search: q.search, status: q.status as never })),
  route('POST', '/suppliers', (c, _p, _q, b) => purchasing.saveSupplier(c, null, b)),
  route('GET', '/suppliers/:id', (c, p) => purchasing.supplierHistory(c, num(p.id))),
  route('PUT', '/suppliers/:id', (c, p, _q, b) => purchasing.saveSupplier(c, num(p.id), b)),
  route('DELETE', '/suppliers/:id', (c, p) => purchasing.deleteSupplier(c, num(p.id))),
  route('POST', '/suppliers/:id/payments', (c, p, _q, b) => purchasing.addSupplierPayment(c, num(p.id), b)),
  route('GET', '/purchases', (c, _p, q) => purchasing.listPos(c, { status: q.status as never, supplierId: q.supplierId ? num(q.supplierId) : undefined, search: q.search })),
  route('POST', '/purchases', (c, _p, _q, b) => purchasing.savePo(c, null, b)),
  route('GET', '/purchases/:id', (c, p) => purchasing.getPo(c, num(p.id))),
  route('PUT', '/purchases/:id', (c, p, _q, b) => purchasing.savePo(c, num(p.id), b)),
  route('POST', '/purchases/:id/transition', (c, p, _q, b) => purchasing.transitionPo(c, num(p.id), b?.action, b?.reason)),
  route('POST', '/purchases/:id/receive', (c, p, _q, b) => purchasing.receiveGoods(c, num(p.id), b)),
  // CRM & loyalty
  route('GET', '/customers', (c, _p, q) => crm.listCustomers(c, { search: q.search, limit: q.limit ? num(q.limit) : undefined })),
  route('POST', '/customers', (c, _p, _q, b) => crm.saveCustomer(c, null, b)),
  route('GET', '/customers/:id/history', (c, p) => crm.customerHistory(c, num(p.id))),
  route('GET', '/customers/:id', (c, p) => crm.getCustomer(c, num(p.id))),
  route('PUT', '/customers/:id', (c, p, _q, b) => crm.saveCustomer(c, num(p.id), b)),
  route('DELETE', '/customers/:id', (c, p) => crm.deleteCustomer(c, num(p.id))),
  route('PUT', '/orders/:id/customer', (c, p, _q, b) => crm.attachToOrder(c, num(p.id), b?.customerId ?? null)),
  route('GET', '/loyalty/program', (c) => { auth.me(c); return crm.program(c); }),
  route('PUT', '/loyalty/program', (c, _p, _q, b) => crm.saveProgram(c, b)),
  route('GET', '/loyalty/accounts/:id', (c, p) => crm.getAccount(c, num(p.id))),
  route('POST', '/loyalty/accounts/:id/adjust', (c, p, _q, b) => crm.adjust(c, num(p.id), b?.points, b?.notes)),
  route('POST', '/bills/:id/redeem-points', (c, p, _q, b) => crm.redeemOnBill(c, num(p.id), b?.points, billing.refreshPaymentStatus)),
  // reservations
  route('GET', '/reservations/availability', (c, _p, q) => guests.availability(c, q.date)),
  route('GET', '/reservations', (c, _p, q) => guests.listReservations(c, { from: q.from, to: q.to, status: q.status as never, search: q.search })),
  route('POST', '/reservations', (c, _p, _q, b) => guests.saveReservation(c, null, b)),
  route('GET', '/reservations/:id', (c, p) => guests.getReservation(c, num(p.id))),
  route('PUT', '/reservations/:id', (c, p, _q, b) => guests.saveReservation(c, num(p.id), b)),
  route('POST', '/reservations/:id/transition', (c, p, _q, b) => guests.transitionReservation(c, num(p.id), b?.action, b?.tableId, b?.reason)),
  // club
  route('GET', '/club/cover-types', (c) => guests.coverTypes(c)),
  route('POST', '/club/cover-types', (c, _p, _q, b) => guests.saveCoverType(c, null, b)),
  route('PUT', '/club/cover-types/:id', (c, p, _q, b) => guests.saveCoverType(c, num(p.id), b)),
  route('GET', '/club/entries', (c, _p, q) => guests.listEntries(c, { date: q.date, status: q.status as never })),
  route('POST', '/club/entries', (c, _p, _q, b) => guests.checkIn(c, b)),
  route('POST', '/club/entries/:id/checkout', (c, p) => guests.checkOut(c, num(p.id))),
  route('POST', '/club/entries/:id/cancel', (c, p, _q, b) => guests.cancelEntry(c, num(p.id), b?.reason)),
  route('GET', '/club/dashboard', (c) => guests.clubDashboard(c)),
  route('POST', '/bills/:id/redeem-cover', (c, p, _q, b) => guests.redeemCover(c, num(p.id), b?.entryId, b?.amount, billing.refreshPaymentStatus)),
  // VIP & bottle service
  route('GET', '/vip/tables', (c) => guests.vipTables(c)),
  route('GET', '/vip/reservations', (c, _p, q) => guests.listVip(c, { date: q.date, status: q.status as never })),
  route('POST', '/vip/reservations', (c, _p, _q, b) => guests.saveVip(c, null, b)),
  route('GET', '/vip/reservations/:id/spend', (c, p) => guests.vipSpend(c, num(p.id))),
  route('GET', '/vip/reservations/:id', (c, p) => guests.getVip(c, num(p.id))),
  route('PUT', '/vip/reservations/:id', (c, p, _q, b) => guests.saveVip(c, num(p.id), b)),
  route('POST', '/vip/reservations/:id/transition', (c, p, _q, b) => guests.transitionVip(c, num(p.id), b?.action, b?.reason)),
  route('GET', '/bottle-service', (c) => guests.bottleList(c)),
  route('PUT', '/bottle-service/:id', (c, p, _q, b) => guests.bottleSave(c, num(p.id), b)),
  route('DELETE', '/bottle-service/:id', (c, p) => guests.bottleRemove(c, num(p.id))),
  // hotel room charges
  route('POST', '/room-charges/verify', (c, _p, _q, b) => guests.verifyRoom(c, b?.roomNo)),
  route('POST', '/bills/:id/room-charge', (c, p, _q, b) => guests.postToRoom(c, num(p.id), b, billing.refreshPaymentStatus)),
  route('GET', '/room-charges', (c, _p, q) => guests.listRoomCharges(c, { from: q.from, to: q.to })),
  // notifications
  route('GET', '/notifications/thresholds', (c) => notify.thresholds(c)),
  route('PUT', '/notifications/thresholds', (c, _p, _q, b) => notify.saveThresholds(c, b?.thresholds ?? [])),
  route('GET', '/notifications', (c, _p, q) => notify.list(c, bool(q.unread), q.limit ? num(q.limit) : 50)),
  route('PUT', '/notifications/read-all', (c) => notify.markAllRead(c)),
  route('PUT', '/notifications/:id/read', (c, p) => notify.markRead(c, num(p.id))),
  // advanced reports
  route('GET', '/reports/v2/sales', (c, _p, q) => reports2.salesPeriod(c, q.from, q.to, q.groupBy)),
  route('GET', '/reports/v2/branches', (c, _p, q) => reports2.branchComparison(c, q.from, q.to)),
  route('GET', '/reports/v2/categories', (c, _p, q) => reports2.categoryPerformance(c, q.from, q.to)),
  route('GET', '/reports/v2/inventory/valuation', (c) => reports2.inventoryValuation(c)),
  route('GET', '/reports/v2/inventory/low-stock', (c) => inventory.lowStock(c)),
  route('GET', '/reports/v2/inventory/wastage', (c, _p, q) => reports2.wastage(c, q.from, q.to)),
  route('GET', '/reports/v2/inventory/consumption', (c, _p, q) => reports2.consumption(c, q.from, q.to)),
  route('GET', '/reports/v2/inventory/movements', (c, _p, q) => inventory.listMovements(c, { type: q.type as never, from: q.from, to: q.to, limit: 500 })),
  route('GET', '/reports/v2/profitability', (c, _p, q) => reports2.profitability(c, q.from, q.to)),
  route('GET', '/reports/v2/staff', (c, _p, q) => reports2.staffPerformance(c, q.from, q.to)),
];

export class MockClient implements ApiClient {
  private db: MockDb;

  constructor(private readonly auth: AuthTokenProvider, private readonly latencyMs = 150) {
    const existing = loadDb();
    if (existing) this.db = existing;
    else {
      this.db = createSeedDb();
      seedTransactions(this.ctx(null));
      seedPhase2Transactions(this.ctx(null));
      saveDb(this.db);
    }
    // keep tabs in sync: reload state when another tab persisted a change
    if (typeof window !== 'undefined') {
      realtime().subscribe('all', () => { const fresh = loadDb(); if (fresh) this.db = fresh; });
    }
  }

  /** Builds the request context. Branch = X-Branch-Id equivalent (provider) if the user may access it, else the user's home branch. */
  private ctx(token: string | null, requestedBranch?: number | null): Ctx & { token: string | null } {
    const ctx: Ctx & { token: string | null } = {
      db: this.db, user: null, token, branchId: this.db.branch.id,
      emit: (topic: RealtimeTopic, type: string, entityId?: number | null) => {
        const evt = { id: nextId(this.db, 'event'), topic, type, entityId: entityId ?? null, at: new Date().toISOString() };
        this.db.events.push(evt);
        if (this.db.events.length > 500) this.db.events.splice(0, this.db.events.length - 500);
        pending.push(evt);
      },
    };
    ctx.user = auth.resolveSession(ctx, token);
    if (ctx.user) {
      ctx.branchId = ctx.user.branchId;
      if (requestedBranch && requestedBranch !== ctx.user.branchId) {
        if (!branches.userCanAccess(ctx, ctx.user.id, requestedBranch)) throw errors.forbidden('You do not have access to this branch');
        ctx.branchId = requestedBranch;
      }
    }
    return ctx;
  }

  get<T>(path: string, params?: QueryParams): Promise<T> { return this.dispatch<T>('GET', path + buildQuery(params)); }
  post<T>(path: string, body?: unknown): Promise<T> { return this.dispatch<T>('POST', path, body); }
  put<T>(path: string, body?: unknown): Promise<T> { return this.dispatch<T>('PUT', path, body); }
  delete<T>(path: string): Promise<T> { return this.dispatch<T>('DELETE', path); }

  private async dispatch<T>(method: string, fullPath: string, body?: unknown): Promise<T> {
    await new Promise((r) => setTimeout(r, this.latencyMs + Math.random() * 50));
    const [path, qs] = fullPath.split('?');
    const q: Record<string, string> = {};
    new URLSearchParams(qs ?? '').forEach((v, k) => { q[k] = v; });
    const r = ROUTES.find((x) => x.method === method && x.pattern.test(path));
    if (!r) throw errors.notFound(`Endpoint not found: ${method} ${path}`);
    const m = path.match(r.pattern)!;
    const p: Record<string, string> = {};
    r.keys.forEach((k, i) => { p[k] = decodeURIComponent(m[i + 1]); });

    const fresh = loadDb(); if (fresh) this.db = fresh;  // pick up writes from other tabs
    const ctx = this.ctx(this.auth.getToken(), this.auth.getBranchId());
    if (!r.public && !ctx.user) { this.auth.onUnauthorized(); throw errors.unauthorized('Session expired. Please sign in again.'); }

    const snapshot = method === 'GET' ? null : JSON.stringify(this.db);
    pending.length = 0;
    try {
      const result = r.handler(ctx, p, q, body);
      if (method !== 'GET') { saveDb(this.db); flushEvents(); }
      return clone(result) as T;
    } catch (e) {
      if (snapshot) this.db = JSON.parse(snapshot) as MockDb;   // atomic: roll back on failure
      if (e instanceof ApiError) throw e;
      throw new ApiError(500, (e as Error)?.message ?? 'Internal error');
    }
  }
}

const pending: { topic: RealtimeTopic; type: string; entityId: number | null; at: string; id: number }[] = [];
function flushEvents(): void {
  const rt = realtime();
  const seen = new Set<string>();
  for (const e of pending) {
    const key = `${e.topic}:${e.type}:${e.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rt.publish?.(e);
  }
  pending.length = 0;
}
