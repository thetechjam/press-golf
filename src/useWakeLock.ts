import { useEffect } from 'react';

export const wakeLockSupported =
  typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * Holds a screen wake lock while `enabled` and the page is visible.
 * The browser silently releases the lock whenever the page hides, so it is
 * re-acquired on visibilitychange back to visible. No-ops where unsupported.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !wakeLockSupported) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const s = await navigator.wakeLock.request('screen');
        // Effect may have cleaned up while the request was in flight.
        if (released) {
          void s.release();
          return;
        }
        sentinel = s;
      } catch {
        // request() can reject (e.g. low battery) — scoring works fine without it.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
      sentinel = null;
    };
  }, [enabled]);
}
