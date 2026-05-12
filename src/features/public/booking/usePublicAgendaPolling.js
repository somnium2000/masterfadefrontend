import { useEffect, useRef } from 'react';

const DEFAULT_PUBLIC_AGENDA_POLL_INTERVAL_MS = 45000;
const MIN_PUBLIC_AGENDA_POLL_INTERVAL_MS = 15000;

function normalizeIntervalMs(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PUBLIC_AGENDA_POLL_INTERVAL_MS;
  return Math.max(parsed, MIN_PUBLIC_AGENDA_POLL_INTERVAL_MS);
}

export default function usePublicAgendaPolling({
  barberId,
  dateKey,
  enabled = true,
  intervalMs = DEFAULT_PUBLIC_AGENDA_POLL_INTERVAL_MS,
  onInvalidate,
}) {
  const invalidateRef = useRef(onInvalidate);

  useEffect(() => {
    invalidateRef.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    if (!enabled || !barberId || typeof window === 'undefined') return undefined;

    const safeIntervalMs = normalizeIntervalMs(intervalMs);
    let timeoutId = null;
    let stopped = false;

    const invalidate = (reason) => {
      invalidateRef.current?.({
        reason,
        barberId,
        dateKey,
      });
    };

    const scheduleNext = () => {
      if (stopped) return;
      timeoutId = window.setTimeout(() => {
        if (stopped) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          scheduleNext();
          return;
        }
        invalidate('poll');
        scheduleNext();
      }, safeIntervalMs);
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      invalidate('visible');
    };

    scheduleNext();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      stopped = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [barberId, dateKey, enabled, intervalMs]);
}
