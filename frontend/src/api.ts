import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
  withCredentials: true,
});

export function storeAuthTokens(accessToken?: string | null, refreshToken?: string | null) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function getStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

// ── Cross-tab logout via BroadcastChannel ────────────────────────────────────
const logoutChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('lms_auth')
  : null;

logoutChannel?.addEventListener('message', (e) => {
  if (e.data === 'logout') {
    localStorage.clear();
    window.location.href = '/login';
  }
});

function broadcastLogout() {
  logoutChannel?.postMessage('logout');
}

function readCookie(name: string): string | null {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const entry of cookies) {
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const key = entry.substring(0, eq);
    if (key === name) {
      const value = entry.substring(eq + 1);
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

const STATE_CHANGING = new Set(['post', 'put', 'patch', 'delete']);

// ── Request interceptor: attach CSRF token on state-changing requests ──────────
api.interceptors.request.use((config) => {
  const accessToken = getStoredAccessToken();
  if (accessToken && !config.headers?.Authorization) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  if (config.method && STATE_CHANGING.has(config.method.toLowerCase())) {
    const csrf = readCookie('XSRF-TOKEN');
    if (csrf) {
      config.headers['X-XSRF-TOKEN'] = csrf;
    }
  }
  return config;
});

// ── Response interceptor ─
//
// Global handling is intentionally minimal:
//   - 401 outside auth pages → force-logout (session expired / invalid token)
//   - everything else → let the caller show a contextual error via getErrorMessage
//
// We don't show toasts here for 429/403/5xx because the page-level catch handlers
// already do that, and double-toasts are confusing. Pages must call getErrorMessage
// in their catch blocks.

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!error.response) {
      // Network / timeout — page handler will show the message.
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const originalRequest = error.config as any;
    const skipAuthRedirect = Boolean(originalRequest?._skipAuthRedirect);
    const isOnAuthPage =
      window.location.pathname === '/login' || window.location.pathname === '/signup';

    if (status === 401 && !skipAuthRedirect && shouldAttemptRefresh(originalRequest)) {
      try {
        originalRequest._retry = true;
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          clearAuthTokens();
          if (!isOnAuthPage) forceLogout('Your session has expired. Please log in again.');
          return Promise.reject(error);
        }

        if (!originalRequest.headers) originalRequest.headers = {};
        originalRequest.headers.Authorization = `Bearer ${refreshed}`;
        return api(originalRequest);
      } catch {
        clearAuthTokens();
        if (!isOnAuthPage) forceLogout('Your session has expired. Please log in again.');
        return Promise.reject(error);
      }
    }

    if (status === 401 && !skipAuthRedirect && !isOnAuthPage) {
      clearAuthTokens();
      forceLogout('Your session has expired. Please log in again.');
    }

    return Promise.reject(error);
  },
);

function shouldAttemptRefresh(originalRequest: any): boolean {
  if (!originalRequest || originalRequest._retry) return false;
  const url = String(originalRequest.url ?? '');
  if (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout')) {
    return false;
  }
  return Boolean(getStoredRefreshToken());
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  const { data } = await axios.post<RefreshResponse>(
    `${API_BASE}/auth/refresh`,
    { refreshToken },
    {
      withCredentials: true,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    },
  );

  if (!data?.accessToken || !data?.refreshToken) return null;
  storeAuthTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

function forceLogout(message = 'Your session has expired. Please log in again.') {
  localStorage.clear();
  broadcastLogout();
  if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
    toast.error(message, { duration: 4000 });
    window.location.href = '/login?error=session_expired';
  }
}

/**
 * Convert an axios error into a user-friendly message. Use this in every
 * form's catch handler — it covers network errors, timeouts, rate limits,
 * server errors, and falls back to whatever the backend provided.
 */
export function getErrorMessage(err: any, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback;

  // Network / timeout (no response from server)
  if (!err.response) {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return 'The request is taking longer than expected. Please try again in a moment.';
    }
    return 'Cannot reach the server. Check your connection and try again.';
  }

  const status = err.response.status;
  const data = err.response?.data ?? {};
  const serverMessage = data.message || data.error;

  // 429 — rate limit
  if (status === 429) {
    const retryAfter = Number(err.response.headers?.['retry-after']) || 0;
    if (serverMessage) return serverMessage;
    if (retryAfter > 0) return `Too many attempts. Try again in ${formatMinutes(retryAfter)}.`;
    return 'Too many attempts. Please wait a moment and try again.';
  }

  // 401 — session expired
  if (status === 401) {
    return 'Your session has expired. Please log in again.';
  }

  // 403 — permission denied or CSRF
  if (status === 403) {
    if (serverMessage) return serverMessage;
    return "You don't have permission to do that.";
  }

  // 404 — not found
  if (status === 404) {
    return serverMessage || 'The requested item was not found.';
  }

  // 409 — conflict (e.g., username taken, weird races)
  if (status === 409) {
    return serverMessage || 'That conflicts with an existing record.';
  }

  // 422 / 400 — validation errors
  if (status === 400 || status === 422) {
    return serverMessage || 'Please check your input and try again.';
  }

  // 5xx — server error
  if (status >= 500) {
    return 'Something went wrong on our end. Please try again in a moment.';
  }

  // Default — trust the server's message if it gave one
  if (serverMessage) return serverMessage;
  return fallback;
}

function formatMinutes(totalSeconds: number): string {
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes <= 0) {
    const seconds = Math.ceil(totalSeconds);
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export default api;
export { readCookie, formatMinutes };