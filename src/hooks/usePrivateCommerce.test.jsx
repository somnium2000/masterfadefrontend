// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import usePrivateCommerce from './usePrivateCommerce.js';
const state = vi.hoisted(() => ({ auth: {}, get: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => state.auth }));
vi.mock('../services/httpClient.js', () => ({ http: { get: state.get } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const login = () => { state.auth = { isAuthenticated: true, user: { id_usuario: 'owner' } }; };

test('guest and missing configuration response keep both flows closed', async () => {
  state.auth = { isAuthenticated: false };
  const view = renderHook(usePrivateCommerce);
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, checking: false });
  expect(state.get).not.toHaveBeenCalled();
  login(); state.get.mockResolvedValue({ data: {} }); view.rerender();
  await waitFor(() => expect(state.get).toHaveBeenCalledOnce());
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, checking: false });
});

test('only explicit backend booleans open flows; logout closes synchronously and re-login rechecks', async () => {
  login(); state.get.mockResolvedValue({ data: { booking: true, vipPurchase: true } });
  const view = renderHook(usePrivateCommerce);
  expect(view.result.current.booking).toBe(false);
  expect(view.result.current.checking).toBe(true);
  await waitFor(() => expect(view.result.current.vipPurchase).toBe(true));
  state.auth = { isAuthenticated: false }; view.rerender();
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, checking: false });
  state.get.mockReturnValue(new Promise(() => {})); login(); view.rerender();
  expect(view.result.current.booking).toBe(false);
});

test('errors and focus revalidation revoke visibility; no cached eligibility', async () => {
  login(); state.get.mockResolvedValue({ data: { booking: true, vipPurchase: true } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.booking).toBe(true));
  state.get.mockRejectedValue(new Error('denied'));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, checking: false });
  expect(state.get.mock.calls[0][1]).toMatchObject({ cache: false, dedupe: false });
});

test('focus revalidation keeps the last verified eligibility while the request is pending', async () => {
  login();
  state.get.mockResolvedValueOnce({ data: { booking: true, vipPurchase: true } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.booking).toBe(true));

  let resolveRefresh;
  state.get.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
  act(() => window.dispatchEvent(new Event('focus')));

  expect(view.result.current).toEqual({ booking: true, vipPurchase: true, checking: true });
  await act(async () => resolveRefresh({ data: { booking: true, vipPurchase: true } }));
  expect(view.result.current).toEqual({ booking: true, vipPurchase: true, checking: false });
});

test('late response from previous identity cannot enable current user', async () => {
  login(); let resolve;
  state.get.mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockResolvedValue({ data: { booking: false } });
  const view = renderHook(usePrivateCommerce);
  state.auth = { isAuthenticated: true, user: { id_usuario: 'other' } }; view.rerender();
  await act(async () => resolve({ data: { booking: true, vipPurchase: true } }));
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, checking: false });
});
