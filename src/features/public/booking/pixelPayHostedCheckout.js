const SANDBOX_CHECKOUT_ORIGINS = new Set([
  'https://pixelpay.app',
  'https://www.pixelpay.app',
  'https://pixelpay.dev',
]);
const SANDBOX_CHECKOUT_PATH = /^\/sandbox\/[A-Za-z0-9_-]+\/checkout(?:\/[A-Za-z0-9_-]+)?\/?$/;

export function isPixelPayHostedPayment(paymentState) {
  return String(paymentState?.payment_channel || '').trim().toLowerCase() === 'hosted';
}

export function validatePixelPayHostedCheckoutUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!SANDBOX_CHECKOUT_ORIGINS.has(url.origin)
      || url.username || url.password || url.hash
      || !SANDBOX_CHECKOUT_PATH.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function redirectToPixelPayHostedCheckout(value, location = globalThis.location) {
  const url = validatePixelPayHostedCheckoutUrl(value);
  if (!url || typeof location?.assign !== 'function') {
    throw new Error('No se pudo abrir el portal de pago. Verifica el estado antes de continuar.');
  }
  location.assign(url);
}
