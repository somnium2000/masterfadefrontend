// @vitest-environment jsdom
// AM: PublicBookingFlow y useBookingMode reales; hooks de servicios completamente simulados.
import { StrictMode, useLayoutEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Flow from '../PublicBookingFlow.jsx';
import { useBookingFlow } from '../BookingFlowContext.jsx';
const auth = vi.hoisted(() => ({}));
const mocks = vi.hoisted(() => {
  const noop = vi.fn();
  const defaults = { contextLoading: false, contextError: '', contextData: {}, selectedBranchId: '', branchList: [], barbers: [], services: [], packages: [], promotions: [], membershipStateData: null, availabilityMap: {}, slots: [], slotsCurated: [], slotSuggestions: [], slotMetrics: {}, hold: null, paymentIntent: null, paymentResult: null, bookingSuccessResult: null, rootRedirectPath: null, homePath: '/', homeLabel: 'Inicio', connectionState: 'disabled', companionRuleValidation: { valid: true }, canAddCompanionBlock: false };
  return { noop, hook: new Proxy(defaults, { get: (target, key) => key in target ? target[key] : noop }) };
});
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
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
const KEY = 'mf_reward_redeem_context_v1';
let latest;
function token(owner = 'client-A') { return `mf_reward_ctx_v1.${btoa(JSON.stringify({ v: 1, id_cliente: owner, id_servicio_canje: 'S', id_sucursal: 'A' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.${'a'.repeat(43)}`; }
function context() { return { owner_id_usuario: 'user-A', owner_id_cliente: 'client-A', canje_context_token: token(), id_servicio_canje: 'S', id_sucursal: 'A', servicio_nombre: 'Servicio QA' }; }
function Probe() { const state = useBookingFlow(); useLayoutEffect(() => { latest = state; }, [state]); return <p>{state.rewardModeActive ? `Recompensa ${state.rewardServiceId}` : `Sin recompensa ${state.bookingMode}`}</p>; }
function App() { return <MemoryRouter initialEntries={['/agendar/agenda']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/agendar" element={<Flow />}><Route path="agenda" element={<Probe />} /></Route></Routes></MemoryRouter>; }
beforeEach(() => { latest = null; sessionStorage.clear(); mocks.noop.mockClear(); Object.assign(auth, { user: { id_usuario: 'user-A', cliente_id: 'client-A', nombres: 'QA', apellidos: 'Prueba', telefono_principal: '99999999' }, roles: ['cliente'], isAuthenticated: true, isHydrated: true, isHydrating: false }); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External HTTP forbidden'); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test('loading conserva contexto válido sin activar recompensa; A lo recupera', async () => {
  const original = JSON.stringify(context()); sessionStorage.setItem(KEY, original); auth.isHydrating = true; auth.isHydrated = false;
  const view = render(<App />); await screen.findByText('Sin recompensa loading'); expect(sessionStorage.getItem(KEY)).toBe(original);
  auth.isHydrating = false; auth.isHydrated = true; view.rerender(<App />); await screen.findByText('Recompensa S'); expect(latest.rewardBranchId).toBe('A');
});
test('B ya autenticado no utiliza contexto de A', async () => {
  sessionStorage.setItem(KEY, JSON.stringify(context())); auth.user = { ...auth.user, id_usuario: 'user-B', cliente_id: 'client-B' }; render(<App />);
  await screen.findByText('Sin recompensa authenticated'); await waitFor(() => expect(sessionStorage.getItem(KEY)).toBeNull());
});
test('flujo montado cambia A → B sin conservar recompensa', async () => {
  sessionStorage.setItem(KEY, JSON.stringify(context())); const view = render(<App />); await screen.findByText('Recompensa S');
  auth.user = { ...auth.user, id_usuario: 'user-B', cliente_id: 'client-B' }; view.rerender(<App />); expect(screen.queryByText('Recompensa S')).not.toBeInTheDocument();
  await waitFor(() => expect(sessionStorage.getItem(KEY)).toBeNull());
});
test.each(['old', 'corrupt', 'incomplete', 'owner-tampered', 'service-tampered', 'token-tampered', 'relabelled', 'branch-tampered', 'bad-payload'])('contexto %s no activa recompensa', async kind => {
  const value = context(); if (kind === 'old') { delete value.owner_id_usuario; delete value.owner_id_cliente; }
  if (kind === 'incomplete') delete value.id_servicio_canje;
  if (kind === 'owner-tampered') { value.owner_id_usuario = 'user-A'; value.owner_id_cliente = 'client-A'; value.canje_context_token = token('client-B'); }
  if (kind === 'service-tampered') value.id_servicio_canje = 'OTHER';
  if (kind === 'token-tampered') value.canje_context_token = 'unexpected-token';
  if (kind === 'branch-tampered') value.id_sucursal = 'B';
  if (kind === 'bad-payload') value.canje_context_token = `mf_reward_ctx_v1.e2Jyb2tlbg.${'a'.repeat(43)}`;
  if (kind === 'relabelled') { auth.user = { ...auth.user, id_usuario: 'user-B', cliente_id: 'client-B' }; value.owner_id_usuario = 'user-B'; value.owner_id_cliente = 'client-B'; }
  sessionStorage.setItem(KEY, kind === 'corrupt' ? '{broken' : JSON.stringify(value)); render(<App />); await screen.findByText('Sin recompensa authenticated'); expect(sessionStorage.getItem(KEY)).toBeNull();
});
test('modo público conserva flujo público y no consume contexto privado', async () => {
  sessionStorage.setItem(KEY, JSON.stringify(context())); sessionStorage.setItem('unrelated', 'preserved'); auth.user = null; auth.roles = []; auth.isAuthenticated = false;
  render(<App />); await screen.findByText('Sin recompensa public'); expect(latest.canUseClienteHold).toBe(false); expect(sessionStorage.getItem(KEY)).toBeNull(); expect(sessionStorage.getItem('unrelated')).toBe('preserved');
});
test('StrictMode y desmontaje conservan contexto legítimo del mismo titular', async () => {
  sessionStorage.setItem(KEY, JSON.stringify(context())); const view = render(<StrictMode><App /></StrictMode>); await screen.findByText('Recompensa S'); view.unmount(); expect(JSON.parse(sessionStorage.getItem(KEY)).canje_context_token).toBe(token());
  await act(async () => {});
});
