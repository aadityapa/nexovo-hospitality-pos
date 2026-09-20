import type { ID } from './common';

export type OfferType = 'PERCENTAGE' | 'FLAT' | 'BOGO' | 'COMBO' | 'HAPPY_HOUR';
export type OfferAppliesTo = 'ALL' | 'CATEGORIES' | 'ITEMS';

export interface Offer {
  id: ID;
  branchId: ID;
  name: string;
  description?: string | null;
  offerType: OfferType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  appliesTo: OfferAppliesTo;
  categoryIds: ID[];
  itemIds: ID[];
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /** HH:mm */
  startTime?: string | null;
  endTime?: string | null;
  /** 1 = Monday … 7 = Sunday; empty = every day */
  daysOfWeek: number[];
  isActive: boolean;
  /** computed by backend at request time */
  isCurrentlyActive: boolean;
  createdAt?: string;
}

export interface OfferInput {
  name: string;
  description?: string;
  offerType: OfferType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  appliesTo: OfferAppliesTo;
  categoryIds: ID[];
  itemIds: ID[];
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek: number[];
  isActive: boolean;
}
