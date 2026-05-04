import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000, // 15s timeout — don't hang forever
});

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

// ── JWT helpers ──────────────────────────────────────────────────────────────

/** Returns true if the JWT is missing or will expire within `bufferSeconds`. */
function isTokenExpiredOrExpiringSoon(token: string | null, bufferSeconds = 60): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000; // ms
    return Date.now() >= expiresAt - bufferSeconds * 1000;
  } catch {
    return true; // can't parse → treat as expired
  }
}

// ── Refresh queue ────────────────────────────────────────────────────────────
// While a refresh is in flight, queue other failed requests so they all retry
// with the new token instead of each firing their own refresh.

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

function subscribeToRefresh(cb: (token: string) => void) {
  refreshQueue.push(cb);
}

function resolveRefreshQueue(newToken: string) {
  refreshQueue.forEach((cb) => cb(newToken));
  refreshQueue = [];
}

function rejectRefreshQueue() {
  refreshQueue = [];
}

// ── Perform a token refresh ──────────────────────────────────────────────────
async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');

  const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data));
  return data.accessToken;
}

// ── Clear session and redirect ───────────────────────────────────────────────
function forceLogout(message = 'Your session has expired. Please login again.') {
  localStorage.clear();
  broadcastLogout();
  const isOnAuthPage = window.location.pathname === '/login' || window.location.pathname === '/signup';
  if (!isOnAuthPage) {
    toast.error(message, { duration: 4000 });
    window.location.href = '/login?error=session_expired';
  }
}

// ── Request interceptor: attach JWT, proactively refresh if near expiry ──────
api.interceptors.request.use(async (config) => {
  let token = localStorage.getItem('accessToken');

  // Proactively refresh if token expires within 60 seconds
  if (token && isTokenExpiredOrExpiringSoon(token, 60)) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken && !isTokenExpiredOrExpiringSoon(refreshToken, 0)) {
      try {
        token = await refreshAccessToken();
      } catch {
        // Refresh failed — let the request go out and handle the 401 in the response interceptor
      }
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor ─────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Network / timeout error (no response from server)
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        toast.error('Request timed out. Please try again.', { duration: 4000 });
      } else {
        toast.error('Network error — please check your connection.', { duration: 4000 });
      }
      return Promise.reject(error);
    }

    const originalRequest = error.config;
    const status = error.response?.status;
    const isOnAuthPage = window.location.pathname === '/login' || window.location.pathname === '/signup';
    const refreshToken = localStorage.getItem('refreshToken');

    // ── 401 Unauthorized: access token expired → refresh ────────────────────
    if (status === 401 && !originalRequest._retry) {
      // No refresh token available: route straight to login.
      if (!refreshToken) {
        if (!isOnAuthPage) {
          forceLogout('Please login to continue.');
        }
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // If a refresh is already in flight, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeToRefresh((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
          // If refresh fails the queue will be cleared and this rejects
          setTimeout(() => reject(error), 10_000);
        });
      }

      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        resolveRefreshQueue(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        isRefreshing = false;
        rejectRefreshQueue();
        forceLogout();
        return Promise.reject(error);
      }
    }

    // ── 403 Forbidden ────────────────────────────────────────────────────────
    // Only treat as a session issue if we have NO access token at all.
    // If we have a valid token and still get 403 it's a genuine permission
    // denial (e.g. admin not a participant) — don't log the user out.
    if (status === 403 && !originalRequest._retry) {
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken && refreshToken) {
        // Access token is missing but we have a refresh token → silent refresh
        originalRequest._retry = true;
        try {
          const newToken = await refreshAccessToken();
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch {
          forceLogout();
          return Promise.reject(error);
        }
      }

      if (!accessToken && !refreshToken && !isOnAuthPage) {
        // Completely unauthenticated
        forceLogout('Please login to continue.');
        return Promise.reject(error);
      }

      // Has token but still 403 → genuine permission denial → let the page handle it
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export default api;
