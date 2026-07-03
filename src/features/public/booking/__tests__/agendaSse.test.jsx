// @vitest-environment jsdom

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import usePublicAgendaEvents, { parseAgendaSseEnabled } from '../hooks/usePublicAgendaEvents.js';
import usePublicAgendaPolling from '../usePublicAgendaPolling.js';

const BRANCH_A = '21355bf5-3ebc-4c7f-b16a-19e2ba2fe041';
const BRANCH_B = '33333333-3333-4333-8333-333333333333';
const BARBER_A = '4215e004-67ff-41d2-b56f-4849f9aaa75a';
const BARBER_B = '30b4e154-e3f7-40e2-b3ee-2f23d432b0b0';

function validEvent(overrides = {}) {
  return {
    id_evento: '17',
    id_sucursal: BRANCH_A,
    id_barbero: BARBER_A,
    fecha_desde: '2026-07-03',
    fecha_hasta: '2026-07-03',
    inicio_at: '2026-07-03T14:00:00.000Z',
    fin_at: '2026-07-03T14:50:00.000Z',
    reason: 'hold_created',
    occurred_at: '2026-07-03T06:09:30.296Z',
    ...overrides,
  };
}

class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.readyState = MockEventSource.CONNECTING;
    this.listeners = new Map();
    this.close = vi.fn(() => {
      this.readyState = MockEventSource.CLOSED;
    });
    MockEventSource.instances.push(this);
  }

  addEventListener(type, listener) {
    const current = this.listeners.get(type) || [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  emitOpen() {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.({});
  }

  emitError(state = MockEventSource.CONNECTING) {
    this.readyState = state;
    this.onerror?.({});
  }

  emit(type, data) {
    (this.listeners.get(type) || []).forEach((listener) => listener({ data: JSON.stringify(data) }));
  }

  emitRaw(type, data) {
    (this.listeners.get(type) || []).forEach((listener) => listener({ data }));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_API_URL', 'http://localhost:3002');
  window.sessionStorage.clear();
  MockEventSource.instances = [];
  globalThis.EventSource = MockEventSource;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('agenda SSE feature flag', () => {
  test('parseAgendaSseEnabled interpreta true y false explicitamente', () => {
    expect(parseAgendaSseEnabled('true')).toBe(true);
    expect(parseAgendaSseEnabled('false')).toBe(false);
    expect(parseAgendaSseEnabled('anything', false)).toBe(false);
  });
});

describe('usePublicAgendaEvents', () => {
  test('no crea EventSource cuando falta branchId o esta disabled', () => {
    renderHook(() => usePublicAgendaEvents({ enabled: false, branchId: BRANCH_A, routeActive: true }));
    renderHook(() => usePublicAgendaEvents({ enabled: true, branchId: '', routeActive: true }));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  test('crea EventSource con withCredentials, id_sucursal y last_event_id', () => {
    window.sessionStorage.setItem(`masterfade:agenda-sse:last-event:${BRANCH_A}`, '16');
    renderHook(() => usePublicAgendaEvents({ enabled: true, branchId: BRANCH_A, routeActive: true }));
    expect(MockEventSource.instances).toHaveLength(1);
    const source = MockEventSource.instances[0];
    expect(source.options).toMatchObject({ withCredentials: true });
    expect(source.url).toContain('/v1/public/agenda/eventos');
    expect(source.url).toContain(`id_sucursal=${BRANCH_A}`);
    expect(source.url).toContain('last_event_id=16');
  });

  test('onopen marca connected y onerror activa fallback despues del timeout', async () => {
    const states = [];
    const handleConnectionStateChange = (state) => states.push(state);
    const { result } = renderHook(() => usePublicAgendaEvents({
      enabled: true,
      branchId: BRANCH_A,
      routeActive: true,
      onConnectionStateChange: handleConnectionStateChange,
    }));
    const source = MockEventSource.instances[0];
    await act(async () => {});
    expect(typeof source.onopen).toBe('function');
    await act(async () => source.emitOpen());
    expect(result.current.connectionState).toBe('connected');
    await act(async () => source.emitError(MockEventSource.CONNECTING));
    expect(result.current.connectionState).toBe('reconnecting');
    await act(async () => vi.advanceTimersByTime(12000));
    expect(result.current.connectionState).toBe('fallback_polling');
    expect(states).toContain('connected');
  });

  test('procesa evento valido, guarda solo id y agrupa con debounce', () => {
    const onAvailabilityChanged = vi.fn();
    const { result } = renderHook(() => usePublicAgendaEvents({
      enabled: true,
      branchId: BRANCH_A,
      routeActive: true,
      onAvailabilityChanged,
    }));
    const source = MockEventSource.instances[0];
    act(() => source.emit('agenda.availability.changed', validEvent()));
    expect(onAvailabilityChanged).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(180));
    expect(onAvailabilityChanged).toHaveBeenCalledTimes(1);
    expect(onAvailabilityChanged.mock.calls[0][0].id_evento).toBe('17');
    expect(result.current.lastEventId).toBe('17');
    expect(window.sessionStorage.getItem(`masterfade:agenda-sse:last-event:${BRANCH_A}`)).toBe('17');
  });

  test('ignora JSON invalido, otra sucursal, motivo desconocido, duplicado y evento anterior', () => {
    const onAvailabilityChanged = vi.fn();
    renderHook(() => usePublicAgendaEvents({
      enabled: true,
      branchId: BRANCH_A,
      routeActive: true,
      onAvailabilityChanged,
    }));
    const source = MockEventSource.instances[0];
    act(() => {
      source.emitRaw('agenda.availability.changed', '{');
      source.emit('agenda.availability.changed', validEvent({ id_sucursal: BRANCH_B }));
      source.emit('agenda.availability.changed', validEvent({ reason: 'unknown' }));
      source.emit('agenda.availability.changed', validEvent({ id_evento: '17' }));
      source.emit('agenda.availability.changed', validEvent({ id_evento: '17' }));
      source.emit('agenda.availability.changed', validEvent({ id_evento: '16' }));
      vi.advanceTimersByTime(180);
    });
    expect(onAvailabilityChanged).toHaveBeenCalledTimes(1);
  });

  test('resync elimina last_event_id y llama callback controlado', () => {
    const onResyncRequired = vi.fn();
    window.sessionStorage.setItem(`masterfade:agenda-sse:last-event:${BRANCH_A}`, '17');
    renderHook(() => usePublicAgendaEvents({
      enabled: true,
      branchId: BRANCH_A,
      routeActive: true,
      onResyncRequired,
    }));
    const source = MockEventSource.instances[0];
    act(() => source.emit('agenda.resync.required', { reason: 'history_not_available' }));
    expect(onResyncRequired).toHaveBeenCalledWith({ reason: 'history_not_available', branchId: BRANCH_A });
    expect(window.sessionStorage.getItem(`masterfade:agenda-sse:last-event:${BRANCH_A}`)).toBeNull();
  });

  test('cleanup y cambio de sucursal cierran EventSource anterior sin procesar eventos tardios', () => {
    const onAvailabilityChanged = vi.fn();
    const { rerender, unmount } = renderHook(({ branchId }) => usePublicAgendaEvents({
      enabled: true,
      branchId,
      routeActive: true,
      onAvailabilityChanged,
    }), { initialProps: { branchId: BRANCH_A } });
    const first = MockEventSource.instances[0];
    rerender({ branchId: BRANCH_B });
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances).toHaveLength(2);
    act(() => {
      first.emit('agenda.availability.changed', validEvent());
      vi.advanceTimersByTime(180);
    });
    expect(onAvailabilityChanged).not.toHaveBeenCalled();
    unmount();
    expect(MockEventSource.instances[1].close).toHaveBeenCalledTimes(1);
  });

  test('StrictMode no deja dos EventSource activos', () => {
    const { unmount } = renderHook(() => usePublicAgendaEvents({
      enabled: true,
      branchId: BRANCH_A,
      routeActive: true,
    }), { wrapper: React.StrictMode });
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[0].close).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances[1].close).not.toHaveBeenCalled();
    unmount();
    expect(MockEventSource.instances[1].close).toHaveBeenCalledTimes(1);
  });
});

describe('usePublicAgendaPolling', () => {
  test('usa 5 minutos cuando SSE esta connected y 45 segundos cuando esta disabled', () => {
    const onInvalidate = vi.fn();
    const { rerender } = renderHook(({ connectionState }) => usePublicAgendaPolling({
      branchId: BRANCH_A,
      barberId: BARBER_A,
      dateKey: '2026-07-03',
      enabled: true,
      connectionState,
      onInvalidate,
    }), { initialProps: { connectionState: 'connected' } });
    act(() => vi.advanceTimersByTime(45000));
    expect(onInvalidate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(255000));
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    rerender({ connectionState: 'disabled' });
    act(() => vi.advanceTimersByTime(45000));
    expect(onInvalidate).toHaveBeenCalledTimes(2);
  });
});
