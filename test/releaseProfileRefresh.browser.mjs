import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// AM: App, autenticacion frontend y HTTP reales; APIs externas sinteticas, sin cuentas reales.
const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4207';
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-prod07-profile');
const owners = {
  A: { id: '11111111-1111-4111-8111-111111111111', name: 'Cliente Sintetico A' },
  B: { id: '22222222-2222-4222-8222-222222222222', name: 'Cliente Sintetico B' },
};

for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
  test(`B1 Perfil compilado ${width} ${theme}: login, regreso, edicion y A/B`, { timeout: 90000 }, async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600, timezoneId: 'Asia/Tokyo' });
      await context.addInitScript(value => {
        localStorage.setItem('mf_theme_variant', value);
        sessionStorage.setItem('mf-agendamiento-aviso-2026-11-17', 'dismissed');
      }, theme);
      const page = await context.newPage(), errors = [], forbidden = [];
      let owner = null, points = 1, phone = '99991111', reads = 0, patches = 0, pending = null, held = null;
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && !/401|Failed to load resource/.test(message.text())) errors.push(message.text());
      });
      const profile = () => ({
        cliente: { id_cliente: owners[owner].id, id_usuario: owners[owner].id, id_persona: owners[owner].id,
          nombre_completo: owners[owner].name, nombres: owners[owner].name, apellidos: '', correo_principal: 'fixture@example.invalid',
          telefono_principal: phone, masterpuntos: points, fecha_nacimiento: '1990-01-01', genero_codigo: 'N', direccion_texto: '', preferencias_corte: '' },
        profile_completion: { is_complete: true, completion_percent: 100 },
      });
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), endpoint = url.pathname, method = request.method();
        if (!endpoint.startsWith('/v1/')) return url.origin === base ? route.continue() : route.fulfill({ status: 204 });
        const allowedWrites = ['POST /v1/auth/login', 'POST /v1/auth/logout', 'POST /v1/auth/session/touch', 'PATCH /v1/cliente/me'];
        if (method !== 'GET' && !allowedWrites.includes(method + ' ' + endpoint)) forbidden.push(method + ' ' + endpoint);
        let data = {};
        if (endpoint === '/v1/auth/login') {
          owner = request.postDataJSON().identifier.startsWith('b@') ? 'B' : 'A';
          data = { logged_in: true };
        } else if (endpoint === '/v1/auth/logout') {
          owner = null; data = { logged_out: true };
        } else if (endpoint === '/v1/auth/csrf') data = { csrf_token: 'isolated-fixture-csrf' };
        else if (endpoint === '/v1/auth/me') {
          if (!owner) return route.fulfill({ status: 401, json: { ok: false, error: { code: 'AUTH_REQUIRED' } } });
          data = { user: { id_usuario: owners[owner].id, nombres: owners[owner].name }, roles: ['cliente'], cliente_id: owners[owner].id };
        } else if (endpoint === '/v1/cliente/me') {
          if (method === 'PATCH') {
            patches++; phone = request.postDataJSON().telefono_principal; data = profile();
          } else {
            reads++; data = profile();
            if (pending) {
              held = pending; pending = null;
              await held.promise;
              try { return await route.fulfill({ status: 401, json: { ok: false, error: { code: 'AUTH_REQUIRED' } } }); }
              catch { return; }
            }
          }
        } else if (endpoint === '/v1/commerce/eligibility') data = { booking: false, vipPurchase: false };
        else if (endpoint === '/v1/citas/pendiente') data = { pendiente: null };
        else if (endpoint === '/v1/citas') data = { citas: [], totals: { proximas: 0, historial: 0, total: 0 }, pagination: { page: 1, limit: 4, total: 0, total_pages: 1, has_next: false, has_prev: false } };
        await route.fulfill({ json: { ok: true, data } });
      });
      async function login(account) {
        await page.locator('#correo_login').fill(account + '@example.invalid');
        await page.locator('#contrasena').fill('Synthetic-only-password-123');
        await page.getByRole('button', { name: 'Entrar', exact: true }).click();
        await page.waitForURL('**/home/cliente/perfil');
        await page.getByRole('heading', { name: owners[account.toUpperCase()].name, exact: true }).waitFor();
        await page.waitForTimeout(300);
      }
      const burst = async () => page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await page.goto(base + '/login?next=' + encodeURIComponent('/home/cliente/perfil'));
      await login('a');
      const before = reads; points = 7;
      await burst(); await page.getByText('Masterpuntos: 7', { exact: true }).waitFor();
      await page.waitForTimeout(250);
      assert.equal(reads - before, 2, 'Una lectura Perfil y su refresco Shell existente, sin duplicados por evento');
      await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const field = dialog.getByLabel('Teléfono principal *', { exact: true });
      await field.fill('99992222'); points = 8;
      await burst(); await page.getByText('Masterpuntos: 8', { exact: true }).waitFor();
      assert.equal(await field.inputValue(), '99992222', 'El regreso no borra el formulario abierto');
      await dialog.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      await page.getByText('99992222', { exact: true }).waitFor();
      assert.equal(patches, 1, 'Solo guardado manual sintetico');
      await mkdir(evidence, { recursive: true });
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(evidence, `${width}-${theme}.png`), fullPage: true });
      let release;
      pending = { promise: new Promise(resolve => { release = resolve; }) };
      await burst();
      for (let i = 0; i < 30 && !held; i++) await page.waitForTimeout(25);
      assert.ok(held, 'Lectura A retenida para respuesta tardia');
      await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
      await page.waitForURL('**/login');
      await page.goto(base + '/login?next=' + encodeURIComponent('/home/cliente/perfil'));
      await login('b'); release();
      await page.waitForTimeout(350);
      assert.equal(new URL(page.url()).pathname, '/home/cliente/perfil');
      assert.equal(await page.getByRole('heading', { name: owners.B.name, exact: true }).isVisible(), true);
      assert.equal(await page.getByRole('heading', { name: owners.A.name, exact: true }).count(), 0);
      await page.getByRole('navigation').getByRole('button', { name: 'Citas', exact: true }).click();
      await page.waitForURL('**/home/cliente/citas');
      await page.waitForTimeout(300);
      const afterUnmount = reads;
      await burst(); await page.waitForTimeout(300);
      assert.equal(reads, afterUnmount, 'Perfil desmontado no conserva listeners');
      assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
