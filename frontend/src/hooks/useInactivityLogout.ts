import { useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

const INACTIVE_MS = 30 * 60 * 1000;   // 30 minutes
const WARNING_MS  =  5 * 60 * 1000;   // warn 5 minutes before

interface Options {
  onLogout: () => void;
}

export function useInactivityLogout({ onLogout }: Options) {
  const timer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  const clearTimers = useCallback(() => {
    if (timer.current)     clearTimeout(timer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    toast.dismiss('inactivity-warning');

    // Show warning 5 min before logout
    warnTimer.current = setTimeout(() => {
      toast('⏰  You\'ll be logged out in 5 minutes due to inactivity.', {
        id: 'inactivity-warning',
        duration: WARNING_MS,
        icon: '⚠️',
      });
    }, INACTIVE_MS - WARNING_MS);

    // Actual logout
    timer.current = setTimeout(() => {
      toast.dismiss('inactivity-warning');
      toast.error('You have been logged out due to inactivity.', { duration: 4000 });
      onLogoutRef.current();
    }, INACTIVE_MS);
  }, [clearTimers]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimers();
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [reset, clearTimers]);
}
