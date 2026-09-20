import { api } from '..';
import type { ID, MenuCategory, CategoryInput, MenuItem, MenuItemInput, PublicMenu, TaxGroup, TaxGroupInput, Offer, OfferInput, PrepLocation } from '@/types';

export const menuApi = {
  categories: (includeInactive = false) => api().get<MenuCategory[]>('/menu/categories', { includeInactive }),
  createCategory: (body: CategoryInput) => api().post<MenuCategory>('/menu/categories', body),
  updateCategory: (id: ID, body: CategoryInput) => api().put<MenuCategory>(`/menu/categories/${id}`, body),
  deleteCategory: (id: ID) => api().delete<null>(`/menu/categories/${id}`),
  reorderCategories: (orderedIds: ID[]) => api().put<MenuCategory[]>('/menu/categories/reorder', { orderedIds }),

  items: (params?: { categoryId?: ID; search?: string; prepLocation?: PrepLocation; includeInactive?: boolean }) => api().get<MenuItem[]>('/menu/items', params),
  createItem: (body: MenuItemInput) => api().post<MenuItem>('/menu/items', body),
  updateItem: (id: ID, body: MenuItemInput) => api().put<MenuItem>(`/menu/items/${id}`, body),
  deleteItem: (id: ID) => api().delete<null>(`/menu/items/${id}`),
  setAvailability: (id: ID, isAvailable: boolean) => api().put<MenuItem>(`/menu/items/${id}/availability`, { isAvailable }),
};

export const publicApi = {
  menu: (branchCode: string, tableCode: string) => api().get<PublicMenu>(`/public/menu/${branchCode}/${tableCode}`),
};

export const taxApi = {
  list: () => api().get<TaxGroup[]>('/settings/taxes'),
  create: (body: TaxGroupInput) => api().post<TaxGroup[]>('/settings/taxes', body),
  update: (id: ID, body: TaxGroupInput) => api().put<TaxGroup[]>(`/settings/taxes/${id}`, body),
};

export const offersApi = {
  list: (includeInactive = false) => api().get<Offer[]>('/offers', { includeInactive }),
  create: (body: OfferInput) => api().post<Offer>('/offers', body),
  update: (id: ID, body: OfferInput) => api().put<Offer>(`/offers/${id}`, body),
  remove: (id: ID) => api().delete<null>(`/offers/${id}`),
};
