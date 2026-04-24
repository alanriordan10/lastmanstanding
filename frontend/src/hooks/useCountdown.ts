import { useState, useEffect, useRef } from 'react';

/** Counts down to a target date, returns { days, hours, minutes, seconds, expired } */
export function useCountdown(target: Date | null) {
  const [remaining, setRemaining] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!target) { setRemaining(0); return; }

    const tick = () => {
      const diff = target.getTime() - Date.now();
      setRemaining(Math.max(0, diff));
      if (diff > 0) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target?.getTime()]);

  const totalSeconds = Math.floor(remaining / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const expired = remaining === 0;

  return { days, hours, minutes, seconds, expired, totalSeconds };
}
