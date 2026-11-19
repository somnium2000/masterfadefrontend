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
  const pending = { state: 'pending', booking_confirmed: false };
  const transport = async (operation, data) => {
    operations.push(operation);
    if (operation === 'lookup') {
      assert.equal(data.reference, 'local-fixture');
      return { status: 400, success: false, data: {} };
    }
    if (operation === 'status') return pending;
    throw new Error('Unexpected delegated operation');
  };
  const result = await adapter.runDelegatedPixelPay({ handoff: handoff(), transport });
  assert.equal(result, pending);
  assert.deepEqual(phases, ['configure', 'setup']);
  assert.deepEqual(scripts, [SDK_SCRIPT]);
  assert.deepEqual(operations, ['lookup', 'status']);

  window.document.querySelector('script').remove();
  loadSongbird = false;
  const failedHandoff = handoff();
  await assert.rejects(adapter.runDelegatedPixelPay({ handoff: failedHandoff, transport }),
    { code: 'PIXELPAY_3DS_SDK_INIT_FAILED' });
  await assert.rejects(adapter.runDelegatedPixelPay({ handoff: failedHandoff, transport }),
    { message: 'PROTOTYPE_BUSY' });
  assert.deepEqual(scripts, [SDK_SCRIPT, SDK_SCRIPT]);
  assert.deepEqual(operations, ['lookup', 'status']);
  assert.equal(outboundCalls, 0);
  process.stdout.write('PixelPay Vite browser bundle: constructors, native setup and delegated lookup verified; initialization failure blocks repeat.\n');
} finally {
  observer.disconnect();
  window.close();
}
