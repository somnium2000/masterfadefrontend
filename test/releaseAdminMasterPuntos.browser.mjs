import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// AM: App compilada + HTTP Fastify/servicio/SQL reales; solo bootstrap/identidad externa/catalogos son sinteticos.
const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const backendRoot = process.env.MASTERFADE_BACKEND_ROOT;
if (!backendRoot) throw new Error('MASTERFADE_BACKEND_ROOT debe apuntar al candidato backend aislado');
const { createAdminPointsReleaseFixture } = await import(pathToFileURL(path.join(backendRoot, 'test/helpers/adminPointsReleaseFixture.mjs')));
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4209';
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-prod09-masterpuntos');

test('Release09 conjunto: Chromium compilado y ajustes reales en PostgreSQL17 temporal', { timeout: 240000 }, async t => {
  const f = await createAdminPointsReleaseFixture();
  const browser = await chromium.launch({ channel: 'chrome' });
  t.after(async () => { await browser.close(); await f.close(); });
  const backend = await f.app.listen({ host: '127.0.0.1', port: 0 });
  await mkdir(evidence, { recursive: true });
  for (const width of [390, 1440]) for (const theme of ['dark', 'light']) for (const scope of ['admin-own', 'super-null', 'admin-other', 'admin-null']) {
    await t.test(`${scope} ${width} ${theme}`, async () => {
      const superAdmin = scope === 'super-null', blocked = scope.startsWith('admin-') && scope !== 'admin-own';
      const client = await f.makeClient(scope.endsWith('null') ? null : scope === 'admin-other' ? f.otherBranch : f.branch);
      await f.seed(client, 5);
      await f.pool.query('UPDATE personas SET apellidos=$2 WHERE id_persona=$1', [client.person, scope]);
      const actor = f.token(superAdmin ? ['super_admin'] : ['admin']);
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600 });
      try {
        await context.addCookies([{ name: 'mf_session', value: actor.token, url: base, httpOnly: true }, { name: 'mf_csrf', value: 'synthetic-release-csrf', url: base }]);
        await context.addInitScript(value => { localStorage.setItem('mf_theme_variant', value); sessionStorage.setItem('mf-agendamiento-aviso-2026-11-17', 'dismissed'); }, theme);
        const page = await context.newPage(), errors = [], forbidden = [], posted = [];
        page.setDefaultTimeout(12000);
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url()), endpoint = url.pathname;
          if (!endpoint.startsWith('/v1/')) return url.origin === base ? route.continue() : route.fulfill({ status: 204 });
          if (/^\/v1\/admin\/puntos\/clientes\/[^/]+\/(resumen|ajuste)$/.test(endpoint)) {
            const headers = await req.allHeaders();
            const response = await fetch(backend + endpoint + url.search, { method: req.method(), headers: { cookie: headers.cookie || '', 'content-type': 'application/json', 'x-csrf-token': headers['x-csrf-token'] || '', 'x-idempotency-key': headers['x-idempotency-key'] || '' }, ...(req.method() === 'GET' ? {} : { body: req.postData() }) });
            if (req.method() === 'POST') posted.push({ payload: req.postDataJSON(), key: headers['x-idempotency-key'] });
            return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
          }
          if (req.method() !== 'GET' && endpoint !== '/v1/auth/session/touch') forbidden.push(endpoint);
          let data = {};
          if (endpoint === '/v1/auth/me') data = { user: { id_usuario: actor.user, nombres: 'Admin sintetico' }, roles: [superAdmin ? 'super_admin' : 'admin'], branch_ids: [f.branch] };
          if (endpoint === '/v1/auth/csrf') data = { csrf_token: 'synthetic-release-csrf' };
          if (endpoint === '/v1/commerce/eligibility') data = { booking: false, vipPurchase: false, publicBooking: false, publicVipPurchase: false };
          if (endpoint.endsWith('/clientes/buscar')) data = { clientes: [{ id_cliente: client.id, nombre_cliente: 'Cliente ' + scope, id_sucursal_origen: client.branch }] };
          if (endpoint.endsWith('/puntos/regalias')) data = { regla: { puntos_para_premio: 10 }, servicios_catalogo: [], configuracion: { sin_membresia: [], con_membresia: [] } };
          await route.fulfill({ json: { ok: true, data } });
        });
        await page.goto(base + (superAdmin ? '/home/super/superpuntos' : '/home/admin/superpuntos'));
        await page.getByRole('button', { name: 'Seleccionar cliente activo', exact: true }).click();
        await page.getByRole('textbox', { name: 'Buscar cliente activo' }).fill('Cliente');
        await page.getByRole('button', { name: 'Cliente ' + scope, exact: true }).click();
        const balanceCard = page.getByText('Saldo total', { exact: true }).locator('xpath=ancestor::article');
        await balanceCard.getByText('5', { exact: true }).waitFor();
        const action = page.getByLabel('Operacion', { exact: true });
        const amount = page.getByLabel('Cantidad de puntos', { exact: true });
        const reason = page.getByLabel('Motivo (min. 5)', { exact: true });
        const apply = page.getByRole('button', { name: 'Aplicar ajuste', exact: true });
        await amount.fill('2147483648'); await reason.fill('Motivo sintetico'); assert.ok(await apply.isDisabled());
        await amount.fill('2'); await reason.fill('abcd'); assert.ok(await apply.isDisabled());
        await reason.fill('Correccion conjunta sintetica');
        if (blocked) {
          assert.ok(await action.locator('option[value="restar"]').isDisabled());
          const before = await f.ledger(client);
          const rejected = await f.adjust(client, actor, { accion: 'restar', puntos: 1, motivo: 'Intento fuera de alcance' });
          assert.equal(rejected.statusCode, 403); assert.deepEqual(await f.ledger(client), before);
        }
        await page.getByRole('status').filter({ hasText: 'SUMAR 2 puntos a Cliente ' + scope }).waitFor();
        await apply.dblclick(); await balanceCard.getByText('7', { exact: true }).waitFor();
        assert.equal(posted.length, 1);
        const replay = await f.adjust(client, actor, posted[0].payload, posted[0].key);
        assert.equal(replay.statusCode, 200); assert.equal(replay.json().data.idempotent_replay, true); assert.equal((await f.ledger(client)).length, 2);
        if (!blocked) {
          await action.selectOption('restar'); await amount.fill('8'); await reason.fill('Resta conjunta sintetica');
          assert.ok(await apply.isDisabled()); await page.getByRole('alert').getByText(/No hay puntos suficientes/).waitFor();
          await amount.fill('3'); await apply.click();
          const dialog = page.getByRole('dialog', { name: 'Confirmar ajuste negativo' });
          await dialog.waitFor(); assert.match(await dialog.innerText(), /Saldo actual: 7\. Saldo previsto: 4/);
          assert.match(await dialog.innerText(), new RegExp('Cliente ' + scope));
          await page.screenshot({ path: path.join(evidence, `${scope}-${width}-${theme}-confirm.png`), fullPage: true });
          await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.equal(posted.length, 1);
          await apply.click(); await page.getByRole('button', { name: 'Si, aplicar ajuste', exact: true }).click();
          await balanceCard.getByText('4', { exact: true }).waitFor(); assert.equal(posted.length, 2); assert.equal(await f.balance(client), 4);
          assert.equal((await f.ledger(client)).length, 3);
        } else assert.equal(await f.balance(client), 7);
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(evidence, `${scope}-${width}-${theme}.png`), fullPage: true });
        assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
      } finally { await context.close(); }
    });
  }
});
