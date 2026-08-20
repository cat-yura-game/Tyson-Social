import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, setAccessToken } from '../api/client';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  bio: string;
  role: 'user' | 'moderator' | 'admin';
  status: 'pending_email' | 'active' | 'limited';
  emailVerified: boolean;
  verified: boolean;
  usernameChangeAvailable: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  birthdayMonthDay: string | null;
  birthdayYear: number | null;
}

interface Credentials {
  email: string;
  password: string;
}

interface Registration extends Credentials {
  username: string;
  displayName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login(input: Credentials): Promise<void>;
  register(input: Registration): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  switchAccount(accountId: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await apiRequest<{ user: AuthUser | null }>('/auth/session');
      setUser(session.user);
      if (!session.user) setAccessToken(null);
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (input: Credentials) => {
    const session = await apiRequest<{ user: AuthUser; accessToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const register = useCallback(async (input: Registration) => {
    const session = await apiRequest<{ user: AuthUser; accessToken: string }>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const switchAccount = useCallback(async (accountId: string) => {
    const session = await apiRequest<{ user: AuthUser; accessToken: string }>(`/users/me/verified-accounts/${encodeURIComponent(accountId)}/switch`, { method: 'POST' });
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, refresh, switchAccount }), [user, loading, login, register, logout, refresh, switchAccount]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
