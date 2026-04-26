import { createElement, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

const LOCAL_BROWSER_ALERTS_KEY = 'lms-browser-alerts-enabled';

export function usePushNotifications() {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const localEnabled = typeof window !== 'undefined' && localStorage.getItem(LOCAL_BROWSER_ALERTS_KEY) === 'true';

    // Check if already subscribed
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub || localEnabled);
        });
      }).catch(() => {
        setIsSubscribed(localEnabled);
      });
      return;
    }

    setIsSubscribed(localEnabled);
  }, []);

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  };

  const subscribe = async (): Promise<boolean> => {
    try {
      const granted = permission === 'granted' || await requestPermission();
      if (!granted) return false;

      localStorage.setItem(LOCAL_BROWSER_ALERTS_KEY, 'true');

      if (!('serviceWorker' in navigator)) {
        setIsSubscribed(true);
        return true;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        // No VAPID key configured — keep browser alerts enabled locally.
        setIsSubscribed(true);
        return true;
      }

      const existingSub = await reg.pushManager.getSubscription();
      const sub = existingSub ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });

      await api.post('/notifications/subscribe', sub.toJSON()).catch(() => {});
      setIsSubscribed(true);
      return true;
    } catch {
      return false;
    }
  };

  const unsubscribe = async () => {
    localStorage.removeItem(LOCAL_BROWSER_ALERTS_KEY);

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await api.delete('/notifications/subscribe').catch(() => {});
      }
    }
    setIsSubscribed(false);
  };

  /** Show a local (non-push) notification immediately */
  const notify = (title: string, body: string, url?: string) => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) {
      showInAppNotification(title, body, url);
      return;
    }

    if (permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'lms',
    });
    if (url) {
      n.onclick = () => {
        window.focus();
        window.location.href = url;
      };
    }
  };

  return { isSupported, permission, isSubscribed, subscribe, unsubscribe, notify };
}

function showInAppNotification(title: string, body: string, url?: string) {
  toast.custom(
    (t) => createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          toast.dismiss(t.id);
          if (url) window.location.href = url;
        },
        className: `pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-brand-500/30 bg-[#111827] text-left shadow-[0_18px_50px_rgba(8,15,30,0.45)] transition-all ${
          t.visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`,
      },
      createElement(
        'div',
        { className: 'bg-gradient-to-r from-brand-600/20 via-brand-500/10 to-transparent px-4 py-3' },
        createElement(
          'div',
          { className: 'flex items-start gap-3' },
          createElement(
            'div',
            { className: 'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-lg font-semibold text-white shadow-lg shadow-brand-500/25' },
            '🏁'
          ),
          createElement(
            'div',
            { className: 'min-w-0 flex-1' },
            createElement(
              'p',
              { className: 'text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-300' },
              'Last Man Standing'
            ),
            createElement(
              'p',
              { className: 'mt-1 text-sm font-semibold text-white' },
              title
            ),
            createElement(
              'p',
              { className: 'mt-1 text-sm leading-5 text-gray-300' },
              body
            ),
          )
        )
      ),
      createElement(
        'div',
        { className: 'flex items-center justify-between gap-3 border-t border-white/5 px-4 py-3' },
        createElement(
          'span',
          { className: 'text-xs font-medium text-gray-400' },
          url ? 'Tap to open' : 'In-app alert'
        ),
        createElement(
          'span',
          { className: 'rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-200' },
          url ? 'View' : 'OK'
        )
      )
    ),
    { duration: 5000, position: 'top-right' }
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
