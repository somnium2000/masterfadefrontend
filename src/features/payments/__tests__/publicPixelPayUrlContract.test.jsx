// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axios = require('axios');
const nativeAdapter = axios.defaults.adapter;
let observer;
afterEach(() => {
  observer?.disconnect();
  axios.defaults.adapter = nativeAdapter;
  document.querySelectorAll('script').forEach(script => script.remove());
  delete window.Cardinal;
  vi.restoreAllMocks();
});

const handoff = (environment = 'sandbox', endpoint = 'https://pixelpay.dev') => ({
  state: 'challenge', continuation_mode: 'songbird', token: 'synthetic-token', expiresAt: Date.now() + 5000,
  order: { id: 'URL-CONTRACT', amount: 1, currency: 'HNL' }, sdk: { environment, endpoint },
  continuation: { status: 202, transaction_type: 'songbird', payload: 'synthetic-setup' },
});
const lookup = continue_url => ({ status: 202, success: true, action: 'continue', data: {
  identifier: 'synthetic-identifier', transaction_id: 'synthetic-transaction', continue_payload: 'synthetic-challenge', continue_url,
} });
const malformed = [
  ['scheme-without-authority', 'https:acs.offline.invalid/challenge'],
  ['single-slash', 'https:/acs.offline.invalid/challenge'],
  ['extra-slash', 'https:///acs.offline.invalid/challenge'],
  ['relative', '/challenge'], ['protocol-relative', '//acs.offline.invalid/challenge'],
  ['leading-control', '\u0000https://acs.offline.invalid/challenge'],
  ['path-control', 'https://acs.offline.invalid/\u0000challenge'],
  ['trailing-control', 'https://acs.offline.invalid/challenge\u007f'],
  ['cleartext', 'http://acs.offline.invalid/challenge'],
  ['userinfo', 'https://synthetic:synthetic@acs.offline.invalid/challenge'],
];

async function adapter() {
  vi.resetModules();
  return import('../experimental/delegatedPixelPay.js');
}

function songbird(scriptUrl = 'https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js') {
  const callbacks = new Map(), scripts = [];
  let external = 0;
  axios.defaults.adapter = async () => { external++; throw new Error('EXTERNAL_PROVIDER_FORBIDDEN'); };
  const cardinal = {
    configure: vi.fn(), on: (name, callback) => callbacks.set(name, callback), off: name => callbacks.delete(name),
    setup: vi.fn(() => queueMicrotask(() => callbacks.get('payments.setupComplete')?.({ sessionId: 'synthetic-reference' }))),
    continue: vi.fn(() => queueMicrotask(() => callbacks.get('payments.validated')?.({ ActionCode: 'SUCCESS' }, 'synthetic-validated'))),
  };
  window.Cardinal = cardinal;
  observer = new MutationObserver(records => {
    for (const record of records) for (const element of record.addedNodes) {
      if (element.tagName !== 'SCRIPT') continue;
      scripts.push(element.src);
      expect(element.src).toBe(scriptUrl);
      queueMicrotask(() => element.dispatchEvent(new Event('load')));
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return { cardinal, scripts, assertOffline: () => expect(external).toBe(0) };
}

test.each(malformed)('Songbird rejects %s before Cardinal receives an ambiguous or unsafe destination', async (_label, url) => {
  const fixture = songbird();
  const native = await adapter();
  const transport = vi.fn(async () => lookup(url));
  await expect(native.runDelegatedPixelPay({ handoff: handoff(), transport })).rejects.toThrow('UNCERTAIN');
  expect(transport.mock.calls.map(([operation]) => operation)).toEqual(['lookup']);
  expect(fixture.cardinal.continue).not.toHaveBeenCalled();
  fixture.assertOffline();
});

test.each([
  ['sandbox', 'https://pixelpay.dev', 'https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js'],
  ['live', 'https://provider.offline.invalid', 'https://songbird.cardinalcommerce.com/edge/v1/songbird.js'],
])('%s uses the exact HTTPS Songbird script and provider-owned HTTPS issuer destination', async (environment, endpoint, scriptUrl) => {
  const fixture = songbird(scriptUrl);
  const native = await adapter();
  const destination = 'https://ACS.offline.invalid:443/challenge?opaque=%2B%2F';
  const payment = { pending_confirmation: true, booking_confirmed: false };
  const transport = vi.fn(async operation => {
    if (operation === 'lookup') return lookup(destination);
    if (operation === 'status') return payment;
    return { status: 200, success: true, action: null, data: {} };
  });
  expect(await native.runDelegatedPixelPay({ handoff: handoff(environment, endpoint), transport })).toEqual(payment);
  expect(fixture.scripts).toEqual([scriptUrl]);
  expect(fixture.cardinal.setup).toHaveBeenCalledExactlyOnceWith('init', { jwt: 'synthetic-setup' });
  expect(fixture.cardinal.continue).toHaveBeenCalledExactlyOnceWith('cca', {
    AcsUrl: destination, Payload: 'synthetic-challenge',
  }, { OrderDetails: { TransactionId: 'synthetic-transaction', OrderNumber: 'URL-CONTRACT', CurrencyCode: 'HNL' } });
  expect(transport.mock.calls.map(([operation]) => operation)).toEqual(['lookup', 'continue', 'retry', 'status']);
  fixture.assertOffline();
});

test.each([
  ['scheme-without-authority', 'https:provider.offline.invalid'],
  ['single-slash', 'https:/provider.offline.invalid'],
  ['extra-slash', 'https:///provider.offline.invalid'],
  ['leading-control', '\u0000https://provider.offline.invalid'],
  ['trailing-control', 'https://provider.offline.invalid\u007f'],
  ['relative', '//provider.offline.invalid'], ['cleartext', 'http://provider.offline.invalid'],
])('Live handoff rejects %s origin before loading SDK or using transport', async (_label, endpoint) => {
  const native = await adapter();
  const loadSdk = vi.fn(), transport = vi.fn();
  await expect(native.runDelegatedPixelPay({ handoff: handoff('live', endpoint), loadSdk, transport }))
    .rejects.toMatchObject({ code: 'PIXELPAY_3DS_CONTINUATION_INVALID' });
  expect(loadSdk).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});

test.each([
  ['scheme-without-authority', 'https:cas.client.cardinaltrusted.com/centinelapi/V1/Cruise/Collect'],
  ['single-slash', 'https:/cas.client.cardinaltrusted.com/centinelapi/V1/Cruise/Collect'],
  ['leading-control', '\u0000https://cas.client.cardinaltrusted.com/centinelapi/V1/Cruise/Collect'],
  ['null', null],
])('present Direct collection %s remains rejected without Songbird fallback', async (_label, collection_url) => {
  const native = await adapter();
  const loadSdk = vi.fn(), transport = vi.fn();
  await expect(native.runDelegatedPixelPay({ handoff: { ...handoff(), continuation_mode: 'direct_api',
    continuation: { ...handoff().continuation, collection_url } }, loadSdk, transport })).rejects.toThrow('COLLECTION_URL_');
  expect(loadSdk).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});
