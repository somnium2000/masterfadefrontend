import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const entry = fileURLToPath(new URL('../src/features/payments/PublicPixelPayChallenge.jsx', import.meta.url));
const { output } = await build({
  configFile: false,
  logLevel: 'silent',
  plugins: [react(), {
    name: 'stepup-fixture',
    resolveId: id => id === 'stepup-fixture' ? '\0stepup-fixture' : null,
    load(id) {
      if (id !== '\0stepup-fixture') return null;
      return `import React from 'react';
import { createRoot } from 'react-dom/client';
import Challenge from ${JSON.stringify(entry)};
const root = createRoot(document.querySelector('#checkout'));
window.openChallenge = () => root.render(React.createElement(Challenge, { active: true, onCancel: window.closeChallenge }));
window.closeChallenge = () => root.render(React.createElement(Challenge, { active: false }));
window.closeChallenge();`;
    },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  build: { write: false, rollupOptions: { input: 'stepup-fixture', output: { inlineDynamicImports: true } } },
});
const browser = await chromium.launch({ executablePath: process.env.MF_CHROMIUM_PATH });
try {
  for (const viewport of [{ width: 360, height: 640 }, { width: 768, height: 820 }, { width: 1280, height: 800 }]) {
    const page = await browser.newPage({ viewport });
    await page.route('**/*', route => route.abort());
    try {
      await page.setContent('<main style="height:2800px"><div id="checkout" style="position:absolute;top:60px"></div><button style="position:absolute;top:1620px">Pagar</button></main>');
      for (const css of output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))) {
        await page.addStyleTag({ content: css.source });
      }
      await page.addScriptTag({ type: 'module', content: output.find(chunk => chunk.type === 'chunk').code });
      await page.locator('[without-sdk-modal]').waitFor({ state: 'attached' });
      await page.evaluate(() => { window.scrollTo(0, 1550); document.querySelector('main > button').focus(); });
      await page.evaluate(() => window.openChallenge());
      await page.getByText('Completa la autenticación con tu banco.').waitFor({ state: 'attached' });
      await page.evaluate(() => {
        // AM: Reproduce the placement and dimensions of the SDK-owned iframe without a bank request.
        const iframe = document.createElement('iframe');
        iframe.name = 'step-up-iframe';
        iframe.title = 'Autenticación bancaria';
        iframe.width = '500';
        iframe.height = '600';
        iframe.srcdoc = '<button>Desafío sintético</button>';
        document.querySelector('[without-sdk-modal] .pixelpay-modal-container').append(iframe);
      });
      const frame = page.locator('iframe[name="step-up-iframe"]');
      const rect = await frame.boundingBox();
      assert.ok(rect && rect.y >= 0 && rect.y < viewport.height && rect.x >= 0 && rect.x + rect.width <= viewport.width,
        `StepUp outside viewport ${viewport.width}: ${JSON.stringify(rect)}`);
      const dialog = page.getByRole('dialog', { name: 'Autenticación 3DS' });
      assert.equal(await dialog.evaluate(node => node.matches(':modal')), true);
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Autenticación 3DS');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Pagar');
      assert.equal(await page.evaluate(() => window.scrollY), 1550);
      process.stdout.write(`StepUp viewport ${viewport.width}x${viewport.height}: PASS\n`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
