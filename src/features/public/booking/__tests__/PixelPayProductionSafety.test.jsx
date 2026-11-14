// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://masterfadeapp.com/agendar/pagar"}
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PublicBookingProvider } from '../BookingFlowContext.jsx';
import PublicBookingPaymentStep from '../PublicBookingPaymentStep.jsx';
import PlanPurchaseFlowDialog from '../../../plans/components/PlanPurchaseFlowDialog.jsx';

function renderBooking(overrides = {}) {
  const completePixelPayPayment = vi.fn();
  const context = {
    bookingBlocksSummary: [], selectedBranch: { nombre_sucursal: 'Sucursal sintetica' },
    paymentIntent: { id_intent: 'synthetic-intent', monto_hnl: 300, estado_intent_codigo: 'link_generado' },
    holdPricing: { subtotal_hnl: 300, total_hnl: 300 }, holdTotalToPay: 300,
    holdRemainingMs: 300000, holdExpired: false, paymentTitularEmail: 'synthetic@example.invalid',
    completePixelPayPayment, refreshPaymentStatus: vi.fn(), cancelBookingFlow: vi.fn(), goToConfirm: vi.fn(),
    createPaymentIntentForHold: vi.fn(),
    ...overrides,
  };
  render(<PublicBookingProvider value={context}><PublicBookingPaymentStep /></PublicBookingProvider>);
  return completePixelPayPayment;
}

function fillBooking() {
  for (const [label, value] of [
    ['Nombre del titular', 'Cliente sintetico'], ['Numero de tarjeta', '4111111111111111'],
    ['Expiracion', '1230'], ['CVV', '987'], ['Telefono de contacto', '99999999'],
    ['Direccion de facturacion', 'Blvd Suyapa'], ['Ciudad', 'Tegucigalpa'], ['Departamento', 'HN-CR'],
  ]) fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
}

function renderVip(props = {}) {
  const onConfirmPayment = vi.fn();
  render(<PlanPurchaseFlowDialog open step="payment"
    orderSummary={{ plan: { nombre_plan: 'VIP', beneficios: [] }, totales: { total_hnl: 300 } }}
    onConfirmPayment={onConfirmPayment} {...props} />);
  return onConfirmPayment;
}

function fillVip() {
  for (const [label, value] of [
    ['Nombre del titular', 'Cliente sintetico'], ['Numero de tarjeta', '4111111111111111'],
    ['Vencimiento', '1230'], ['CVV', '987'], ['Teléfono', '99999999'],
    ['Dirección de facturación', 'Blvd Suyapa'], ['Ciudad', 'Tegucigalpa'], ['Departamento', 'HN-CR'],
  ]) fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
}

beforeEach(() => {
  vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay');
  vi.stubEnv('VITE_APP_URL', 'https://masterfadeapp.com');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it.each(['', 'sandbox', 'unknown'])('produccion reserva bloquea entorno %j sin presentar Sandbox', (environment) => {
  vi.stubEnv('VITE_PIXELPAY_ENV', environment);
  const onPay = renderBooking();
  fillBooking();
  const button = screen.getByRole('button', { name: /Pagar con PixelPay|Pago no disponible/ });
  expect(button.disabled).toBe(true);
  expect(screen.getByLabelText('Numero de tarjeta').closest('fieldset').disabled).toBe(true);
  fireEvent.click(button);
  expect(onPay).not.toHaveBeenCalled();
  expect(screen.queryByText(/Sandbox|tarjetas de prueba|Entorno de pruebas/)).toBeNull();
  expect(screen.getByRole('alert').textContent).toMatch(/pago.*no.*disponible/i);
});

it('el host productivo bloquea un artefacto configurado para QA', () => {
  vi.stubEnv('VITE_APP_URL', 'https://qa.masterfadeapp.com');
  vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
  const onPay = renderBooking();
  expect(screen.getByRole('button', { name: /Pagar con PixelPay|Pago no disponible/ }).disabled).toBe(true);
  expect(onPay).not.toHaveBeenCalled();
  expect(screen.queryByText(/Sandbox|tarjetas de prueba|Entorno de pruebas/)).toBeNull();
});

it('configuracion Live muestra solo mensajes de pago real', () => {
  vi.stubEnv('VITE_PIXELPAY_ENV', 'live');
  renderBooking();
  expect(screen.getByRole('button', { name: 'Pagar con PixelPay' }).disabled).toBe(false);
  expect(screen.getByText('Información de pago')).toBeTruthy();
  expect(screen.getByText('Solo aceptamos tarjetas válidas')).toBeTruthy();
  expect(screen.queryByText(/Sandbox|tarjetas de prueba|Entorno de pruebas/)).toBeNull();
});

it('Live conserva la validacion y solo envia el formulario valido una vez', async () => {
  vi.stubEnv('VITE_PIXELPAY_ENV', 'live');
  const onPay = renderBooking();
  const button = screen.getByRole('button', { name: 'Pagar con PixelPay' });
  fireEvent.click(button);
  expect(onPay).not.toHaveBeenCalled();
  fillBooking();
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(onPay).toHaveBeenCalledOnce());
  expect(onPay.mock.calls[0][0].card.expire).toBe('3012');
  await waitFor(() => expect(screen.getByLabelText('CVV').value).toBe(''));
});

it('la incertidumbre Live conserva la conciliacion sin permitir otro cobro', () => {
  vi.stubEnv('VITE_PIXELPAY_ENV', 'live');
  const refreshPaymentStatus = vi.fn();
  const onPay = renderBooking({ paymentResult: { pending_confirmation: true }, paymentCanExecuteSale: false, refreshPaymentStatus });
  expect(screen.queryByRole('button', { name: 'Pagar con PixelPay' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado del pago' }));
  expect(refreshPaymentStatus).toHaveBeenCalledOnce();
  expect(onPay).not.toHaveBeenCalled();
});

it.each(['', 'sandbox', 'invalid'])('produccion VIP bloquea entorno %j antes del callback', (environment) => {
  vi.stubEnv('VITE_PIXELPAY_ENV', environment);
  const onConfirmPayment = renderVip();
  fillVip();
  const button = screen.getByRole('button', { name: 'Pagar con PixelPay' });
  expect(button.disabled).toBe(true);
  expect(screen.getByLabelText('Numero de tarjeta').closest('fieldset').disabled).toBe(true);
  fireEvent.click(button);
  expect(onConfirmPayment).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toMatch(/pago.*no.*disponible/i);
});

it('VIP Live conserva validacion, callback y limpieza de campos sensibles', () => {
  vi.stubEnv('VITE_PIXELPAY_ENV', 'live');
  const onConfirmPayment = renderVip();
  const button = screen.getByRole('button', { name: 'Pagar con PixelPay' });
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(onConfirmPayment).not.toHaveBeenCalled();
  fillVip();
  fireEvent.click(button);
  expect(onConfirmPayment).toHaveBeenCalledOnce();
  expect(onConfirmPayment.mock.calls[0][0].card.expire).toBe('3012');
  expect(screen.getByLabelText('CVV').value).toBe('');
});
