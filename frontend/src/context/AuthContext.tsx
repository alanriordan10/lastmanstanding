import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { storeAuthTokens, clearAuthTokens, setAuthFailureHandler } from '../api';
import type { AuthResponse } from '../types';

interface AuthContextType {
  user: AuthResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  loginWithToken: (token: string) => Promise<void>;
  loginWithData: (data: AuthResponse) => void;
  markClubAdminRevoked: () => void;
  signup: (email: string, username: string, password: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isClubAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type StoredUser = Omit<AuthResponse, 'accessToken' | 'refreshToken'>;

function stripTokens(data: AuthResponse): StoredUser {
  const { accessToken, refreshToken, ...rest } = data;
  return rest;
}

function persistTokens(data: AuthResponse) {
  storeAuthTokens(data.accessToken, data.refreshToken);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clubAdminRevoked, setClubAdminRevoked] = useState(() => localStorage.getItem('clubAdminRevoked') === '1');

  const clearLocalSession = useCallback(() => {
    clearAuthTokens();
    localStorage.removeItem('user');
    localStorage.removeItem('clubAdminRevoked');
    setClubAdminRevoked(false);
    setUser(null);
  }, []);

  const redirectToLogin = useCallback((reason: string = 'session_expired') => {
    if (typeof window === 'undefined') return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const returnTo = currentPath && currentPath !== '/login' ? `&returnTo=${encodeURIComponent(currentPath)}` : '';
    window.location.replace(`/login?error=${encodeURIComponent(reason)}${returnTo}`);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('user');

    if (stored) {
      try {
        const userData = JSON.parse(stored) as StoredUser;
        setUser(userData as AuthResponse);

        api.get<AuthResponse>('/auth/me', { _skipAuthRedirect: true } as any)
          .then(({ data }) => {
            persistUser(data);
          })
          .catch((err) => {
            const status = err?.response?.status;
            if (status === 401 || status === 403) {
              // Cookie is stale or invalid — clear the cached user and send
              // the user back to sign in rather than leaving them on a
              // logged-out public page that still looks authenticated.
              handleAuthFailure();
            }
          })
          .finally(() => setIsLoading(false));
        return;
      } catch {
        clearAuthTokens();
        localStorage.removeItem('user');
        localStorage.removeItem('clubAdminRevoked');
      }
    }
    setIsLoading(false);
  }, []);

  const persistUser = (data: AuthResponse) => {
    const cleaned = stripTokens(data);
    localStorage.setItem('user', JSON.stringify(cleaned));
    localStorage.removeItem('clubAdminRevoked');
    setClubAdminRevoked(false);
    setUser(cleaned as AuthResponse);
  };

  const markClubAdminRevoked = useCallback(() => {
    localStorage.setItem('clubAdminRevoked', '1');
    setClubAdminRevoked(true);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    persistTokens(data);
    persistUser(data);
    return data;
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    localStorage.setItem('accessToken', token);
    const { data } = await api.get<AuthResponse>('/auth/me');
    persistTokens(data);
    persistUser(data);
  }, []);

  const loginWithData = useCallback((data: AuthResponse) => {
    persistTokens(data);
    persistUser(data);
  }, []);

  const signup = useCallback(async (email: string, username: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/signup', { email, username, password });
    persistTokens(data);
    persistUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    // Clear local state synchronously so the UI updates immediately — the
    // server-side logout is best-effort and may take longer (or fail).
    clearAuthTokens();
    localStorage.removeItem('user');
    localStorage.removeItem('clubAdminRevoked');
    setClubAdminRevoked(false);
    setUser(null);
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore — local state is already cleared
    }
  }, []);

  const handleAuthFailure = useCallback(() => {
    clearLocalSession();
    redirectToLogin();
  }, [clearLocalSession, redirectToLogin]);

  useEffect(() => {
    setAuthFailureHandler(handleAuthFailure);
    return () => setAuthFailureHandler(null);
  }, [handleAuthFailure]);

  const isAdmin = user?.role === 'ADMIN';
  const isClubAdmin = user?.role === 'CLUB_ADMIN' && !clubAdminRevoked;

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithToken, loginWithData, markClubAdminRevoked, signup, logout, isAdmin, isClubAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}