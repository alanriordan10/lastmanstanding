import { useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

const INACTIVE_MS = 30 * 60 * 1000;   // 30 minutes
const WARNING_MS  =  5 * 60 * 1000;   // warn 5 minutes before

interface Options {
  onLogout: () => void;
}

export function useInactivityLogout({ onLogout }: Options) {
  const timer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnToastId = useRef<string | undefined>(undefined);

  const clearTimers = () => {
    if (timer.current)     clearTimeout(timer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
  };

  const reset = useCallback(() => {
    clearTimers();

    // Dismiss existing warning toast
    if (warnToastId.current) {
      toast.dismiss(warnToastId.current);
      warnToastId.current = undefined;
    }

    // Show warning 5 min before logout
    warnTimer.current = setTimeout(() => {
      warnToastId.current = toast(
        (t) => (
          <div className="flex items-center gap-3">
            <span className="text-2xl">⏰</span>
            <div>
              <p className="font-semibold text-sm">Inactivity warning</p>
              <p className="text-xs text-gray-300 mt-0.5">
                You'll be logged out in 5 minutes due to inactivity.
              </p>
              <button
                onClick={() => { toast.dismiss(t.id); reset(); }}
                className="mt-1.5 text-xs text-brand-400 hover:text-brand-300 underline"
              >
                Stay logged in
              </button>
            </div>
          </div>
        ),
        { duration: WARNING_MS, id: 'inactivity-warning' }
      ) as string;
    }, INACTIVE_MS - WARNING_MS);

    // Actual logout
    timer.current = setTimeout(() => {
      toast.dismiss('inactivity-warning');
      toast.error('You have been logged out due to inactivity.', { duration: 4000 });
      onLogout();
    }, INACTIVE_MS);
  }, [onLogout]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // start the timer immediately

    return () => {
      clearTimers();
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [reset]);
}
