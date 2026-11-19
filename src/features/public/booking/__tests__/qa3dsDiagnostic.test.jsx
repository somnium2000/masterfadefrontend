// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PublicBookingProvider } from '../BookingFlowContext.jsx';
import PublicBookingPaymentStep from '../PublicBookingPaymentStep.jsx';
import useBookingPayment from '../hooks/useBookingPayment.js';
import { getPublicPaymentStatus, queryPublicPixelPayStatus, salePublicPixelPay, requestSongbirdBridge } from '../publicBookingApi.js';

vi.mock('../publicBookingApi.js', () => ({
  completePublicMockPayment: vi.fn(), completePublicSimulatorPayment: vi.fn(), createPublicPaymentIntent: vi.fn(),
  getPublicPaymentStatus: vi.fn(), queryPublicPixelPayStatus: vi.fn(), salePublicPixelPay: vi.fn(), requestSongbirdBridge: vi.fn(),
}));
const GROUP = '11111111-1111-4111-8111-111111111111';
const INTENT = '22222222-2222-4222-8222-222222222222';
const KEY = 'masterfade.publicBookingPayment.v1';
const email = 'synthetic@example.test';
const input = { groupId: GROUP, intentId: INTENT, titularEmail: email, card: {}, billing: {} };
const fresh = { id_grupo_cita: GROUP, id_intent: INTENT, estado_intent_codigo: 'link_generado', monto_hnl: 1, qa_3ds_diagnostic: true };
const pending = { ...fresh, estado_intent_codigo: 'pendiente_confirmacion', pending_confirmation: true };
function seed(intent = fresh) {
  sessionStorage.setItem(KEY, JSON.stringify({ id_grupo_cita: GROUP, id_intent: INTENT, titular_email: email, paymentIntent: intent }));
}
function mountPayment(overrides = {}) {
  const context = { paymentIntent: fresh, holdRemainingMs: 60000, holdExpired: false,
    holdTotalToPay: 1, bookingBlocksSummary: [], paymentTitularEmail: email,
    pixelpaySale: false, pixelpay3dsDiagnostic: true, paymentCanExecuteSale: false, paymentCanObserve3ds: true,
    observePixelPay3ds: vi.fn(), completePixelPayPayment: vi.fn(),
    refreshPaymentStatus: vi.fn(), goToConfirm: vi.fn(), cancelBookingFlow: vi.fn(), ...overrides };
  render(<PublicBookingProvider value={context}><PublicBookingPaymentStep /></PublicBookingProvider>);
  return context;
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear();
  vi.stubEnv('VITE_ENTORNO', 'qa'); vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay'); vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test.each([false, true])('stale diagnostic and bridge grants cannot initiate a marked attempt, Sale grant=%s', pixelpaySale => {
  const context = mountPayment({ pixelpaySongbirdBridge: true, paymentOwnerId: 'synthetic-owner',
    pixelpaySale, paymentCanExecuteSale: true });
  expect(screen.queryByLabelText('CVV')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Observar respuesta Sandbox (una operación)' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Iniciar autenticación 3DS' })).toBeNull();
  expect(context.observePixelPay3ds).not.toHaveBeenCalled();
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();
  expect(requestSongbirdBridge).not.toHaveBeenCalled();
  expect(salePublicPixelPay).not.toHaveBeenCalled();
  expect(screen.getByText('Pago con autenticación no disponible')).toBeTruthy();
  expect(screen.queryByText(/El resultado de esta operación sigue pendiente de verificación/)).toBeNull();
});

test('confirmed backend failure does not become an uncertain payment after bridge retirement', () => {
  mountPayment({ paymentIntent: { ...fresh, estado_intent_codigo: 'fallido' },
    paymentResult: { ...fresh, estado_intent_codigo: 'fallido', pending_confirmation: false } });
  expect(screen.getByText('Pago Sandbox no completado')).toBeTruthy();
  expect(screen.getByText(/El backend informó que el pago no pudo completarse/)).toBeTruthy();
  expect(screen.queryByText(/El resultado de esta operación sigue pendiente de verificación/)).toBeNull();
  expect(salePublicPixelPay).not.toHaveBeenCalled();
});

test('pending checkout keeps uncertainty and local verification without mounting the old bridge', () => {
  const context = mountPayment({ paymentIntent: pending, paymentResult: pending,
    pixelpaySongbirdBridge: true, paymentOwnerId: 'synthetic-owner' });
  expect(screen.getByText(/El resultado de esta operación sigue pendiente de verificación/)).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Autenticación 3DS de Sandbox' })).toBeNull();
  expect(screen.queryByLabelText('CVV')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado del pago' }));
  expect(context.refreshPaymentStatus).toHaveBeenCalledWith({ queryPixelPayProvider: false });
  expect(context.observePixelPay3ds).not.toHaveBeenCalled();
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();
  expect(requestSongbirdBridge).not.toHaveBeenCalled();
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
});

test('retired direct diagnostic callback does not send a Sale or mark an unsent attempt pending', async () => {
  seed();
  const view = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  act(() => view.result.current.restorePaymentContext(GROUP));
  await act(async () => expect(await view.result.current.observePixelPay3dsOnce(input)).toBeNull());
  expect(salePublicPixelPay).not.toHaveBeenCalled();
  expect(view.result.current.paymentIntent).toMatchObject(fresh);
  expect(view.result.current.paymentIntent.pending_confirmation).not.toBe(true);
});

test('restored uncertain attempt survives remount and only queries local state without a repeat Sale', async () => {
  seed(pending);
  const first = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  act(() => first.result.current.restorePaymentContext(GROUP));
  first.unmount();
  const second = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  act(() => second.result.current.restorePaymentContext(GROUP));
  getPublicPaymentStatus.mockResolvedValue(pending);
  await act(async () => {
    expect(await second.result.current.observePixelPay3dsOnce(input)).toBeNull();
    expect(await second.result.current.salePixelPayOnce(input)).toBeNull();
    await second.result.current.queryPixelPayStatusOnce(input);
  });
  expect(salePublicPixelPay).not.toHaveBeenCalled();
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  expect(getPublicPaymentStatus).toHaveBeenCalledOnce();
  expect(second.result.current.paymentIntent).toMatchObject({ qa_3ds_diagnostic: true, pending_confirmation: true });
});

test('local status still restores historical diagnostic recovery without persisting opaque fields', async () => {
  const view = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  getPublicPaymentStatus.mockResolvedValue({ ...pending, payload: 'OPAQUE_CANARY', card_number: 'PAN_CANARY',
    qa_3ds_observation: { raw: 'SECRET_CANARY' } });
  await act(async () => view.result.current.fetchPaymentStatusOnce(input));
  await waitFor(() => expect(view.result.current.paymentIntent?.qa_3ds_diagnostic).toBe(true));
  const stored = sessionStorage.getItem(KEY);
  for (const canary of ['OPAQUE_CANARY', 'SECRET_CANARY', 'PAN_CANARY', 'qa_3ds_observation', 'card_number']) expect(stored).not.toContain(canary);
  expect(salePublicPixelPay).not.toHaveBeenCalled();
});

test('verified backend approval remains confirmed in the historical diagnostic presentation', () => {
  mountPayment({ paymentIntent: { ...fresh, booking_confirmed: true }, paymentResult: { ...fresh, booking_confirmed: true } });
  expect(screen.getByText('Pago Sandbox confirmado')).toBeTruthy();
  expect(screen.getByText('El backend verificó el pago Sandbox y confirmó la cita.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Iniciar autenticación 3DS' })).toBeNull();
});
