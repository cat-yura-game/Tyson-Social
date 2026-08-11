import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../api/client';

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
  createdAt: string;
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await apiRequest<{ user: AuthUser | null }>('/auth/session');
      setUser(session.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (input: Credentials) => {
    const session = await apiRequest<{ user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
    setUser(session.user);
  }, []);

  const register = useCallback(async (input: Registration) => {
    const session = await apiRequest<{ user: AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    await apiRequest('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, refresh }), [user, loading, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
