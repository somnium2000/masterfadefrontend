import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const engines = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4189';
const legal = JSON.parse(readFileSync(new URL('../src/features/public/data/legalTerms.v0.3-RC1.json', import.meta.url), 'utf8'));
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-legal-terms-evidence');

for (const engine of ['chromium', 'webkit']) for (const width of [390, 1440]) for (const theme of ['dark', 'light']) {
  test(`${engine} ${width} ${theme}: documentos íntegros y lectura sin consentimiento automático`, {
    skip: !existsSync(engines[engine].executablePath()), timeout: 90000,
  }, async () => {
    const browser = await engines[engine].launch();
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390, isMobile: width === 390 });
      const errors = [], writes = [];
      await context.addInitScript(value => {
        if (location.protocol === 'http:' || location.protocol === 'https:') localStorage.setItem('mf_theme_variant', value);
      }, theme);
      context.on('page', tab => {
        tab.on('pageerror', error => errors.push(error.message));
        tab.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      });
      await context.route('**/v1/**', async route => {
        const request = route.request(), endpoint = new URL(request.url()).pathname;
        let data = {};
        if (endpoint === '/v1/auth/me') data = { user: null, roles: [] };
        if (request.method() !== 'GET') {
          const payload = request.postDataJSON();
          writes.push({ endpoint, terms: payload?.acepta_terminos, marketing: payload?.consentimiento_marketing });
          assert.ok(['/v1/auth/register', '/v1/auth/register/confirm'].includes(endpoint));
          data = endpoint === '/v1/auth/register' ? { pending_verification: true } : { registered: true };
        }
        await route.fulfill({ json: { ok: true, data } });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const noOverflow = async tab => assert.ok(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sin desbordamiento de página');
      const aligned = async (tab, id) => tab.waitForFunction(target => {
        const node = document.getElementById(target), top = node?.getBoundingClientRect().top;
        return top >= -1 && top <= 32;
      }, id).catch(async error => {
        throw new Error(JSON.stringify(await tab.evaluate(target => ({ target, top: document.getElementById(target)?.getBoundingClientRect().top, fonts: document.fonts.status, images: [...document.querySelectorAll('header img')].map(image => image.complete) }), id)), { cause: error });
      });
      await page.goto(`${base}/terminos-y-condiciones`);
      await page.getByRole('heading', { level: 1, name: 'Términos y condiciones' }).waitFor();
      assert.equal(await page.getByRole('article').count(), 8);
      assert.equal(await page.getByRole('heading', { level: 3 }).count(), 62);
      const rendered = await page.locator('.legal-terms__paragraph').allTextContents();
      assert.deepEqual(rendered, legal.documents.flatMap(doc => doc.chapters.flatMap(ch => ch.blocks.filter(block => block.type === 'paragraph').map(block => block.text))));
      const table = page.getByRole('table');
      const sourceTable = legal.documents.flatMap(doc => doc.chapters.flatMap(ch => ch.blocks)).find(block => block.type === 'table');
      assert.deepEqual(await table.locator('th').allTextContents(), sourceTable.headers);
      assert.deepEqual(await table.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent))), sourceTable.rows);
      await page.getByRole('note').getByText(legal.approval_status, { exact: true }).waitFor();
      await noOverflow(page);
      await mkdir(evidence, { recursive: true });
      await page.waitForFunction(() => [...document.querySelectorAll('header img')].every(image => image.complete && image.naturalWidth > 0));
      await page.screenshot({ path: path.join(evidence, `${engine}-${width}-${theme}-overview.png`) });
      const nav = page.getByRole('navigation', { name: 'Índice de documentos legales' });
      await nav.locator('a[href="#politica-de-privacidad"]').click();
      await aligned(page, 'politica-de-privacidad');
      await page.screenshot({ path: path.join(evidence, `${engine}-${width}-${theme}-privacy.png`) });
      await page.locator('#politica-de-privacidad .legal-terms__back').click();
      await nav.locator('summary').first().click();
      await nav.locator('a[href="#aviso-legal-apartado-1"]').click();
      await aligned(page, 'aviso-legal-apartado-1');
      await page.goto(`${base}/terminos-y-condiciones#politica-de-privacidad`);
      await aligned(page, 'politica-de-privacidad');
      const cookieRegion = page.getByRole('region', { name: 'Tabla de cookies y almacenamiento local' });
      await cookieRegion.scrollIntoViewIfNeeded();
      await noOverflow(page);
      if (width === 390) {
        await cookieRegion.focus();
        for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('.legal-terms__table-scroll').scrollLeft > 0);
      }
      await page.screenshot({ path: path.join(evidence, `${engine}-${width}-${theme}-cookies.png`) });
      for (const confirmation of [false, true]) {
        const entry = confirmation ? '/register/confirm#operation=11111111-1111-4111-8111-111111111111&token=' + 'b'.repeat(64) : '/register?next=%2Fhome%2Fcliente';
        await page.goto(base + entry);
        await page.getByRole('heading', { level: 1, name: confirmation ? 'Confirmar registro' : 'Registrarte' }).waitFor();
        const fields = confirmation
          ? [['Nombre', 'Legal'], ['Apellido', 'Sintético'], ['Contraseña final', 'FixtureOnly9!'], ['Confirmar contraseña', 'FixtureOnly9!']]
          : [['Nombre', 'Legal'], ['Apellido', 'Sintético'], ['Correo (sera tu usuario/login)', 'legal@example.test'], ['Contraseña', 'FixtureOnly9!'], ['Confirmar contraseña', 'FixtureOnly9!']];
        for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
        const terms = page.getByRole('checkbox', { name: 'Acepto términos y condiciones para crear mi cuenta.', exact: true });
        const marketing = page.getByRole('checkbox', { name: /Acepto recibir comunicaciones/ });
        for (const [name, target] of [['términos y condiciones', 'terminos-y-condiciones'], ['Política de privacidad', 'politica-de-privacidad']]) {
          const link = page.getByRole('link', { name, exact: true });
          assert.equal(await link.getAttribute('target'), '_blank');
          const [reading] = await Promise.all([context.waitForEvent('page'), link.click()]);
          await reading.getByRole('heading', { level: 1, name: 'Términos y condiciones' }).waitFor();
          assert.equal(new URL(reading.url()).hash, `#${target}`);
          assert.equal(await reading.evaluate(() => window.opener === null), true);
          await aligned(reading, target);
          await reading.close();
          await page.bringToFront();
          assert.equal(await terms.isChecked(), false);
          assert.equal(await marketing.isChecked(), false);
          for (const [label, value] of fields) assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), value);
        }
        const before = writes.length;
        await page.getByRole('button', { name: confirmation ? 'Completar registro' : 'Crear cuenta', exact: true }).click();
        if (!confirmation) await page.getByRole('alert').filter({ hasText: 'Debes aceptar los términos' }).waitFor();
        else assert.equal(await terms.evaluate(node => node.validity.valueMissing), true);
        assert.equal(writes.length, before);
        await terms.check();
        await page.getByRole('button', { name: confirmation ? 'Completar registro' : 'Crear cuenta', exact: true }).click();
        await page.getByRole('status').filter({ hasText: confirmation ? 'Registro completado' : 'Registro pendiente' }).waitFor();
        assert.deepEqual(writes.at(-1), { endpoint: confirmation ? '/v1/auth/register/confirm' : '/v1/auth/register', terms: true, marketing: false });
        await noOverflow(page);
        await page.screenshot({ path: path.join(evidence, `${engine}-${width}-${theme}-${confirmation ? 'confirm' : 'register'}.png`) });
      }
      assert.equal(writes.length, 2);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
