// @vitest-environment jsdom
import { useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Flow from '../PublicBookingFlow.jsx';
import { useBookingFlow } from '../BookingFlowContext.jsx';

const auth = vi.hoisted(() => ({}));
const mocks = vi.hoisted(() => {
  const noop = vi.fn();
  const confirm = vi.fn();
  const defaults = { contextLoading: false, contextError: '', contextData: {}, selectedBranchId: '', branchList: [], barbers: [], services: [], packages: [], promotions: [], membershipStateData: null, availabilityMap: {}, slots: [], slotsCurated: [], slotSuggestions: [], slotMetrics: {}, hold: null, paymentIntent: null, paymentResult: null, bookingSuccessResult: null, rootRedirectPath: null, homePath: '/', homeLabel: 'Inicio', connectionState: 'disabled', companionRuleValidation: { valid: true }, canAddCompanionBlock: false, confirmHoldWithoutPayment: confirm };
  return { noop, confirm, hook: new Proxy(defaults, { get: (target, key) => key in target ? target[key] : noop }) };
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
const TOKEN = `mf_reward_ctx_v1.${btoa(JSON.stringify({ v: 1, id_cliente: 'client-A', id_servicio_canje: 'S', id_sucursal: 'A' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.${'a'.repeat(43)}`;
let snapshots;
function Probe() {
  const state = useBookingFlow();
  // AM: Captura el render confirmado antes de la limpieza pasiva del padre.
  useLayoutEffect(() => { snapshots.push(state); }, [state]);
  return null;
}
function App() {
  return <MemoryRouter initialEntries={['/agendar/agenda']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/agendar" element={<Flow />}><Route path="agenda" element={<Probe />} /></Route></Routes></MemoryRouter>;
}
beforeEach(() => {
  snapshots = [];
  sessionStorage.clear();
  mocks.noop.mockClear();
  mocks.confirm.mockReset().mockResolvedValue({ ok: true, data: { confirmado_sin_pago: true } });
  Object.assign(auth, { user: { id_usuario: 'user-A', cliente_id: 'client-A' }, roles: ['cliente'], isAuthenticated: true, isHydrated: true, isHydrating: false });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External HTTP forbidden'); }));
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function seed() {
  sessionStorage.setItem(KEY, JSON.stringify({ owner_id_usuario: 'user-A', owner_id_cliente: 'client-A', canje_context_token: TOKEN, id_servicio_canje: 'S', id_sucursal: 'A' }));
}
async function confirm(state) {
  await act(async () => { expect(await state.confirmHoldWithoutPayment({ idGrupoCita: 'synthetic-group', totalPagarHnl: 0, skipNavigate: true })).toBe(true); });
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  return mocks.confirm.mock.calls[0][1];
}
test('contexto de A no se transmite cuando B tiene rewardModeActive falso antes de la limpieza pasiva', async () => {
  seed();
  auth.user = { id_usuario: 'user-B', cliente_id: 'client-B' };
  render(<App />);
  expect(snapshots[0].rewardModeActive).toBe(false);
  expect(await confirm(snapshots[0])).toEqual({});
});
test('cambio A a B no transmite el contexto anterior en el primer render de B', async () => {
  seed(); const view = render(<App />);
  expect(snapshots[0].rewardModeActive).toBe(true);
  snapshots = [];
  auth.user = { id_usuario: 'user-B', cliente_id: 'client-B' };
  view.rerender(<App />);
  expect(snapshots[0].rewardModeActive).toBe(false);
  expect(await confirm(snapshots[0])).toEqual({});
});
test('recompensa vigente conserva exactamente el token y el contrato de confirmación', async () => {
  seed(); render(<App />);
  expect(snapshots[0].rewardModeActive).toBe(true);
  expect(await confirm(snapshots[0])).toEqual({ canje_context_token: TOKEN });
});
test('confirmación habitual sin recompensa mantiene el payload vacío', async () => {
  render(<App />);
  expect(await confirm(snapshots[0])).toEqual({});
});
