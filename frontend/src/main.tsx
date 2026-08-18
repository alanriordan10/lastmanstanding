import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

const PUBLIC_AUTH_PATH_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/register-club',
  '/create-club',
];

function isPublicAuthPage(pathname: string): boolean {
  return PUBLIC_AUTH_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on auth errors (401, 403)
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return false;
        }
        return failureCount < 1;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error: any) => {
        // Global mutation error handler - redirect on auth errors
        const status = error?.response?.status;
        if ((status === 401 || status === 403) && !isPublicAuthPage(window.location.pathname)) {
          console.warn('Authentication error in mutation, redirecting to login');
          toast.error('Your session has expired. Please login again.');
          setTimeout(() => {
            localStorage.clear();
            window.location.href = '/login?error=session_expired';
          }, 1500);
        }
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#111a2e', color: '#f3f6ff', border: '1px solid rgba(255,255,255,0.14)' },
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
