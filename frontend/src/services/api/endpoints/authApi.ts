import { api } from '..';
import type { LoginRequest, LoginResponse, User } from '@/types';

export const authApi = {
  login: (body: LoginRequest) => api().post<LoginResponse>('/auth/login', body),
  logout: () => api().post<null>('/auth/logout'),
  me: () => api().get<User>('/auth/me'),
  forgotPassword: (email: string) => api().post<null>('/auth/forgot-password', { email }),
};
