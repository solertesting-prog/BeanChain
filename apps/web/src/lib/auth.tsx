'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, tokens } from './api';
import type { Me } from './types';

interface LoginResult {
  mfaRequired?: boolean;
}

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<LoginResult>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    country: string;
    acceptTerms: boolean;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<Me>('/auth/me'));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        tokens.clear();
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string, mfaCode?: string) => {
      const res = await api<{ accessToken?: string; refreshToken?: string; mfaRequired?: boolean }>('/auth/login', {
        method: 'POST',
        body: { email, password, ...(mfaCode ? { mfaCode } : {}) },
      });
      if (res.mfaRequired) return { mfaRequired: true };
      tokens.set({ accessToken: res.accessToken!, refreshToken: res.refreshToken! });
      await refresh();
      return {};
    },
    [refresh],
  );

  const register = useCallback<AuthState['register']>(
    async (data) => {
      const res = await api<{ accessToken: string; refreshToken: string }>('/auth/register', { method: 'POST', body: data });
      tokens.set(res);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokens.refresh;
    tokens.clear();
    setUser(null);
    if (refreshToken) {
      await api('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => undefined);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, refresh }), [user, loading, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export const isStaff = (u: Me | null) => u?.role === 'ADMIN' || u?.role === 'OPERATOR';
