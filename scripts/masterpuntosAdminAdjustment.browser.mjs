import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4197';
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-masterpuntos-admin-adjustment-evidence');
const USER = '11111111-1111-4111-8111-111111111111', CLIENT = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333', OTHER = '44444444-4444-4444-8444-444444444444';

for (const width of [390, 1440]) for (const role of ['admin', 'super_admin']) {
  test(`Ajuste administrativo ${role} ${width}: sumar/restar, confirmar, historial y saldo`, { timeout: 60000 }, async () => {
    const browser = await chromium.launch({ channel: process.env.MASTERFADE_CHROMIUM_CHANNEL || 'chrome' });
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 });
      await context.addInitScript(theme => localStorage.setItem('mf_theme_variant', theme), role === 'admin' ? 'dark' : 'light');
      let balance = 5;
      const movements = [], writes = [], errors = [];
      // AM: Todas las APIs se interceptan con datos sinteticos; no hay conexiones a QA ni produccion.
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
        const endpoint = url.pathname;
        if (!endpoint.startsWith('/v1/')) return route.continue();
        let data = {};
        if (endpoint === '/v1/auth/me') data = { user: { id_usuario: USER, nombres: 'Admin', apellidos: 'Sintetico' }, roles: [role], branch_ids: [BRANCH] };
        else if (endpoint === '/v1/auth/csrf') data = { csrf_token: 'synthetic-only' };
        else if (endpoint === '/v1/commerce/eligibility') data = { booking: true, vipPurchase: true };
        else if (endpoint === '/v1/admin/puntos/regalias') data = { regla: { puntos_para_premio: 10 }, servicios_catalogo: [], configuracion: { sin_membresia: [], con_membresia: [] } };
        else if (endpoint === '/v1/admin/puntos/clientes/buscar') data = { clientes: [
          { id_cliente: CLIENT, nombre_cliente: 'Cliente Sintetico', id_sucursal_origen: BRANCH },
          { id_cliente: OTHER, nombre_cliente: 'Cliente Otra Sucursal', id_sucursal_origen: OTHER },
        ] };
        else if (endpoint.endsWith('/resumen')) data = { id_cliente: CLIENT, nombre_cliente: endpoint.includes(OTHER) ? 'Cliente Otra Sucursal' : 'Cliente Sintetico', saldo_total: balance,
          puntos_para_premio: 10, historial: movements, id_sucursal_origen: endpoint.includes(OTHER) ? OTHER : BRANCH };
        if (request.method() !== 'GET') {
          assert.ok(endpoint.endsWith('/ajuste') || endpoint === '/v1/auth/session/touch', `Escritura inesperada: ${endpoint}`);
          if (endpoint.endsWith('/ajuste')) {
            const payload = request.postDataJSON();
            assert.match(request.headers()['x-idempotency-key'], /^[0-9a-f-]{36}$/i);
            writes.push(payload);
            const amount = payload.accion === 'restar' ? -payload.puntos : payload.puntos;
            balance += amount;
            movements.unshift({ id_points_tx: String(writes.length), puntos: amount, motivo: payload.motivo, tipo_puntos_codigo: amount < 0 ? 'ajuste_resta' : 'ajustar' });
            data = { saldo_actual: balance };
          }
        }
        await route.fulfill({ json: { ok: true, data } });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/home/${role === 'admin' ? 'admin' : 'super'}/superpuntos`);
      const selectClient = async name => {
        await page.getByRole('button', { name: /Seleccionar cliente activo|^Cliente Sintetico$/ }).click();
        await page.getByRole('textbox', { name: 'Buscar cliente activo' }).fill('Cliente');
        await page.getByRole('button', { name, exact: true }).click();
        await page.getByText('Saldo total', { exact: true }).waitFor();
      };
      await selectClient('Cliente Sintetico');
      const form = page.locator('form').filter({ has: page.getByLabel('Operacion', { exact: true }) });
      await page.getByLabel('Cantidad de puntos').fill('2');
      await page.getByLabel('Motivo (min. 5)', { exact: true }).fill('Suma sintetica');
      await page.getByText('SUMAR 2 puntos. Saldo actual: 5. Saldo previsto: 7.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Aplicar ajuste', exact: true }).click();
      await page.getByText('Suma sintetica', { exact: true }).waitFor();
      await page.getByLabel('Operacion', { exact: true }).selectOption('restar');
      await page.getByLabel('Cantidad de puntos').fill('8');
      await page.getByLabel('Motivo (min. 5)', { exact: true }).fill('Resta sintetica');
      assert.equal(await page.getByRole('button', { name: 'Aplicar ajuste', exact: true }).isDisabled(), true);
      await page.getByLabel('Cantidad de puntos').fill('3');
      await page.getByRole('button', { name: 'Aplicar ajuste', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('RESTAR 3 puntos a Cliente Sintetico. Saldo actual: 7. Saldo previsto: 4. Motivo: Resta sintetica', { exact: true }).waitFor();
      assert.equal(writes.length, 1);
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, `${role}-${width}-confirm.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.equal(writes.length, 1);
      await page.getByRole('button', { name: 'Aplicar ajuste', exact: true }).click();
      await page.getByRole('button', { name: 'Si, aplicar ajuste', exact: true }).click();
      await page.getByText('Resta sintetica', { exact: true }).waitFor();
      assert.equal(balance, 4); assert.equal(writes.length, 2);
      assert.deepEqual(writes.map(row => row.accion), ['sumar', 'restar']);
      assert.equal(await form.locator('input[type=number]').inputValue(), '');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await form.screenshot({ path: path.join(evidence, `${role}-${width}-form.png`) });
      if (role === 'admin') {
        await selectClient('Cliente Otra Sucursal');
        assert.equal(await page.getByRole('option', { name: 'RESTAR', exact: true }).isDisabled(), true);
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
