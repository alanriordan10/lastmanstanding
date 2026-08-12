import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';
import type { AuthResponse } from '../types';

interface AuthContextType {
  user: AuthResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  loginWithData: (data: AuthResponse) => void;
  markClubAdminRevoked: () => void;
  signup: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isClubAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clubAdminRevoked, setClubAdminRevoked] = useState(() => localStorage.getItem('clubAdminRevoked') === '1');

  // Load user from localStorage on mount, then validate + refresh role from server
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const stored = localStorage.getItem('user');

    if (token && stored) {
      try {
        const userData = JSON.parse(stored);
        setUser(userData); // set immediately from cache so UI doesn't flash

        // Check if JWT is expired
        try {
          const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.exp && Date.now() >= payload.exp * 1000) {
            localStorage.clear();
            setUser(null);
            setIsLoading(false);
            return;
          }
        } catch {
          localStorage.clear();
          setUser(null);
          setIsLoading(false);
          return;
        }

        // Refresh role from server — picks up any role changes made since last login
        api.get<AuthResponse>('/auth/me')
          .then(({ data }) => {
            persistUser(data);
          })
          .catch(() => {
            // If /auth/me fails (e.g. token revoked), keep cached user — they'll get errors on next API call
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
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data));
    localStorage.removeItem('clubAdminRevoked');
    setClubAdminRevoked(false);
    setUser(data);
  };

  const markClubAdminRevoked = useCallback(() => {
    localStorage.setItem('clubAdminRevoked', '1');
    setClubAdminRevoked(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    persistUser(data);
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    localStorage.setItem('accessToken', token);
    const { data } = await api.get<AuthResponse>('/auth/me');
    persistUser(data);
  }, []);

  const loginWithData = useCallback((data: AuthResponse) => {
    persistUser(data);
  }, []);

  const signup = useCallback(async (email: string, username: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/signup', { email, username, password });
    persistUser(data);
  }, []);

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => {});
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
