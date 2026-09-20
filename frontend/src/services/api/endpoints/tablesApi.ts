import { api } from '..';
import type { ID, Floor, FloorInput, DiningTable, TableInput, TableStatus, Branch, BranchInput } from '@/types';

export const floorsApi = {
  list: () => api().get<Floor[]>('/floors'),
  create: (body: FloorInput) => api().post<Floor>('/floors', body),
  update: (id: ID, body: FloorInput) => api().put<Floor>(`/floors/${id}`, body),
  remove: (id: ID) => api().delete<null>(`/floors/${id}`),
};

export const tablesApi = {
  list: (params?: { floorId?: ID; status?: TableStatus; search?: string; waiterId?: ID }) => api().get<DiningTable[]>('/tables', params),
  get: (id: ID) => api().get<DiningTable>(`/tables/${id}`),
  create: (body: TableInput) => api().post<DiningTable>('/tables', body),
  update: (id: ID, body: TableInput) => api().put<DiningTable>(`/tables/${id}`, body),
  remove: (id: ID) => api().delete<null>(`/tables/${id}`),
  overrideStatus: (id: ID, status: TableStatus, reason: string) => api().put<DiningTable>(`/tables/${id}/status`, { status, reason }),
  assignWaiter: (id: ID, waiterId: ID | null) => api().put<DiningTable>(`/tables/${id}/assign`, { waiterId }),
  regenerateQr: (id: ID) => api().post<DiningTable>(`/tables/${id}/regenerate-qr`),
};

export const branchApi = {
  current: () => api().get<Branch>('/branches/current'),
  update: (body: BranchInput) => api().put<Branch>('/branches/current', body),
};
