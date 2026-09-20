import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menuApi, taxApi, offersApi } from '@/services/api/endpoints';
import { toast } from '@/store/uiStore';
import type { ID, CategoryInput, MenuItemInput, OfferInput, PrepLocation, TaxGroupInput } from '@/types';

export const menuKeys = {
  categories: (inactive: boolean) => ['menu', 'categories', inactive] as const,
  items: (p: object) => ['menu', 'items', p] as const,
  taxes: ['settings', 'taxes'] as const,
  offers: (inactive: boolean) => ['offers', inactive] as const,
};

export function useCategories(includeInactive = false) {
  return useQuery({ queryKey: menuKeys.categories(includeInactive), queryFn: () => menuApi.categories(includeInactive), staleTime: 60_000 });
}
export function useMenuItems(params: { categoryId?: ID; search?: string; prepLocation?: PrepLocation; includeInactive?: boolean } = {}) {
  return useQuery({ queryKey: menuKeys.items(params), queryFn: () => menuApi.items(params), staleTime: 30_000 });
}
export function useTaxGroups() {
  return useQuery({ queryKey: menuKeys.taxes, queryFn: taxApi.list, staleTime: 5 * 60_000 });
}
export function useOffers(includeInactive = false) {
  return useQuery({ queryKey: menuKeys.offers(includeInactive), queryFn: () => offersApi.list(includeInactive), staleTime: 30_000 });
}

function useInvalidate(keys: string[][]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
}

export function useCategoryMutations() {
  const inv = useInvalidate([['menu'], ['public-menu']]);
  const save = useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: CategoryInput }) => (id == null ? menuApi.createCategory(body) : menuApi.updateCategory(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Category created' : 'Category updated'); } });
  const remove = useMutation({ mutationFn: (id: ID) => menuApi.deleteCategory(id), onSuccess: () => { inv(); toast.success('Category deleted'); } });
  const reorder = useMutation({ mutationFn: (ids: ID[]) => menuApi.reorderCategories(ids), onSuccess: inv });
  return { save, remove, reorder };
}

export function useItemMutations() {
  const inv = useInvalidate([['menu'], ['public-menu']]);
  const save = useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: MenuItemInput }) => (id == null ? menuApi.createItem(body) : menuApi.updateItem(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Item created' : 'Item updated'); } });
  const remove = useMutation({ mutationFn: (id: ID) => menuApi.deleteItem(id), onSuccess: () => { inv(); toast.success('Item deleted'); } });
  const availability = useMutation({ mutationFn: ({ id, isAvailable }: { id: ID; isAvailable: boolean }) => menuApi.setAvailability(id, isAvailable), onSuccess: (d) => { inv(); toast.success(d.isAvailable ? `${d.name} is available` : `${d.name} marked unavailable`); } });
  return { save, remove, availability };
}

export function useOfferMutations() {
  const inv = useInvalidate([['offers'], ['public-menu']]);
  const save = useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: OfferInput }) => (id == null ? offersApi.create(body) : offersApi.update(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Offer created' : 'Offer updated'); } });
  const remove = useMutation({ mutationFn: (id: ID) => offersApi.remove(id), onSuccess: () => { inv(); toast.success('Offer deleted'); } });
  return { save, remove };
}

export function useTaxMutations() {
  const inv = useInvalidate([['settings']]);
  return useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: TaxGroupInput }) => (id == null ? taxApi.create(body) : taxApi.update(id, body)), onSuccess: () => { inv(); toast.success('Tax configuration saved'); } });
}
