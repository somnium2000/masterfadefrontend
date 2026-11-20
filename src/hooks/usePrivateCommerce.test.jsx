// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import usePrivateCommerce from './usePrivateCommerce.js';
const state = vi.hoisted(() => ({ auth: {}, get: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => state.auth }));
vi.mock('../services/httpClient.js', () => ({ http: { get: state.get } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
const login = () => { state.auth = { isAuthenticated: true, user: { id_usuario: 'owner' } }; };

const closed = { booking: false, vipPurchase: false, publicBooking: false, publicVipPurchase: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false, checking: false };

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
  expect(view.result.current).toEqual({ ...closed, booking: true, publicBooking: true, checking: true });
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
  expect(view.result.current).toEqual({ ...closed, booking: true });
});

test('retired diagnostic stays closed even with stale QA eligibility and preserves booking on refresh failure', async () => {
  vi.stubEnv('VITE_ENTORNO', 'qa'); vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay'); vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
  login(); state.get.mockResolvedValue({ data: { booking: true, vipPurchase: false, pixelpaySale: false, pixelpay3dsDiagnostic: true } });
  const view = renderHook(usePrivateCommerce);
  expect(view.result.current.pixelpay3dsDiagnostic).toBe(false);
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current.pixelpay3dsDiagnostic).toBe(false);
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

test('retired Songbird capability stays closed with stale backend grant and logout',async()=>{
  vi.stubEnv('VITE_ENTORNO','qa');vi.stubEnv('VITE_PAYMENT_PROVIDER','pixelpay');vi.stubEnv('VITE_PIXELPAY_ENV','sandbox');
  login();state.get.mockResolvedValue({data:{booking:true,pixelpaySale:false,pixelpaySongbirdBridge:true}});
  const view=renderHook(usePrivateCommerce);
  expect(view.result.current.pixelpaySongbirdBridge).toBe(false);
  await waitFor(()=>expect(view.result.current.checking).toBe(false));
  expect(view.result.current.pixelpaySongbirdBridge).toBe(false);
  expect(view.result.current.pixelpaySale).toBe(false);
  state.get.mockRejectedValue(new Error('unavailable'));await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(view.result.current.pixelpaySongbirdBridge).toBe(false);expect(view.result.current.booking).toBe(true);
  state.auth={isAuthenticated:false};view.rerender();expect(view.result.current.pixelpaySongbirdBridge).toBe(false);
});

test.each(['allowed','denied','error'])('focus revalidation never reopens the retired Songbird capability: %s',async outcome=>{
  vi.stubEnv('VITE_ENTORNO','qa');vi.stubEnv('VITE_PAYMENT_PROVIDER','pixelpay');vi.stubEnv('VITE_PIXELPAY_ENV','sandbox');
  login();state.get.mockResolvedValue({data:{booking:true,pixelpaySongbirdBridge:true,pixelpaySale:false}});
  const view=renderHook(usePrivateCommerce);await waitFor(()=>expect(view.result.current.checking).toBe(false));
  expect(view.result.current.pixelpaySongbirdBridge).toBe(false);
  let resolve,reject;state.get.mockReturnValueOnce(new Promise((yes,no)=>{resolve=yes;reject=no;}));
  act(()=>window.dispatchEvent(new Event('focus')));
  expect(view.result.current).toMatchObject({checking:true,pixelpaySongbirdBridge:false,pixelpaySale:false});
  await act(async()=>outcome==='error'?reject(new Error('offline')):resolve({data:{booking:true,pixelpaySongbirdBridge:outcome==='allowed'}}));
  expect(view.result.current.checking).toBe(false);
  expect(view.result.current.pixelpaySongbirdBridge).toBe(false);
});


test('public 3DS grant follows the authenticated identity and keeps checkout closed during refresh', async () => {
  login();
  state.get.mockResolvedValue({ data: { booking: true, vipPurchase: true, pixelpayPublic3dsRequired: true, pixelpayPublic3ds: true } });
  const view = renderHook(usePrivateCommerce);
  await waitFor(() => expect(view.result.current.pixelpayPublic3ds).toBe(true));
  let finish;
  state.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(view.result.current).toMatchObject({ pixelpayPublic3dsRequired: true, pixelpayPublic3ds: false });
  await act(async () => finish({ data: { booking: true, vipPurchase: true, pixelpayPublic3dsRequired: true, pixelpayPublic3ds: false } }));
  expect(view.result.current).toMatchObject({ pixelpayPublic3dsRequired: true, pixelpayPublic3ds: false });
  state.auth = { isAuthenticated: false };
  view.rerender();
  expect(view.result.current).not.toHaveProperty('pixelpayPublic3ds');
});
