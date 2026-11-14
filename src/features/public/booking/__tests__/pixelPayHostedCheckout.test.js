import { describe, expect, it, vi } from 'vitest';
import { normalizeBookingPaymentUiState } from '../bookingUtils.js';
import { redirectToPixelPayHostedCheckout, validatePixelPayHostedCheckoutUrl } from '../pixelPayHostedCheckout.js';

const CHECKOUT = 'https://pixelpay.app/sandbox/opaque-token/checkout/example';

describe('PixelPay Hosted checkout boundary', () => {
  it.each([
    CHECKOUT,
    'https://www.pixelpay.app/sandbox/opaque_token/checkout/example?lang=es',
    'https://pixelpay.dev/sandbox/token/checkout',
  ])('permite únicamente checkout Sandbox oficial: %s', (url) => {
    expect(validatePixelPayHostedCheckoutUrl(url)).toBe(url);
  });

  it.each([
    'http://pixelpay.app/sandbox/token/checkout/example',
    'https://pixelpay.app.evil.test/sandbox/token/checkout/example',
    'https://pixelpay.app@evil.test/sandbox/token/checkout/example',
    'https://user:secret@pixelpay.app/sandbox/token/checkout/example',
    'https://pixelpay.app:444/sandbox/token/checkout/example',
    'https://pixelpay.app/sandbox/token/checkout/example#paid',
    'https://pixelpay.app/checkout/live',
    'https://pixelpay.app/sandbox/token/checkout/../../admin',
    'https://pixelpay.app/sandbox/token/checkout/%2fredirect',
    'javascript:alert(1)',
    '/sandbox/token/checkout/example',
  ])('rechaza redirección no autorizada: %s', (url) => {
    expect(validatePixelPayHostedCheckoutUrl(url)).toBeNull();
    const location = { assign: vi.fn() };
    expect(() => redirectToPixelPayHostedCheckout(url, location)).toThrow();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it('redirige solo después de validar la URL recibida del backend', () => {
    const location = { assign: vi.fn() };
    redirectToPixelPayHostedCheckout(CHECKOUT, location);
    expect(location.assign).toHaveBeenCalledExactlyOnceWith(CHECKOUT);
  });

  it.each(['paid', 'pagado', 'confirmado'])('un estado Hosted %s sin confirmación canónica sigue pendiente', (state) => {
    const result = normalizeBookingPaymentUiState({
      paymentIntent: { payment_channel: 'hosted', monto_hnl: 300, estado_intent_codigo: state },
      paymentResult: { payment_channel: 'hosted', estado_intent_codigo: state, booking_confirmed: false },
    });
    expect(result).toMatchObject({ status: 'processing', bookingConfirmed: false, totalPagadoHnl: 0 });
  });
});
