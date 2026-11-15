// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import usePrivateCommerce from './usePrivateCommerce.js';
const state = vi.hoisted(() => ({ auth: {}, get: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => state.auth }));
vi.mock('../services/httpClient.js', () => ({ http: { get: state.get } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
const login = () => { state.auth = { isAuthenticated: true, user: { id_usuario: 'owner' } }; };

test('guest and missing configuration response keep both flows closed', async () => {
  state.auth = { isAuthenticated: false };
  const view = renderHook(usePrivateCommerce);
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false });
  expect(state.get).not.toHaveBeenCalled();
  login(); state.get.mockResolvedValue({ data: {} }); view.rerender();
  await waitFor(() => expect(state.get).toHaveBeenCalledOnce());
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false });
});

test('only explicit backend booleans open flows; logout closes synchronously and re-login rechecks', async () => {
  login(); state.get.mockResolvedValue({ data: { booking: true, vipPurchase: true } });
  const view = renderHook(usePrivateCommerce);
  expect(view.result.current.booking).toBe(false);
  expect(view.result.current.checking).toBe(true);
  await waitFor(() => expect(view.result.current.vipPurchase).toBe(true));
  state.auth = { isAuthenticated: false }; view.rerender();
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false });
  state.get.mockReturnValue(new Promise(() => {})); login(); view.rerender();
  expect(view.result.current.booking).toBe(false);
});

test('errors and focus revalidation revoke visibility; no cached eligibility', async () => {
  login(); state.get.mockResolvedValue({ data: { booking: true, vipPurchase: true } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.booking).toBe(true));
  state.get.mockRejectedValue(new Error('denied'));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false });
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

  expect(view.result.current).toEqual({ booking: true, vipPurchase: true, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: true });
  await act(async () => resolveRefresh({ data: { booking: true, vipPurchase: true } }));
  expect(view.result.current).toEqual({ booking: true, vipPurchase: true, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false });
});

test('late response from previous identity cannot enable current user', async () => {
  login(); let resolve;
  state.get.mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockResolvedValue({ data: { booking: false } });
  const view = renderHook(usePrivateCommerce);
  state.auth = { isAuthenticated: true, user: { id_usuario: 'other' } }; view.rerender();
  await act(async () => resolve({ data: { booking: true, vipPurchase: true } }));
  expect(view.result.current).toEqual({ booking: false, vipPurchase: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false });
});

test.each([false, true])('preserves an explicit PixelPay Sale capability (%s)', async (pixelpaySale) => {
  login();
  state.get.mockResolvedValue({ data: { booking: true, vipPurchase: false, pixelpaySale } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current).toMatchObject({ booking: true, vipPurchase: false, pixelpaySale });
  state.auth = { isAuthenticated: false }; view.rerender();
  expect(view.result.current).not.toHaveProperty('pixelpaySale');
});

test.each([undefined, null, 'false', 0])('omits absent or invalid legacy Sale capability (%s)', async (pixelpaySale) => {
  login();
  state.get.mockResolvedValue({ data: { booking: true, vipPurchase: false, pixelpaySale } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current).toEqual({ booking: true, vipPurchase: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false });
});

test('diagnostic grant requires QA Sandbox and explicit eligibility; refresh revokes it without losing booking', async () => {
  vi.stubEnv('VITE_ENTORNO', 'qa'); vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay'); vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
  login(); state.get.mockResolvedValue({ data: { booking: true, vipPurchase: false, pixelpaySale: false, pixelpay3dsDiagnostic: true } });
  const view = renderHook(usePrivateCommerce);
  expect(view.result.current.pixelpay3dsDiagnostic).toBe(false);
  await waitFor(() => expect(view.result.current.pixelpay3dsDiagnostic).toBe(true));
  let rejectRefresh;
  state.get.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRefresh = reject; }));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(view.result.current).toMatchObject({ booking: true, pixelpaySale: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: true });
  await act(async () => rejectRefresh(new Error('unavailable')));
  expect(view.result.current).toMatchObject({ booking: true, vipPurchase: false, pixelpaySale: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false });
  state.auth = { isAuthenticated: false }; view.rerender();
  expect(view.result.current.booking).toBe(false);
  expect(view.result.current.pixelpay3dsDiagnostic).toBe(false);
});

test.each([undefined, false, 'true', 1])('diagnostic eligibility %s never follows booking or Sale', async capability => {
  vi.stubEnv('VITE_ENTORNO', 'qa'); vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay'); vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
  login(); state.get.mockResolvedValue({ data: { booking: true, pixelpaySale: true, pixelpay3dsDiagnostic: capability } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current.pixelpay3dsDiagnostic).toBe(false);
});

test('Live cannot acquire a diagnostic grant from the backend boolean', async () => {
  vi.stubEnv('VITE_ENTORNO', 'qa'); vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay'); vi.stubEnv('VITE_PIXELPAY_ENV', 'live');
  login(); state.get.mockResolvedValue({ data: { booking: true, pixelpay3dsDiagnostic: true } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current.pixelpay3dsDiagnostic).toBe(false);
});

test('Songbird capability requires a confirmed QA boolean and is revoked on refresh error and logout',async()=>{
  vi.stubEnv('VITE_ENTORNO','qa');vi.stubEnv('VITE_PAYMENT_PROVIDER','pixelpay');vi.stubEnv('VITE_PIXELPAY_ENV','sandbox');
  login();state.get.mockResolvedValue({data:{booking:true,pixelpaySale:false,pixelpaySongbirdBridge:true}});
  const view=renderHook(usePrivateCommerce);
  expect(view.result.current.pixelpaySongbirdBridge).toBe(false);
  await waitFor(()=>expect(view.result.current.pixelpaySongbirdBridge).toBe(true));
  expect(view.result.current.pixelpaySale).toBe(false);
  state.get.mockRejectedValue(new Error('unavailable'));await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(view.result.current.pixelpaySongbirdBridge).toBe(false);expect(view.result.current.booking).toBe(true);
  state.auth={isAuthenticated:false};view.rerender();expect(view.result.current.pixelpaySongbirdBridge).toBe(false);
});
