import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runLab } from './run.mjs';
import { classify, SONGBIRD, SONGBIRD_CHUNK, GATEWAY } from './policy.mjs';

const origin = 'http://127.0.0.1:12345';
test('transport defaults closed: no Status, Auth, redirects, secrets, arbitrary hosts or POST Songbird', () => {
  assert.equal(classify(SONGBIRD, 'GET', origin), 'script_fixture');
  assert.equal(classify(SONGBIRD, 'GET', origin, true), 'real_script');
  assert.equal(classify(SONGBIRD_CHUNK, 'GET', origin, true), 'real_script');
  assert.equal(classify(SONGBIRD_CHUNK, 'GET', origin), 'blocked');
  for (const [url, method] of [
    [SONGBIRD, 'POST'], [SONGBIRD + '?token=synthetic', 'GET'],
    [SONGBIRD_CHUNK, 'POST'], [SONGBIRD_CHUNK + '?token=synthetic', 'GET'],
    ['https://pixelpay.app/api/v2/transaction/sale', 'POST'],
    [GATEWAY + '/api/v2/transaction/status', 'POST'],
    [GATEWAY + '/api/v2/transaction/auth', 'POST'],
    [GATEWAY + '/api/v2/transaction/void', 'POST'],
    [GATEWAY + '/api/v2/transaction/sale?token=synthetic', 'POST'],
    [GATEWAY + '/api/v2/merchant/public_key?__proto__=synthetic', 'GET'],
    ['https://user:synthetic@pixelpay.dev/api/v2/transaction/sale', 'POST'],
    ['https://songbirdstag.cardinalcommerce.com.evil.invalid/edge/v1/songbird.js', 'GET'],
    [origin + '/sdk.js?data=synthetic', 'GET'], ['not a URL', 'GET'],
  ]) assert.equal(classify(url, method, origin, true), 'blocked');
});

for (const [name, options, expectedContinue] of [
  ['challenge / continue success=true', {}, 1],
  ['challenge / continue success=false', { continueSuccess: false }, 1],
  ['NOACTION without validated JWT', { noAction: true }, 0],
]) test(`unmodified SDK in real Chrome: ${name}, second Sale blocked`, async () => {
  const result = await runLab(options);
  assert.equal(result.sdkVersion, '2.5.8');
  assert.equal(result.deadlineReached, false);
  assert.equal(result.native.constructed, true);
  assert.equal(result.native.authenticationRequested, true);
  assert.equal(result.native.publicSandboxPreset, true);
  assert.equal(result.native.scriptLoaded, true);
  assert.equal(result.native.sdkMethodsUnchanged, true);
  assert.equal(result.native.hashValidationRequiresBackend, true);
  assert.deepEqual(result.native.fixtureStages, ['setup_fixture', 'challenge_fixture', 'validated_fixture']);
  assert.equal(result.presetHeadersPresent, true);
  assert.equal(result.encryptedCardPresent, true);
  assert.equal(result.counts.saleAttempts, 2);
  assert.equal(result.counts.saleDispatched, 0);
  assert.equal(result.counts.secondSaleBlocked, 1);
  assert.equal(result.counts.lookup, 1);
  assert.equal(result.counts.continue, expectedContinue);
  assert.equal(result.counts.externalDispatched, 0);
  assert.equal(result.counts.blocked, 0);
  assert.equal(result.counts.websocketsBlocked, 0);
  assert.equal(result.finalizationIdentityMatches, true);
  assert.equal(result.finalizationIdentifierPresent, true);
  assert.equal(result.native.financialApproval, false);
  assert.equal(result.realDdcCompleted, false);
  assert.equal(result.realChallengeCompleted, false);
  assert.ok(result.trace.indexOf('lookup') > result.trace.indexOf('sale_202_fixture'));
  assert.ok(result.trace.indexOf('second_sale_blocked') > result.trace.indexOf('lookup'));
  // AM: Reports contain only fixed codes, counters, booleans and an SDK file hash.
  const serialized = JSON.stringify(result);
  for (const forbidden of ['4111111111111111', 'synthetic.initial.jwt', 'synthetic.validated.jwt',
    'fixture@example.invalid', 'x-auth-hash', 'card_cvv', 'continue_payload', 'auth_key']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('browser code only invokes public SDK APIs; no SDK/Cardinal method replacement or handoff input', async () => {
  const source = await readFile(new URL('./browser.mjs', import.meta.url), 'utf8');
  assert.equal(/prototype\.[\w]+\s*=(?!=)/.test(source), false);
  assert.equal(/Cardinal\s*=|Cardinal\.\w+\s*=(?!=)/.test(source), false);
  for (const forbidden of ['setupCredentials', 'localStorage', 'sessionStorage', 'console.', 'fetch(', 'XMLHttpRequest']) {
    assert.equal(source.includes(forbidden), false);
  }
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.equal(/<input|<form/i.test(html), false);
});
