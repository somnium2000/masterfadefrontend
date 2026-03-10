import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const NotificationsContext = createContext(null);

const MAX_NOTIFICATIONS = 5;
const DEFAULT_DURATION_MS = {
  success: 2800,
  info: 3600,
  warning: 5000,
  error: 7000,
  loading: 0,
};

function createNotificationId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `nf_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function resolveDuration(type, explicitDuration, persist) {
  if (persist) return 0;
  if (Number.isFinite(explicitDuration) && explicitDuration >= 0) return explicitDuration;
  return DEFAULT_DURATION_MS[type] ?? DEFAULT_DURATION_MS.info;
}

function normalizePayload(input) {
  if (typeof input === 'string') {
    return { message: input, type: 'info' };
  }
  if (input && typeof input === 'object') {
    return {
      ...input,
      message: String(input.message || '').trim(),
      title: input.title ? String(input.title).trim() : '',
      type: String(input.type || 'info').toLowerCase(),
    };
  }
  return { message: '', type: 'info' };
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const timersRef = useRef(new Map());

  const clearTimer = useCallback((id) => {
    const current = timersRef.current.get(id);
    if (current) {
      clearTimeout(current);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback((id) => {
    clearTimer(id);
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, [clearTimer]);

  const scheduleAutoDismiss = useCallback((item) => {
    clearTimer(item.id);
    if (!item.duration || item.duration <= 0 || item.persist) return;
    const timeoutId = setTimeout(() => {
      setNotifications((prev) => prev.filter((entry) => entry.id !== item.id));
      timersRef.current.delete(item.id);
    }, item.duration);
    timersRef.current.set(item.id, timeoutId);
  }, [clearTimer]);

  const notify = useCallback((input) => {
    const payload = normalizePayload(input);
    if (!payload.message) return null;

    const notification = {
      id: payload.id || createNotificationId(),
      type: payload.type || 'info',
      title: payload.title || '',
      message: payload.message,
      createdAt: Date.now(),
      dedupeKey: payload.dedupeKey || '',
      persist: Boolean(payload.persist),
      duration: resolveDuration(payload.type, payload.duration, payload.persist),
    };

    const removedIds = [];

    setNotifications((prev) => {
      let working = prev;
      if (notification.dedupeKey) {
        const existing = prev.find((entry) => entry.dedupeKey === notification.dedupeKey);
        if (existing) {
          removedIds.push(existing.id);
          working = prev.filter((entry) => entry.id !== existing.id);
        }
      }

      const stacked = [notification, ...working];
      const next = stacked.slice(0, MAX_NOTIFICATIONS);
      const trimmed = stacked.slice(MAX_NOTIFICATIONS);
      trimmed.forEach((entry) => removedIds.push(entry.id));
      return next;
    });

    removedIds.forEach((id) => clearTimer(id));
    scheduleAutoDismiss(notification);
    return notification.id;
  }, [clearTimer, scheduleAutoDismiss]);

  const update = useCallback((id, patch = {}) => {
    let nextNotification = null;
    setNotifications((prev) => prev.map((entry) => {
      if (entry.id !== id) return entry;
      const nextType = String(patch.type || entry.type || 'info').toLowerCase();
      const nextPersist = patch.persist !== undefined ? Boolean(patch.persist) : entry.persist;
      const nextDuration = resolveDuration(
        nextType,
        patch.duration !== undefined ? patch.duration : entry.duration,
        nextPersist
      );

      nextNotification = {
        ...entry,
        ...patch,
        id,
        type: nextType,
        persist: nextPersist,
        duration: nextDuration,
      };
      return nextNotification;
    }));

    // AM: Resetea ciclo de autocierre cuando una notificación cambia de estado (ej. loading -> success).
    if (nextNotification) {
      scheduleAutoDismiss(nextNotification);
    }
    return Boolean(nextNotification);
  }, [scheduleAutoDismiss]);

  const clearAll = useCallback(() => {
    timersRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timersRef.current.clear();
    setNotifications([]);
  }, []);

  const success = useCallback((message, options = {}) => notify({ ...options, type: 'success', message }), [notify]);
  const info = useCallback((message, options = {}) => notify({ ...options, type: 'info', message }), [notify]);
  const warning = useCallback((message, options = {}) => notify({ ...options, type: 'warning', message }), [notify]);
  const error = useCallback((message, options = {}) => notify({ ...options, type: 'error', message }), [notify]);
  const loading = useCallback((message, options = {}) => notify({ ...options, type: 'loading', message, persist: true }), [notify]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timeoutId) => clearTimeout(timeoutId));
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({
    notifications,
    notify,
    success,
    info,
    warning,
    error,
    loading,
    update,
    dismiss,
    clearAll,
  }), [clearAll, dismiss, error, info, loading, notifications, notify, success, update, warning]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications debe usarse dentro de <NotificationProvider>');
  }
  return context;
}
