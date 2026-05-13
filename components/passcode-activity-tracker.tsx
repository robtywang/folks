'use client';

import { useEffect } from 'react';
import { lock, useLockState } from '@/lib/lock';

/**
 * Mounted once in the root layout. While a passcode is set, listens for
 * tab-hidden events and re-locks. Handles both backgrounding and tab close
 * (sessionStorage clears on close anyway, but locking on hide also kills
 * the unlock when the user opens another tab in the same window).
 */
export function PasscodeActivityTracker() {
  const { pinSet } = useLockState();

  useEffect(() => {
    if (!pinSet) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') lock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pinSet]);

  return null;
}
