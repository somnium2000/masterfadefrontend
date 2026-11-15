// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Flow from '../PublicBookingFlow.jsx';
import Payment from '../PublicBookingPaymentStep.jsx';
import { useBookingFlow } from '../BookingFlowContext.jsx';
import usePrivateCommerce from '../../../../hooks/usePrivateCommerce.js';
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
  return { noop, data, auth: {}, eligibilityGet: vi.fn(), hook: new Proxy(data, { get: (target, key) => key in target ? target[key] : noop }) };
});
vi.mock('../../../../context/AuthContext.jsx', () => ({
  useAuth: () => mocks.auth,
}));
vi.mock('../../../../services/httpClient.js', () => ({ http: { get: mocks.eligibilityGet } }));
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
let eligibility;
function Probe({ showPayment = false }) {
  const current = useBookingFlow();
  useEffect(() => { flow = current; }, [current]);
  return showPayment ? <Payment /> : null;
}
function mount(pixelpaySale = true) {
  return render(<MemoryRouter initialEntries={[`/agendar/pagar?id_grupo_cita=${GROUP}&id_intent=${INTENT}`]}>
    <Routes><Route path="/agendar" element={<Flow pixelpaySale={pixelpaySale} />}>
      <Route path="pagar" element={<Probe />} />
    </Route></Routes>
  </MemoryRouter>);
}
function EligibilityFlow() {
  const current = usePrivateCommerce();
  useEffect(() => { eligibility = current; }, [current]);
  return <Flow pixelpaySale={current.pixelpaySale} />;
}
function mountEligibility({ entorno = 'qa', environment = 'sandbox' } = {}) {
  mocks.auth = {
    user: { id_usuario: '33333333-3333-4333-8333-333333333333', cliente_id: '44444444-4444-4444-8444-444444444444' },
    roles: ['cliente'], isAuthenticated: true, isHydrated: true, isHydrating: false,
  };
  vi.stubEnv('VITE_ENTORNO', entorno);
  vi.stubEnv('VITE_PIXELPAY_ENV', environment);
  return render(<MemoryRouter initialEntries={[`/agendar/pagar?id_grupo_cita=${GROUP}&id_intent=${INTENT}`]}>
    <Routes><Route path="/agendar" element={<EligibilityFlow />}>
      <Route path="pagar" element={<Probe showPayment />} />
    </Route></Routes>
  </MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { user: null, roles: [], isAuthenticated: false, isHydrated: true, isHydrating: false };
  mocks.eligibilityGet.mockReset();
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

test.each([
  ['false', { booking: true, vipPurchase: false, pixelpaySale: false }],
  ['undefined', { booking: true, vipPurchase: false, pixelpaySale: undefined }],
  ['campo ausente', { booking: true, vipPurchase: false }],
  ['tipo incorrecto', { booking: true, vipPurchase: false, pixelpaySale: 'true' }],
])('QA con elegibilidad real %s oculta formulario y bloquea callback', async (_label, data) => {
  mocks.eligibilityGet.mockResolvedValue({ data });
  mountEligibility();
  await waitFor(() => expect(eligibility.checking).toBe(false));
  await waitFor(() => expect(flow.paymentRestoring).toBe(false));
  expect(mocks.eligibilityGet).toHaveBeenCalledWith('/v1/commerce/eligibility', expect.objectContaining({ cache: false, dedupe: false }));
  expect(screen.queryByLabelText('Numero de tarjeta')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pagar con PixelPay Sandbox' })).not.toBeInTheDocument();
  expect(flow.paymentCanExecuteSale).toBe(false);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).not.toHaveBeenCalled();
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem(KEY))).toMatchObject({ id_grupo_cita: GROUP, id_intent: INTENT });
});

test('QA con consulta inicial pendiente permanece cerrado hasta autorización explícita', async () => {
  let finish;
  mocks.eligibilityGet.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  mountEligibility();
  await waitFor(() => expect(flow.paymentRestoring).toBe(false));
  expect(eligibility.checking).toBe(true);
  expect(screen.queryByLabelText('Numero de tarjeta')).not.toBeInTheDocument();
  expect(flow.paymentCanExecuteSale).toBe(false);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).not.toHaveBeenCalled();
  await act(async () => { finish({ data: { booking: true, vipPurchase: false, pixelpaySale: true } }); });
  expect(flow.paymentCanExecuteSale).toBe(true);
  expect(screen.getByLabelText('Numero de tarjeta')).toBeInTheDocument();
});

test('QA con fallo de consulta inicial no presenta ni ejecuta Sale', async () => {
  mocks.eligibilityGet.mockRejectedValue(new Error('Eligibility unavailable'));
  mountEligibility();
  await waitFor(() => expect(eligibility.checking).toBe(false));
  await waitFor(() => expect(flow.paymentRestoring).toBe(false));
  expect(screen.queryByLabelText('Numero de tarjeta')).not.toBeInTheDocument();
  expect(flow.paymentCanExecuteSale).toBe(false);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).not.toHaveBeenCalled();
});

test('QA autorizado explícitamente permite formulario válido y un único envío', async () => {
  mocks.eligibilityGet.mockResolvedValue({ data: { booking: true, vipPurchase: false, pixelpaySale: true } });
  salePublicPixelPay.mockResolvedValue({ ...READY, estado_intent_codigo: 'pendiente_confirmacion', pending_confirmation: true });
  mountEligibility();
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  for (const [label, value] of [
    ['Nombre del titular', 'Cliente Sintetico'], ['Numero de tarjeta', '4111111111111111'],
    ['Expiracion', '12/39'], ['CVV', '123'], ['Telefono de contacto', '99999999'],
    ['Direccion de facturacion', 'Barrio Centro calle uno'], ['Ciudad', 'Tegucigalpa'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Pagar con PixelPay Sandbox' }));
  await waitFor(() => expect(salePublicPixelPay).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(false));
  expect(salePublicPixelPay.mock.calls[0][1]).toMatchObject({ authenticated: true });
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
});

test('QA revoca formulario y callback si falla la renovación tras autorización válida', async () => {
  mocks.eligibilityGet.mockResolvedValueOnce({ data: { booking: true, vipPurchase: false, pixelpaySale: true } });
  mountEligibility();
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  let fail;
  mocks.eligibilityGet.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(eligibility.checking).toBe(true);
  expect(eligibility.booking).toBe(true);
  expect(screen.queryByLabelText('Numero de tarjeta')).not.toBeInTheDocument();
  expect(flow.paymentCanExecuteSale).toBe(false);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).not.toHaveBeenCalled();
  await act(async () => { fail(new Error('Eligibility unavailable')); });
  expect(eligibility.checking).toBe(false);
  expect(eligibility.booking).toBe(true);
  expect(screen.queryByLabelText('Numero de tarjeta')).not.toBeInTheDocument();
  expect(flow.paymentCanExecuteSale).toBe(false);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem(KEY))).toMatchObject({ id_grupo_cita: GROUP, id_intent: INTENT });
});

test('capacidad true conserva validación de importe positivo antes de permitir Sale', async () => {
  mocks.eligibilityGet.mockResolvedValue({ data: { booking: true, vipPurchase: false, pixelpaySale: true } });
  getPublicPaymentStatus.mockResolvedValue({ ...READY, monto_hnl: 0 });
  mountEligibility();
  await waitFor(() => expect(eligibility.pixelpaySale).toBe(true));
  await waitFor(() => expect(flow.paymentRestoring).toBe(false));
  expect(flow.paymentCanExecuteSale).toBe(false);
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).not.toHaveBeenCalled();
});

test('entorno Live conserva contrato legacy cuando elegibilidad omite pixelpaySale', async () => {
  mocks.eligibilityGet.mockResolvedValue({ data: { booking: true, vipPurchase: false } });
  salePublicPixelPay.mockResolvedValue({ ...READY, estado_intent_codigo: 'pendiente_confirmacion', pending_confirmation: true });
  mountEligibility({ entorno: 'production', environment: 'live' });
  await waitFor(() => expect(eligibility.checking).toBe(false));
  await waitFor(() => expect(flow.paymentCanExecuteSale).toBe(true));
  expect(screen.getByLabelText('Numero de tarjeta')).toBeInTheDocument();
  await act(async () => { await flow.completePixelPayPayment({ card: {}, billing: {} }); });
  expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
});
