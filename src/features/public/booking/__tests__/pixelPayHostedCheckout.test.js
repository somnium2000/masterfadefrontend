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

  it('admite los parámetros del ejemplo oficial y url anidada al mismo checkout con profundidad uno', () => {
    const base = 'https://pixelpay.app/sandbox/ZvCAXse0zn/checkout/example';
    const nested = `${base}?success=0&slug=sandbox&merchant=sandbox&payload=eyJfb3JkZXJfaWQiOiJmaXh0dXJlIn0%3D`;
    const url = `${base}?success=1&slug=sandbox&merchant=sandbox&payload=eyJfb3JkZXJfaWQiOiJmaXh0dXJlIn0%3D&url=${encodeURIComponent(nested)}`;
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
    'https://pixelpay.dev/pruebas-maria-3/P-a039903a-449c-4911-bf43-85b776284e97/checkout',
    'https://www.pixelpay.app/my_company/1dab5ed0/checkout',
    'https://pixelpay.dev/masterfade/S-a039903a-449c-4911-bf43-85b776284e97/checkout',
    'https://pixelpay.app/masterfade/S-a039903a-449c-4911-bf43-85b776284e97/checkout',
    `${CHECKOUT}/redirect`,
    `${CHECKOUT}?url=${encodeURIComponent('https://evil.test/checkout')}`,
    `${CHECKOUT}?url=${encodeURIComponent('//evil.test/checkout')}`,
    `${CHECKOUT}?url=${encodeURIComponent(CHECKOUT.replace('opaque-token', 'otra-orden'))}`,
    `${CHECKOUT}?url=${encodeURIComponent(CHECKOUT.replace('pixelpay.app', 'pixelpay.dev'))}`,
    `${CHECKOUT}?url=${encodeURIComponent(`${CHECKOUT}?url=${encodeURIComponent(CHECKOUT)}`)}`,
    `${CHECKOUT}?redirect=https%3A%2F%2Fevil.test`,
    `${CHECKOUT}?next=https%3A%2F%2Fevil.test`,
    `${CHECKOUT}?callback=https%3A%2F%2Fevil.test`,
    `${CHECKOUT}?_callback=https%3A%2F%2Fevil.test`,
    `${CHECKOUT}?_complete=https%3A%2F%2Fevil.test`,
    `${CHECKOUT}?_cancel=https%3A%2F%2Fevil.test`,
    `${CHECKOUT}?merchant=masterfade`,
    `${CHECKOUT}?slug=other`,
    `${CHECKOUT}?success=paid`,
    `${CHECKOUT}?success=1&success=0`,
    `${CHECKOUT}?lang=es&lang=en`,
    `${CHECKOUT}?%72edirect=https%3A%2F%2Fevil.test`,
    `${CHECKOUT}?payload=not%25base64`,
    `${CHECKOUT}?toString=unsafe`,
    ` ${CHECKOUT}`,
    `${CHECKOUT}\n`,
    `${CHECKOUT}?payload=${'a'.repeat(16000)}`,
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
