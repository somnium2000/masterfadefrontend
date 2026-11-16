export const SONGBIRD = 'https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js';
// AM: Exact public dependency observed on 2026-11-15; a changed release fails closed.
export const SONGBIRD_CHUNK = 'https://songbirdstag.cardinalcommerce.com/edge/v1/a960453caa80548c4a43/5.a960453caa80548c4a43.songbird.js';
export const GATEWAY = 'https://pixelpay.dev';
const routes = new Map([
  ['/api/v2/merchant/public_key', ['GET', 'public_key']],
  ['/api/v2/transaction/sale', ['POST', 'sale']],
  ['/api/v2/cardinal/authentication/lookup', ['POST', 'lookup']],
  ['/api/v2/cardinal/authentication/continue', ['POST', 'continue']],
]);
const metadata = new Map([
  ['lang', ['en', 'es']], ['from', ['sdk-javascript']],
  ['sdk_version', ['2.5.8-beta.0']], ['env', ['sandbox']],
]);

// AM: No environment variables, arbitrary URLs, redirects, credentials or real payment mode.
export function classify(url, method, origin, realScript = false) {
  let parsed;
  try { parsed = new URL(url); } catch { return 'blocked'; }
  if (parsed.username || parsed.password || parsed.hash) return 'blocked';
  if (parsed.origin === origin && method === 'GET' && !parsed.search
      && ['/', '/browser.mjs', '/sdk.js'].includes(parsed.pathname)) return 'local';
  if (url === SONGBIRD && method === 'GET') return realScript ? 'real_script' : 'script_fixture';
  if (realScript && url === SONGBIRD_CHUNK && method === 'GET') return 'real_script';
  const publicKeyQuery = parsed.pathname === '/api/v2/merchant/public_key'
    && [...parsed.searchParams].every(([key, value]) => metadata.get(key)?.includes(value));
  if (parsed.origin === GATEWAY && (!parsed.search || publicKeyQuery)) {
    const route = routes.get(parsed.pathname);
    if (route && method === 'OPTIONS') return 'preflight_fixture';
    if (route?.[0] === method) return route[1];
  }
  return 'blocked';
}
