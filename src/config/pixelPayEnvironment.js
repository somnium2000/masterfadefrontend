const PRODUCTION_HOSTS = new Set(['masterfadeapp.com', 'www.masterfadeapp.com']);

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function readAppUrl(value) {
  try { return new URL(String(value || '').trim()); }
  catch { return null; }
}

export function resolvePixelPayEnvironment({ environment, appUrl, runtimeHostname } = {}) {
  const parsedAppUrl = readAppUrl(appUrl);
  const configuredProduction = PRODUCTION_HOSTS.has(normalizeHostname(parsedAppUrl?.hostname));
  const runtimeProduction = PRODUCTION_HOSTS.has(normalizeHostname(runtimeHostname));
  const productionTarget = configuredProduction || runtimeProduction;
  const qaTarget = normalizeHostname(parsedAppUrl?.hostname) === 'qa.masterfadeapp.com'
    || normalizeHostname(runtimeHostname) === 'qa.masterfadeapp.com';
  const normalized = String(environment ?? '').trim().toLowerCase();
  const invalid = (reasonCode) => ({ environment: 'invalid', valid: false, canPay: false, reasonCode, productionTarget });

  if (String(appUrl ?? '').trim() && (!parsedAppUrl?.hostname
    || !['http:', 'https:'].includes(parsedAppUrl.protocol))) return invalid('PIXELPAY_APP_URL_INVALID');
  // AM: El host servido detecta tambien un bundle de QA copiado al dominio productivo.
  if (productionTarget && (!configuredProduction || parsedAppUrl?.protocol !== 'https:'
    || parsedAppUrl.username || parsedAppUrl.password)) return invalid('PIXELPAY_PRODUCTION_TARGET_INVALID');
  if (productionTarget && normalized !== 'live') return invalid('PIXELPAY_PRODUCTION_ENV_INVALID');
  if (qaTarget && normalized === 'live') return invalid('PIXELPAY_QA_ENV_INVALID');
  if (normalized && !['live', 'sandbox'].includes(normalized)) return invalid('PIXELPAY_ENV_INVALID');

  return { environment: normalized || 'sandbox', valid: true, canPay: true, reasonCode: null, productionTarget };
}

export function assertPixelPayBuildEnvironment(env = {}) {
  if (String(env.VITE_PAYMENT_PROVIDER || '').trim().toLowerCase() !== 'pixelpay') return;
  const state = resolvePixelPayEnvironment({ environment: env.VITE_PIXELPAY_ENV, appUrl: env.VITE_APP_URL });
  if (state.canPay) return;
  // AM: Mensajes fijos, sin volcar variables que puedan contener valores sensibles.
  if (state.productionTarget) throw new Error('[PixelPay configuration] El destino productivo requiere VITE_APP_URL=https://masterfadeapp.com y VITE_PIXELPAY_ENV=live.');
  if (state.reasonCode === 'PIXELPAY_QA_ENV_INVALID') throw new Error('[PixelPay configuration] El destino QA requiere VITE_PIXELPAY_ENV=sandbox.');
  if (state.reasonCode === 'PIXELPAY_APP_URL_INVALID') throw new Error('[PixelPay configuration] VITE_APP_URL debe ser una URL HTTP(S) valida.');
  throw new Error('[PixelPay configuration] VITE_PIXELPAY_ENV debe ser live o sandbox.');
}
