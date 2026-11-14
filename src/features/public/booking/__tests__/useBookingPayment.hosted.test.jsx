// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useBookingPayment from '../hooks/useBookingPayment.js';
import { getPublicPaymentStatus, queryPublicPixelPayStatus, salePublicPixelPay } from '../publicBookingApi.js';
import { getPixelPayHostedPaymentStatus, startPixelPayHostedPayment } from '../pixelPayHostedApi.js';
import { BOOKING_PAYMENT_CONTEXT_STORAGE_KEY } from '../paymentResumeContext.js';

vi.mock('../publicBookingApi.js', () => ({
  completePublicMockPayment: vi.fn(), completePublicSimulatorPayment: vi.fn(),
  createPublicPaymentIntent: vi.fn(), getPublicPaymentStatus: vi.fn(),
  queryPublicPixelPayStatus: vi.fn(), salePublicPixelPay: vi.fn(),
}));
vi.mock('../pixelPayHostedApi.js', () => ({
  getPixelPayHostedPaymentStatus: vi.fn(), startPixelPayHostedPayment: vi.fn(),
}));

const GROUP = '11111111-2222-4333-8444-555555555555';
const INTENT = '99999999-9999-4999-8999-999999999999';
const EMAIL = 'qa@example.test';
const input = { groupId: GROUP, intentId: INTENT, titularEmail: EMAIL };
const intent = { id_grupo_cita: GROUP, id_intent: INTENT, hosted_available: true, payment_channel: 'sdk', monto_hnl: 300, estado_intent_codigo: 'link_generado' };
const started = { id_grupo_cita: GROUP, id_intent: INTENT, payment_channel: 'hosted', checkout_url: 'https://pixelpay.app/sandbox/token/checkout/example', pending_confirmation: true, booking_confirmed: false, hosted_state: 'checkout_ready' };

async function mountEligible() {
  const view = renderHook(() => useBookingPayment({ currentGroupId: GROUP, authenticated: true }));
  await act(async () => { view.result.current.setPaymentIntent(intent); });
  return view;
}

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
afterEach(cleanup);

describe('Hosted start and durable recovery', () => {
  it('persiste identidad y canal antes del request, deduplica doble clic y no usa Sale ni Status SDK', async () => {
    let resolveStart;
    startPixelPayHostedPayment.mockImplementationOnce(() => {
      const stored = JSON.parse(sessionStorage.getItem(BOOKING_PAYMENT_CONTEXT_STORAGE_KEY));
      expect(stored).toMatchObject({ id_intent: INTENT, titular_email: EMAIL, paymentIntent: { payment_channel: 'hosted', hosted_state: 'creating' } });
      return new Promise((resolve) => { resolveStart = resolve; });
    });
    const view = await mountEligible();
    await act(async () => {
      const first = view.result.current.startPixelPayHostedOnce(input);
      const second = view.result.current.startPixelPayHostedOnce(input);
      resolveStart(started);
      expect(await first).toMatchObject({ checkout_url: started.checkout_url, booking_confirmed: false });
      await second;
    });
    expect(startPixelPayHostedPayment).toHaveBeenCalledTimes(1);
    expect(startPixelPayHostedPayment.mock.calls[0][1]).toMatchObject({ authenticated: true });
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
    const stored = sessionStorage.getItem(BOOKING_PAYMENT_CONTEXT_STORAGE_KEY);
    expect(stored).not.toContain('checkout_url');
    expect(stored).not.toContain('payment_hash');
  });

  it('un timeout bloquea nueva creación y se recupera con consulta durable, incluso tras recargar', async () => {
    startPixelPayHostedPayment.mockRejectedValueOnce(new Error('timeout'));
    const first = await mountEligible();
    await act(async () => { await expect(first.result.current.startPixelPayHostedOnce(input)).rejects.toThrow('timeout'); });
    await act(async () => { expect(await first.result.current.startPixelPayHostedOnce(input)).toBeNull(); });
    first.unmount();
    getPixelPayHostedPaymentStatus.mockResolvedValue({ ...started, checkout_url: undefined, hosted_state: 'creation_uncertain' });
    const second = renderHook(() => useBookingPayment({ currentGroupId: GROUP }));
    await act(async () => {
      second.result.current.restorePaymentContext(GROUP);
      await second.result.current.queryPixelPayStatusOnce(input);
      expect(await second.result.current.startPixelPayHostedOnce(input)).toBeNull();
      expect(await second.result.current.salePixelPayOnce(input)).toBeNull();
    });
    expect(startPixelPayHostedPayment).toHaveBeenCalledTimes(1);
    expect(getPixelPayHostedPaymentStatus).toHaveBeenCalledTimes(1);
    expect(getPublicPaymentStatus).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(second.result.current.paymentResult).toMatchObject({ payment_channel: 'hosted', booking_confirmed: false });
  });

  it('acepta 202 sin URL y conserva el estado pendiente que devuelve el backend', async () => {
    startPixelPayHostedPayment.mockResolvedValueOnce({
      ...started, checkout_url: undefined, hosted_state: 'creation_uncertain', code: 'PIXELPAY_HOSTED_CONFIRMATION_BLOCKED',
    });
    const view = await mountEligible();
    await act(async () => {
      expect(await view.result.current.startPixelPayHostedOnce(input)).toMatchObject({
        hosted_state: 'creation_uncertain', code: 'PIXELPAY_HOSTED_CONFIRMATION_BLOCKED', booking_confirmed: false,
      });
    });
    expect(view.result.current.paymentIntent.hosted_state).toBe('creation_uncertain');
  });

  it('un rechazo previo al claim recupera SDK únicamente tras consultar su canal canónico', async () => {
    startPixelPayHostedPayment.mockRejectedValueOnce(Object.assign(new Error('conflict'), {
      status: 409, data: { error: { code: 'PIXELPAY_HOSTED_PREVIOUS_ATTEMPT_EXISTS' } },
    }));
    getPublicPaymentStatus.mockResolvedValueOnce({ ...intent, estado_intent_codigo: 'pendiente_confirmacion', booking_confirmed: false });
    const view = await mountEligible();
    await act(async () => { await expect(view.result.current.startPixelPayHostedOnce(input)).rejects.toThrow(); });
    expect(view.result.current.paymentIntent.payment_channel).toBe('hosted');
    await act(async () => {
      expect(await view.result.current.fetchPaymentStatusOnce(input)).toMatchObject({ payment_channel: 'sdk', hosted_start_rejected: true });
    });
    expect(view.result.current.paymentIntent.payment_channel).toBe('sdk');
    expect(getPixelPayHostedPaymentStatus).not.toHaveBeenCalled();
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  it('404 Hosted consulta el canal canónico pero no desbloquea una creación incierta', async () => {
    startPixelPayHostedPayment.mockRejectedValueOnce(new Error('network timeout'));
    getPixelPayHostedPaymentStatus.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    getPublicPaymentStatus.mockResolvedValueOnce({ ...intent, booking_confirmed: false });
    const view = await mountEligible();
    await act(async () => { await expect(view.result.current.startPixelPayHostedOnce(input)).rejects.toThrow(); });
    await act(async () => {
      await view.result.current.fetchPaymentStatusOnce(input);
      expect(await view.result.current.startPixelPayHostedOnce(input)).toBeNull();
      expect(await view.result.current.salePixelPayOnce(input)).toBeNull();
    });
    expect(view.result.current.paymentIntent).toMatchObject({ payment_channel: 'hosted', hosted_state: 'creation_uncertain' });
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(startPixelPayHostedPayment).toHaveBeenCalledTimes(1);
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
    expect(salePublicPixelPay).not.toHaveBeenCalled();
  });

  it.each([
    { ...started, checkout_url: 'https://attacker.example/checkout' },
    { ...started, id_intent: '88888888-8888-4888-8888-888888888888' },
    { ...started, id_grupo_cita: '22222222-3333-4444-8555-666666666666' },
    { ...started, payment_channel: 'sdk' },
  ])('rechaza URL o identidad ajena sin volver a crear', async (response) => {
    startPixelPayHostedPayment.mockResolvedValueOnce(response);
    const view = await mountEligible();
    await act(async () => { await expect(view.result.current.startPixelPayHostedOnce(input)).rejects.toThrow(); });
    expect(view.result.current.paymentResult).toMatchObject({ booking_confirmed: false, hosted_state: 'creation_uncertain' });
    await act(async () => { expect(await view.result.current.startPixelPayHostedOnce(input)).toBeNull(); });
    expect(startPixelPayHostedPayment).toHaveBeenCalledTimes(1);
  });

  it('descubre Hosted en /estado sin storage y persiste el canal para las consultas siguientes', async () => {
    getPublicPaymentStatus.mockResolvedValueOnce({ ...started, checkout_url: undefined });
    getPixelPayHostedPaymentStatus.mockResolvedValueOnce({ ...started, checkout_url: undefined });
    const view = renderHook(() => useBookingPayment({ currentGroupId: GROUP }));
    await act(async () => {
      await view.result.current.fetchPaymentStatusOnce(input);
      await view.result.current.queryPixelPayStatusOnce(input);
    });
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(getPixelPayHostedPaymentStatus).toHaveBeenCalledTimes(1);
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
    expect(view.result.current.paymentIntent).toMatchObject({ id_intent: INTENT, payment_channel: 'hosted' });
  });

  it('una respuesta tardía tras limpiar el flujo no restaura la orden anterior', async () => {
    let resolveStart;
    startPixelPayHostedPayment.mockReturnValueOnce(new Promise((resolve) => { resolveStart = resolve; }));
    const view = await mountEligible();
    let pending;
    await act(async () => { pending = view.result.current.startPixelPayHostedOnce(input); });
    await act(async () => { view.result.current.clearPaymentState(); });
    await act(async () => { resolveStart(started); expect(await pending).toBeNull(); });
    expect(view.result.current.paymentIntent).toBeNull();
    expect(view.result.current.paymentResult).toBeNull();
    expect(sessionStorage.getItem(BOOKING_PAYMENT_CONTEXT_STORAGE_KEY)).toBeNull();
  });
});
