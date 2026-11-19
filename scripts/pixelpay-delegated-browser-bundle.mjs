import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = fileURLToPath(new URL('../src/features/payments/experimental/delegatedPixelPay.js', import.meta.url));
// AM: Vite's client build selects the SDK browser entry. Import the emitted module, not its source.
const bundle = await build({
  root,
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    rollupOptions: {
      input: entry,
      preserveEntrySignatures: 'strict',
      output: { inlineDynamicImports: true },
    },
  },
});
const chunk = bundle.output.find(output => output.type === 'chunk' && output.isEntry);
assert.ok(chunk, 'Vite did not emit the delegated browser module');
const bundleUrl = `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`;

const dom = new JSDOM('', { url: 'https://checkout.invalid/' });
const { window } = dom;
for (const key of ['window', 'document', 'MutationObserver', 'navigator', 'screen', 'Event', 'CustomEvent', 'XMLHttpRequest']) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true });
}
let outboundCalls = 0;
const blockNetwork = () => {
  outboundCalls++;
  throw new Error('Unexpected native network call');
};
globalThis.fetch = window.fetch = blockNetwork;
window.XMLHttpRequest.prototype.send = blockNetwork;

const SDK_SCRIPT = 'https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js';
const handlers = new Map();
const phases = [];
window.Cardinal = {
  configure: () => phases.push('configure'),
  on: (name, callback) => handlers.set(name, callback),
  off: name => handlers.delete(name),
  setup: () => {
    phases.push('setup');
    queueMicrotask(() => handlers.get('payments.setupComplete')({ sessionId: 'local-fixture' }));
  },
  continue: () => phases.push('unexpected-continue'),
};
const scripts = [];
let loadSongbird = true;
const observer = new window.MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.tagName !== 'SCRIPT') continue;
      scripts.push(node.src);
      // AM: JSDOM does not load subresources. Complete only the expected Sandbox script locally.
      node.dispatchEvent(new window.Event(loadSongbird && node.src === SDK_SCRIPT ? 'load' : 'error'));
    }
  }
});
observer.observe(window.document.body, { childList: true });

const handoff = () => ({
  expiresAt: Date.now() + 5000,
  state: 'challenge',
  order: { id: 'local-order', amount: 1, currency: 'HNL' },
  sdk: { endpoint: 'https://offline.invalid', environment: 'sandbox' },
  continuation: { transaction_type: 'songbird', payload: 'synthetic', collection_url: null },
});

const lookupResponse = {
  status: 202, success: true, action: 'continue',
  data: { identifier: 'local-identifier', continue_url: 'https://offline.invalid/challenge',
    continue_payload: 'synthetic-challenge', transaction_id: 'local-transaction' },
};
const pending = { state: 'pending', booking_confirmed: false };
const CAS = 'https://cas.client.cardinaltrusted.com';
const ENDPOINT = 'https://pixelpay.dev';
const COLLECTION_URL = `${CAS}/centinelapi/V1/Cruise/Collect?fixture=%2B%3D`;
const STEP_UP_URL = `${CAS}/centinelapi/V2/Cruise/StepUp?fixture=%25`;
const directHandoff = () => ({
  ...handoff(), continuation_mode: 'direct_api', sdk: { endpoint: ENDPOINT, environment: 'sandbox' },
  continuation: { ...handoff().continuation, status: 202, collection_url: COLLECTION_URL },
});
const directLookupResponse = { ...lookupResponse, data: { ...lookupResponse.data, continue_url: STEP_UP_URL, window_size: '03' } };

function challengeFixture() {
  window.document.querySelectorAll('script').forEach(script => script.remove());
  const callbacks = new Map(), continuations = [];
  const setup = Promise.withResolvers();
  window.Cardinal = {
    configure: () => {},
    on: (name, callback) => callbacks.set(name, callback),
    off: name => callbacks.delete(name),
    setup: () => setup.resolve(),
    continue: (...args) => continuations.push(args),
  };
  return { callbacks, continuations, ready: setup.promise };
}

async function assertCallbackSettles(callback) {
  let deadline;
  try {
    await Promise.race([callback, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Native setup callback did not settle')), 1000);
    })]);
  } finally {
    clearTimeout(deadline);
  }
}

async function verifyDuplicateSetup(adapter) {
  const fixture = challengeFixture();
  const firstLookup = Promise.withResolvers();
  const operations = [];
  const { sdk, Manager } = await adapter.loadDelegatedSdk();
  let manager;
  class InspectedManager extends Manager {
    constructor(...args) {
      super(...args);
      manager = this;
    }
  }
  const transport = async (operation, data) => {
    operations.push(operation);
    if (operation === 'start') return handoff();
    if (operation === 'lookup') return firstLookup.promise;
    if (operation === 'continue') {
      assert.deepEqual(data, { payload: 'synthetic-validated' });
      return { status: 200, success: true, data: {} };
    }
    if (operation === 'retry') return { status: 200, success: true, data: {} };
    if (operation === 'status') return pending;
    throw new Error('Unexpected delegated operation');
  };
  const result = adapter.runDelegatedPixelPay({
    transport, loadSdk: async () => ({ sdk, Manager: InspectedManager }),
  });
  await fixture.ready;
  const emitSetup = fixture.callbacks.get('payments.setupComplete');
  const first = emitSetup({ sessionId: 'local-reference' });
  await emitSetup({ sessionId: 'local-reference' });
  assert.deepEqual(operations, ['start', 'lookup']);
  firstLookup.resolve(lookupResponse);
  await first;
  await assertCallbackSettles(emitSetup({ sessionId: 'local-reference' }));
  assert.equal(fixture.continuations.length, 1, 'The same native lookup must continue the challenge only once');
  assert.deepEqual(operations, ['start', 'lookup']);
  assert.equal(window.Cardinal.onSetupCompleteBusy, false);
  assert.equal(manager.identifier, lookupResponse.data.identifier);
  assert.equal(manager.transaction.authentication_identifier, lookupResponse.data.identifier);
  assert.deepEqual(fixture.continuations[0][2].OrderDetails, {
    TransactionId: lookupResponse.data.transaction_id, OrderNumber: 'local-order', CurrencyCode: 'HNL',
  });
  await fixture.callbacks.get('payments.validated')({ ActionCode: 'SUCCESS' }, 'synthetic-validated');
  assert.equal(await result, pending);
  assert.deepEqual(operations, ['start', 'lookup', 'continue', 'retry', 'status']);
  assert.equal(fixture.callbacks.has('payments.setupComplete'), false);

  // AM: A subsequent manager may legitimately see the same reference under its own context.
  const next = challengeFixture();
  const nextOperations = [];
  const nextHandoff = handoff();
  nextHandoff.order.id = 'local-next-order';
  const nextResult = adapter.runDelegatedPixelPay({ transport: async operation => {
    nextOperations.push(operation);
    if (operation === 'start') return nextHandoff;
    if (operation === 'lookup') return lookupResponse;
    if (operation === 'status') return pending;
    throw new Error('Unexpected operation in next context');
  } });
  await next.ready;
  await next.callbacks.get('payments.setupComplete')({ sessionId: 'local-reference' });
  assert.equal(next.continuations.length, 1);
  assert.equal(next.continuations[0][2].OrderDetails.OrderNumber, nextHandoff.order.id);
  await next.callbacks.get('payments.validated')({ ActionCode: 'ERROR' });
  assert.equal(await nextResult, pending);
  assert.deepEqual(nextOperations, ['start', 'lookup', 'status']);
}

async function verifyClosedLookup(reason) {
  // AM: An uncertain session remains locked. A fresh module models a separate browser page.
  const adapter = await import(`${bundleUrl}#${reason}`);
  const fixture = challengeFixture();
  const lookup = Promise.withResolvers();
  const controller = new AbortController();
  const operations = [];
  const timeoutMs = reason === 'expiry' ? 1000 : 5000;
  let transportSignal;
  const transport = async (operation, data, signal) => {
    operations.push(operation);
    transportSignal = signal;
    if (operation === 'start') return handoff();
    if (operation === 'lookup') return lookup.promise;
    throw new Error('Unexpected operation after scope closes');
  };
  const closed = assert.rejects(adapter.runDelegatedPixelPay({
    timeoutMs, transport, signal: controller.signal,
  }), { message: 'PROTOTYPE_UNCERTAIN' });
  await fixture.ready;
  const emitSetup = fixture.callbacks.get('payments.setupComplete');
  const first = emitSetup({ sessionId: 'local-reference' });
  assert.deepEqual(operations, ['start', 'lookup']);
  if (reason === 'mismatch') {
    lookup.resolve(lookupResponse);
    await first;
    await assertCallbackSettles(emitSetup({ sessionId: 'other-reference' }));
  } else if (reason === 'cancel') {
    controller.abort();
  }
  await closed;
  assert.equal(transportSignal.aborted, true);
  assert.equal(fixture.callbacks.has('payments.setupComplete'), false);
  assert.equal(fixture.callbacks.has('payments.validated'), false);
  lookup.resolve(lookupResponse);
  await assertCallbackSettles(first);
  assert.equal(fixture.continuations.length, reason === 'mismatch' ? 1 : 0);
  assert.deepEqual(operations, ['start', 'lookup']);
  await assert.rejects(adapter.runDelegatedPixelPay({ transport }), { message: 'PROTOTYPE_BUSY' });
}

function directFixture() {
  const originalSubmit = window.HTMLFormElement.prototype.submit;
  const collection = Promise.withResolvers(), challenge = Promise.withResolvers();
  const forms = [];
  window.HTMLFormElement.prototype.submit = function () {
    forms.push({ id: this.id, action: this.action, fields: Array.from(this.querySelectorAll('input'), field => [field.name, field.value]) });
    if (this.id === 'cardinal_collection_form') collection.resolve();
    else if (this.id === 'step-up-form') challenge.resolve();
    else throw new Error('Unexpected native form');
  };
  const emit = (origin, source, data) => window.dispatchEvent(new window.MessageEvent('message', { origin, source, data }));
  return {
    forms, emit, collection: collection.promise, challenge: challenge.promise,
    close: () => { window.HTMLFormElement.prototype.submit = originalSubmit; },
  };
}

const collectionFrame = () => window.document.getElementById('cardinal_collection_iframe');
const stepUpFrame = () => window.document.querySelector('iframe[name="step-up-iframe"]');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const profile = { MessageType: 'profile.completed', SessionId: 'direct-collection-reference' };
const callback = { name: 'pixelpay_continue', identifier: 'direct-callback-identifier' };

async function verifyNativeDirectApi(status) {
  const adapter = await import(`${bundleUrl}#direct-${status}`);
  const fixture = directFixture();
  const operations = [];
  let challengeWindow;
  try {
    const result = adapter.runDelegatedPixelPay({ handoff: directHandoff(), transport: async (operation, data) => {
      operations.push(operation);
      if (operation === 'lookup') {
        assert.equal(data.reference, profile.SessionId);
        return { ...directLookupResponse, status };
      }
      if (operation === 'retry') {
        assert.deepEqual(data, {});
        return { status: 200, success: true, data: {} };
      }
      if (operation === 'status') return pending;
      throw new Error('Unexpected Direct API operation');
    } });
    await fixture.collection;
    const collectWindow = collectionFrame().contentWindow;
    fixture.emit(CAS, window, profile);
    fixture.emit(ENDPOINT, collectWindow, callback);
    assert.deepEqual(operations, []);
    fixture.emit(CAS, collectWindow, profile);
    fixture.emit(CAS, collectWindow, profile);
    await fixture.challenge;
    challengeWindow = stepUpFrame().contentWindow;
    fixture.emit(CAS, collectWindow, profile);
    fixture.emit(ENDPOINT, collectWindow, callback);
    fixture.emit(CAS, challengeWindow, callback);
    await tick();
    assert.deepEqual(operations, ['lookup']);
    assert.deepEqual(fixture.forms, [
      { id: 'cardinal_collection_form', action: COLLECTION_URL, fields: [['JWT', directHandoff().continuation.payload]] },
      { id: 'step-up-form', action: STEP_UP_URL, fields: [['JWT', directLookupResponse.data.continue_payload]] },
    ]);
    fixture.emit(ENDPOINT, challengeWindow, callback);
    fixture.emit(ENDPOINT, challengeWindow, callback);
    assert.equal(await result, pending);
    assert.deepEqual(operations, ['lookup', 'retry', 'status']);
    assert.equal(collectionFrame(), null);
    assert.equal(stepUpFrame(), null);
    assert.equal(window.document.getElementById('step-up-form'), null);
    fixture.emit(ENDPOINT, challengeWindow, callback);
    assert.deepEqual(operations, ['lookup', 'retry', 'status']);
  } finally {
    fixture.close();
  }
}

async function verifyDirectCancellation(reason) {
  const adapter = await import(`${bundleUrl}#direct-${reason}`);
  const fixture = directFixture();
  const controller = new AbortController();
  const lookup = Promise.withResolvers();
  const operations = [];
  const payment = directHandoff();
  if (reason === 'expiry') payment.expiresAt = Date.now() + 1000;
  try {
    const rejected = assert.rejects(adapter.runDelegatedPixelPay({
      handoff: payment, signal: controller.signal, transport: async operation => {
        operations.push(operation);
        if (operation === 'lookup') return lookup.promise;
        throw new Error('Unexpected operation after closing Direct API');
      },
    }), { message: 'PROTOTYPE_UNCERTAIN' });
    await fixture.collection;
    const source = collectionFrame().contentWindow;
    fixture.emit(CAS, source, profile);
    let challengeSource;
    if (reason === 'abort-after-stepup') {
      lookup.resolve(directLookupResponse);
      await fixture.challenge;
      challengeSource = stepUpFrame().contentWindow;
    }
    if (reason !== 'expiry') controller.abort();
    await rejected;
    lookup.resolve(directLookupResponse);
    fixture.emit(CAS, source, profile);
    fixture.emit(ENDPOINT, source, callback);
    if (challengeSource) fixture.emit(ENDPOINT, challengeSource, callback);
    await tick();
    assert.deepEqual(operations, ['lookup']);
    assert.equal(fixture.forms.length, challengeSource ? 2 : 1);
    assert.equal(collectionFrame(), null);
    assert.equal(stepUpFrame(), null);
  } finally {
    fixture.close();
  }
}

async function verifyInvalidDirectHandoffs() {
  for (const [label, value] of [
    ['ABSENT', undefined], ['NULL', null], ['EMPTY', ''], ['INVALID', 'https://not-cas.invalid/centinelapi/V1/Cruise/Collect'],
  ]) {
    const adapter = await import(`${bundleUrl}#collection-${label}`);
    const payment = directHandoff();
    if (label === 'ABSENT') delete payment.continuation.collection_url;
    else payment.continuation.collection_url = value;
    let requests = 0;
    await assert.rejects(adapter.runDelegatedPixelPay({ handoff: payment, transport: () => { requests++; } }),
      { code: `PIXELPAY_3DS_COLLECTION_URL_${label}` });
    assert.equal(requests, 0);
    assert.equal(collectionFrame(), null);
  }
}

async function verifyDirectFrictionlessTransportFailure() {
  const adapter = await import(`${bundleUrl}#direct-frictionless-failure`);
  const fixture = directFixture();
  const operations = [];
  try {
    const rejected = assert.rejects(adapter.runDelegatedPixelPay({
      handoff: directHandoff(),
      transport: async operation => {
        operations.push(operation);
        if (operation === 'lookup') return { status: 200, success: true, action: null,
          data: { identifier: 'synthetic-frictionless-identifier' } };
        throw new Error('Synthetic transport failure');
      },
    }), { message: 'PROTOTYPE_UNCERTAIN' });
    await fixture.collection;
    fixture.emit(CAS, collectionFrame().contentWindow, profile);
    await rejected;
    await tick();
    assert.deepEqual(operations, ['lookup', 'retry']);
    assert.equal(collectionFrame(), null);
    assert.equal(stepUpFrame(), null);
  } finally {
    fixture.close();
  }
}

try {
  const adapter = await import(bundleUrl);
  const { sdk, Manager } = await adapter.loadDelegatedSdk();
  for (const [namespace, name] of [
    ['Requests', 'SaleTransaction'], ['Models', 'Settings'], ['Responses', 'SuccessResponse'],
    ['Responses', 'PayloadResponse'], ['Responses', 'FailureResponse'],
  ]) {
    const browserType = window[namespace]?.[name];
    assert.equal(typeof browserType, 'function', `${namespace}.${name} missing from SDK browser entry`);
    assert.equal(sdk[namespace]?.[name], browserType, `${namespace}.${name} missing from the adapter`);
  }
  assert.equal(typeof Manager?.prototype?.init, 'function');
  assert.equal(typeof Manager.clearAllEvents, 'function');

  const operations = [];
  const transport = async (operation, data) => {
    operations.push(operation);
    if (operation === 'start') return handoff();
    if (operation === 'lookup') {
      assert.equal(data.reference, 'local-fixture');
      return { status: 400, success: false, data: {} };
    }
    if (operation === 'status') return pending;
    throw new Error('Unexpected delegated operation');
  };
  const result = await adapter.runDelegatedPixelPay({ transport });
  assert.equal(result, pending);
  assert.deepEqual(phases, ['configure', 'setup']);
  assert.deepEqual(scripts, [SDK_SCRIPT]);
  assert.deepEqual(operations, ['start', 'lookup', 'status']);

  window.document.querySelector('script').remove();
  loadSongbird = false;
  await assert.rejects(adapter.runDelegatedPixelPay({ transport }),
    { code: 'PIXELPAY_3DS_SDK_INIT_FAILED' });
  await assert.rejects(adapter.runDelegatedPixelPay({ transport }),
    { message: 'PROTOTYPE_BUSY' });
  assert.deepEqual(scripts, [SDK_SCRIPT, SDK_SCRIPT]);
  assert.deepEqual(operations, ['start', 'lookup', 'status', 'start']);
  loadSongbird = true;
  await verifyDuplicateSetup(await import(`${bundleUrl}#duplicate`));
  for (const reason of ['mismatch', 'cancel', 'expiry']) await verifyClosedLookup(reason);
  for (const status of [200, 202]) await verifyNativeDirectApi(status);
  for (const reason of ['abort', 'abort-after-stepup', 'expiry']) await verifyDirectCancellation(reason);
  await verifyInvalidDirectHandoffs();
  await verifyDirectFrictionlessTransportFailure();
  assert.equal(outboundCalls, 0);
  process.stdout.write('PixelPay Vite browser bundle: native Songbird and Direct collection, single continuation, attempt isolation and shutdown verified offline.\n');
} finally {
  observer.disconnect();
  window.close();
}
