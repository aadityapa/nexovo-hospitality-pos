import { api } from '..';
import type { ID, User, UserInput, Role, PermissionDef, AuditLog, Paginated, Approver, StaffMember } from '@/types';
import type { Permission } from '@/config/permissions';

export const usersApi = {
  list: (params?: { search?: string; role?: string; status?: 'ACTIVE' | 'INACTIVE' }) => api().get<User[]>('/users', params),
  /** Users who may approve cancellations/discounts — available to every authenticated staff member. */
  approvers: () => api().get<Approver[]>('/users/approvers'),
  /** Active staff of the current branch (optionally filtered by role; managers/admins always included) — any authenticated user. */
  staff: (role?: string) => api().get<StaffMember[]>('/users/staff', role ? { role } : undefined),
  create: (body: UserInput) => api().post<User>('/users', body),
  update: (id: ID, body: UserInput) => api().put<User>(`/users/${id}`, body),
  setStatus: (id: ID, isActive: boolean) => api().put<User>(`/users/${id}/status`, { isActive }),
  setPassword: (id: ID, password: string) => api().put<null>(`/users/${id}/password`, { password }),
};

export const rolesApi = {
  list: () => api().get<Role[]>('/roles'),
  permissions: () => api().get<PermissionDef[]>('/permissions'),
  update: (id: ID, body: { permissions: Permission[]; maxDiscountPercent: number }) => api().put<Role[]>(`/roles/${id}`, body),
};

export const auditApi = {
  list: (params?: { entity?: string; from?: string; to?: string; page?: number; pageSize?: number }) => api().get<Paginated<AuditLog>>('/audit-logs', params),
};
