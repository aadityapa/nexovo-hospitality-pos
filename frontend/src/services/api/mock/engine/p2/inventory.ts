/**
 * MOCK ENGINE — Inventory, stock movements, recipes (mirror of INVENTORY_PKG + RECIPE_PKG).
 */
import { type Ctx, errors, now, audit, assertPermission, nextId, clone, currentBranch } from '../context';
import { createNotification, resolveDedupe } from './notify';
import type { InventoryUnit, InventoryCategory, InventoryCategoryInput, InventoryItem, InventoryItemInput, StockMovement, ManualMovementInput, MovementType, InventoryDashboard, Recipe, RecipeInput, RecipeCostRow, StockStatus, ID } from '@/types';
import { round2 } from '@/utils/money';

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function stockStatusOf(i: { currentQty: number; minQty: number; reorderLevel: number }): StockStatus {
  if (i.currentQty <= 0) return 'OUT';
  if (i.currentQty <= i.minQty) return 'LOW';
  if (i.currentQty <= i.reorderLevel) return 'REORDER';
  return 'OK';
}

export function units(ctx: Ctx): InventoryUnit[] { return clone(ctx.db.p2.units); }

/** Same family via base factors; cross-family via UNIT_CONVERSIONS or the item's pack size. */
export function convertQty(ctx: Ctx, qty: number, fromUnit: ID, toUnit: ID, packSize?: number | null): number {
  if (fromUnit === toUnit) return qty;
  const f = ctx.db.p2.units.find((u) => u.id === fromUnit);
  const t = ctx.db.p2.units.find((u) => u.id === toUnit);
  if (!f || !t) throw errors.validation('Unknown unit', 'unitId');
  if (f.baseUnit === t.baseUnit) return (qty * f.factorToBase) / t.factorToBase;
  const c1 = ctx.db.p2.unitConversions.find((c) => c.fromUnitId === fromUnit && c.toUnitId === toUnit);
  if (c1) return qty * c1.factor;
  const c2 = ctx.db.p2.unitConversions.find((c) => c.fromUnitId === toUnit && c.toUnitId === fromUnit);
  if (c2) return qty / c2.factor;
  if (packSize && packSize > 0) {
    if (t.baseUnit === 'PIECE') return (qty * f.factorToBase) / packSize / t.factorToBase;
    if (f.baseUnit === 'PIECE') return (qty * f.factorToBase * packSize) / t.factorToBase;
  }
  throw errors.business(`No conversion from ${f.code} to ${t.code} (set a pack size or a unit conversion)`);
}

// ------------------------------------------------------------ categories
export function listCategories(ctx: Ctx): InventoryCategory[] {
  assertPermission(ctx, 'inventory:view');
  return ctx.db.p2.invCategories.filter((c) => c.branchId === ctx.branchId).map((c) => ({ id: c.id, name: c.name, kind: c.kind, isActive: c.isActive, itemCount: ctx.db.p2.invItems.filter((i) => i.categoryId === c.id && !i.isDeleted).length })).sort((a, b) => a.name.localeCompare(b.name));
}

export function saveCategory(ctx: Ctx, id: ID | null, body: InventoryCategoryInput): InventoryCategory[] {
  assertPermission(ctx, 'inventory:manage');
  const name = String(body.name ?? '').trim();
  if (!name) throw errors.validation('Category name is required', 'name');
  if (ctx.db.p2.invCategories.some((c) => c.branchId === ctx.branchId && c.id !== id && c.name.toLowerCase() === name.toLowerCase())) throw errors.conflict('Category already exists');
  if (id == null) ctx.db.p2.invCategories.push({ id: nextId(ctx.db, 'invCategory'), branchId: ctx.branchId, name, kind: body.kind ?? 'INGREDIENT', isActive: body.isActive ?? true, itemCount: 0 });
  else {
    const c = ctx.db.p2.invCategories.find((x) => x.id === id && x.branchId === ctx.branchId);
    if (!c) throw errors.notFound('Category not found');
    Object.assign(c, { name, kind: body.kind ?? c.kind, isActive: body.isActive ?? true });
    ctx.db.p2.invItems.filter((i) => i.categoryId === id).forEach((i) => { i.categoryName = name; i.categoryKind = c.kind; });
  }
  audit(ctx, 'INV_CATEGORY_SAVED', 'INVENTORY_CATEGORIES', id, null, body);
  return listCategories(ctx);
}

// ------------------------------------------------------------ items
export function hydrateItem(ctx: Ctx, i: InventoryItem & { isDeleted?: boolean }): InventoryItem {
  const { isDeleted: _d, ...rest } = i;
  const last = ctx.db.p2.movements.filter((m) => m.invItemId === i.id).reduce<string | null>((a, m) => (!a || m.createdAt > a ? m.createdAt : a), null);
  return { ...clone(rest), stockValue: round2(i.currentQty * i.avgCost), stockStatus: stockStatusOf(i), lastMovementAt: last, supplierName: ctx.db.p2.suppliers.find((s) => s.id === i.supplierId)?.name ?? null };
}

export function listItems(ctx: Ctx, q: { search?: string; categoryId?: ID; status?: StockStatus }): InventoryItem[] {
  assertPermission(ctx, 'inventory:view');
  const s = (q.search ?? '').toLowerCase();
  return ctx.db.p2.invItems
    .filter((i) => !i.isDeleted && i.isActive && i.branchId === ctx.branchId)
    .filter((i) => !q.categoryId || i.categoryId === Number(q.categoryId))
    .filter((i) => !s || i.name.toLowerCase().includes(s) || i.code.toLowerCase().includes(s))
    .map((i) => hydrateItem(ctx, i))
    .filter((i) => !q.status || i.stockStatus === q.status)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getItem(ctx: Ctx, id: ID): InventoryItem {
  assertPermission(ctx, 'inventory:view');
  const i = ctx.db.p2.invItems.find((x) => x.id === Number(id) && !x.isDeleted);
  if (!i) throw errors.notFound('Inventory item not found');
  return hydrateItem(ctx, i);
}

export function saveItem(ctx: Ctx, id: ID | null, body: InventoryItemInput): InventoryItem {
  assertPermission(ctx, 'inventory:manage');
  const name = String(body.name ?? '').trim();
  if (!name) throw errors.validation('Item name is required', 'name');
  const cat = ctx.db.p2.invCategories.find((c) => c.id === Number(body.categoryId) && c.branchId === ctx.branchId);
  if (!cat) throw errors.validation('Inventory category is invalid', 'categoryId');
  const unit = ctx.db.p2.units.find((u) => u.id === Number(body.unitId));
  if (!unit) throw errors.validation('Unit is invalid', 'unitId');
  const minQty = Number(body.minQty ?? 0), reorder = Number(body.reorderLevel ?? 0), cost = Number(body.costPrice ?? 0);
  if (minQty < 0 || reorder < 0 || cost < 0) throw errors.validation('Quantities and cost cannot be negative', 'minQty');
  const code = body.code?.trim() || `INV-${Date.now().toString(36).toUpperCase()}`;
  if (ctx.db.p2.invItems.some((i) => !i.isDeleted && i.id !== id && i.branchId === ctx.branchId && i.code.toLowerCase() === code.toLowerCase())) throw errors.conflict('Item code already exists');
  const supplierId = body.supplierId ? Number(body.supplierId) : null;
  let it: Phase2Item;
  if (id == null) {
    it = { id: nextId(ctx.db, 'invItem'), branchId: ctx.branchId, categoryId: cat.id, categoryName: cat.name, categoryKind: cat.kind, code, name, unitId: unit.id, unitCode: unit.code, packSize: body.packSize ?? null, currentQty: 0, minQty, maxQty: body.maxQty ?? null, reorderLevel: reorder, costPrice: cost, avgCost: cost, stockValue: 0, supplierId, supplierName: null, allowNegative: !!body.allowNegative, isActive: body.isActive ?? true, stockStatus: 'OK', lastMovementAt: null, createdAt: now(), updatedAt: null, isDeleted: false };
    ctx.db.p2.invItems.push(it);
    if (body.openingQty && body.openingQty > 0) applyMovement(ctx, it.id, 'OPENING_STOCK', body.openingQty, cost, 'ITEM', it.id, `OPENING:${it.id}`, 'Opening stock');
    audit(ctx, 'INV_ITEM_CREATED', 'INVENTORY_ITEMS', it.id, null, body);
  } else {
    const found = ctx.db.p2.invItems.find((x) => x.id === id && !x.isDeleted && x.branchId === ctx.branchId);
    if (!found) throw errors.notFound('Inventory item not found');
    Object.assign(found, { categoryId: cat.id, categoryName: cat.name, categoryKind: cat.kind, code, name, unitId: unit.id, unitCode: unit.code, packSize: body.packSize ?? null, minQty, maxQty: body.maxQty ?? null, reorderLevel: reorder, costPrice: cost, supplierId, allowNegative: !!body.allowNegative, isActive: body.isActive ?? true, updatedAt: now() });
    it = found;
    audit(ctx, 'INV_ITEM_UPDATED', 'INVENTORY_ITEMS', it.id, null, body);
  }
  ctx.emit('inventory', 'item.saved', it.id);
  return hydrateItem(ctx, it);
}
type Phase2Item = Ctx['db']['p2']['invItems'][number];

export function deleteItem(ctx: Ctx, id: ID): null {
  assertPermission(ctx, 'inventory:manage');
  const it = ctx.db.p2.invItems.find((x) => x.id === Number(id) && !x.isDeleted);
  if (!it) throw errors.notFound('Inventory item not found');
  const used = ctx.db.p2.recipes.filter((r) => r.isActive && r.ingredients.some((g) => g.invItemId === it.id)).length;
  if (used > 0) throw errors.business(`Item is used in ${used} recipe(s). Remove it from recipes first.`);
  it.isDeleted = true; it.isActive = false; it.updatedAt = now();
  audit(ctx, 'INV_ITEM_DELETED', 'INVENTORY_ITEMS', it.id);
  ctx.emit('inventory', 'item.deleted', it.id);
  return null;
}

// ------------------------------------------------------------ movements (the only way stock changes)
export function applyMovement(ctx: Ctx, invItemId: ID, type: MovementType, qty: number, unitCost: number | null, refType: string | null, refId: ID | null, idemKey: string | null, reason: string): StockMovement | null {
  if (!qty) throw errors.validation('Quantity must be non-zero', 'qty');
  if (idemKey && ctx.db.p2.movements.some((m) => m.idemKey === idemKey)) return null;   // never twice
  const i = ctx.db.p2.invItems.find((x) => x.id === invItemId);
  if (!i) throw errors.notFound('Inventory item not found');
  const after = round4(i.currentQty + qty);
  if (after < 0 && !i.allowNegative) throw errors.business(`Insufficient stock for ${i.name}: available ${i.currentQty} ${i.unitCode}, required ${Math.abs(qty)}`);
  const cost = unitCost ?? i.avgCost;
  let newAvg = i.avgCost;
  if (qty > 0 && unitCost != null && ['PURCHASE', 'OPENING_STOCK', 'RETURN', 'ADJUSTMENT', 'TRANSFER'].includes(type)) {
    const base = Math.max(i.currentQty, 0);
    newAvg = base + qty > 0 ? (base * i.avgCost + qty * unitCost) / (base + qty) : unitCost;
  }
  const mvt: Ctx['db']['p2']['movements'][number] = { id: nextId(ctx.db, 'movement'), branchId: i.branchId, invItemId, itemName: i.name, itemCode: i.code, unitCode: i.unitCode, type, qty: round4(qty), qtyBefore: i.currentQty, qtyAfter: after, unitCost: round4(cost), totalCost: round2(Math.abs(qty) * cost), refType, refId, reason: reason.slice(0, 300), createdBy: ctx.user?.id ?? null, createdByName: ctx.user?.fullName ?? null, createdAt: now(), idemKey };
  ctx.db.p2.movements.push(mvt);
  i.currentQty = after; i.avgCost = round4(newAvg); i.updatedAt = now();
  if (type === 'PURCHASE' && unitCost != null) i.costPrice = unitCost;
  if (i.minQty > 0 && after <= i.minQty) createNotification(ctx, 'LOW_STOCK', after <= 0 ? 'CRITICAL' : 'WARNING', `Low stock: ${i.name}`, `Remaining ${after} ${i.unitCode} (minimum ${i.minQty})`, 'INVENTORY_ITEMS', i.id, 'MANAGER', null, `LOW_STOCK:${i.id}`);
  else if (after > i.minQty) resolveDedupe(ctx, `LOW_STOCK:${i.id}`);
  ctx.emit('inventory', 'stock.moved', invItemId);
  return clone(mvt);
}

export function manualMovement(ctx: Ctx, body: ManualMovementInput): InventoryItem {
  assertPermission(ctx, 'inventory:adjust');
  const type = body.type;
  if (!['ADJUSTMENT', 'WASTAGE', 'DAMAGE', 'OPENING_STOCK', 'RETURN', 'TRANSFER'].includes(type)) throw errors.validation('Invalid movement type', 'type');
  const qty = Number(body.qty);
  if (!qty) throw errors.validation('Quantity is required', 'qty');
  if (!body.reason?.trim()) throw errors.validation('Reason is required', 'reason');
  const signed = type === 'WASTAGE' || type === 'DAMAGE' ? -Math.abs(qty) : type === 'OPENING_STOCK' || type === 'RETURN' ? Math.abs(qty) : qty;
  audit(ctx, `STOCK_${type}`, 'INVENTORY_ITEMS', body.invItemId, null, `${signed} — ${body.reason}`);
  applyMovement(ctx, Number(body.invItemId), type, signed, body.unitCost ?? null, 'MANUAL', null, null, body.reason);
  return getItem(ctx, Number(body.invItemId));
}

export function listMovements(ctx: Ctx, q: { invItemId?: ID; type?: MovementType; from?: string; to?: string; limit?: number }): StockMovement[] {
  assertPermission(ctx, 'inventory:view');
  return ctx.db.p2.movements
    .filter((m) => m.branchId === ctx.branchId)
    .filter((m) => !q.invItemId || m.invItemId === Number(q.invItemId))
    .filter((m) => !q.type || m.type === q.type)
    .filter((m) => !q.from || m.createdAt >= q.from)
    .filter((m) => !q.to || m.createdAt <= q.to)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, q.limit ?? 200)
    .map(({ idemKey: _k, branchId: _b, ...m }) => clone(m));
}

export function lowStock(ctx: Ctx): InventoryItem[] {
  return listItems(ctx, {}).filter((i) => i.stockStatus !== 'OK').sort((a, b) => (a.minQty ? a.currentQty / a.minQty : 0) - (b.minQty ? b.currentQty / b.minQty : 0));
}

export function dashboard(ctx: Ctx): InventoryDashboard {
  const items = listItems(ctx, {});
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = ctx.db.p2.movements.filter((m) => m.branchId === ctx.branchId && m.createdAt >= since);
  const sum = (types: MovementType[]) => round2(recent.filter((m) => types.includes(m.type)).reduce((a, m) => a + m.totalCost, 0));
  return {
    stockValue: round2(items.reduce((a, i) => a + i.stockValue, 0)), itemCount: items.length,
    lowStockCount: items.filter((i) => i.stockStatus === 'LOW' || i.stockStatus === 'REORDER').length, outOfStockCount: items.filter((i) => i.stockStatus === 'OUT').length,
    wastage30d: sum(['WASTAGE', 'DAMAGE']), consumption30d: sum(['SALE_CONSUMPTION']), purchases30d: sum(['PURCHASE']),
    lowStock: lowStock(ctx), recentMovements: listMovements(ctx, { limit: 10 }),
  };
}

// ------------------------------------------------------------ recipes
const withWastage = (qty: number, w: number) => qty * (1 + (w || 0) / 100);

function lineCost(ctx: Ctx, invItemId: ID, qty: number, unitId: ID, wastage: number): number {
  const i = ctx.db.p2.invItems.find((x) => x.id === invItemId);
  if (!i) return 0;
  return round4(convertQty(ctx, withWastage(qty, wastage), unitId, i.unitId, i.packSize) * i.avgCost);
}

export function recipeCost(ctx: Ctx, menuItemId: ID): number {
  const r = ctx.db.p2.recipes.find((x) => x.menuItemId === menuItemId && x.isActive);
  if (!r) return 0;
  return round2(r.ingredients.reduce((a, g) => a + lineCost(ctx, g.invItemId, g.qty, g.unitId, g.wastagePct), 0) / (r.yieldQty || 1));
}

export function getRecipe(ctx: Ctx, menuItemId: ID): Recipe {
  assertPermission(ctx, 'recipes:view');
  const mi = ctx.db.items.find((x) => x.id === Number(menuItemId));
  if (!mi) throw errors.notFound('Menu item not found');
  const r = ctx.db.p2.recipes.find((x) => x.menuItemId === mi.id);
  const ingredients = (r?.ingredients ?? []).map((g) => {
    const inv = ctx.db.p2.invItems.find((x) => x.id === g.invItemId);
    return { ...g, itemName: inv?.name, itemCode: inv?.code, unitCode: ctx.db.p2.units.find((u) => u.id === g.unitId)?.code, stockUnitCode: inv?.unitCode, avgCost: inv?.avgCost, lineCost: lineCost(ctx, g.invItemId, g.qty, g.unitId, g.wastagePct) };
  });
  const cost = r?.isActive ? recipeCost(ctx, mi.id) : 0;
  return {
    menuItemId: mi.id, menuItemName: mi.name, sellingPrice: mi.price, prepLocation: mi.prepLocation, recipeId: r?.id ?? null, variantCode: r?.variantCode ?? 'STD', portionLabel: r?.portionLabel ?? 'Standard', yieldQty: r?.yieldQty ?? 1, isActive: r?.isActive ?? true,
    ingredients, recipeCost: cost, foodCostPercent: mi.price > 0 ? Math.round((cost * 1000) / mi.price) / 10 : 0, grossMargin: round2(mi.price - cost), suggestedPrice: cost > 0 ? Math.round(cost / 0.3) : null,
  };
}

export function saveRecipe(ctx: Ctx, menuItemId: ID, body: RecipeInput): Recipe {
  assertPermission(ctx, 'recipes:manage');
  const mi = ctx.db.items.find((x) => x.id === Number(menuItemId) && !x.isDeleted);
  if (!mi) throw errors.notFound('Menu item not found');
  const yieldQty = Number(body.yieldQty ?? 1);
  if (!(yieldQty > 0)) throw errors.validation('Yield must be positive', 'yieldQty');
  const ingredients = (body.ingredients ?? []).map((g) => {
    const qty = Number(g.qty), w = Number(g.wastagePct ?? 0);
    if (!(qty > 0)) throw errors.validation('Ingredient quantity must be positive', 'ingredients');
    if (w < 0 || w > 100) throw errors.validation('Wastage must be 0–100 %', 'ingredients');
    if (!ctx.db.p2.invItems.some((x) => x.id === Number(g.invItemId) && !x.isDeleted)) throw errors.validation(`Ingredient ${g.invItemId} not found`, 'ingredients');
    if (!ctx.db.p2.units.some((u) => u.id === Number(g.unitId))) throw errors.validation('Unit is invalid', 'ingredients');
    return { invItemId: Number(g.invItemId), qty, unitId: Number(g.unitId), wastagePct: w };
  });
  let r = ctx.db.p2.recipes.find((x) => x.menuItemId === mi.id);
  if (r) Object.assign(r, { yieldQty, portionLabel: body.portionLabel ?? r.portionLabel, isActive: body.isActive ?? true, ingredients, updatedAt: now() });
  else { r = { id: nextId(ctx.db, 'recipe'), menuItemId: mi.id, variantCode: 'STD', portionLabel: body.portionLabel ?? 'Standard', yieldQty, isActive: body.isActive ?? true, ingredients, updatedAt: now() }; ctx.db.p2.recipes.push(r); }
  audit(ctx, 'RECIPE_SAVED', 'RECIPES', r.id, null, body);
  ctx.emit('menu', 'recipe.saved', mi.id);
  return getRecipe(ctx, mi.id);
}

export function deleteRecipe(ctx: Ctx, menuItemId: ID): null {
  assertPermission(ctx, 'recipes:manage');
  const r = ctx.db.p2.recipes.find((x) => x.menuItemId === Number(menuItemId));
  if (r) { r.isActive = false; r.updatedAt = now(); }
  audit(ctx, 'RECIPE_DEACTIVATED', 'RECIPES', Number(menuItemId));
  return null;
}

export function costingList(ctx: Ctx): RecipeCostRow[] {
  assertPermission(ctx, 'recipes:view');
  return ctx.db.items.filter((mi) => !mi.isDeleted && mi.branchId === ctx.branchId).map((mi) => {
    const r = ctx.db.p2.recipes.find((x) => x.menuItemId === mi.id && x.isActive);
    const cost = recipeCost(ctx, mi.id);
    return { menuItemId: mi.id, menuItemName: mi.name, categoryName: ctx.db.categories.find((c) => c.id === mi.categoryId)?.name ?? '', prepLocation: mi.prepLocation, sellingPrice: mi.price, recipeCost: cost, ingredientCount: r?.ingredients.length ?? 0, foodCostPercent: mi.price > 0 ? Math.round((cost * 1000) / mi.price) / 10 : 0, grossMargin: round2(mi.price - cost) };
  }).sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.menuItemName.localeCompare(b.menuItemName));
}

// ------------------------------------------------------------ order hooks (idempotent)
export function deductForOrderItem(ctx: Ctx, orderItemId: ID): void {
  const o = ctx.db.orders.find((x) => x.items.some((i) => i.id === orderItemId));
  const oi = o?.items.find((i) => i.id === orderItemId);
  if (!o || !oi || oi.stockDeducted || oi.status === 'CANCELLED') return;
  const bottle = ctx.db.p2.bottleService.find((b) => b.menuItemId === oi.menuItemId && b.isActive && b.invItemId);
  if (bottle?.invItemId) applyMovement(ctx, bottle.invItemId, 'SALE_CONSUMPTION', -oi.quantity, null, 'ORDER_ITEM', oi.id, `ORDER_ITEM:${oi.id}:BOTTLE`, `Bottle service ${oi.itemName}`);
  const r = ctx.db.p2.recipes.find((x) => x.menuItemId === oi.menuItemId && x.isActive);
  if (r) {
    for (const g of r.ingredients) {
      const inv = ctx.db.p2.invItems.find((x) => x.id === g.invItemId);
      if (!inv) continue;
      const qty = convertQty(ctx, (withWastage(g.qty, g.wastagePct) * oi.quantity) / (r.yieldQty || 1), g.unitId, inv.unitId, inv.packSize);
      applyMovement(ctx, inv.id, 'SALE_CONSUMPTION', -qty, null, 'ORDER_ITEM', oi.id, `ORDER_ITEM:${oi.id}:${g.invItemId}`, `${oi.itemName} x${oi.quantity}`);
    }
  }
  oi.stockDeducted = true;
}

export function reverseForOrderItem(ctx: Ctx, orderItemId: ID): void {
  const o = ctx.db.orders.find((x) => x.items.some((i) => i.id === orderItemId));
  const oi = o?.items.find((i) => i.id === orderItemId);
  if (!oi || !oi.stockDeducted) return;
  for (const m of ctx.db.p2.movements.filter((m) => m.refType === 'ORDER_ITEM' && m.refId === orderItemId && m.type === 'SALE_CONSUMPTION')) {
    applyMovement(ctx, m.invItemId, 'CONSUMPTION_REVERSAL', -m.qty, m.unitCost, 'ORDER_ITEM', orderItemId, `REVERSE:${m.id}`, `Cancelled ${oi.itemName}`);
  }
  oi.stockDeducted = false;
}

function deductOrder(ctx: Ctx, orderId: ID): void {
  const o = ctx.db.orders.find((x) => x.id === orderId);
  if (!o) return;
  for (const it of o.items) if (it.status !== 'CANCELLED' && !it.stockDeducted) deductForOrderItem(ctx, it.id);
}

export function onOrderConfirmed(ctx: Ctx, orderId: ID): void {
  if ((currentBranch(ctx).stockDeductionMode ?? 'ON_CONFIRM') === 'ON_CONFIRM') deductOrder(ctx, orderId);
}
export function onBillClosed(ctx: Ctx, orderId: ID): void {
  if (currentBranch(ctx).stockDeductionMode === 'ON_BILL_CLOSE') deductOrder(ctx, orderId);
}
export function deductManual(ctx: Ctx, orderId: ID): void {
  assertPermission(ctx, 'inventory:adjust');
  deductOrder(ctx, orderId);
  audit(ctx, 'STOCK_DEDUCTED_MANUAL', 'ORDERS', orderId);
}
