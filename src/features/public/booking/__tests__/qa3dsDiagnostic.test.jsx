// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { isQaPixelPay3dsDiagnosticAuthorized } from '../../../payments/pixelPaySaleCapability.js';
import { PublicBookingProvider } from '../BookingFlowContext.jsx';
import PublicBookingPaymentStep from '../PublicBookingPaymentStep.jsx';
import useBookingPayment from '../hooks/useBookingPayment.js';
import { getPublicPaymentStatus, queryPublicPixelPayStatus, salePublicPixelPay, requestSongbirdBridge } from '../publicBookingApi.js';

vi.mock('../publicBookingApi.js', () => ({
  completePublicMockPayment: vi.fn(), completePublicSimulatorPayment: vi.fn(), createPublicPaymentIntent: vi.fn(),
  getPublicPaymentStatus: vi.fn(), queryPublicPixelPayStatus: vi.fn(), salePublicPixelPay: vi.fn(), requestSongbirdBridge:vi.fn(),
}));
const GROUP = '11111111-1111-4111-8111-111111111111';
const INTENT = '22222222-2222-4222-8222-222222222222';
const KEY = 'masterfade.publicBookingPayment.v1';
const email = 'synthetic@example.test';
const input = { groupId: GROUP, intentId: INTENT, titularEmail: email, card: { number: '0000000000000000', cvv: '000', holder: 'Synthetic fixture', expire: '12/39' }, billing: {} };
const fresh = { id_grupo_cita: GROUP, id_intent: INTENT, estado_intent_codigo: 'link_generado', monto_hnl: 1, qa_3ds_diagnostic: true };
const pending = { ...fresh, estado_intent_codigo: 'pendiente_confirmacion', pending_confirmation: true };
function seed(intent = fresh) {
  sessionStorage.setItem(KEY, JSON.stringify({ id_grupo_cita: GROUP, id_intent: INTENT, titular_email: email, paymentIntent: intent }));
}
function mountPayment(overrides = {}) {
  const context = { paymentIntent: fresh, holdRemainingMs: 60000, holdExpired: false,
    holdTotalToPay: 1, bookingBlocksSummary: [], paymentTitularEmail: email,
    pixelpaySale: false, pixelpay3dsDiagnostic: true, paymentCanExecuteSale: false, paymentCanObserve3ds: true,
    observePixelPay3ds: vi.fn().mockResolvedValue(pending), completePixelPayPayment: vi.fn(),
    refreshPaymentStatus: vi.fn(), goToConfirm: vi.fn(), cancelBookingFlow: vi.fn(), ...overrides };
  render(<PublicBookingProvider value={context}><PublicBookingPaymentStep /></PublicBookingProvider>);
  return context;
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear();
  vi.stubEnv('VITE_ENTORNO', 'qa'); vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay'); vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test.each([undefined, false, null, 'true', 1])('diagnostic capability %s stays closed even with booking', cap => {
  expect(isQaPixelPay3dsDiagnosticAuthorized(cap)).toBe(false);
  const context = mountPayment({ pixelpay3dsDiagnostic: cap });
  expect(screen.queryByRole('button', { name: 'Observar respuesta Sandbox (una operación)' })).toBeNull();
  expect(context.observePixelPay3ds).not.toHaveBeenCalled();
});
test.each([['VITE_ENTORNO', 'production'], ['VITE_PIXELPAY_ENV', 'live'], ['VITE_PAYMENT_PROVIDER', 'simulator']])('diagnostic never opens in %s=%s', (key, value) => {
  vi.stubEnv(key, value);
  expect(isQaPixelPay3dsDiagnosticAuthorized(true)).toBe(false);
  const context = mountPayment();
  expect(screen.queryByRole('button', { name: 'Observar respuesta Sandbox (una operación)' })).toBeNull();
  expect(context.observePixelPay3ds).not.toHaveBeenCalled();
});
test('fresh marked intent can observe once, clears sensitive fields and never uses normal Sale', async () => {
  let finish;
  const context = mountPayment({ pixelpaySongbirdBridge:true,paymentOwnerId:'synthetic-owner',
    observePixelPay3ds: vi.fn(() => new Promise(resolve => { finish = resolve; })) });
  for (const [label, value] of [['Nombre del titular', 'Synthetic fixture'], ['Numero de tarjeta', '0000000000000000'],
    ['Expiracion', '12/39'], ['CVV', '000'], ['Telefono de contacto', '99999999'],
    ['Direccion de facturacion', 'Barrio Central calle uno'], ['Ciudad', 'Tegucigalpa']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  expect(screen.getByText(/No garantiza un desafío 3DS/)).toBeTruthy();
  const button = screen.getByRole('button', { name: 'Observar respuesta Sandbox (una operación)' });
  fireEvent.click(button); fireEvent.click(button);
  expect(context.observePixelPay3ds).toHaveBeenCalledOnce();
  expect(requestSongbirdBridge).not.toHaveBeenCalled();
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();
  await act(async () => finish(pending));
  expect(screen.getByLabelText('CVV').value).toBe('');
  expect(screen.getByLabelText('Numero de tarjeta').value).toBe('');
  expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain(input.card.number);
});
test('pending marked intent only verifies local state even after diagnostic capability expires', () => {
  const context = mountPayment({ paymentIntent: pending, paymentResult: pending, pixelpay3dsDiagnostic: false, paymentCanObserve3ds: false });
  expect(screen.getByText('Observación Sandbox detenida')).toBeTruthy();
  expect(screen.queryByLabelText('CVV')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Observar respuesta Sandbox (una operación)' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado del pago' }));
  expect(context.refreshPaymentStatus).toHaveBeenCalledWith({ queryPixelPayProvider: false });
  expect(context.observePixelPay3ds).not.toHaveBeenCalled();
});

test('pending checkout exposes bridge metadata only with its own QA capability; it never calls Sale or external Status',async()=>{
  requestSongbirdBridge.mockResolvedValue({state:'contract_blocked',can_start:false});
  const context=mountPayment({paymentIntent:pending,paymentResult:pending,paymentOwnerId:'synthetic-owner',
    pixelpaySongbirdBridge:true,pixelpay3dsDiagnostic:false,paymentCanObserve3ds:false});
  await screen.findByText(/El puente conservó el intento/);
  expect(requestSongbirdBridge.mock.calls.map(c=>c[0].action)).toEqual(['status']);
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();expect(context.observePixelPay3ds).not.toHaveBeenCalled();
  expect(salePublicPixelPay).not.toHaveBeenCalled();expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('CVV')).toBeNull();
});

test('fresh checkout never reads an unreserved bridge state',()=>{
  mountPayment({pixelpaySongbirdBridge:true,paymentOwnerId:'synthetic-owner'});
  expect(requestSongbirdBridge).not.toHaveBeenCalled();
});
test('terminal verified approval remains a confirmed payment in diagnostic presentation', () => {
  mountPayment({ paymentIntent: { ...fresh, booking_confirmed: true }, paymentResult: { ...fresh, booking_confirmed: true },
    paymentCanObserve3ds: false, pixelpay3dsDiagnostic: false });
  expect(screen.getByText('Pago Sandbox confirmado')).toBeTruthy();
  expect(screen.getByText('El backend verificó el pago Sandbox y confirmó la cita.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Observar respuesta Sandbox (una operación)' })).toBeNull();
});
test.each([
  { estado_intent_codigo: 'confirmado', booking_confirmed: true },
  { estado_intent_codigo: 'fallido', booking_confirmed: false },
])('diagnostic preserves terminal response $estado_intent_codigo without second POST', async terminal => {
  seed();salePublicPixelPay.mockResolvedValue({ ...fresh, ...terminal, pending_confirmation: false });
  const view = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  act(() => view.result.current.restorePaymentContext(GROUP));
  await act(async () => view.result.current.observePixelPay3dsOnce(input));
  expect(view.result.current.paymentResult).toMatchObject({ ...terminal, pending_confirmation: false, qa_3ds_diagnostic: true });
  await act(async () => expect(await view.result.current.observePixelPay3dsOnce(input)).toBeNull());
  expect(salePublicPixelPay).toHaveBeenCalledOnce();
});
test('marked prefetch authorizes an initial diagnostic; concurrent normal action shares the same claim and no retry follows 202', async () => {
  seed(); let finish;
  salePublicPixelPay.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  act(() => view.result.current.restorePaymentContext(GROUP));
  let first, concurrent;
  act(() => {
    first = view.result.current.observePixelPay3dsOnce(input);
    concurrent = view.result.current.salePixelPayOnce(input);
  });
  expect(salePublicPixelPay).toHaveBeenCalledOnce();
  expect(JSON.parse(sessionStorage.getItem(KEY)).paymentIntent).toMatchObject({ qa_3ds_diagnostic: true, pending_confirmation: true });
  await act(async () => { finish({ ...pending, qa_3ds_observation: { opaque_payload_present: true } }); await Promise.all([first, concurrent]); });
  await act(async () => expect(await view.result.current.observePixelPay3dsOnce(input)).toBeNull());
  expect(salePublicPixelPay).toHaveBeenCalledOnce();
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  expect(salePublicPixelPay.mock.calls[0][0]).not.toHaveProperty('diagnostic');
  expect(salePublicPixelPay.mock.calls[0][1]).toMatchObject({ authenticated: true });
});
test('timeout preserves diagnostic recovery across real hook remount; direct Status becomes only local GET', async () => {
  seed(); salePublicPixelPay.mockRejectedValue(Object.assign(new Error('offline synthetic timeout'), { code: 'NETWORK_UNAVAILABLE', status: 0 }));
  const first = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  act(() => first.result.current.restorePaymentContext(GROUP));
  await act(async () => { await expect(first.result.current.observePixelPay3dsOnce(input)).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' }); });
  first.unmount();
  const second = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  act(() => second.result.current.restorePaymentContext(GROUP));
  getPublicPaymentStatus.mockResolvedValue(pending);
  await act(async () => {
    expect(await second.result.current.observePixelPay3dsOnce(input)).toBeNull();
    await second.result.current.queryPixelPayStatusOnce(input);
  });
  expect(salePublicPixelPay).toHaveBeenCalledOnce();
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  expect(getPublicPaymentStatus).toHaveBeenCalledOnce();
  expect(second.result.current.paymentIntent).toMatchObject({ qa_3ds_diagnostic: true, pending_confirmation: true });
});
test('local /estado can restore fresh diagnostic selection before first operation without persisting opaque fields', async () => {
  const view = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  getPublicPaymentStatus.mockResolvedValue({ ...fresh, payload: 'OPAQUE_CANARY', card_number: input.card.number,
    qa_3ds_observation: { raw: 'SECRET_CANARY' } });
  await act(async () => view.result.current.fetchPaymentStatusOnce(input));
  await waitFor(() => expect(view.result.current.paymentIntent?.qa_3ds_diagnostic).toBe(true));
  expect(view.result.current.paymentIntent.pending_confirmation).toBe(false);
  const stored = sessionStorage.getItem(KEY);
  for (const canary of ['OPAQUE_CANARY', 'SECRET_CANARY', input.card.number, 'qa_3ds_observation', 'card_number']) expect(stored).not.toContain(canary);
  salePublicPixelPay.mockResolvedValue(pending);
  await act(async () => view.result.current.observePixelPay3dsOnce(input));
  expect(salePublicPixelPay).toHaveBeenCalledOnce();
});
test('missing durable browser recovery prevents any diagnostic POST', async () => {
  const view = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
  try {
    await act(async () => { await expect(view.result.current.observePixelPay3dsOnce(input)).rejects.toMatchObject({ code: 'PIXELPAY_RECOVERY_CONTEXT_UNAVAILABLE' }); });
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  } finally { write.mockRestore(); }
});
test.each(['clear', 'group-change'])('late diagnostic timeout after %s cannot restore another hook context', async mode => {
  seed();let reject;
  salePublicPixelPay.mockReturnValue(new Promise((_resolve, no) => { reject = no; }));
  const view = renderHook(({groupId}) => useBookingPayment({ currentGroupId: groupId, authenticated: true }), {initialProps:{groupId:GROUP}});
  act(() => view.result.current.restorePaymentContext(GROUP));
  let started; act(() => { started = view.result.current.observePixelPay3dsOnce(input); });
  // Attach the rejection immediately; this is an aborted old checkout, not an unhandled request.
  const caught = started.catch(error => error);
  if(mode==='clear')act(() => view.result.current.clearPaymentState());
  else view.rerender({groupId:'33333333-3333-4333-8333-333333333333'});
  await act(async () => { reject(Object.assign(new Error('synthetic abort'), {name:'AbortError'}));await caught; });
  expect(view.result.current.paymentIntent).toBeNull();
  expect(view.result.current.paymentResult).toBeNull();
  expect(salePublicPixelPay).toHaveBeenCalledOnce();
  expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
});
