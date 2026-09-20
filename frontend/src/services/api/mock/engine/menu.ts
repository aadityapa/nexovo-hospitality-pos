import { type Ctx, errors, now, audit, assertPermission, nextId, clone } from './context';
import type { MenuCategory, CategoryInput, MenuItem, MenuItemInput, TaxGroup, TaxGroupInput, Offer, OfferInput, PublicMenu, PrepLocation } from '@/types';
import { isOfferCurrentlyActive } from '@/utils/offers';

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ------------------------------------------------------------ categories
export function listCategories(ctx: Ctx, includeInactive = false, requirePerm = true): MenuCategory[] {
  if (requirePerm) assertPermission(ctx, 'menu:view');
  return ctx.db.categories
    .filter((c) => !c.isDeleted && c.branchId === ctx.branchId && (includeInactive || c.isActive))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
    .map(clone);
}

export function saveCategory(ctx: Ctx, id: number | null, body: CategoryInput): MenuCategory {
  assertPermission(ctx, 'menu:manage');
  const name = String(body.name ?? '').trim();
  if (!name) throw errors.validation('Category name is required', 'name');
  if (!['KITCHEN', 'BAR'].includes(body.prepLocation)) throw errors.validation('Invalid preparation location', 'prepLocation');
  const slug = slugify(name);
  if (ctx.db.categories.some((c) => !c.isDeleted && c.id !== id && c.branchId === ctx.branchId && c.slug === slug)) throw errors.conflict('A category with this name already exists');
  let c: MenuCategory;
  if (id == null) {
    c = { id: nextId(ctx.db, 'category'), branchId: ctx.branchId, name, slug, description: body.description ?? null, imageUrl: body.imageUrl ?? null, prepLocation: body.prepLocation, displayOrder: body.displayOrder ?? Math.max(0, ...ctx.db.categories.map((x) => x.displayOrder)) + 1, isActive: body.isActive ?? true, isDeleted: false, createdAt: now() };
    ctx.db.categories.push(c);
    audit(ctx, 'CATEGORY_CREATED', 'MENU_CATEGORIES', c.id, null, body);
  } else {
    const found = ctx.db.categories.find((x) => x.id === id && !x.isDeleted);
    if (!found) throw errors.notFound('Category not found');
    Object.assign(found, { name, slug, description: body.description ?? null, imageUrl: body.imageUrl ?? null, prepLocation: body.prepLocation, displayOrder: body.displayOrder ?? found.displayOrder, isActive: body.isActive ?? true });
    c = found;
    audit(ctx, 'CATEGORY_UPDATED', 'MENU_CATEGORIES', c.id, null, body);
  }
  ctx.emit('menu', 'category.saved', c.id);
  return clone(c);
}

export function deleteCategory(ctx: Ctx, id: number): null {
  assertPermission(ctx, 'menu:manage');
  const c = ctx.db.categories.find((x) => x.id === id && !x.isDeleted);
  if (!c) throw errors.notFound('Category not found');
  const active = ctx.db.items.filter((i) => i.categoryId === id && !i.isDeleted).length;
  if (active > 0) throw errors.business(`Category has ${active} active items. Move or delete them first.`);
  c.isDeleted = true; c.isActive = false;
  audit(ctx, 'CATEGORY_DELETED', 'MENU_CATEGORIES', id);
  ctx.emit('menu', 'category.deleted', id);
  return null;
}

export function reorderCategories(ctx: Ctx, orderedIds: number[]): MenuCategory[] {
  assertPermission(ctx, 'menu:manage');
  orderedIds.forEach((id, i) => { const c = ctx.db.categories.find((x) => x.id === id); if (c) c.displayOrder = i + 1; });
  ctx.emit('menu', 'category.reordered');
  return listCategories(ctx, true);
}

// ------------------------------------------------------------ items
export function listItems(ctx: Ctx, q: { categoryId?: number; search?: string; prepLocation?: PrepLocation; includeInactive?: boolean }, requirePerm = true): MenuItem[] {
  if (requirePerm) assertPermission(ctx, 'menu:view');
  const s = (q.search ?? '').toLowerCase();
  return ctx.db.items
    .filter((i) => !i.isDeleted && i.branchId === ctx.branchId && (q.includeInactive || i.isActive))
    .filter((i) => !q.categoryId || i.categoryId === Number(q.categoryId))
    .filter((i) => !q.prepLocation || i.prepLocation === q.prepLocation)
    .filter((i) => !s || i.name.toLowerCase().includes(s) || i.code.toLowerCase().includes(s))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
    .map((i) => {
      const bs = ctx.db.p2.bottleService.find((b) => b.menuItemId === i.id && b.isActive);
      return { ...clone(i), categoryName: ctx.db.categories.find((c) => c.id === i.categoryId)?.name, isBottleService: !!bs, bottleSizeMl: bs?.bottleSizeMl ?? null };
    });
}

export function saveItem(ctx: Ctx, id: number | null, body: MenuItemInput): MenuItem {
  assertPermission(ctx, 'menu:manage');
  const name = String(body.name ?? '').trim();
  const price = Number(body.price);
  if (!name) throw errors.validation('Item name is required', 'name');
  if (!Number.isFinite(price) || price < 0) throw errors.validation('Price must be zero or positive', 'price');
  if (!['KITCHEN', 'BAR'].includes(body.prepLocation)) throw errors.validation('Preparation location must be KITCHEN or BAR', 'prepLocation');
  if (!ctx.db.categories.some((c) => c.id === Number(body.categoryId) && !c.isDeleted && c.branchId === ctx.branchId)) throw errors.validation('Category is invalid', 'categoryId');
  if (!ctx.db.taxGroups.some((t) => t.id === Number(body.taxGroupId) && t.isActive)) throw errors.validation('Tax group is invalid', 'taxGroupId');
  const code = (body.code?.trim() || `ITM-${Date.now().toString(36).toUpperCase()}`);
  if (ctx.db.items.some((i) => !i.isDeleted && i.id !== id && i.branchId === ctx.branchId && i.code.toLowerCase() === code.toLowerCase())) throw errors.conflict('Item code already exists');

  let it: MenuItem;
  if (id == null) {
    it = { id: nextId(ctx.db, 'item'), branchId: ctx.branchId, categoryId: Number(body.categoryId), code, name, description: body.description ?? null, imageUrl: body.imageUrl ?? null, price, prepLocation: body.prepLocation, taxGroupId: Number(body.taxGroupId), isVeg: !!body.isVeg, isPopular: !!body.isPopular, isAvailable: body.isAvailable ?? true, isActive: body.isActive ?? true, isDeleted: false, displayOrder: body.displayOrder ?? 0, tags: body.tags ?? null, createdAt: now(), updatedAt: null };
    ctx.db.items.push(it);
    ctx.db.priceHistory.push({ itemId: it.id, price, from: now(), to: null });
    audit(ctx, 'ITEM_CREATED', 'MENU_ITEMS', it.id, null, body);
  } else {
    const found = ctx.db.items.find((x) => x.id === id && !x.isDeleted);
    if (!found) throw errors.notFound('Menu item not found');
    if (found.price !== price) {
      const open = ctx.db.priceHistory.find((p) => p.itemId === id && !p.to);
      if (open) open.to = now();
      ctx.db.priceHistory.push({ itemId: id, price, from: now(), to: null });
      audit(ctx, 'MENU_PRICE_CHANGED', 'MENU_ITEMS', id, String(found.price), String(price));
    }
    Object.assign(found, { categoryId: Number(body.categoryId), code, name, description: body.description ?? null, imageUrl: body.imageUrl ?? null, price, prepLocation: body.prepLocation, taxGroupId: Number(body.taxGroupId), isVeg: !!body.isVeg, isPopular: !!body.isPopular, isAvailable: body.isAvailable ?? true, isActive: body.isActive ?? true, displayOrder: body.displayOrder ?? found.displayOrder, tags: body.tags ?? null, updatedAt: now() });
    it = found;
    audit(ctx, 'ITEM_UPDATED', 'MENU_ITEMS', it.id, null, body);
  }
  ctx.emit('menu', 'item.saved', it.id);
  return { ...clone(it), categoryName: ctx.db.categories.find((c) => c.id === it.categoryId)?.name };
}

export function deleteItem(ctx: Ctx, id: number): null {
  assertPermission(ctx, 'menu:manage');
  const it = ctx.db.items.find((x) => x.id === id && !x.isDeleted);
  if (!it) throw errors.notFound('Menu item not found');
  // soft delete: historical ORDER_ITEMS keep their name/price snapshot
  it.isDeleted = true; it.isActive = false; it.isAvailable = false; it.updatedAt = now();
  audit(ctx, 'ITEM_DELETED', 'MENU_ITEMS', id);
  ctx.emit('menu', 'item.deleted', id);
  return null;
}

export function setAvailability(ctx: Ctx, id: number, isAvailable: boolean): MenuItem {
  assertPermission(ctx, 'menu:availability');
  const it = ctx.db.items.find((x) => x.id === id && !x.isDeleted);
  if (!it) throw errors.notFound('Menu item not found');
  it.isAvailable = !!isAvailable; it.updatedAt = now();
  audit(ctx, 'ITEM_AVAILABILITY', 'MENU_ITEMS', id, null, isAvailable ? 'Y' : 'N');
  ctx.emit('menu', 'item.availability', id);
  return clone(it);
}

// ------------------------------------------------------------ taxes
export function listTaxGroups(ctx: Ctx, requirePerm = true): TaxGroup[] {
  if (requirePerm) assertPermission(ctx, 'settings:view');
  return clone(ctx.db.taxGroups);
}

export function saveTaxGroup(ctx: Ctx, id: number | null, body: TaxGroupInput): TaxGroup[] {
  assertPermission(ctx, 'settings:manage');
  const code = String(body.code ?? '').trim().toUpperCase();
  if (!code) throw errors.validation('Tax code is required', 'code');
  if (!body.name?.trim()) throw errors.validation('Tax name is required', 'name');
  const rates = (body.rates ?? []).map((r) => ({ code: String(r.code).toUpperCase(), name: r.name, percent: Number(r.percent) }));
  if (rates.some((r) => !Number.isFinite(r.percent) || r.percent < 0)) throw errors.validation('Tax rate cannot be negative', 'rates');
  if (ctx.db.taxGroups.some((t) => t.code === code && t.id !== id)) throw errors.conflict('Tax code already exists');
  const totalPercent = rates.reduce((a, r) => a + r.percent, 0);
  if (id == null) ctx.db.taxGroups.push({ id: nextId(ctx.db, 'taxGroup'), code, name: body.name, isActive: body.isActive ?? true, totalPercent, rates });
  else {
    const t = ctx.db.taxGroups.find((x) => x.id === id);
    if (!t) throw errors.notFound('Tax group not found');
    Object.assign(t, { code, name: body.name, isActive: body.isActive ?? true, totalPercent, rates });
  }
  audit(ctx, 'TAX_CONFIG_SAVED', 'TAX_CONFIGURATIONS', id, null, body);
  return clone(ctx.db.taxGroups);
}

// ------------------------------------------------------------ offers
function withActive(o: Offer): Offer { return { ...clone(o), isCurrentlyActive: isOfferCurrentlyActive(o) }; }

export function listOffers(ctx: Ctx, includeInactive = false, onlyCurrent = false, requirePerm = true): Offer[] {
  if (requirePerm) assertPermission(ctx, 'offers:view');
  return ctx.db.offers
    .filter((o) => !o.isDeleted && (includeInactive || o.isActive))
    .map(withActive)
    .filter((o) => !onlyCurrent || o.isCurrentlyActive)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name));
}

export function saveOffer(ctx: Ctx, id: number | null, body: OfferInput): Offer {
  assertPermission(ctx, 'offers:manage');
  if (!body.name?.trim()) throw errors.validation('Offer name is required', 'name');
  if (!['PERCENTAGE', 'FLAT', 'BOGO', 'COMBO', 'HAPPY_HOUR'].includes(body.offerType)) throw errors.validation('Invalid offer type', 'offerType');
  const v = Number(body.discountValue ?? 0);
  if (['PERCENTAGE', 'HAPPY_HOUR'].includes(body.offerType) && (v <= 0 || v > 100)) throw errors.validation('Percentage must be between 1 and 100', 'discountValue');
  if (['FLAT', 'COMBO'].includes(body.offerType) && v <= 0) throw errors.validation('Discount value must be positive', 'discountValue');
  if (!body.startDate || !body.endDate || body.endDate < body.startDate) throw errors.validation('End date must be on or after start date', 'endDate');
  if (body.startTime && body.endTime && body.endTime < body.startTime) throw errors.validation('End time must be after start time', 'endTime');
  if (body.appliesTo === 'CATEGORIES' && !body.categoryIds?.length) throw errors.validation('Select at least one category', 'categoryIds');
  if (body.appliesTo === 'ITEMS' && !body.itemIds?.length) throw errors.validation('Select at least one item', 'itemIds');
  const data = { name: body.name.trim(), description: body.description ?? null, offerType: body.offerType, discountValue: v, maxDiscountAmount: body.maxDiscountAmount ?? null, appliesTo: body.appliesTo ?? 'ALL', categoryIds: body.appliesTo === 'CATEGORIES' ? body.categoryIds : [], itemIds: body.appliesTo === 'ITEMS' ? body.itemIds : [], startDate: body.startDate, endDate: body.endDate, startTime: body.startTime || null, endTime: body.endTime || null, daysOfWeek: body.daysOfWeek ?? [], isActive: body.isActive ?? true };
  let o: Offer & { isDeleted: boolean };
  if (id == null) {
    o = { id: nextId(ctx.db, 'offer'), branchId: ctx.branchId, ...data, isCurrentlyActive: false, isDeleted: false, createdAt: now() };
    ctx.db.offers.push(o);
    audit(ctx, 'OFFER_CREATED', 'OFFERS', o.id, null, body);
  } else {
    const found = ctx.db.offers.find((x) => x.id === id && !x.isDeleted);
    if (!found) throw errors.notFound('Offer not found');
    Object.assign(found, data);
    o = found;
    audit(ctx, 'OFFER_UPDATED', 'OFFERS', o.id, null, body);
  }
  ctx.emit('menu', 'offer.saved', o.id);
  return withActive(o);
}

export function deleteOffer(ctx: Ctx, id: number): null {
  assertPermission(ctx, 'offers:manage');
  const o = ctx.db.offers.find((x) => x.id === id && !x.isDeleted);
  if (!o) throw errors.notFound('Offer not found');
  o.isDeleted = true; o.isActive = false;
  audit(ctx, 'OFFER_DELETED', 'OFFERS', id);
  ctx.emit('menu', 'offer.deleted', id);
  return null;
}

// ------------------------------------------------------------ public
export function publicMenu(ctx: Ctx, branchCode: string, tableCode: string): PublicMenu {
  const b = [ctx.db.branch, ...ctx.db.p2.branches].find((x) => x.code.toLowerCase() === String(branchCode).toLowerCase());
  const t = b ? ctx.db.tables.find((x) => x.publicCode === tableCode && !x.isDeleted && x.isActive && x.branchId === b.id) : undefined;
  if (!b || !t) throw errors.notFound('This QR code is not valid or the table is no longer in service. Please ask our staff for help.');
  ctx.branchId = b.id;   // public menu is scoped to the branch encoded in the QR URL
  const categories = listCategories(ctx, false, false);
  const activeCat = new Set(categories.map((c) => c.id));
  const items = listItems(ctx, {}, false).filter((i) => activeCat.has(i.categoryId));
  return {
    business: { name: b.businessName, branchName: b.name, logoUrl: b.logoUrl, address: [b.address, b.city].filter(Boolean).join(', '), phone: b.phone, welcomeMessage: b.welcomeMessage, currency: b.currency, serviceChargePercent: b.serviceChargePercent },
    branchCode: b.code,
    table: { publicCode: t.publicCode, number: t.number, name: t.name, floorName: t.floorName },
    categories,
    items,
    offers: listOffers(ctx, false, true, false),
  };
}
