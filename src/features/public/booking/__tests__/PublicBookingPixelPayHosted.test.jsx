// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicBookingProvider } from '../BookingFlowContext.jsx';
import PublicBookingPaymentStep, { shouldQueryPixelPayProviderOnManualVerify } from '../PublicBookingPaymentStep.jsx';
import PublicBookingSuccessStep from '../PublicBookingSuccessStep.jsx';
import { resolvePaymentResumeContext } from '../paymentResumeContext.js';
import { shouldPreserveUnresolvedPaymentState } from '../PublicBookingFlow.jsx';

function context(overrides = {}) {
  return {
    bookingBlocksSummary: [],
    paymentIntent: { id_intent: 'intent-1', monto_hnl: 300, estado_intent_codigo: 'link_generado', payment_channel: 'sdk', hosted_available: true },
    holdTotalToPay: 300, holdExpired: false, paymentTitularEmail: 'qa@example.test',
    paymentCanExecuteSale: true, paymentCanStartHosted: true,
    completePixelPayPayment: vi.fn(), completePixelPayHostedPayment: vi.fn(),
    refreshPaymentStatus: vi.fn(), cancelBookingFlow: vi.fn(), goToConfirm: vi.fn(),
    ...overrides,
  };
}

function mount(overrides = {}) {
  const value = context(overrides);
  render(<PublicBookingProvider value={value}><PublicBookingPaymentStep /></PublicBookingProvider>);
  return value;
}

beforeEach(() => { vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay'); vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox'); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('Hosted booking UI', () => {
  it('preserva SDK por defecto y no ofrece Hosted sin capacidad del backend', () => {
    mount({ paymentIntent: { id_intent: 'intent-1', monto_hnl: 300, estado_intent_codigo: 'link_generado' } });
    expect(screen.getByLabelText('CVV')).toBeTruthy();
    expect(screen.queryByLabelText('Dónde deseas pagar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continuar en PixelPay Sandbox' })).toBeNull();
  });

  it('Hosted omite tarjeta y facturación local y deduplica envío concurrente', async () => {
    let resolveStart;
    const value = mount({ completePixelPayHostedPayment: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })) });
    expect(screen.getByLabelText('CVV')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dónde deseas pagar'), { target: { value: 'hosted' } });
    expect(screen.queryByLabelText('CVV')).toBeNull();
    expect(screen.queryByLabelText('Numero de tarjeta')).toBeNull();
    expect(screen.queryByLabelText('Direccion de facturacion')).toBeNull();
    const startButton = screen.getByRole('button', { name: 'Continuar en PixelPay Sandbox' });
    fireEvent.click(startButton);
    fireEvent.click(startButton);
    expect(value.completePixelPayHostedPayment).toHaveBeenCalledTimes(1);
    expect(value.completePixelPayPayment).not.toHaveBeenCalled();
    await act(async () => { resolveStart({ booking_confirmed: false }); });
  });

  it('un Hosted iniciado conserva verificación durable al cancelar o expirar, sin ofrecer otro pago', () => {
    const value = mount({
      paymentIntent: { id_intent: 'intent-1', payment_channel: 'hosted', monto_hnl: 300, estado_intent_codigo: 'pendiente_confirmacion' },
      paymentResult: { payment_channel: 'hosted', estado_intent_codigo: 'pendiente_confirmacion', pending_confirmation: true, booking_confirmed: false },
      holdExpired: true, holdRemainingMs: 0, paymentCanExecuteSale: false, paymentCanStartHosted: false,
    });
    expect(screen.getByText('Pago en verificación', { selector: 'h4' })).toBeTruthy();
    expect(screen.getByText(/Volver del portal o cerrarlo no confirma ni cancela el pago/)).toBeTruthy();
    expect(screen.queryByLabelText('CVV')).toBeNull();
    expect(screen.queryByLabelText('Dónde deseas pagar')).toBeNull();
    expect(screen.queryByRole('button', { name: /Continuar en PixelPay/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Pagar con/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar estado del pago' }));
    expect(value.refreshPaymentStatus).toHaveBeenCalledExactlyOnceWith({ queryPixelPayProvider: false });
  });

  it('no confirma en la pantalla de resultado por paid ni por parámetros modificables del retorno', () => {
    const groupId = '11111111-2222-4333-8444-555555555555';
    const intentId = '99999999-9999-4999-8999-999999999999';
    const resume = resolvePaymentResumeContext({
      search: `?id_grupo_cita=${groupId}&id_intent=${intentId}&paid=true&status=paid&payment_hash=forged&_complete=1`,
      pendingContext: null,
      bookingPaymentContext: { id_grupo_cita: groupId, id_intent: intentId, titular_email: 'qa@example.test', payment_channel: 'hosted' },
    });
    expect(resume).toEqual({ id_grupo_cita: groupId, id_intent: intentId, titular_email: 'qa@example.test', payment_channel: 'hosted' });
    const value = context({
      paymentIntent: { id_intent: intentId, id_grupo_cita: groupId, payment_channel: 'hosted', estado_intent_codigo: 'paid' },
      paymentResult: { payment_channel: 'hosted', status: 'paid', booking_confirmed: false },
    });
    render(<PublicBookingProvider value={value}><PublicBookingSuccessStep /></PublicBookingProvider>);
    expect(screen.queryByText('¡Reserva confirmada!')).toBeNull();
    expect(screen.getByText('Pago en verificación')).toBeTruthy();
  });

  it('nunca usa Status SDK para Hosted aunque reciba pending_confirmation', () => {
    expect(shouldQueryPixelPayProviderOnManualVerify({
      providerType: 'pixelpay',
      paymentIntent: { payment_channel: 'hosted' },
      paymentResult: { pending_confirmation: true },
    })).toBe(false);
  });

  it('permite resolver el pendiente optimista solo por rechazo previo más canal SDK canónico', () => {
    const pending = { payment_channel: 'hosted', pending_confirmation: true };
    expect(shouldPreserveUnresolvedPaymentState({
      currentResult: pending,
      paymentIntent: pending,
      nextResult: { payment_channel: 'sdk', hosted_start_rejected: true, estado_intent_codigo: 'link_generado' },
    })).toBe(false);
    expect(shouldPreserveUnresolvedPaymentState({
      currentResult: pending,
      paymentIntent: pending,
      nextResult: { payment_channel: 'sdk', estado_intent_codigo: 'link_generado' },
    })).toBe(true);
  });
});
