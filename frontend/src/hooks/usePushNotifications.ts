import { useState, useEffect } from 'react';
import api from '../api';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    // Check if already subscribed
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      }).catch(() => {});
    }
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

      const reg = await navigator.serviceWorker.ready;
      // In production, replace with your real VAPID public key from the backend
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        // No VAPID key configured — still allow local notifications
        setIsSubscribed(true);
        return true;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });

      await api.post('/notifications/subscribe', sub.toJSON());
      setIsSubscribed(true);
      return true;
    } catch {
      return false;
    }
  };

  const unsubscribe = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await api.delete('/notifications/subscribe').catch(() => {});
    }
    setIsSubscribed(false);
  };

  /** Show a local (non-push) notification immediately */
  const notify = (title: string, body: string, url?: string) => {
    if (permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      tag: 'lms',
    });
    if (url) n.onclick = () => { window.focus(); window.location.href = url; };
  };

  return { permission, isSubscribed, subscribe, unsubscribe, notify };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
