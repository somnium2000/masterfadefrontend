import { useEffect, useRef, useState } from 'react';

const DEFAULT_RECONNECT_MS = 1500;
const MAX_RECONNECT_MS = 8000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').trim();
  const p = String(path || '').trim();
  if (!base) return p;
  if (!p) return base;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const baseClean = base.replace(/\/+$/, '');
  const pathClean = p.startsWith('/') ? p : `/${p}`;
  return `${baseClean}${pathClean}`;
}

function parseEventPayload(raw) {
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return {};
  }
}

export function formatRealtimeFreshness(lastSignalAt) {
  if (!lastSignalAt) return 'Sin actualizaciones en vivo';
  const now = Date.now();
  const diffSeconds = Math.max(0, Math.floor((now - lastSignalAt.getTime()) / 1000));
  if (diffSeconds <= 15) return 'Actualizado hace unos segundos';
  if (diffSeconds < 60) return `Actualizado hace ${diffSeconds} segundos`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  return `Actualizado hace ${diffMinutes} min`;
}

export default function useSecurityRealtime({
  enabled = true,
  channels = [],
  onSignal = null,
  signalDebounceMs = 400,
  maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
} = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [signalCount, setSignalCount] = useState(0);
  const [lastSignalAt, setLastSignalAt] = useState(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const sourceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(DEFAULT_RECONNECT_MS);
  const debounceTimerRef = useRef(null);
  const pendingSignalRef = useRef(null);
  const handlerRef = useRef(onSignal);
  const debounceMsRef = useRef(Math.max(100, Number(signalDebounceMs || 400)));
  const reconnectFailuresRef = useRef(0);

  useEffect(() => {
    handlerRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    debounceMsRef.current = Math.max(100, Number(signalDebounceMs || 400));
  }, [signalDebounceMs]);

  const channelKey = Array.isArray(channels)
    ? channels
      .filter(Boolean)
      .map((value) => String(value))
      .sort()
      .join('|')
    : '';

  useEffect(() => {
    if (!enabled) return undefined;
    const allowedChannels = new Set(channelKey ? channelKey.split('|').filter(Boolean) : []);
    const reconnectLimit = Math.max(1, Number(maxReconnectAttempts || DEFAULT_MAX_RECONNECT_ATTEMPTS));

    const targetUrl = joinUrl(import.meta.env.VITE_API_URL, '/v1/admin/seguridad/realtime/events');
    let closedManually = false;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }
    function clearDebounceTimer() {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    }

    function closeCurrentSource() {
      const current = sourceRef.current;
      if (current) {
        current.close();
        sourceRef.current = null;
      }
    }

    function scheduleReconnect() {
      clearReconnectTimer();
      if (closedManually) return;
      if (reconnectFailuresRef.current >= reconnectLimit) {
        setIsUnavailable(true);
        return;
      }
      const delay = reconnectDelayRef.current;
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
      reconnectDelayRef.current = Math.min(MAX_RECONNECT_MS, delay * 2);
    }

    function handleSignal(eventName, payload) {
      if (allowedChannels.size && !allowedChannels.has(eventName)) return;
      setSignalCount((prev) => prev + 1);
      setLastSignalAt(new Date());
      if (typeof handlerRef.current === 'function') {
        pendingSignalRef.current = { event: eventName, payload };
        clearDebounceTimer();
        debounceTimerRef.current = setTimeout(() => {
          const signal = pendingSignalRef.current;
          pendingSignalRef.current = null;
          if (signal && typeof handlerRef.current === 'function') {
            handlerRef.current(signal);
          }
        }, debounceMsRef.current);
      }
    }

    function connect() {
      closeCurrentSource();
      clearReconnectTimer();

      const source = new EventSource(targetUrl, { withCredentials: true });
      sourceRef.current = source;

      source.onopen = () => {
        setIsConnected(true);
        setIsUnavailable(false);
        reconnectDelayRef.current = DEFAULT_RECONNECT_MS;
        reconnectFailuresRef.current = 0;
      };

      source.addEventListener('security.sessions.changed', (event) => {
        handleSignal('security.sessions.changed', parseEventPayload(event.data));
      });

      source.addEventListener('security.alerts.changed', (event) => {
        handleSignal('security.alerts.changed', parseEventPayload(event.data));
      });

      source.addEventListener('ping', () => {
        // noop: heartbeat para mantener vivo el stream sin disparar refetch.
      });

      source.onerror = () => {
        setIsConnected(false);
        reconnectFailuresRef.current += 1;
        closeCurrentSource();
        scheduleReconnect();
      };
    }

    reconnectFailuresRef.current = 0;
    connect();

    return () => {
      closedManually = true;
      setIsConnected(false);
      reconnectFailuresRef.current = 0;
      clearReconnectTimer();
      clearDebounceTimer();
      closeCurrentSource();
    };
  }, [enabled, channelKey, maxReconnectAttempts]);

  return {
    isConnected,
    isUnavailable,
    signalCount,
    lastSignalAt,
    freshnessLabel: formatRealtimeFreshness(lastSignalAt),
  };
}
