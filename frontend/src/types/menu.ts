import type { ID, PrepLocation } from './common';
import type { Offer } from './offer';

export interface TaxRate {
  code: string;
  name: string;
  percent: number;
}

export interface TaxGroup {
  id: ID;
  code: string;
  name: string;
  isActive: boolean;
  totalPercent: number;
  rates: TaxRate[];
}

export interface TaxGroupInput {
  code: string;
  name: string;
  isActive: boolean;
  rates: TaxRate[];
}

export interface MenuCategory {
  id: ID;
  branchId: ID;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  prepLocation: PrepLocation;
  displayOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: string;
}

export interface CategoryInput {
  name: string;
  description?: string;
  imageUrl?: string;
  prepLocation: PrepLocation;
  displayOrder?: number;
  isActive: boolean;
}

export interface MenuItem {
  id: ID;
  branchId: ID;
  categoryId: ID;
  categoryName?: string;
  code: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  prepLocation: PrepLocation;
  taxGroupId: ID;
  isVeg: boolean;
  isPopular: boolean;
  isAvailable: boolean;
  isActive: boolean;
  isDeleted: boolean;
  displayOrder: number;
  tags?: string | null;
  /** Phase 2 — set when the item is sold as a whole bottle (bottle service). */
  isBottleService?: boolean;
  bottleSizeMl?: number | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface MenuItemInput {
  code?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  categoryId: ID;
  price: number;
  prepLocation: PrepLocation;
  taxGroupId: ID;
  isVeg: boolean;
  isPopular: boolean;
  isAvailable: boolean;
  isActive: boolean;
  displayOrder?: number;
  tags?: string;
}

export interface PublicBusiness {
  name: string;
  branchName: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  welcomeMessage?: string | null;
  currency: string;
  serviceChargePercent: number;
}

export interface PublicTable {
  publicCode: string;
  number: string;
  name: string;
  floorName: string;
}

export interface PublicMenu {
  business: PublicBusiness;
  branchCode: string;
  table: PublicTable;
  categories: MenuCategory[];
  items: MenuItem[];
  offers: Offer[];
}
