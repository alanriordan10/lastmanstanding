const CACHE_NAME = 'lms-v2';

// Only cache these specific static files on install
const STATIC_ASSETS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ── Never intercept these ──────────────────────────────────────────
  // 1. Non-GET requests (POST, PUT, DELETE etc.)
  if (event.request.method !== 'GET') return;

  // 2. Vite dev server HMR / websocket
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules')) return;

  // 3. API calls — let them go straight to network
  if (
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/club-admin/') ||
    url.pathname.startsWith('/competitions/') ||
    url.pathname.startsWith('/notifications/') ||
    url.pathname.startsWith('/competitions') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/club-admin')
  ) {
    // Only skip if this looks like an API call (same origin, not a page navigation)
    if (event.request.mode !== 'navigate') return;
  }

  // 4. Cross-origin requests — don't touch
  if (url.origin !== self.location.origin) return;

  // ── SPA navigation — always fetch from network, fall back to / ────
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful HTML responses
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/index.html', clone));
          }
          return response;
        })
        .catch(() =>
          // Offline fallback — serve cached index.html for SPA routing
          caches.match('/index.html').then((cached) => cached ?? caches.match('/'))
        )
    );
    return;
  }

  // ── Static assets (JS, CSS, images) — cache first, network fallback ─
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else — plain network request, no caching
});

// ── Push notifications ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? 'Last Man Standing';
  const options = {
    body: data.body ?? 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag ?? 'lms-notification',
    data: { url: data.url ?? '/' },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
      } else {
        clients.openWindow(url);
      }
    })
  );
});
