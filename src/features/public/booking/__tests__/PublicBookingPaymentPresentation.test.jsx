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
