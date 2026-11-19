import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4189';
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-masterpuntos-integral-evidence');
const USER = '11111111-1111-4111-8111-111111111111', CLIENT = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333', OTHER = '44444444-4444-4444-8444-444444444444';
const SERVICE = '55555555-5555-4555-8555-555555555555';

for (const width of [390, 1440]) for (const theme of ['dark', 'light']) for (const booking of [true, false]) {
  test(`MasterPuntos ${width} ${theme} comercio=${booking}: saldo, selector, errores y pausa`, { timeout: 60000 }, async () => {
    const browser = await chromium.launch({ channel: process.env.MASTERFADE_CHROMIUM_CHANNEL || 'chrome' });
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 });
      await context.addInitScript(value => { if (/^https?:$/.test(location.protocol)) localStorage.setItem('mf_theme_variant', value); }, theme);
      let balance = 0, rejectPrepare = true;
      const writes = [], errors = [];
      const member = theme === 'light';
      const serviceName = member ? 'Servicio VIP autorizado' : 'Corte autorizado';
      const summary = () => ({ id_cliente: CLIENT, saldo_total: balance, puntos_titular: balance, puntos_integrante: 0,
        puntos_para_premio: 10, progreso_actual: Math.min(balance, 10), recompensas_disponibles: Math.floor(balance / 10),
        puede_canjear: balance >= 10, estado_plan: member ? 'activa' : 'sin_membresia',
        servicios_redimibles: [{ id_servicio: SERVICE, nombre_servicio: serviceName, sucursales_disponibles: [BRANCH] }],
        historial: [{ id_points_tx: String(balance), motivo: `Lectura sintética ${balance}`, puntos: 1, created_at: '2026-11-12T12:00:00Z' }] });
      // AM: Solo APIs externas sinteticas; ninguna peticion alcanza QA, Supabase o una pasarela.
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
        const endpoint = url.pathname;
        if (!endpoint.startsWith('/v1/')) return route.continue();
        let data = {};
        if (endpoint === '/v1/auth/me') data = { user: { id_usuario: USER, nombres: 'Cliente', apellidos: 'Sintético', telefono_principal: '99999999' }, roles: ['cliente'], cliente_id: CLIENT };
        else if (endpoint === '/v1/auth/csrf') data = { csrf_token: 'synthetic-only' };
        else if (endpoint === '/v1/commerce/eligibility') data = { booking, vipPurchase: false };
        else if (endpoint === '/v1/cliente/me') data = { cliente: { id_cliente: CLIENT, id_usuario: USER, nombre_completo: 'Cliente Sintético', masterpuntos: balance, id_sucursal_preferida: BRANCH, nombres: 'Cliente', apellidos: 'Sintético', telefono_principal: '99999999', perfil_completo: true } };
        else if (endpoint === '/v1/cliente/puntos/resumen') data = summary();
        else if (endpoint === '/v1/public/catalog/sucursales') data = { sucursales: [{ id_sucursal: BRANCH, nombre_sucursal: 'Centro' }, { id_sucursal: OTHER, nombre_sucursal: 'Otra sucursal' }] };
        else if (endpoint === '/v1/citas') data = { citas: [] };
        else if (endpoint === '/v1/citas/pendiente') data = { pendiente: null };
        else if (endpoint === '/v1/public/catalog/servicios') data = { servicios: [] };
        else if (endpoint === '/v1/public/citas/contexto') data = { sucursales: [{ id_sucursal: BRANCH, nombre_sucursal: 'Centro' }], parametros: {} };
        else if (endpoint === '/v1/public/agenda/barberos') data = { barberos: [] };
        if (request.method() !== 'GET') {
          writes.push(endpoint);
          assert.ok(['/v1/auth/session/touch', '/v1/cliente/puntos/canjear'].includes(endpoint), `Operacion inesperada: ${endpoint}`);
          if (endpoint === '/v1/cliente/puntos/canjear') {
            assert.equal(booking, true);
            assert.deepEqual(request.postDataJSON(), { id_servicio: SERVICE, id_sucursal: BRANCH });
            if (rejectPrepare) return route.fulfill({ status: 409, json: { ok: false, error: { code: 'POINTS_REDEEM_INSUFFICIENT_BALANCE', message: 'Mensaje sintético' } } });
            data = { canje_preparado: true, canje_activo: true, saldo_actual: balance, puntos_requeridos: 10,
              id_servicio_canje: SERVICE, id_sucursal: BRANCH, servicio_nombre: serviceName,
              canje_context_token: 'mf_reward_ctx_v1.' + Buffer.from(JSON.stringify({ v: 1, id_cliente: CLIENT, id_sucursal: BRANCH, id_servicio_canje: SERVICE })).toString('base64url') + '.' + 'a'.repeat(43) };
          }
        }
        await route.fulfill({ json: { ok: true, data } });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sin desbordamiento horizontal');
      await page.goto(base + '/home/cliente');
      for (const amount of [0, 9, 10, 11, 20]) {
        balance = amount;
        await page.getByRole('button', { name: 'Actualizar', exact: true }).waitFor();
        // AM: El regreso de la pasarela refresca saldo/historial sin pulsar Actualizar.
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.getByText(`Lectura sintética ${amount}`, { exact: true }).waitFor();
        const card = page.getByText('Saldo total', { exact: true }).locator('..');
        await card.getByText(String(amount), { exact: true }).waitFor();
        await page.getByText('Recompensas disponibles', { exact: true }).locator('..').getByText(String(Math.floor(amount / 10)), { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Canjear mi recompensa', exact: true }).count(), amount >= 10 ? 1 : 0);
        await noOverflow();
      }
      await page.goto(base + '/home/cliente/perfil');
      await page.getByText('Masterpuntos: 20', { exact: true }).waitFor();
      balance = 21;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByText('Masterpuntos: 21', { exact: true }).waitFor();
      await noOverflow();
      await page.goBack();
      await page.getByText('Lectura sintética 21', { exact: true }).waitFor();
      balance = 20;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.getByText('Lectura sintética 20', { exact: true }).waitFor();
      await mkdir(evidence, { recursive: true });
      await page.getByRole('heading', { name: 'Ruta a tu cortesía' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidence, `${width}-${theme}-${booking}-summary.png`) });
      if (!booking) {
        await page.goto(base + '/home/cliente?accion=canjear');
        await page.getByRole('heading', { name: 'Ruta a tu cortesía' }).waitFor();
        const paused = page.getByRole('button', { name: 'Proximamente...', exact: true }).first();
        await paused.waitFor(); assert.equal(await paused.isDisabled(), true);
        assert.equal(await page.getByRole('dialog', { name: 'Canjear recompensa' }).count(), 0);
        assert.equal(await page.getByText('Canjea tu recompensa para continuar con tu cita', { exact: false }).count(), 0);
        assert.equal(writes.filter(endpoint => endpoint === '/v1/cliente/puntos/canjear').length, 0);
      } else {
        await page.getByRole('button', { name: 'Canjear mi recompensa', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Canjear recompensa' });
        const submit = dialog.getByRole('button', { name: 'Confirmar canje' });
        await dialog.getByRole('button', { name: serviceName, exact: true }).click();
        await dialog.getByRole('combobox').selectOption(OTHER);
        assert.equal(await submit.isDisabled(), true);
        await dialog.getByRole('combobox').selectOption(BRANCH);
        await dialog.getByRole('button', { name: serviceName, exact: true }).click();
        await submit.click();
        await dialog.getByText('No tienes puntos suficientes para canjear esta recompensa.', { exact: true }).waitFor();
        assert.equal(balance, 20); await noOverflow();
        await dialog.screenshot({ path: path.join(evidence, `${width}-${theme}-error.png`) });
        rejectPrepare = false;
        await submit.click(); await page.waitForURL(/\/agendar/);
        assert.equal(balance, 20);
        assert.equal(writes.filter(endpoint => endpoint === '/v1/cliente/puntos/canjear').length, 2);
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
