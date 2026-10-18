// @vitest-environment jsdom
// AM: AuthProvider, MasterPuntos, PublicBookingFlow y useBookingMode reales; servicios y HTTP simulados.
import { useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../../../context/AuthContext.jsx';
import Points from '../../../cliente/components/ClienteCourtesyRouteSection.jsx';
import Flow from '../PublicBookingFlow.jsx';
import { useBookingFlow } from '../BookingFlowContext.jsx';
import * as client from '../../../../services/httpClient.js';
const mocks = vi.hoisted(() => {
  const noop = vi.fn();
  const defaults = { contextLoading: false, contextError: '', contextData: {}, selectedBranchId: '', branchList: [], barbers: [], services: [], packages: [], promotions: [], membershipStateData: null, availabilityMap: {}, slots: [], slotsCurated: [], slotSuggestions: [], slotMetrics: {}, hold: null, paymentIntent: null, paymentResult: null, bookingSuccessResult: null, rootRedirectPath: null, homePath: '/', homeLabel: 'Inicio', connectionState: 'disabled', companionRuleValidation: { valid: true }, canAddCompanionBlock: false };
  return { noop, hook: new Proxy(defaults, { get: (target, key) => key in target ? target[key] : noop }) };
});
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => ({ error: mocks.noop, info: mocks.noop, warning: mocks.noop, success: mocks.noop }) }));
vi.mock('../hooks/useBookingCatalogs.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingAvailability.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingHold.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingPayment.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingCompanions.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingWizardNavigation.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/usePublicAgendaEvents.js', () => ({ default: () => mocks.hook, parseAgendaSseEnabled: () => false }));
vi.mock('../usePublicAgendaPolling.js', () => ({ default: () => undefined }));
vi.mock('../components/BookingLayout.jsx', () => ({ default: ({ children }) => children }));

vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: null }));
vi.mock('../../../admin/lib/adminReportesApi.js', () => ({ setAdminReportesSessionScope: vi.fn() }));
const api = vi.hoisted(() => ({ getClientePuntosResumen: vi.fn(), getClienteMe: vi.fn(), redeemClientePuntosReward: vi.fn() }));
vi.mock('../../../cliente/lib/clienteApi.js', () => api);
vi.mock('../../../cliente/lib/clientFeatureFlags.js', () => ({ CLIENT_BOOKING_ENABLED: true, CLIENT_LOCK_MESSAGE: 'Proximamente...' }));
vi.mock('../../lib/catalogApi.js', () => ({ listPublicCatalogBranches: async () => ({ branches: [{ id_sucursal: 'A', nombre_sucursal: 'Suyapa' }] }) }));
const KEY = 'mf_reward_redeem_context_v1';
let latest, actor, fetchMock, hydration;
const TOKEN = `mf_reward_ctx_v1.${btoa(JSON.stringify({ v: 1, id_cliente: 'client-A', id_servicio_canje: 'S', id_sucursal: 'A' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.${'a'.repeat(43)}`;
function context() { return { owner_id_usuario: 'synthetic-A', owner_id_cliente: 'client-A', canje_context_token: TOKEN, id_servicio_canje: 'S', id_sucursal: 'A' }; }
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function response(data, status = 200) { return { ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => data }; }
function userPayload() { return { ok: true, data: { user: { id_usuario: `synthetic-${actor}`, nombres: 'QA', apellidos: actor, telefono_principal: '99999999' }, roles: ['cliente'], cliente_id: `client-${actor}` } }; }
beforeEach(() => {
  latest = null; actor = 'A'; hydration = null; sessionStorage.clear(); localStorage.clear(); mocks.noop.mockClear(); window.history.pushState({}, '', '/');
  localStorage.setItem('mf_session_last_backend_touch_at', String(Date.now())); document.cookie = 'mf_csrf=synthetic-test; path=/';
  fetchMock = vi.fn(async url => {
    const path = String(url);
    if (path.endsWith('/v1/auth/me')) return hydration ? hydration.promise : response(userPayload());
    if (path.endsWith('/v1/auth/login')) { actor = 'B'; return response({ ok: true, data: { session: { authenticated: true } } }); }
    if (path.endsWith('/v1/auth/logout')) return response({ ok: true, data: { logged_out: true } });
    if (path.endsWith('/v1/auth/csrf')) return response({ data: { csrf_token: 'synthetic-only' } });
    if (path.endsWith('/v1/auth/session/touch')) return response({ ok: true });
    throw new Error('Unexpected HTTP in mock');
  }); vi.stubGlobal('fetch', fetchMock);
  api.getClientePuntosResumen.mockReset().mockResolvedValue({ saldo_total: 12, puntos_para_premio: 10, puede_canjear: true, servicios_redimibles: [{ id_servicio: 'S', nombre_servicio: 'Servicio QA' }] });
  api.getClienteMe.mockReset().mockResolvedValue({ cliente: { id_sucursal_preferida: 'A' } });
  api.redeemClientePuntosReward.mockReset().mockResolvedValue({ canje_context_token: TOKEN, id_servicio_canje: 'S', id_sucursal: 'A' });
});
afterEach(() => { cleanup(); client.registerSessionInvalidationHandler(null); client.abortInFlightRequests(); vi.unstubAllGlobals(); document.cookie = 'mf_csrf=; Max-Age=0; path=/'; });
function SessionProbe() { const auth = useAuth(); useLayoutEffect(() => { latest = auth; }, [auth]); return null; }
function BookingProbe() { const state = useBookingFlow(); return <p>{state.rewardModeActive ? `Recompensa ${state.rewardServiceId}` : `Sin recompensa ${state.bookingMode}`}</p>; }
function App({ entry = '/home/cliente' }) { return <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthProvider><SessionProbe /><Routes><Route path="/home/cliente" element={<Points />} /><Route path="/login" element={<p>Login simulado</p>} /><Route path="/agendar" element={<Flow />}><Route index element={<BookingProbe />} /><Route path="agenda" element={<BookingProbe />} /></Route></Routes></AuthProvider></MemoryRouter>; }
async function prepare() {
  const view = render(<App />); await act(async () => { await latest.hydrateSession(); }); await screen.findByText('Saldo total');
  fireEvent.click(screen.getByRole('button', { name: 'Canjear mi recompensa' })); await screen.findByRole('button', { name: /Servicio QA\s*Seleccionado/ });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' })); await screen.findByText('Recompensa S'); return view;
}
test('A prepara, navega y consume su contexto con metadatos solo locales', async () => {
  await prepare(); expect(JSON.parse(sessionStorage.getItem(KEY))).toMatchObject(context());
  expect(api.redeemClientePuntosReward).toHaveBeenCalledExactlyOnceWith({ id_servicio: 'S', id_sucursal: 'A' });
  expect(mocks.noop).not.toHaveBeenCalledWith(expect.objectContaining({ owner_id_usuario: expect.anything() }));
});
test('reload de agendamiento espera hidratación real y recupera A', async () => {
  const raw = JSON.stringify(context()); sessionStorage.setItem(KEY, raw); window.history.pushState({}, '', '/agendar/agenda'); hydration = deferred();
  render(<App entry="/agendar/agenda" />); await screen.findByText('Sin recompensa loading'); expect(sessionStorage.getItem(KEY)).toBe(raw);
  await act(async () => hydration.resolve(response(userPayload()))); await screen.findByText('Recompensa S'); expect(JSON.parse(sessionStorage.getItem(KEY)).canje_context_token).toBe(TOKEN);
});
test('logout con MasterPuntos desmontado y login B no conservan contexto A', async () => {
  await prepare(); sessionStorage.setItem('unrelated', 'preserved');
  await act(async () => { expect(await latest.logout()).toMatchObject({ ok: true }); }); expect(sessionStorage.getItem(KEY)).toBeNull();
  await act(async () => { await latest.login('b@example.test', 'synthetic-only', false); }); await screen.findByText('Sin recompensa authenticated');
  expect(latest.user.cliente_id).toBe('client-B'); expect(sessionStorage.getItem('unrelated')).toBe('preserved');
});
test('cambio confirmado A → B con booking montado elimina contexto anterior', async () => {
  await prepare(); await act(async () => { await latest.login('b@example.test', 'synthetic-only', false); });
  await screen.findByText('Sin recompensa authenticated'); expect(sessionStorage.getItem(KEY)).toBeNull();
});
test('invalidación efectiva 401 elimina solo contexto de recompensa', async () => {
  await prepare(); sessionStorage.setItem('unrelated', 'preserved'); fetchMock.mockResolvedValueOnce(response({ error: { code: 'AUTH_REQUIRED' } }, 401));
  await act(async () => { await expect(client.http.get('/v1/cliente/synthetic-read')).rejects.toMatchObject({ status: 401 }); });
  expect(latest.user).toBeNull(); expect(sessionStorage.getItem(KEY)).toBeNull(); expect(sessionStorage.getItem('unrelated')).toBe('preserved');
});
test('expiración de sesión elimina contexto sin afectar claves ajenas', async () => {
  await prepare(); sessionStorage.setItem('unrelated', 'preserved');
  fetchMock.mockResolvedValueOnce(response({ error: { code: 'AUTH_SESSION_IDLE_EXPIRED' } }, 401));
  await act(async () => { await expect(client.http.get('/v1/cliente/synthetic-read')).rejects.toMatchObject({ status: 401 }); });
  await waitFor(() => expect(latest.user).toBeNull()); expect(sessionStorage.getItem(KEY)).toBeNull(); expect(sessionStorage.getItem('unrelated')).toBe('preserved');
});

test('logout no confirmado conserva contexto legítimo y no cierra sesión', async () => {
  await prepare(); fetchMock.mockResolvedValueOnce(response({ error: { code: 'UNCONFIRMED' } }, 503));
  await act(async () => { expect(await latest.logout()).toMatchObject({ ok: false }); });
  expect(latest.user.cliente_id).toBe('client-A'); expect(JSON.parse(sessionStorage.getItem(KEY)).canje_context_token).toBe(TOKEN); await screen.findByText('Recompensa S');
});

test('rehidratación real pendiente conserva contexto y no activa recompensa prematuramente', async () => {
  await prepare(); const raw = sessionStorage.getItem(KEY); hydration = deferred(); let pending;
  act(() => { pending = latest.hydrateSession(); }); await screen.findByText('Sin recompensa loading'); expect(sessionStorage.getItem(KEY)).toBe(raw);
  await act(async () => { hydration.resolve(response(userPayload())); await pending; }); await screen.findByText('Recompensa S');
});
