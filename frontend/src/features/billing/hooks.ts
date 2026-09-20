import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/services/api/endpoints';
import { toast } from '@/store/uiStore';
import type { ID, BillListParams, AddDiscountRequest, AddPaymentRequest } from '@/types';

export function useBills(params: BillListParams = {}, opts: { refetchInterval?: number } = {}) {
  return useQuery({ queryKey: ['bills', 'list', params], queryFn: () => billingApi.list(params), staleTime: 5_000, ...opts });
}
export function useBill(id: ID | undefined) {
  return useQuery({ queryKey: ['bills', 'one', id], queryFn: () => billingApi.get(id!), enabled: !!id, staleTime: 3_000 });
}
export function useReceipt(id: ID | undefined) {
  return useQuery({ queryKey: ['bills', 'receipt', id], queryFn: () => billingApi.receipt(id!), enabled: !!id });
}

export function useBillMutations() {
  const qc = useQueryClient();
  const inv = () => { void qc.invalidateQueries({ queryKey: ['bills'] }); void qc.invalidateQueries({ queryKey: ['orders'] }); void qc.invalidateQueries({ queryKey: ['tables'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); void qc.invalidateQueries({ queryKey: ['reports'] }); };
  const create = useMutation({ mutationFn: (orderId: ID) => billingApi.create(orderId), onSuccess: inv });
  const addDiscount = useMutation({ mutationFn: ({ id, body }: { id: ID; body: AddDiscountRequest }) => billingApi.addDiscount(id, body), onSuccess: () => { inv(); toast.success('Discount applied'); }, meta: { silent: true } });
  const removeDiscount = useMutation({ mutationFn: ({ id, discountId }: { id: ID; discountId: ID }) => billingApi.removeDiscount(id, discountId), onSuccess: () => { inv(); toast.success('Discount removed'); } });
  const finalize = useMutation({ mutationFn: (id: ID) => billingApi.finalize(id), onSuccess: (b) => { inv(); toast.success('Bill finalized', `${b.billNumber} · ${b.tableName}`); } });
  const addPayment = useMutation({ mutationFn: ({ id, body }: { id: ID; body: AddPaymentRequest }) => billingApi.addPayment(id, body), onSuccess: (b) => { inv(); if (b.paymentStatus === 'PAID') toast.success('Payment completed', b.billNumber); else toast.success('Payment recorded'); }, meta: { silent: true } });
  const reversePayment = useMutation({ mutationFn: ({ id, paymentId, reason }: { id: ID; paymentId: ID; reason: string }) => billingApi.reversePayment(id, paymentId, reason), onSuccess: () => { inv(); toast.success('Payment reversed'); } });
  const close = useMutation({ mutationFn: (id: ID) => billingApi.close(id), onSuccess: (b) => { inv(); toast.success('Order closed', `${b.tableName} is now available`); } });
  return { create, addDiscount, removeDiscount, finalize, addPayment, reversePayment, close };
}
