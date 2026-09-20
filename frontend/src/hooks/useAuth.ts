import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/services/api/endpoints';
import { homeForRoles, primaryRole } from '@/config/roleHome';
import type { LoginRequest } from '@/types';
import type { Permission } from '@/config/permissions';

export function useAuth() {
  const { user, token, setSession, clear, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const login = useCallback(async (req: LoginRequest) => {
    const res = await authApi.login(req);
    setSession({ token: res.token, expiresAt: res.expiresAt, user: res.user, rememberMe: req.rememberMe });
    qc.clear();
    return res.user;
  }, [setSession, qc]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* best effort */ }
    clear();
    qc.clear();
    navigate('/login', { replace: true });
  }, [clear, qc, navigate]);

  return {
    user,
    token,
    isAuthenticated: !!token && !!user,
    role: user ? primaryRole(user.roles) : undefined,
    home: user ? homeForRoles(user.roles) : '/login',
    login,
    logout,
    can: hasPermission,
  };
}

export function usePermission(p: Permission | Permission[], mode: 'any' | 'all' = 'any'): boolean {
  return useAuthStore((s) => s.hasPermission(p, mode));
}
