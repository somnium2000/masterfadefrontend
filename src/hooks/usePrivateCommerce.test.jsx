// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import usePrivateCommerce from './usePrivateCommerce.js';
const state = vi.hoisted(() => ({ auth: {}, get: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => state.auth }));
vi.mock('../services/httpClient.js', () => ({ http: { get: state.get } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const login = () => { state.auth = { isAuthenticated: true, user: { id_usuario: 'owner' } }; };

const closed = { booking: false, vipPurchase: false, publicBooking: false, publicVipPurchase: false, checking: false };

test('guest fetches public availability but cannot gain personal permission', async () => {
  state.auth = { isAuthenticated: false };
  state.get.mockResolvedValue({ data: { publicBooking: true, publicVipPurchase: false, booking: true } });
  const view = renderHook(usePrivateCommerce);
  expect(view.result.current).toEqual({ ...closed, checking: true });
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current).toEqual({ ...closed, publicBooking: true });
  expect(state.get).toHaveBeenCalledWith('/v1/commerce/eligibility', expect.objectContaining({ cache: false, dedupe: false }));
});

test('missing configuration and non-boolean flags keep flows closed', async () => {
  login(); state.get.mockResolvedValue({ data: { publicBooking: 'true', booking: 1, vipPurchase: '1' } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current).toEqual(closed);
});

test('only explicit backend booleans open flows; logout closes synchronously and re-login rechecks', async () => {
  login(); state.get.mockResolvedValue({ data: { booking: true, vipPurchase: true } });
  const view = renderHook(usePrivateCommerce);
  expect(view.result.current.booking).toBe(false);
  expect(view.result.current.checking).toBe(true);
  await waitFor(() => expect(view.result.current.vipPurchase).toBe(true));
  state.get.mockReturnValue(new Promise(() => {}));
  state.auth = { isAuthenticated: false }; view.rerender();
  expect(view.result.current).toEqual({ ...closed, checking: true });
  login(); view.rerender();
  expect(view.result.current.booking).toBe(false);
});

test('same-identity focus refresh preserves a valid checkout while pending, then applies denial', async () => {
  login(); state.get.mockResolvedValue({ data: { booking: true, publicBooking: true } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.booking).toBe(true));
  let finish;
  state.get.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(view.result.current).toEqual({ ...closed, booking: true, publicBooking: true });
  await act(async () => finish({ data: { booking: false, publicBooking: false } }));
  expect(view.result.current).toEqual(closed);
});

test('request failure revokes eligibility without using cached permission', async () => {
  login(); state.get.mockResolvedValue({ data: { booking: true, vipPurchase: true } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.booking).toBe(true));
  state.get.mockRejectedValue(new Error('denied'));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(view.result.current).toEqual(closed);
  expect(state.get.mock.calls[0][1]).toMatchObject({ cache: false, dedupe: false });
});

test('late response from previous identity cannot enable current user', async () => {
  login(); let resolve;
  state.get.mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockResolvedValue({ data: { booking: false } });
  const view = renderHook(usePrivateCommerce);
  state.auth = { isAuthenticated: true, user: { id_usuario: 'other' } }; view.rerender();
  await act(async () => resolve({ data: { booking: true, vipPurchase: true } }));
  expect(view.result.current).toEqual(closed);
});

test('a slower focus response cannot override the latest decision', async () => {
  login(); state.get.mockResolvedValue({ data: { booking: true } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.booking).toBe(true));
  let stale;
  state.get.mockReturnValueOnce(new Promise(resolve => { stale = resolve; })).mockResolvedValue({ data: {} });
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => stale({ data: { booking: true } }));
  expect(view.result.current).toEqual(closed);
});
