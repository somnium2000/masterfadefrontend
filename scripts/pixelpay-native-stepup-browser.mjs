import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd().replaceAll('\\', '/');
const { output } = await build({
  configFile: false, logLevel: 'silent',
  resolve: { alias: { '@': root + '/src' } },
  plugins: [react(), tailwindcss(), {
    name: 'stepup-browser-fixture',
    resolveId: id => id === 'stepup-fixture' ? '\0stepup-fixture' : null,
    load: id => id === '\0stepup-fixture' ? `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import Challenge from '${root}/src/features/payments/PublicPixelPayChallenge.jsx';
      import { runDelegatedPixelPay } from '${root}/src/features/payments/experimental/delegatedPixelPay.js';
      import '${root}/src/index.css';
      const root = createRoot(document.querySelector('#checkout'));
      let active = false, revision = 0;
      const controller = new AbortController();
      const render = () => root.render(React.createElement(React.Fragment, null,
        React.createElement('span', { id: 'revision' }, revision),
        React.createElement(Challenge, { active, overlay: true, onCancel: () => controller.abort() })));
      window.bump = () => { revision++; render(); };
      window.operations = [];
      window.stepUpTrace = [];
      sessionStorage.setItem('mf_pixelpay_stepup_trace', '1');
      window.addEventListener('masterfade:pixelpay-stepup', ({ detail }) => window.stepUpTrace.push(detail));
      render();
      document.querySelector('#pay').onclick = async () => {
        active = true; render();
        try {
          const outcome = await runDelegatedPixelPay({
            signal: controller.signal,
            handoff: { state: 'challenge', continuation_mode: 'direct_api', expiresAt: Date.now() + 20000,
              order: { id: 'synthetic-order', amount: 1, currency: 'HNL' },
              sdk: { endpoint: 'https://offline-pixelpay.invalid', environment: 'live' },
              continuation: { status: 202, transaction_type: 'songbird', payload: 'fixture-collection',
                collection_url: 'https://client.cardinaltrusted.com/centinelapi/V1/Cruise/Collect' } },
            transport: async operation => {
              window.operations.push(operation);
              if (operation === 'lookup') return { status: 202, action: 'continue', success: true,
                data: { identifier: 'fixture-lookup', continue_url: 'https://client.cardinaltrusted.com/centinelapi/V2/Cruise/StepUp',
                  continue_payload: 'fixture-stepup', window_size: '03' } };
              if (operation === 'retry') return { status: 400, success: false, action: null, data: {} };
              return { pending_confirmation: true, booking_confirmed: false };
            },
          });
          window.outcome = outcome;
        } catch (error) { window.outcome = error.code || error.message; }
        finally { active = false; render(); }
      };
    ` : null,
  }],
  build: { write: false, rollupOptions: { input: 'stepup-fixture', output: { inlineDynamicImports: true } } },
});
const script = output.find(item => item.type === 'chunk').code;
const styles = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
const callback = "parent.postMessage({name:'pixelpay_continue',identifier:'fixture-callback'}, 'https://checkout.invalid')";
const browser = await chromium.launch({ executablePath: process.env.MF_CHROMIUM_PATH });
try {
  const scenarios = [
    { viewport: { width: 360, height: 640 } },
    { viewport: { width: 768, height: 820 } },
    { viewport: { width: 1280, height: 800 } },
    { viewport: { width: 360, height: 640 }, cancel: true },
  ];
  for (const { viewport, cancel } of scenarios) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
    const fixtureErrors = [];
    page.on('pageerror', error => fixtureErrors.push(error.message));
    const requests = [];
    const blocked = [];
    await page.route('**/*', async route => {
      const req = route.request();
      const url = req.url();
      const html = body => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
      if (url === 'https://checkout.invalid/') return html('<main style="height:2800px"><div id="checkout"></div><button id="above" style="position:absolute;top:1555px">Anterior</button><button id="pay" style="position:absolute;top:1630px">Pagar</button><button id="below" style="position:absolute;top:1680px">Siguiente</button></main>');
      if (url === 'https://client.cardinaltrusted.com/centinelapi/V1/Cruise/Collect' && req.method() === 'POST') {
        requests.push('collect');
        return html("<script>parent.postMessage({MessageType:'profile.completed',SessionId:'fixture-session'},'https://checkout.invalid')</script>");
      }
      if (url === 'https://client.cardinaltrusted.com/centinelapi/V2/Cruise/StepUp' && req.method() === 'POST') {
        requests.push('stepup');
        return html(`<main style="min-height:calc(100vh - 16px);display:flex;flex-direction:column;align-items:start;justify-content:space-between">
          <label>Código sintético<input></label><button>Completar desafío</button>
        </main><script>
          ${callback};
          document.querySelector('button').onclick=()=>{if(document.querySelector('input').value==='1234') location.replace('https://offline-pixelpay.invalid/callback');};
        </script>`);
      }
      if (url === 'https://offline-pixelpay.invalid/callback') return html(`<script>${callback};${callback};</script>`);
      if (url === 'https://checkout.invalid/favicon.ico') return route.fulfill({ status: 204 });
      blocked.push(url);
      return route.abort();
    });
    try {
      await page.goto('https://checkout.invalid/');
      for (const css of styles) await page.addStyleTag({ content: css.source });
      await page.addScriptTag({ type: 'module', content: script });
      await page.locator('[without-sdk-modal]').waitFor({ state: 'attached' });
      await page.evaluate(() => window.scrollTo(0, 1550));
      await page.locator('#pay').click();
      const dialog = page.getByRole('dialog', { name: 'Autenticación 3DS' });
      const frame = page.locator('iframe[name="step-up-iframe"]');
      const issuer = page.frameLocator('iframe[name="step-up-iframe"]');
      await issuer.getByRole('button', { name: 'Completar desafío' }).waitFor({ timeout: 10000 }).catch(async error => {
        throw new Error(JSON.stringify({ requests, blocked, fixtureErrors, state: await page.evaluate(() => ({ operations: window.operations, outcome: window.outcome, frames: [...document.querySelectorAll('iframe')].map(node => node.name) })) }), { cause: error });
      });
      assert.equal(await dialog.evaluate(node => node.parentElement === document.body), true);
      assert.equal(await frame.evaluate(node => node.parentElement.classList.contains('pixelpay-modal-container')), true);
      assert.equal(await frame.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)',
        'A transparent issuer document needs a readable background');
      assert.deepEqual(requests, ['collect', 'stepup']);
      const rect = await frame.boundingBox();
      assert.ok(rect && rect.y >= 0 && rect.y < viewport.height && rect.x >= 0 && rect.x + rect.width <= viewport.width,
        `StepUp outside viewport ${viewport.width}: ${JSON.stringify(rect)}`);
      assert.equal(await frame.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return document.elementFromPoint(rect.x + 12, rect.y + 12) === node;
      }), true, 'StepUp must not be occluded');
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      assert.equal(await dialog.evaluate(node => node.matches(':modal')), true);
      await page.locator('#below').evaluate(node => node.focus());
      assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true,
        'Focus escaped to the booking underneath the active challenge');
      const original = await frame.elementHandle();
      await issuer.getByRole('textbox').click();
      assert.equal(await frame.evaluate(node => document.activeElement === node), true);
      await issuer.getByRole('textbox').fill('1234');
      await page.evaluate(() => window.bump());
      await page.waitForFunction(() => document.querySelector('#revision').textContent === '1');
      assert.equal(await frame.evaluate((node, before) => node === before, original), true);
      assert.equal(await issuer.getByRole('textbox').inputValue(), '1234');
      await page.waitForFunction(() => window.stepUpTrace.some(event =>
        event.phase === 'callback_observed' && !event.originMatches && event.frameMatches));
      // A callback from the allowed origin must still come from the StepUp frame.
      await page.evaluate(() => {
        const other = document.createElement('iframe');
        other.src = 'https://offline-pixelpay.invalid/callback';
        document.body.append(other);
      });
      await page.waitForFunction(() => window.stepUpTrace.some(event =>
        event.phase === 'callback_observed' && event.originMatches && !event.frameMatches));
      assert.deepEqual(await page.evaluate(() => window.operations), ['lookup']);
      if (cancel) {
        await dialog.getByRole('button', { name: 'Cancelar autenticación' }).focus();
        await page.keyboard.press('Escape');
      } else {
        await issuer.getByRole('button', { name: 'Completar desafío' }).click();
      }
      await page.waitForFunction(() => !!window.outcome);
      assert.deepEqual(await page.evaluate(() => window.operations), cancel ? ['lookup'] : ['lookup', 'retry', 'status']);
      if (!cancel) {
        assert.deepEqual(await page.evaluate(() => window.outcome), { pending_confirmation: true, booking_confirmed: false });
      }
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await page.locator('#pay').evaluate(node => document.activeElement === node), true);
      assert.deepEqual(fixtureErrors, []);
      assert.deepEqual(blocked, []);
      const result = cancel ? 'Escape cancelled; no retry' : 'visible, interactive, single retry, pending';
      process.stdout.write(`Native StepUp ${viewport.width}x${viewport.height}: ${result}.\n`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
