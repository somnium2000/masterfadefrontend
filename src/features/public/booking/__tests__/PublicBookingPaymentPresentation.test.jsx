// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PublicBookingProvider } from '../BookingFlowContext.jsx';
import PublicBookingPaymentStep from '../PublicBookingPaymentStep.jsx';

function bookingContext(overrides = {}) {
  return {
    bookingBlocksSummary: [{ id: 'person-1', alias: 'Cliente de prueba', isComplete: true,
      selectedDate: '2026-11-10', selectedTime: '09:00', barbero: { nombre_completo: 'Barbero de prueba' },
      selection_type: 'services', selectedServices: [{ id_servicio: 'service-1', nombre_servicio: 'Corte de cabello', precio_hnl: 300 }],
      selectedServiceIdsEffective: ['service-1'], total_hnl: 300 }],
    selectedBranch: { nombre_sucursal: 'MasterFade Suyapa' },
    paymentIntent: { id_intent: 'intent-1', monto_hnl: 300, estado_intent_codigo: 'link_generado' },
    holdPricing: { subtotal_hnl: 300, total_hnl: 300 }, holdTotalToPay: 300,
    holdRemainingMs: 354000, holdExpired: false, paymentTitularEmail: 'cliente@example.test',
    refreshPaymentStatus: vi.fn(), cancelBookingFlow: vi.fn(), goToConfirm: vi.fn(),
    completePixelPayPayment: vi.fn(), createPaymentIntentForHold: vi.fn(),
    ...overrides,
  };
}

function renderPayment(overrides) {
  const context = bookingContext(overrides);
  render(<PublicBookingProvider value={context}><PublicBookingPaymentStep /></PublicBookingProvider>);
  return context;
}

beforeEach(() => { vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay'); vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox'); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it('oculta el CVV y conserva la entrada numérica de hasta cuatro dígitos', () => {
  const context = renderPayment();
  const cvv = screen.getByLabelText('CVV');
  expect(cvv.type).toBe('password');
  expect(cvv.inputMode).toBe('numeric');
  expect(cvv.autocomplete).toBe('cc-csc');
  expect(cvv.maxLength).toBe(4);
  fireEvent.change(cvv, { target: { value: '12a345' } });
  expect(cvv.value).toBe('1234');
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();
});

it('presenta el resumen real, hold y CTA Sandbox sin ejecutar un pago', () => {
  const context = renderPayment();
  const summary = within(screen.getByText('Resumen de tu reserva').parentElement);
  expect(summary.getByText('MasterFade Suyapa')).toBeTruthy();
  expect(summary.getByText('Corte de cabello')).toBeTruthy();
  expect(summary.getByText(/Barbero de prueba/)).toBeTruthy();
  expect(summary.getByText(/05:54 restantes/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pagar con PixelPay Sandbox' })).toBeTruthy();
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al resumen' }));
  expect(context.goToConfirm).toHaveBeenCalledOnce();
});

it('en live no presenta Sandbox ni indica una aprobación sin evidencia', () => {
  vi.stubEnv('VITE_PIXELPAY_ENV', 'live');
  renderPayment();
  expect(screen.queryByText(/Sandbox/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Pagar con PixelPay' })).toBeTruthy();
  expect(screen.getByText('Datos de pago').parentElement.getAttribute('aria-current')).toBe('step');
});

it('mantiene pendiente sin CTA de cobro y conserva la verificación', () => {
  const context = renderPayment({ paymentResult: { pending_confirmation: true }, paymentCanExecuteSale: false });
  expect(screen.queryByRole('button', { name: /^Pagar con/ })).toBeNull();
  expect(screen.getAllByText(/No vuelvas a realizar el pago/).length).toBeGreaterThan(0);
  expect(screen.getByText('Procesando').parentElement.getAttribute('aria-current')).toBe('step');
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado del pago' }));
  expect(context.refreshPaymentStatus).toHaveBeenCalledOnce();
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();
});

it('capacidad Sale suspendida oculta tarjeta y cobro sin bloquear la consulta existente', () => {
  const context = renderPayment({ pixelpaySale: false, paymentCanExecuteSale: true });
  expect(screen.getByText(/El pago con PixelPay Sandbox aún no está habilitado/)).toBeTruthy();
  expect(screen.queryByLabelText('CVV')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Pagar con/ })).toBeNull();
  expect(screen.getByText(/temporalmente retenida y pendiente de pago/)).toBeTruthy();
  expect(screen.queryByText(/Estamos verificando el resultado del pago/)).toBeNull();
  expect(screen.queryByText(/No vuelvas a realizar el pago/)).toBeNull();
  expect(screen.getByText('Procesando').parentElement.getAttribute('aria-current')).toBeNull();
  expect(screen.getByText('Confirmación').parentElement.getAttribute('aria-current')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado del pago' }));
  expect(context.refreshPaymentStatus).toHaveBeenCalledOnce();
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();
});

it('hold vigente sin intent conserva resumen, vencimiento y estado pendiente sin inventar Sale', () => {
  renderPayment({ pixelpaySale: false, paymentIntent: null, holdExpiresAtIso: '2099-01-01T00:00:00Z' });
  expect(screen.getByText('Pago deshabilitado en QA')).toBeTruthy();
  expect(screen.getByText(/temporalmente retenida y pendiente de pago/)).toBeTruthy();
  expect(screen.getByText(/05:54 restantes/)).toBeTruthy();
  expect(screen.getByText(/Vencimiento: 2099/)).toBeTruthy();
  expect(screen.getByText('MasterFade Suyapa')).toBeTruthy();
  expect(screen.getByText('Corte de cabello')).toBeTruthy();
  expect(screen.getAllByText('L 300.00').length).toBeGreaterThan(0);
  expect(screen.queryByText(/Estamos verificando el resultado del pago/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Verificar estado del pago' }).disabled).toBe(true);
});

it('hold vencido con Sale suspendida no se presenta como reserva vigente ni confirmada', () => {
  renderPayment({ pixelpaySale: false, holdExpired: true, holdRemainingMs: 0,
    paymentResult: { estado_intent_codigo: 'expirado' } });
  expect(screen.getByText(/La reserva temporal venció; consulta su estado/)).toBeTruthy();
  expect(screen.queryByText(/temporalmente retenida y pendiente de pago/)).toBeNull();
  expect(screen.queryByText(/Reserva temporal activa/)).toBeNull();
  expect(screen.queryByText(/Estamos verificando el resultado del pago/)).toBeNull();
  expect(screen.getByText('Confirmación').parentElement.getAttribute('aria-current')).toBeNull();
});

it.each([
  { pending_confirmation: true, estado_intent_codigo: 'pendiente_confirmacion' },
  { manual_reconciliation_required: true, estado_intent_codigo: 'expirado' },
])('Sale suspendida conserva evidencia incierta y su advertencia aunque el hold venza: %j', paymentResult => {
  const context = renderPayment({ pixelpaySale: false, paymentResult, holdExpired: true, holdRemainingMs: 0 });
  expect(screen.queryByText('Pago deshabilitado en QA')).toBeNull();
  expect(screen.getByText('Tu pago requiere verificación. No vuelvas a realizar el pago.')).toBeTruthy();
  expect(screen.getByText('Procesando').parentElement.getAttribute('aria-current')).toBe('step');
  expect(screen.queryByRole('button', { name: /^Pagar con/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado del pago' }));
  expect(context.refreshPaymentStatus).toHaveBeenCalledWith({ queryPixelPayProvider: true });
  expect(context.completePixelPayPayment).not.toHaveBeenCalled();
});

it('recuperar contexto consulta la reserva sin marcar una Sale como procesada', () => {
  renderPayment({ pixelpaySale: false, paymentRestoring: true });
  expect(screen.getByText(/Estamos consultando el estado de la reserva temporal/)).toBeTruthy();
  expect(screen.queryByText(/Estamos verificando el resultado del pago/)).toBeNull();
  expect(screen.getByText('Procesando').parentElement.getAttribute('aria-current')).toBeNull();
});

it.each(['payment_attempt_id', 'payment_uuid', 'provider_session_id', 'transaction_id', 'provider_tx_id', 'referencia_externa'])('la identidad %s reportada evita afirmar que no hay una transacción previa', field => {
  renderPayment({ pixelpaySale: false, paymentResult: { [field]: 'synthetic-provider-reference' } });
  expect(screen.queryByText('Pago deshabilitado en QA')).toBeNull();
  expect(screen.getByText(/No vuelvas a realizar el pago/)).toBeTruthy();
});

it('evidencia guardada en el intent no desaparece por un resultado sin referencias', () => {
  renderPayment({ pixelpaySale: false,
    paymentIntent: { id_intent: 'intent-1', estado_intent_codigo: 'link_generado', payment_uuid: 'synthetic-provider-reference' },
    paymentResult: { estado_intent_codigo: 'expirado' }, holdExpired: true });
  expect(screen.queryByText('Pago deshabilitado en QA')).toBeNull();
  expect(screen.getByText(/No vuelvas a realizar el pago/)).toBeTruthy();
});

it('confirmación del backend prevalece sobre un estado textual anterior a Sale', () => {
  renderPayment({ pixelpaySale: false, paymentResult: { estado_intent_codigo: 'link_generado', booking_confirmed: true } });
  expect(screen.queryByText('Pago deshabilitado en QA')).toBeNull();
  expect(screen.queryByText(/temporalmente retenida y pendiente de pago/)).toBeNull();
  expect(screen.getByText('Confirmación').parentElement.getAttribute('aria-current')).toBe('step');
});

it('la incertidumbre conservada en el intent sigue visible y consultable', () => {
  const context = renderPayment({ pixelpaySale: false,
    paymentIntent: { id_intent: 'intent-1', estado_intent_codigo: 'expirado', pending_confirmation: true },
    paymentResult: { estado_intent_codigo: 'expirado' }, holdExpired: true });
  expect(screen.queryByText('Pago deshabilitado en QA')).toBeNull();
  expect(screen.getByText('Tu pago requiere verificación. No vuelvas a realizar el pago.')).toBeTruthy();
  expect(screen.getByText('Procesando').parentElement.getAttribute('aria-current')).toBe('step');
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado del pago' }));
  expect(context.refreshPaymentStatus).toHaveBeenCalledWith({ queryPixelPayProvider: true });
});

it('un estado desconocido no se interpreta como ausencia de transacción', () => {
  renderPayment({ pixelpaySale: false, paymentResult: { estado_intent_codigo: 'unknown-provider-state' } });
  expect(screen.queryByText('Pago deshabilitado en QA')).toBeNull();
  expect(screen.getByText(/No vuelvas a realizar el pago/)).toBeTruthy();
});

it('capacidad verdadera conserva formulario y progreso de datos de pago', () => {
  renderPayment({ pixelpaySale: true });
  expect(screen.getByLabelText('CVV')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pagar con PixelPay Sandbox' }).disabled).toBe(false);
  expect(screen.getByText('Datos de pago').parentElement.getAttribute('aria-current')).toBe('step');
});

it('capacidad ausente conserva el checkout anterior', () => {
  renderPayment();
  expect(screen.queryByText(/aún no está habilitado/)).toBeNull();
  expect(screen.getByLabelText('CVV')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pagar con PixelPay Sandbox' }).disabled).toBe(false);
});
