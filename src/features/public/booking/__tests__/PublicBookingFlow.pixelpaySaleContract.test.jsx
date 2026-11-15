// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Flow from '../PublicBookingFlow.jsx';
import { useBookingFlow } from '../BookingFlowContext.jsx';
import { getPublicPaymentStatus, queryPublicPixelPayStatus, salePublicPixelPay } from '../publicBookingApi.js';

const mocks = vi.hoisted(() => {
  const noop = vi.fn();
  const data = {
    contextLoading: false, contextError: '', contextData: {}, selectedBranchId: '',
    branchList: [], barbers: [], services: [], packages: [], promotions: [],
    membershipStateData: null, availabilityMap: {}, slots: [], slotsCurated: [],
    slotSuggestions: [], slotMetrics: {}, hold: null, rootRedirectPath: null,
    homePath: '/', homeLabel: 'Inicio', connectionState: 'disabled',
    companionRuleValidation: { valid: true }, canAddCompanionBlock: false,
  };
  return { noop, data, hook: new Proxy(data, { get: (target, key) => key in target ? target[key] : noop }) };
});
vi.mock('../../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null, roles: [], isAuthenticated: false, isHydrated: true, isHydrating: false }),
}));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({
  useNotifications: () => ({ error: mocks.noop, info: mocks.noop, warning: mocks.noop, success: mocks.noop }),
}));
vi.mock('../hooks/useBookingCatalogs.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingAvailability.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingHold.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingCompanions.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/useBookingWizardNavigation.js', () => ({ default: () => mocks.hook }));
vi.mock('../hooks/usePublicAgendaEvents.js', () => ({ default: () => mocks.hook, parseAgendaSseEnabled: () => false }));
vi.mock('../usePublicAgendaPolling.js', () => ({ default: () => undefined }));
vi.mock('../../../../components/branding/MasterfadeLogo.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({ default: () => null }));
vi.mock('../publicBookingApi.js', () => ({
  completePublicMockPayment: vi.fn(), completePublicSimulatorPayment: vi.fn(),
  confirmClienteCitaHoldWithoutPayment: vi.fn(), createClienteCitaHold: vi.fn(),
  createPublicCitaHold: vi.fn(), createPublicPaymentIntent: vi.fn(),
  getPublicPaymentStatus: vi.fn(), queryPublicPixelPayStatus: vi.fn(),
  releaseClienteCitaHold: vi.fn(), releasePublicCitaHold: vi.fn(),
  salePublicPixelPay: vi.fn(), validatePublicBookingContacts: vi.fn(),
}));

const GROUP = '11111111-1111-4111-8111-111111111111';
const INTENT = '22222222-2222-4222-8222-222222222222';
const KEY = 'masterfade.publicBookingPayment.v1';
const READY = { id_grupo_cita: GROUP, id_intent: INTENT, estado_intent_codigo: 'link_generado', monto_hnl: 1 };
let flow;
function Probe() {
  const current = useBookingFlow();
  useEffect(() => { flow = current; }, [current]);
  return null;
}
function mount(pixelpaySale = true) {
  return render(<MemoryRouter initialEntries={[`/agendar/pagar?id_grupo_cita=${GROUP}&id_intent=${INTENT}`]}>
    <Routes><Route path="/agendar" element={<Flow pixelpaySale={pixelpaySale} />}>
      <Route path="pagar" element={<Probe />} />
    </Route></Routes>
  </MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay');
  vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
  sessionStorage.clear(); localStorage.clear();
  mocks.data.hold = { id_grupo_cita: GROUP, total_pagar_hnl: 1, hold_expires_at: '2099-01-01T00:00:00Z' };
  sessionStorage.setItem(KEY, JSON.stringify({
    id_grupo_cita: GROUP, id_intent: INTENT, titular_email: 'synthetic@example.test', paymentIntent: READY,
  }));
  getPublicPaymentStatus.mockResolvedValue(READY);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test.each(['NETWORK_UNAVAILABLE', 'TIMEOUT', 'PIXELPAY_SALE_ERROR', 'UNKNOWN_FAILURE', 'ABORT_ERR'])('%s tras enviar Sale bloquea otro envío y conserva el contexto', async (code) => {
  const error = Object.assign(new Error('Sin respuesta'), {
    status: 0, code, data: { error: { code } }, name: code === 'ABORT_ERR' ? 'AbortError' : 'Error',
  });
  salePublicPixelPay.mockRejectedValue(error);
  mount();
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  await act(async () => {
    await expect(flow.completePixelPayPayment({ card: {}, billing: {} })).rejects.toBe(error);
  });
  expect(flow.paymentCanExecuteSale).toBe(false);
  expect(flow.paymentResult).toMatchObject({ pending_confirmation: true, estado_intent_codigo: 'pendiente_confirmacion' });
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem(KEY))).toMatchObject({ id_grupo_cita: GROUP, id_intent: INTENT });
});

test('capacidad false bloquea Sale sin eliminar la consulta ni el contexto', async () => {
  mount(false);
  await waitFor(() => expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1));
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(flow.paymentCanExecuteSale).toBe(false);
  expect(salePublicPixelPay).not.toHaveBeenCalled();
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem(KEY)).paymentIntent.pending_confirmation).toBeUndefined();
});

test.each([
  { pending_confirmation: true, estado_intent_codigo: 'pendiente_confirmacion' },
  { accepted: true, status: 202 },
])('respuesta aceptada incompleta o pendiente conserva un solo envío: %j', async (response) => {
  let finish;
  salePublicPixelPay.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  mount();
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  await act(async () => {
    const callback = flow.completePixelPayPayment;
    const first = callback({ card: {}, billing: {} });
    const duplicate = callback({ card: {}, billing: {} });
    expect(JSON.parse(sessionStorage.getItem(KEY)).paymentIntent.pending_confirmation).toBe(true);
    finish(response);
    await Promise.all([first, duplicate]);
  });
  expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
  expect(flow.paymentCanExecuteSale).toBe(false);
  expect(flow.paymentResult.pending_confirmation).toBe(true);
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
});

test('recarga durante Sale sin respuesta conserva bloqueo aunque GET todavía diga link_generado', async () => {
  let finish;
  salePublicPixelPay.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const firstRender = mount();
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  let pending;
  act(() => { pending = flow.completePixelPayPayment({ card: { cvv: 'synthetic-cvv' }, billing: {} }); });
  expect(JSON.parse(sessionStorage.getItem(KEY)).paymentIntent.pending_confirmation).toBe(true);
  expect(sessionStorage.getItem(KEY)).not.toContain('synthetic-cvv');
  firstRender.unmount();
  mount();
  await waitFor(() => expect(getPublicPaymentStatus).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(flow.paymentResult?.pending_confirmation).toBe(true));
  expect(flow.paymentCanExecuteSale).toBe(false);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  await act(async () => { finish({ pending_confirmation: true }); await pending; });
});

test.each(['PRIVATE_COMMERCE_RESTRICTED', 'AUTH_TOKEN_INVALID', 'CSRF_TOKEN_INVALID', 'FST_ERR_VALIDATION', 'AUTH_SESSION_INVALID'])('rechazo preflight %s no inventa evidencia de Sale', async (code) => {
  const error = Object.assign(new Error('Rechazado'), { status: 403, data: { error: { code } } });
  salePublicPixelPay.mockRejectedValue(error);
  mount();
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  await act(async () => { await expect(flow.completePixelPayPayment({ card: {}, billing: {} })).rejects.toBe(error); });
  expect(flow.paymentResult.estado_intent_codigo).toBe('link_generado');
  expect(JSON.parse(sessionStorage.getItem(KEY)).paymentIntent.pending_confirmation).toBe(false);
  expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
});

test.each(['PIXELPAY_SALE_ALREADY_IN_PROGRESS', 'UNKNOWN_SERVER_CODE'])('409 %s no habilita otro cobro', async (code) => {
  const error = Object.assign(new Error('Rechazado'), { status: 409, data: { error: { code } } });
  salePublicPixelPay.mockRejectedValue(error);
  mount();
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  await act(async () => { await expect(flow.completePixelPayPayment({ card: {}, billing: {} })).rejects.toBe(error); });
  expect(flow.paymentCanExecuteSale).toBe(false);
  expect(JSON.parse(sessionStorage.getItem(KEY)).paymentIntent.pending_confirmation).toBe(true);
});

test.each([
  { ...READY, booking_confirmed: true, estado_intent_codigo: 'confirmado' },
  { ...READY, estado_intent_codigo: 'fallido' },
])('respuesta definitiva no se convierte en pendiente ni permite segundo envío: %j', async (response) => {
  salePublicPixelPay.mockResolvedValue(response);
  mount();
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  getPublicPaymentStatus.mockResolvedValue(response);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(flow.paymentCanExecuteSale).toBe(false);
  expect(flow.paymentResult).toMatchObject(response);
  expect(flow.paymentResult.pending_confirmation).not.toBe(true);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
});

test('contexto sin correo verificado no permite Sale', async () => {
  sessionStorage.clear();
  mount();
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(flow.paymentCanExecuteSale).toBe(false);
  expect(salePublicPixelPay).not.toHaveBeenCalled();
});
