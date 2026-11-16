import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import nacl from 'tweetnacl';
import { classify, SONGBIRD } from './policy.mjs';

const require = createRequire(import.meta.url);
const sdkEntry = require.resolve('@pixelpay/sdk-core');
const sdkBrowser = await readFile(new URL('./browser/index.js', pathToFileURL(sdkEntry)));
const sdkVersion = require('@pixelpay/sdk-core/package.json').version;
if (sdkVersion !== '2.5.8') throw new Error('SDK_VERSION_MISMATCH');

const fixtureScript = noAction => `(() => {
  const handlers = new Map();
  window.Cardinal = {
    configure() {}, off(name) { handlers.delete(name); }, on(name, fn) { handlers.set(name, fn); },
    setup() { window.labRecordFixture('setup_fixture'); queueMicrotask(() => handlers.get('payments.setupComplete')({sessionId:'synthetic-ddc'})); },
    continue() { window.labRecordFixture('challenge_fixture'); queueMicrotask(() => {
      window.labRecordFixture('validated_fixture');
      handlers.get('payments.validated')({ActionCode:'${noAction ? 'NOACTION' : 'SUCCESS'}'}, ${noAction ? 'undefined' : "'synthetic.validated.jwt'"});
    }); }
  };
})();`;

export async function runLab({ realScript = false, continueSuccess = true, noAction = false } = {}) {
  const files = new Map([
    ['/', ['text/html', await readFile(new URL('./index.html', import.meta.url))]],
    ['/browser.mjs', ['text/javascript', await readFile(new URL('./browser.mjs', import.meta.url))]],
    ['/sdk.js', ['text/javascript', sdkBrowser]],
  ]);
  const server = createServer((req, res) => {
    const entry = req.method === 'GET' && files.get(req.url);
    if (!entry) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': entry[0], 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self' https://songbirdstag.cardinalcommerce.com; style-src 'unsafe-inline'; connect-src https://pixelpay.dev https://*.cardinalcommerce.com; frame-src https:; img-src data:; base-uri 'none'; form-action https:",
    });
    res.end(entry[1]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const trace = [];
  const counts = { publicKey: 0, saleAttempts: 0, saleDispatched: 0, secondSaleBlocked: 0,
    lookup: 0, continue: 0, externalDispatched: 0, realScriptAttempts: 0,
    blocked: 0, cardinalRequestsBlocked: 0, websocketsBlocked: 0 };
  let firstOrder;
  let finalizationIdentityMatches = false;
  let finalizationIdentifierPresent = false;
  let presetHeadersPresent = true;
  let encryptedCardPresent = false;
  let scriptHttp = null;
  let scriptTransportFailure = false;
  const blockedCardinalStages = [];
  const realScriptResponses = [];
  const dispatchedScripts = new Set();
  const publicKey = Buffer.from(nacl.box.keyPair().publicKey).toString('base64');
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
      '--disable-background-networking', '--disable-component-update', '--disable-extensions',
      `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1${realScript ? ', EXCLUDE songbirdstag.cardinalcommerce.com' : ''}`,
    ] });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => { counts.websocketsBlocked++; socket.close(); });
    await context.route('**/*', async route => {
      const request = route.request();
      const kind = classify(request.url(), request.method(), origin, realScript);
      const headers = { 'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type,x-auth-key,x-auth-hash,x-auth-secure' };
      const reply = (status, data, success = true, action = null) => route.fulfill({
        status, headers, contentType: 'application/json', body: JSON.stringify({ success, action, data }),
      });
      if (kind === 'local') return route.continue();
      if (kind === 'preflight_fixture') return route.fulfill({ status: 204, headers });
      if (kind === 'real_script') {
        // AM: Only this exact nonfinancial GET may leave; redirects are never followed.
        counts.realScriptAttempts++;
        if (dispatchedScripts.has(request.url())) { counts.blocked++; return route.abort(); }
        dispatchedScripts.add(request.url());
        counts.externalDispatched++;
        trace.push('songbird_real_get');
        try {
          const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 15000 });
          if (request.url() === SONGBIRD) scriptHttp = response.status();
          realScriptResponses.push({ code: request.url() === SONGBIRD ? 'SONGBIRD_ENTRY' : 'SONGBIRD_CHUNK',
            http: response.status(), sha256: createHash('sha256').update(await response.body()).digest('hex') });
          if (response.status() !== 200) { counts.blocked++; return route.abort(); }
          return route.fulfill({ response });
        } catch { scriptTransportFailure = true; return route.abort(); }
      }
      if (kind === 'script_fixture') {
        trace.push('songbird_script_fixture');
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: fixtureScript(noAction) });
      }
      if (kind === 'blocked') {
        counts.blocked++;
        const blockedUrl = new URL(request.url());
        if (blockedUrl.hostname.endsWith('.cardinalcommerce.com')) {
          counts.cardinalRequestsBlocked++;
          const knownPaths = new Map([
            ['/v1/order/jwt/init', 'CARDINAL_JWT_INIT'],
            ['/v1/order/jwt/continue', 'CARDINAL_JWT_CONTINUE'],
          ]);
          const staticPath = /^\/edge\/v1\/(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.js$/i.test(blockedUrl.pathname)
            ? blockedUrl.pathname : null;
          blockedCardinalStages.push({ code: knownPaths.get(blockedUrl.pathname.toLowerCase().replace(/\/$/, '')) || 'CARDINAL_OTHER',
            staticPath,
            resourceType: ['script', 'xhr', 'fetch', 'document', 'image'].includes(request.resourceType())
              ? request.resourceType() : 'other', method: ['GET', 'POST'].includes(request.method()) ? request.method() : 'OTHER' });
        }
        trace.push('other_request_blocked'); return route.abort();
      }
      presetHeadersPresent &&= Boolean(request.headers()['x-auth-key'] && request.headers()['x-auth-hash']);
      trace.push(kind);
      if (kind === 'public_key') { counts.publicKey++; return reply(200, { public_key: publicKey }); }
      if (kind === 'sale') {
        counts.saleAttempts++;
        const body = request.postDataJSON();
        const identity = [body.order_id, body.order_amount, body.order_currency];
        if (counts.saleAttempts === 1) {
          firstOrder = identity;
          encryptedCardPresent = Boolean(body.card_number && body.card_cvv)
            && body.card_number !== '4111111111111111' && body.card_cvv !== '999';
          trace.push('sale_202_fixture');
          return reply(202, { transaction_type: 'songbird', payload: 'synthetic.initial.jwt' });
        }
        finalizationIdentityMatches = identity.every((value, index) => value === firstOrder[index]);
        finalizationIdentifierPresent = body.authentication_identifier === 'synthetic-auth';
        counts.secondSaleBlocked++;
        trace.push('second_sale_blocked');
        return route.abort('blockedbyclient');
      }
      if (kind === 'lookup') {
        counts.lookup++;
        return reply(200, { identifier: 'synthetic-auth', continue_url: 'https://acs.offline.invalid',
          continue_payload: 'synthetic', transaction_id: 'synthetic-tx' }, true, 'continue');
      }
      counts.continue++;
      return reply(200, {}, continueSuccess);
    });
    const page = await context.newPage();
    page.on('response', response => { if (response.url() === SONGBIRD) scriptHttp = response.status(); });
    page.on('requestfailed', request => { if (request.url() === SONGBIRD) scriptTransportFailure = true; });
    // AM: No console listeners, traces, HAR, screenshots, raw errors, bodies or headers are persisted.
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    let deadlineReached = false;
    try { await page.waitForFunction(() => window.labSnapshot?.().finished, null, { timeout: realScript ? 20000 : 10000 }); }
    catch { deadlineReached = true; }
    const result = await page.evaluate(() => window.labSnapshot());
    return {
      mode: realScript ? 'real_script_only' : 'offline', sdkVersion, browserVersion: browser.version(),
      observedAtUTC: new Date().toISOString(),
      sdkBrowserSha256: createHash('sha256').update(sdkBrowser).digest('hex'),
      counts, trace, scriptHttp, scriptTransportFailure, deadlineReached, blockedCardinalStages, realScriptResponses,
      native: result, presetHeadersPresent, encryptedCardPresent,
      finalizationIdentityMatches, finalizationIdentifierPresent,
      realDdcCompleted: false, realChallengeCompleted: false,
      stopCode: realScript ? (result.cardinalJwtRejected ? 'CARDINAL_REJECTED_SYNTHETIC_JWT_BEFORE_DDC'
        : result.cardinalValidationFailed ? 'CARDINAL_VALIDATION_FAILED_WITH_SYNTHETIC_INPUT'
        : blockedCardinalStages.some(stage => stage.code === 'CARDINAL_JWT_INIT')
        ? 'CARDINAL_JWT_INIT_BLOCKED_NO_AUTHENTIC_FRESH_TOKEN'
        : result.scriptLoaded ? 'CARDINAL_IO_OR_STATIC_DEPENDENCY_BLOCKED' : 'REAL_SCRIPT_NOT_LOADED')
        : (counts.secondSaleBlocked ? 'NATIVE_SECOND_SALE_BLOCKED_BEFORE_DISPATCH'
        : 'OFFLINE_SEQUENCE_INCOMPLETE'),
    };
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--real-script', '--continue-false', '--noaction'].includes(arg))) {
    process.stderr.write('LAB_ARGUMENT_REJECTED\n'); process.exitCode = 1;
  } else {
    try {
      process.stdout.write(`${JSON.stringify(await runLab({ realScript: args.includes('--real-script'),
        continueSuccess: !args.includes('--continue-false'), noAction: args.includes('--noaction') }), null, 2)}\n`);
    } catch { process.stderr.write('LAB_EXECUTION_FAILED\n'); process.exitCode = 1; }
  }
}
