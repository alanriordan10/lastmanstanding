import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { storeAuthTokens, clearAuthTokens } from '../api';
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

  useEffect(() => {
    const stored = localStorage.getItem('user');

    if (stored) {
      try {
        const userData = JSON.parse(stored) as StoredUser;
        setUser(userData as AuthResponse);

        api.get<AuthResponse>('/auth/me')
          .then(({ data }) => {
            persistUser(data);
          })
          .catch((err) => {
            const status = err?.response?.status;
            if (status === 401 || status === 403) {
              // Cookie is stale or invalid — clear the cached user so the
              // next render treats them as logged out.
              localStorage.removeItem('user');
              setUser(null);
            }
          })
          .finally(() => setIsLoading(false));
        return;
      } catch {
        localStorage.clear();
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
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore — clear local state regardless
    }
    clearAuthTokens();
    localStorage.clear();
    setClubAdminRevoked(false);
    setUser(null);
  }, []);

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