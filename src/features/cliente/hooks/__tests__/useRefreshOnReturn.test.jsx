// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import useRefreshOnReturn from '../useRefreshOnReturn.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const tick = () => act(() => vi.advanceTimersByTime(100));
function restored(persisted) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

test('focus, visibility y BFCache se agrupan en una lectura silenciosa', () => {
  const refresh = vi.fn();
  renderHook(() => useRefreshOnReturn(refresh, true));
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  restored(true);
  expect(refresh).not.toHaveBeenCalled();
  tick();
  expect(refresh).toHaveBeenCalledExactlyOnceWith({ silent: true });
});

test('pageshow normal no repite la carga inicial; BFCache si actualiza', () => {
  const refresh = vi.fn();
  renderHook(() => useRefreshOnReturn(refresh, true));
  restored(false); tick(); expect(refresh).not.toHaveBeenCalled();
  restored(true); tick(); expect(refresh).toHaveBeenCalledTimes(1);
});

test('documento oculto no solicita perfil hasta volver a ser visible', () => {
  const refresh = vi.fn();
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  renderHook(() => useRefreshOnReturn(refresh, true));
  visibility.mockReturnValue('hidden');
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange')); restored(true); tick();
  expect(refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange')); tick();
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('sin identidad habilitada no se registran lecturas', () => {
  const refresh = vi.fn();
  renderHook(() => useRefreshOnReturn(refresh, false));
  window.dispatchEvent(new Event('focus')); restored(true); tick();
  expect(refresh).not.toHaveBeenCalled();
});

test('desmontaje elimina listeners y cancela el debounce pendiente', () => {
  const refresh = vi.fn();
  const view = renderHook(() => useRefreshOnReturn(refresh, true));
  window.dispatchEvent(new Event('focus')); view.unmount(); tick();
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange')); restored(true); tick();
  expect(refresh).not.toHaveBeenCalled();
});

test('cambio de callback descarta el evento de la identidad anterior', () => {
  const previous = vi.fn(), current = vi.fn();
  const view = renderHook(({ refresh }) => useRefreshOnReturn(refresh, true), { initialProps: { refresh: previous } });
  window.dispatchEvent(new Event('focus'));
  view.rerender({ refresh: current }); tick();
  expect(previous).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled();
  restored(true); tick(); expect(current).toHaveBeenCalledTimes(1);
});

test('deshabilitar la sesion elimina un regreso programado', () => {
  const refresh = vi.fn();
  const view = renderHook(({ enabled }) => useRefreshOnReturn(refresh, enabled), { initialProps: { enabled: true } });
  window.dispatchEvent(new Event('focus')); view.rerender({ enabled: false }); tick();
  expect(refresh).not.toHaveBeenCalled();
});
