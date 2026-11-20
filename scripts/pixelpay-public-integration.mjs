import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.PIXELPAY_INTEGRATION_BACKEND;
assert.ok(backend, 'Set PIXELPAY_INTEGRATION_BACKEND to the companion backend checkout; this check must not skip.');
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = 'virtual:public-pixelpay-integration';
const bundle = await build({ root, configFile: false, logLevel: 'silent', resolve: { alias: { '@': path.join(root, 'src') } }, plugins: [react(), {
  name: 'public-pixelpay-integration',
  resolveId: id => id === entry ? '\0public-pixelpay-integration.jsx' : null,
  load(id) {
    if (id !== '\0public-pixelpay-integration.jsx') return null;
    return `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import useBookingPayment from ${JSON.stringify(path.join(root, 'src/features/public/booking/hooks/useBookingPayment.js'))};
      import Challenge from ${JSON.stringify(path.join(root, 'src/features/payments/PublicPixelPayChallenge.jsx'))};
      export { loadDelegatedSdk } from ${JSON.stringify(path.join(root, 'src/features/payments/experimental/delegatedPixelPay.js'))};
      function Probe({ args }) {
        const flow = useBookingPayment({ currentGroupId: args.groupId, authenticated: true });
        const [error, setError] = React.useState('');
        return React.createElement(React.Fragment, null,
          React.createElement('button', { onClick: () => flow.salePixelPayOnce(args).catch(() => setError('FAILED')) }, 'Pagar'),
          React.createElement(Challenge, { active: flow.public3dsActive, onCancel: flow.cancelPublic3ds }),
          React.createElement('output', null, JSON.stringify(flow.paymentResult)),
          React.createElement('span', { id: 'failure' }, error));
      }
      export function mount(element, args) { const root = createRoot(element); root.render(React.createElement(Probe, { args })); return () => root.unmount(); }
    `;
  },
}], define: { 'import.meta.env.VITE_API_URL': '""' },
  build: { write: false, rollupOptions: { input: entry, preserveEntrySignatures: 'strict', output: { inlineDynamicImports: true } } },
});
const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry);
assert.ok(chunk);
const bundleUrl = `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`;
const waitFor = async (predicate, label) => {
  const deadline = Date.now() + 12000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

async function verify(scenario) {
  const child = spawn(process.execPath, [path.join(backend, 'test/fixtures/publicPixelPayApi.mjs'), scenario],
    { cwd: backend, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const server = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('LOCAL_SERVER_TIMEOUT')), 15000);
    child.once('error', reject);
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`LOCAL_SERVER_FAILED: ${stderr}`)); });
    child.stdout.on('data', data => {
      output += data;
      if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output.split('\n')[0])); }
    });
  });
  const dom = new JSDOM('<div id="app"></div>', { url: server.address });
  const { window } = dom;
  for (const key of ['window', 'document', 'MutationObserver', 'navigator', 'screen', 'Event', 'CustomEvent', 'XMLHttpRequest']) {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true });
  }
  const counts = { init: 0, setup: 0, continue: 0, collect: 0, stepUp: 0, external: 0, saleRequests: 0 };
  const requests = [];
  const request = (route, options = {}) => new Promise((resolve, reject) => {
    const url = new URL(route, server.address);
    if (url.origin !== server.address || !['http:'].includes(url.protocol)) {
      counts.external++; reject(new Error('EXTERNAL_BLOCKED')); return;
    }
    const req = http.request(url, { method: options.method ?? 'GET', headers: { ...options.headers, cookie: server.headers.cookie } }, res => {
      let body = '';
      res.on('data', data => { body += data; });
      res.on('end', () => resolve(new Response(body, { status: res.statusCode, headers: res.headers })));
    });
    req.on('error', reject); req.end(options.body);
  });
  const block = () => { counts.external++; throw new Error('EXTERNAL_BLOCKED'); };
  globalThis.fetch = window.fetch = async (route, options) => {
    requests.push({ route: String(route), method: options?.method });
    if (String(route).endsWith('/pixelpay/sale')) counts.saleRequests++;
    return request(route, options);
  };
  window.XMLHttpRequest.prototype.send = block;
  document.cookie = 'mf_csrf=synthetic-csrf; path=/';
  const active = () => document.querySelector('dialog[without-sdk-modal]')?.open === true;
  const handlers = new Map();
  window.Cardinal = {
    configure() {}, off: name => handlers.delete(name), on: (name, fn) => handlers.set(name, fn),
    setup() {
      counts.setup++;
      setTimeout(() => { assert.equal(active(), true); handlers.get('payments.setupComplete')?.({ sessionId: 'synthetic-session' }); }, 20);
    },
    continue() {
      counts.continue++; assert.equal(active(), true);
      queueMicrotask(() => handlers.get('payments.validated')?.({ ActionCode: 'SUCCESS' }, 'synthetic-validated-' + 'x'.repeat(1024)));
    },
  };
  const observer = new window.MutationObserver(records => {
    for (const record of records) for (const element of record.addedNodes) {
      if (element.tagName === 'SCRIPT') {
        assert.equal(element.src, 'https://songbird.cardinalcommerce.com/edge/v1/songbird.js');
        queueMicrotask(() => element.dispatchEvent(new window.Event('load')));
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.HTMLFormElement.prototype.submit = function () {
    if (this.id === 'cardinal_collection_form') {
      counts.collect++;
      assert.equal(this.getAttribute('action'), 'https://client.cardinaltrusted.com/centinelapi/V1/Cruise/Collect');
      setTimeout(() => { assert.equal(active(), true); window.dispatchEvent(new window.MessageEvent('message', {
        origin: 'https://client.cardinaltrusted.com', source: document.getElementById('cardinal_collection_iframe').contentWindow,
        data: { MessageType: 'profile.completed', SessionId: 'synthetic-collection-session' },
      })); }, 20);
    } else if (this.id === 'step-up-form') {
      counts.stepUp++;
      assert.equal(this.getAttribute('action'), 'https://client.cardinaltrusted.com/centinelapi/V2/Cruise/StepUp');
      queueMicrotask(() => window.dispatchEvent(new window.MessageEvent('message', {
        origin: 'https://offline-pixelpay.invalid', source: document.querySelector('iframe[name="step-up-iframe"]').contentWindow,
        data: { name: 'pixelpay_continue', identifier: 'synthetic-callback' },
      })));
    } else assert.fail('Unexpected form');
  };
  let unmount;
  try {
    const adapter = await import(`${bundleUrl}#${scenario}`);
    const { sdk, Manager } = await adapter.loadDelegatedSdk();
    assert.equal(sdk.Requests.SaleTransaction, window.Requests.SaleTransaction, 'PR123 browser namespace preserved');
    const nativeInit = Manager.prototype.init;
    Manager.prototype.init = function (...args) { counts.init++; return nativeInit.apply(this, args); };
    unmount = adapter.mount(document.getElementById('app'), {
      groupId: '11111111-2222-4333-8444-555555555555', intentId: '99999999-9999-4999-8999-999999999999',
      titularEmail: 'cliente@example.com', public3ds: true,
      card: { number: '4000000000000002', holder: 'Fixture', expire: '3012', cvv: '999' },
      billing: { address: 'Synthetic address', country: 'HN', state: 'HN-CR', city: 'SPS', phone: '99999999' },
    });
    await waitFor(() => document.querySelector('button'), 'React mount');
    // AM: Allow the mounted hook to establish its current booking group before the double click.
    await new Promise(resolve => setTimeout(resolve, 20));
    document.querySelector('button').click(); document.querySelector('button').click();
    await waitFor(() => document.getElementById('failure').textContent
      || (JSON.parse(document.querySelector('output')?.textContent || 'null') !== null && !active()), `terminal ${scenario}`);
    assert.equal(document.getElementById('failure').textContent, '');
    const result = JSON.parse(document.querySelector('output').textContent);
    const state = await (await request('/__fixture__/state')).json();
    process.stdout.write(JSON.stringify({ scenario, counts, calls: state.calls, diagnostic: result.public_3ds_browser_diagnostic }) + '\n');
    const songbird = scenario.startsWith('songbird');
    const blocked = scenario === 'collection-untrusted';
    const continueFailed = scenario === 'songbird-continue-false';
    const approved = !blocked && !continueFailed && scenario !== 'bad-hash';
    const start = state.phases.find(row => row.phase === 'start_result');
    assert.equal(start?.state, blocked ? 'unsupported' : 'challenge');
    assert.equal(start?.continuation_diagnostic?.code, blocked ? 'PIXELPAY_3DS_COLLECTION_URL_INVALID'
      : songbird ? 'PIXELPAY_3DS_SONGBIRD_READY' : 'PIXELPAY_3DS_COLLECTION_READY');
    assert.equal(start.continuation_diagnostic.sdk_data.collection_url.type, songbird ? 'absent' : 'string');
    assert.equal(state.phases.some(row => row.phase === 'handoff_ready'), !blocked);
    if (scenario === 'challenge') {
      for (const source of ['raw_data', 'sdk_data']) {
        assert.equal(start.continuation_diagnostic[source].collection_url.origin, 'https://client.cardinaltrusted.com');
        assert.equal(start.continuation_diagnostic[source].collection_url.length, 64);
      }
      assert.equal(start.continuation_diagnostic.raw_to_sdk_equal.collection_url, true);
    }
    if (continueFailed) assert.deepEqual(result.public_3ds_browser_diagnostic, { code: 'PIXELPAY_3DS_CHALLENGE_INTERRUPTED' });
    assert.equal(counts.saleRequests, 1);
    assert.equal(counts.init, blocked ? 0 : 1, JSON.stringify({ scenario, counts, result, state }));
    assert.equal(counts.setup, songbird ? 1 : 0);
    assert.equal(counts.continue, songbird ? 1 : 0);
    assert.equal(counts.collect, blocked || songbird ? 0 : 1);
    assert.equal(counts.stepUp, ['challenge', 'bad-hash'].includes(scenario) ? 1 : 0);
    assert.deepEqual(state.calls, blocked ? ['start'] : continueFailed ? ['start', 'lookup', 'continue']
      : songbird ? ['start', 'lookup', 'continue', 'retry'] : ['start', 'lookup', 'retry']);
    assert.equal(state.stats.initialSales, 1);
    assert.equal(state.stats.lookups, blocked ? 0 : 1);
    assert.equal(state.stats.continues, songbird ? 1 : 0);
    assert.equal(state.stats.retries, blocked || continueFailed ? 0 : 1);
    assert.equal(state.stats.statusQueries, 0);
    assert.equal(state.stats.cryptoContextMatches, true);
    assert.equal(state.stats.credentialsInNode, true);
    assert.equal(state.stats.externalSockets + state.external + counts.external, 0);
    assert.equal(state.saleAttempts, 1);
    assert.equal(state.dispatches, blocked || continueFailed ? 0 : 1);
    assert.equal(state.payments, approved ? 1 : 0);
    assert.equal(state.confirmations, approved ? 1 : 0);
    assert.equal(result.booking_confirmed === true, approved);
    if (!approved) assert.equal(result.pending_confirmation, true);
    assert.ok(requests.filter(row => row.method === 'POST').every(row => row.route.startsWith('/v1/pagos/reservas/')));
    assert.doesNotMatch(JSON.stringify(window.sessionStorage), /4000000000000002|synthetic-(?:key|secret|hash|validated)|"(?:card|billing|token|payload)"/);
    process.stdout.write(`Public React/API/application-worker/browser-SDK ${scenario}: PASS (external=0).\n`);
  } finally {
    unmount?.(); observer.disconnect(); window.close(); child.stdin.end();
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill(); resolve(); }, 3000).unref(); });
  }
}

for (const scenario of ['songbird', 'challenge', 'frictionless', 'collection-untrusted', 'songbird-continue-false', 'bad-hash']) await verify(scenario);
