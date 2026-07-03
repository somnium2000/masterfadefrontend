import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const CONNECTION_STATES = Object.freeze({
  disabled: 'disabled',
  connecting: 'connecting',
  connected: 'connected',
  reconnecting: 'reconnecting',
  fallbackPolling: 'fallback_polling',
  error: 'error',
});

const DECIMAL_ID_RE = /^(0|[1-9][0-9]*)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 180;
const FALLBACK_AFTER_MS = 12000;
const LAST_EVENT_KEY_PREFIX = 'masterfade:agenda-sse:last-event:';

const RECOGNIZED_REASONS = new Set([
  'hold_created',
  'hold_released',
  'hold_expired',
  'booking_confirmed',
  'booking_cancelled',
  'booking_rescheduled',
  'availability_released',
  'block_changed',
  'branch_schedule_changed',
  'barber_schedule_changed',
  'branch_availability_changed',
  'barber_availability_changed',
  'service_availability_changed',
  'booking_rules_changed',
]);

const RESYNC_REASONS = new Set([
  'history_not_available',
  'invalid_last_event_id',
  'replay_limit_exceeded',
  'client_buffer_overflow',
]);

export function parseAgendaSseEnabled(value, fallback = true) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

function getStorageKey(branchId) {
  return `${LAST_EVENT_KEY_PREFIX}${branchId}`;
}

function readLastEventId(branchId) {
  if (!branchId || typeof window === 'undefined') return '';
  try {
    const value = String(window.sessionStorage.getItem(getStorageKey(branchId)) || '').trim();
    return DECIMAL_ID_RE.test(value) ? value : '';
  } catch {
    return '';
  }
}

function writeLastEventId(branchId, eventId) {
  if (!branchId || !DECIMAL_ID_RE.test(String(eventId || '')) || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getStorageKey(branchId), String(eventId));
  } catch {
    // sessionStorage can be unavailable in privacy modes.
  }
}

function clearLastEventId(branchId) {
  if (!branchId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getStorageKey(branchId));
  } catch {
    // sessionStorage can be unavailable in privacy modes.
  }
}

function compareEventIds(left, right) {
  const a = BigInt(String(left));
  const b = BigInt(String(right));
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function isValidIsoOrNull(value) {
  if (value == null) return true;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed);
}

function normalizeEventPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const eventId = String(raw.id_evento || '').trim();
  const branchId = String(raw.id_sucursal || '').trim();
  const barberValue = raw.id_barbero == null ? null : String(raw.id_barbero || '').trim();
  const dateFrom = raw.fecha_desde == null ? null : String(raw.fecha_desde || '').trim();
  const dateTo = raw.fecha_hasta == null ? null : String(raw.fecha_hasta || '').trim();
  const reason = String(raw.reason || '').trim();
  if (!DECIMAL_ID_RE.test(eventId)) return null;
  if (!UUID_RE.test(branchId)) return null;
  if (barberValue !== null && !UUID_RE.test(barberValue)) return null;
  if (dateFrom !== null && !DATE_RE.test(dateFrom)) return null;
  if (dateTo !== null && !DATE_RE.test(dateTo)) return null;
  if (!isValidIsoOrNull(raw.inicio_at) || !isValidIsoOrNull(raw.fin_at) || !isValidIsoOrNull(raw.occurred_at)) return null;
  if (!RECOGNIZED_REASONS.has(reason)) return null;
  return {
    id_evento: eventId,
    id_sucursal: branchId,
    id_barbero: barberValue,
    fecha_desde: dateFrom,
    fecha_hasta: dateTo,
    inicio_at: raw.inicio_at == null ? null : String(raw.inicio_at),
    fin_at: raw.fin_at == null ? null : String(raw.fin_at),
    reason,
    occurred_at: raw.occurred_at == null ? null : String(raw.occurred_at),
  };
}

function warnInvalidEvent(message) {
  if (!import.meta.env.DEV) return;
  console.warn(`[agenda-sse] ${message}`);
}

function buildEventUrl(branchId, lastEventId) {
  const baseUrl = String(import.meta.env.VITE_API_URL || window.location.origin || '').trim();
  const url = new URL('/v1/public/agenda/eventos', baseUrl);
  url.searchParams.set('id_sucursal', branchId);
  if (lastEventId && DECIMAL_ID_RE.test(lastEventId)) {
    url.searchParams.set('last_event_id', lastEventId);
  }
  return url.toString();
}

function deferStateUpdate(callback) {
  Promise.resolve().then(callback);
}

function groupEvents(events) {
  const grouped = new Map();
  events.forEach((event) => {
    const key = [
      event.id_sucursal,
      event.id_barbero || 'general',
      event.fecha_desde || '',
      event.fecha_hasta || '',
      event.reason,
    ].join('|');
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, event);
      return;
    }
    grouped.set(key, {
      ...current,
      fecha_desde: [current.fecha_desde, event.fecha_desde].filter(Boolean).sort()[0] || null,
      fecha_hasta: [current.fecha_hasta, event.fecha_hasta].filter(Boolean).sort().at(-1) || null,
      inicio_at: current.inicio_at || event.inicio_at,
      fin_at: current.fin_at || event.fin_at,
    });
  });
  return [...grouped.values()];
}

export default function usePublicAgendaEvents({
  enabled = true,
  branchId,
  routeActive,
  onAvailabilityChanged,
  onResyncRequired,
  onConnectionStateChange,
} = {}) {
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.disabled);
  const [lastEventId, setLastEventId] = useState('');
  const [lastEventAt, setLastEventAt] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const sourceRef = useRef(null);
  const generationRef = useRef(0);
  const lastProcessedRef = useRef('');
  const queueRef = useRef([]);
  const flushTimerRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);

  const shouldConnect = Boolean(enabled && routeActive && branchId && typeof window !== 'undefined');

  const setState = useCallback((nextState) => {
    setConnectionState(nextState);
    onConnectionStateChange?.(nextState);
  }, [onConnectionStateChange]);

  const flushQueue = useCallback(() => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const grouped = groupEvents(queueRef.current);
    queueRef.current = [];
    grouped.forEach((event) => {
      onAvailabilityChanged?.(event);
    });
  }, [onAvailabilityChanged]);

  const enqueueEvent = useCallback((event) => {
    queueRef.current.push(event);
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(flushQueue, DEBOUNCE_MS);
  }, [flushQueue]);

  useEffect(() => {
    if (!shouldConnect) {
      intentionalCloseRef.current = true;
      generationRef.current += 1;
      if (sourceRef.current) sourceRef.current.close();
      sourceRef.current = null;
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      queueRef.current = [];
      lastProcessedRef.current = '';
      const disabledGeneration = generationRef.current;
      deferStateUpdate(() => {
        if (generationRef.current !== disabledGeneration) return;
        setLastEventId('');
        setState(CONNECTION_STATES.disabled);
      });
      return undefined;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    intentionalCloseRef.current = false;
    const restoredLastId = readLastEventId(branchId);
    lastProcessedRef.current = restoredLastId;
    deferStateUpdate(() => {
      if (generationRef.current !== generation) return;
      setLastEventId(restoredLastId);
      setState(CONNECTION_STATES.connecting);
    });

    const source = new EventSource(buildEventUrl(branchId, restoredLastId), { withCredentials: true });
    sourceRef.current = source;

    const armFallbackTimer = () => {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = window.setTimeout(() => {
        if (generationRef.current !== generation || intentionalCloseRef.current) return;
        setState(CONNECTION_STATES.fallbackPolling);
      }, FALLBACK_AFTER_MS);
    };

    source.onopen = () => {
      if (generationRef.current !== generation) return;
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      setReconnectAttempts(0);
      setState(CONNECTION_STATES.connected);
    };

    source.onerror = () => {
      if (generationRef.current !== generation || intentionalCloseRef.current) return;
      if (source.readyState === EventSource.CLOSED) {
        setState(CONNECTION_STATES.error);
        return;
      }
      setReconnectAttempts((value) => value + 1);
      setState(CONNECTION_STATES.reconnecting);
      armFallbackTimer();
    };

    source.addEventListener('agenda.availability.changed', (message) => {
      if (generationRef.current !== generation || intentionalCloseRef.current) return;
      let parsed = null;
      try {
        parsed = JSON.parse(message.data);
      } catch {
        warnInvalidEvent('invalid_json');
        return;
      }
      const event = normalizeEventPayload(parsed);
      if (!event) {
        warnInvalidEvent('invalid_payload');
        return;
      }
      if (event.id_sucursal !== branchId) return;
      if (lastProcessedRef.current && compareEventIds(event.id_evento, lastProcessedRef.current) <= 0) return;
      lastProcessedRef.current = event.id_evento;
      writeLastEventId(branchId, event.id_evento);
      setLastEventId(event.id_evento);
      setLastEventAt(new Date().toISOString());
      enqueueEvent(event);
    });

    source.addEventListener('agenda.resync.required', (message) => {
      if (generationRef.current !== generation || intentionalCloseRef.current) return;
      let reason = '';
      try {
        reason = String(JSON.parse(message.data)?.reason || '').trim();
      } catch {
        reason = '';
      }
      if (!RESYNC_REASONS.has(reason)) return;
      clearLastEventId(branchId);
      lastProcessedRef.current = '';
      setLastEventId('');
      onResyncRequired?.({ reason, branchId });
    });

    return () => {
      intentionalCloseRef.current = true;
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      fallbackTimerRef.current = null;
      flushTimerRef.current = null;
      queueRef.current = [];
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
    };
  }, [
    branchId,
    enqueueEvent,
    onResyncRequired,
    setState,
    shouldConnect,
  ]);

  return useMemo(() => ({
    connectionState,
    lastEventId,
    lastEventAt,
    reconnectAttempts,
    isConnected: connectionState === CONNECTION_STATES.connected,
    isFallbackPolling: connectionState === CONNECTION_STATES.fallbackPolling || connectionState === CONNECTION_STATES.disabled,
  }), [connectionState, lastEventAt, lastEventId, reconnectAttempts]);
}
