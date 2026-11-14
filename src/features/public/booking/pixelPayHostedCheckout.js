const SANDBOX_CHECKOUT_ORIGINS = new Set([
  'https://pixelpay.app',
  'https://www.pixelpay.app',
  'https://pixelpay.dev',
]);
const SANDBOX_CHECKOUT_PATH = /^\/sandbox\/[A-Za-z0-9_-]+\/checkout(?:\/example)?\/?$/;
const SANDBOX_QUERY_VALUES = {
  success: /^(?:0|1)$/,
  slug: /^sandbox$/,
  merchant: /^sandbox$/,
  lang: /^(?:es|en)$/,
  payload: /^[A-Za-z0-9+/_-]+={0,2}$/,
};

export function isPixelPayHostedPayment(paymentState) {
  return String(paymentState?.payment_channel || '').trim().toLowerCase() === 'hosted';
}

export function validatePixelPayHostedCheckoutUrl(value) {
  // AM: Una ruta comercial documentada no demuestra que el checkout pertenezca a Sandbox.
  const inspect = (candidate, depth = 0) => {
    if (typeof candidate !== 'string' || candidate.length > 16000 || candidate.includes('\\')
      || [...candidate].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return null;
    let url;
    try { url = new URL(candidate); } catch { return null; }
    if (!SANDBOX_CHECKOUT_ORIGINS.has(url.origin) || url.username || url.password || url.port || url.hash
      || !SANDBOX_CHECKOUT_PATH.test(url.pathname)) return null;
    const seen = new Set();
    for (const [key, queryValue] of url.searchParams) {
      if (seen.has(key)) return null;
      seen.add(key);
      if (key === 'url') {
        const nested = depth === 0 ? inspect(queryValue, 1) : null;
        if (!nested || nested.origin !== url.origin || nested.pathname !== url.pathname) return null;
      } else if (!Object.hasOwn(SANDBOX_QUERY_VALUES, key) || !SANDBOX_QUERY_VALUES[key].test(queryValue)) return null;
    }
    return url;
  };
  return inspect(value)?.href || null;
}

export function redirectToPixelPayHostedCheckout(value, location = globalThis.location) {
  const url = validatePixelPayHostedCheckoutUrl(value);
  if (!url || typeof location?.assign !== 'function') {
    throw new Error('No se pudo abrir el portal de pago. Verifica el estado antes de continuar.');
  }
  location.assign(url);
}
