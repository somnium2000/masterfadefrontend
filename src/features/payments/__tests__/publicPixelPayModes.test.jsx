// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axios = require('axios');
const originalAdapter = axios.defaults.adapter;
let observer;
afterEach(() => {
  observer?.disconnect();
  axios.defaults.adapter = originalAdapter;
  document.querySelectorAll('script').forEach(script => script.remove());
  delete window.Cardinal;
  vi.restoreAllMocks();
});

const handoff = () => ({
  token: 'synthetic-operation-token', state: 'challenge', continuation_mode: 'songbird',
  expiresAt: Date.now() + 5000,
  order: { id: 'MF-HISTORICAL-QA', amount: 1, currency: 'HNL' },
  sdk: { endpoint: 'https://pixelpay.dev', environment: 'sandbox' },
  continuation: { status: 202, transaction_type: 'songbird', payload: 'synthetic.setup.signature' },
});
const challenge = { status: 202, success: true, action: 'continue', data: {
  identifier: 'synthetic-auth', continue_url: 'https://centinelapistag.cardinalcommerce.com/challenge',
  continue_payload: 'synthetic-challenge', transaction_id: 'synthetic-tx',
} };
const pending = { processed: false, booking_confirmed: false, pending_confirmation: true };

async function adapter() {
  vi.resetModules();
  return import('../experimental/delegatedPixelPay.js');
}

function songbirdFixture({ action = 'SUCCESS', duplicate = false } = {}) {
  const callbacks = new Map();
  let external = 0;
  axios.defaults.adapter = async () => { external++; throw new Error('PROVIDER_NETWORK_FORBIDDEN'); };
  const cardinal = {
    configure: vi.fn(),
    on: (event, callback) => callbacks.set(event, callback),
    off: event => callbacks.delete(event),
    setup: vi.fn(() => queueMicrotask(() => {
      callbacks.get('payments.setupComplete')?.({ sessionId: 'synthetic-reference' });
      if (duplicate) callbacks.get('payments.setupComplete')?.({ sessionId: 'synthetic-reference' });
    })),
    continue: vi.fn(() => queueMicrotask(() => {
      callbacks.get('payments.validated')?.({ ActionCode: action }, 'synthetic.validated.signature');
      if (duplicate) callbacks.get('payments.validated')?.({ ActionCode: action }, 'synthetic.validated.signature');
    })),
  };
  window.Cardinal = cardinal;
  observer = new MutationObserver(records => {
    for (const record of records) for (const element of record.addedNodes) {
      if (element.tagName === 'SCRIPT') queueMicrotask(() => element.dispatchEvent(new Event('load')));
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return { cardinal, callbacks, assertOffline: () => expect(external).toBe(0) };
}

test.each([200, 202])('public Songbird restores historical QA Init -> lookup %s -> Continue using the original SDK', async status => {
  const fixture = songbirdFixture({ duplicate: true });
  const native = await adapter();
  const calls = [];
  const result = await native.runDelegatedPixelPay({ handoff: handoff(), transport: async (operation, data) => {
    calls.push({ operation, data });
    if (operation === 'lookup') return { ...challenge, status };
    if (operation === 'continue') return { status: 200, success: true, action: null, data: {} };
    if (operation === 'retry') return { status: 200, success: true, action: null, data: {} };
    if (operation === 'status') return pending;
    throw new Error('UNEXPECTED_OPERATION');
  } });
  expect(result).toEqual(pending);
  expect(calls.map(call => call.operation)).toEqual(['lookup', 'continue', 'retry', 'status']);
  expect(calls[1].data).toEqual({ payload: 'synthetic.validated.signature' });
  expect(calls[2].data).toEqual({});
  expect(fixture.cardinal.setup).toHaveBeenCalledExactlyOnceWith('init', { jwt: 'synthetic.setup.signature' });
  expect(fixture.cardinal.continue).toHaveBeenCalledExactlyOnceWith('cca', {
    AcsUrl: challenge.data.continue_url, Payload: challenge.data.continue_payload,
  }, { OrderDetails: { TransactionId: 'synthetic-tx', OrderNumber: 'MF-HISTORICAL-QA', CurrencyCode: 'HNL' } });
  expect(fixture.cardinal.configure).toHaveBeenLastCalledWith({ logging: { level: 'off' } });
  expect(fixture.callbacks.size).toBe(0);
  expect(window.Cardinal).toBe(fixture.cardinal);
  expect(document.querySelector('#cardinal_collection_form')).toBeNull();
  expect(native.isDelegatedPixelPayBusy()).toBe(false);
  fixture.assertOffline();
});

test('Songbird frictionless lookup authorizes backend retry without a fabricated browser validation', async () => {
  const fixture = songbirdFixture();
  const native = await adapter();
  const transport = vi.fn(async operation => operation === 'status' ? pending : {
    status: 200, success: true, action: null, data: { identifier: 'synthetic-frictionless' },
  });
  expect(await native.runDelegatedPixelPay({ handoff: handoff(), transport })).toEqual(pending);
  expect(transport.mock.calls.map(([operation]) => operation)).toEqual(['lookup', 'retry', 'status']);
  expect(fixture.cardinal.continue).not.toHaveBeenCalled();
  fixture.assertOffline();
});

test.each(['NOACTION', 'FAILURE', 'ERROR', 'CANCEL'])('Songbird %s browser event cannot authorize continue or a second Sale', async action => {
  const fixture = songbirdFixture({ action });
  const native = await adapter();
  const transport = vi.fn(async () => challenge);
  await expect(native.runDelegatedPixelPay({ handoff: handoff(), transport })).rejects.toThrow('UNCERTAIN');
  expect(transport.mock.calls.map(([operation]) => operation)).toEqual(['lookup']);
  expect(fixture.callbacks.size).toBe(0);
  fixture.assertOffline();
});

test('unaccredited server authenticationContinue cannot authorize native retry', async () => {
  const fixture = songbirdFixture();
  const native = await adapter();
  const transport = vi.fn(async operation => operation === 'lookup' ? challenge : {
    status: 200, success: false, action: null, data: {},
  });
  await expect(native.runDelegatedPixelPay({ handoff: handoff(), transport })).rejects.toThrow('UNCERTAIN');
  expect(transport.mock.calls.map(([operation]) => operation)).toEqual(['lookup', 'continue']);
  fixture.assertOffline();
});

test('native Cardinal.continue exception is caught even though the SDK does not await lookup validation', async () => {
  const fixture = songbirdFixture();
  fixture.cardinal.continue.mockImplementation(() => { throw new Error('NEVER_LOG_NATIVE_ERROR'); });
  const native = await adapter();
  const transport = vi.fn(async () => challenge);
  await expect(native.runDelegatedPixelPay({ handoff: handoff(), transport })).rejects.toThrow('UNCERTAIN');
  expect(transport.mock.calls.map(([operation]) => operation)).toEqual(['lookup']);
  expect(fixture.callbacks.size).toBe(0);
  fixture.assertOffline();
});

test.each([null, '', {}, 'https://malicious.invalid/Collect'])('present rejected collection %j never becomes Songbird', async collection_url => {
  const native = await adapter();
  const loadSdk = vi.fn(), transport = vi.fn();
  await expect(native.runDelegatedPixelPay({
    handoff: { ...handoff(), continuation: { ...handoff().continuation, collection_url } }, loadSdk, transport,
  })).rejects.toMatchObject({ code: 'PIXELPAY_3DS_CONTINUATION_INVALID' });
  expect(loadSdk).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  expect(native.isDelegatedPixelPayBusy()).toBe(false);
});

test('equivalent CAS host case and explicit default port remain Direct API', async () => {
  const native = await adapter();
  const collection = 'https://CAS.CLIENT.CARDINALTRUSTED.COM:443/centinelapi/V2/Cruise/Collect';
  const direct = (collection_url) => ({ ...handoff(), continuation_mode: 'direct_api', continuation: {
    ...handoff().continuation, collection_url,
  } });
  expect(native.validatePublicHandoff(direct(collection))).toBe('https://pixelpay.dev');
  expect(() => native.validatePublicHandoff(direct(collection + '?opaque=1'))).toThrow('COLLECTION_URL_INVALID');
  expect(() => native.validatePublicHandoff({ ...handoff(), continuation_mode: 'direct_api' })).toThrow('COLLECTION_URL_ABSENT');
});

test('public pending drops raw failures and releases challenge UI', async () => {
  const { completePublicPixelPay3ds } = await import('../publicPixelPay3ds.js');
  const onChallenge = vi.fn();
  const result = await completePublicPixelPay3ds({ public_3ds_handoff: handoff() }, {
    run: async () => { throw Object.assign(new Error('NEVER_LOG_CARD_TOKEN'), { code: 'NEVER_LOG_PAYLOAD' }); }, onChallenge,
  });
  expect(result).toMatchObject(pending);
  expect(JSON.stringify(result)).not.toMatch(/NEVER_LOG|synthetic|payload|token/);
  expect(onChallenge.mock.calls).toEqual([[true], [false]]);
});

test('no handoff or expired handoff performs no SDK start or continuation', async () => {
  const { completePublicPixelPay3ds } = await import('../publicPixelPay3ds.js');
  const run = vi.fn(), advance = vi.fn();
  expect(await completePublicPixelPay3ds(pending, { run, advance })).toEqual(pending);
  const result = await completePublicPixelPay3ds({ public_3ds_handoff: { ...handoff(), expiresAt: 1 } }, { run, advance });
  expect(result).toMatchObject(pending);
  expect(run).not.toHaveBeenCalled();
  expect(advance).not.toHaveBeenCalled();
});
