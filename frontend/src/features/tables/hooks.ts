import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { floorsApi, tablesApi, usersApi } from '@/services/api/endpoints';
import { toast } from '@/store/uiStore';
import type { ID, FloorInput, TableInput, TableStatus } from '@/types';

export function useFloors() {
  return useQuery({ queryKey: ['tables', 'floors'], queryFn: floorsApi.list, staleTime: 60_000 });
}
export function useTables(params: { floorId?: ID; status?: TableStatus; search?: string; waiterId?: ID } = {}) {
  return useQuery({ queryKey: ['tables', 'list', params], queryFn: () => tablesApi.list(params), staleTime: 10_000 });
}
export function useTable(id: ID | undefined) {
  return useQuery({ queryKey: ['tables', 'one', id], queryFn: () => tablesApi.get(id!), enabled: !!id });
}
export function useWaiters() {
  return useQuery({ queryKey: ['users', 'waiters'], queryFn: () => usersApi.list({ role: 'WAITER', status: 'ACTIVE' }), staleTime: 60_000, meta: { silent: true }, retry: false });
}

export function useTableMutations() {
  const qc = useQueryClient();
  const inv = () => { void qc.invalidateQueries({ queryKey: ['tables'] }); void qc.invalidateQueries({ queryKey: ['public-menu'] }); };
  const saveFloor = useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: FloorInput }) => (id == null ? floorsApi.create(body) : floorsApi.update(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Floor created' : 'Floor updated'); } });
  const removeFloor = useMutation({ mutationFn: (id: ID) => floorsApi.remove(id), onSuccess: () => { inv(); toast.success('Floor deleted'); } });
  const saveTable = useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: TableInput }) => (id == null ? tablesApi.create(body) : tablesApi.update(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Table created' : 'Table updated'); } });
  const removeTable = useMutation({ mutationFn: (id: ID) => tablesApi.remove(id), onSuccess: () => { inv(); toast.success('Table deleted'); } });
  const overrideStatus = useMutation({ mutationFn: ({ id, status, reason }: { id: ID; status: TableStatus; reason: string }) => tablesApi.overrideStatus(id, status, reason), onSuccess: () => { inv(); toast.success('Table status updated'); } });
  const assign = useMutation({ mutationFn: ({ id, waiterId }: { id: ID; waiterId: ID | null }) => tablesApi.assignWaiter(id, waiterId), onSuccess: () => { inv(); toast.success('Waiter assignment updated'); } });
  const regenerateQr = useMutation({ mutationFn: (id: ID) => tablesApi.regenerateQr(id), onSuccess: () => { inv(); toast.success('QR code regenerated', 'Old printed codes for this table no longer work.'); } });
  return { saveFloor, removeFloor, saveTable, removeTable, overrideStatus, assign, regenerateQr };
}
