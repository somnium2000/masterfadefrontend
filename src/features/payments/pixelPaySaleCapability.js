export function requiresExplicitPixelPaySaleAuthorization({
  entorno = import.meta.env.VITE_ENTORNO,
  provider = import.meta.env.VITE_PAYMENT_PROVIDER || import.meta.env.VITE_PAYMENT_PROVIDER_CODE,
  environment = import.meta.env.VITE_PIXELPAY_ENV,
  hostname = typeof globalThis !== 'undefined' ? globalThis.location?.hostname : '',
} = {}) {
  const normalized = value => String(value || '').trim().toLowerCase();
  const qa = normalized(entorno) === 'qa' || normalized(hostname) === 'qa.masterfadeapp.com';
  // AM: Match the existing presentation: only explicit Live is outside Sandbox.
  return qa && normalized(provider) === 'pixelpay' && normalized(environment) !== 'live';
}

export function isPixelPaySaleAuthorized(capability, options) {
  // AM: QA Sandbox requires a confirmed grant; preserve the legacy contract elsewhere.
  return requiresExplicitPixelPaySaleAuthorization(options) ? capability === true : capability !== false;
}
