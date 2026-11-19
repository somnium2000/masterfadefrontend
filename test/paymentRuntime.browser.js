import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

// AM: Ejecutar con node --test contra vite preview; Playwright puede instalarse fuera del repositorio.
const { chromium, webkit, devices } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4173';
const GROUP = '11111111-1111-4111-8111-111111111111';
const INTENT = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333';
const BARBER = '44444444-4444-4444-8444-444444444444';
const SERVICE = '55555555-5555-4555-8555-555555555555';
const KEY = 'masterfade.publicBookingPayment.v1';
const EMAIL = 'synthetic@example.test';
const intent = { id_grupo_cita: GROUP, id_intent: INTENT, estado_intent_codigo: 'link_generado', monto_hnl: 300, moneda_codigo: 'HNL', provider: 'pixelpay' };
const branch = { id_sucursal: BRANCH, nombre_sucursal: 'Sucursal sintética' };
const profile = { id_usuario: '66666666-6666-4666-8666-666666666666', nombres: 'Cliente', apellidos: 'Sintético', email: EMAIL, telefono_principal: '99999999' };

async function setup(browser, { cliente = false, mobile = true, state = 'link_generado', resume = true } = {}) {
  const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  await page.clock.setFixedTime(new Date('2030-06-15T12:00:00Z'));
  const errors = [];
  const calls = [];
  let saleFinish;
  let currentState = state;
  page.on('pageerror', error => errors.push(error.stack));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) errors.push(message.text());
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    // AM: Ninguna petición de esta prueba llega a QA, Supabase o una pasarela.
    if (url.origin !== baseURL) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    const path = url.pathname;
    if (!path.startsWith('/v1/')) return route.continue();
    const method = route.request().method();
    calls.push({ method, path });
    if (path === '/v1/public/agenda/eventos') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
    let data = {};
    let status = 200;
    if (path === '/v1/auth/me') {
      if (!cliente) return route.fulfill({ status: 401, json: { ok: false, error: { code: 'UNAUTHORIZED' } } });
      data = { user: profile, roles: ['cliente'], cliente_id: '77777777-7777-4777-8777-777777777777' };
    } else if (path === '/v1/auth/csrf') data = { csrf_token: 'synthetic-csrf' };
    else if (path === '/v1/public/citas/contexto') data = { sucursales: [branch], parametros: { pago_total_obligatorio: true } };
    else if (path === '/v1/public/agenda/barberos') data = { barberos: [{ id_empleado: BARBER, nombre_completo: 'Barbero sintético' }] };
    else if (path === '/v1/public/catalog/servicios') data = { servicios: [{ id_servicio: SERVICE, nombre_servicio: 'Corte sintético', activo: true, agendable: true, precio_hnl: 300, duracion_min: 30 }] };
    else if (path === '/v1/public/catalog/sucursales') data = { sucursales: [branch] };
    else if (path === '/v1/public/catalog/paquetes') data = { paquetes: [] };
    else if (path.endsWith('/promociones')) data = { promociones: [] };
    else if (path === '/v1/public/agenda/disponibilidad') {
      const start = url.searchParams.get('fecha_desde');
      const end = url.searchParams.get('fecha_hasta');
      const days = [];
      for (let day = new Date(start + 'T12:00:00Z'); day <= new Date(end + 'T12:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) {
        days.push({ fecha: day.toISOString().slice(0, 10), disponible: true, barberos_disponibles: 1, primer_horario_disponible: '10:00', franjas: { manana: 1, tarde: 1, noche: 0 } });
      }
      data = { disponibilidad: days };
    } else if (path === '/v1/public/agenda/horarios') data = { horarios: [{ hora: '10:00', disponible: true }, { hora: '16:00', disponible: true }], duracion_total_min: 30, buffer_total_min: 0 };
    else if (path.endsWith('/validar-contactos') || path.endsWith('/validar-titular')) data = { valid: true };
    else if (path === '/v1/public/citas/hold' || path === '/v1/citas/hold') data = { id_grupo_cita: GROUP, total_pagar_hnl: 300, total_hnl: 300, subtotal_hnl: 300, hold_expires_at: '2099-01-01T00:00:00Z', release_token: 'synthetic-release' };
    else if (path.endsWith('/crear-intent')) data = intent;
    else if (path.endsWith('/pixelpay/sale')) {
      data = await new Promise(resolve => { saleFinish = resolve; });
      currentState = data.estado_intent_codigo;
    } else if (path.endsWith('/estado') && path.includes('/pagos/')) data = { ...intent, estado_intent_codigo: currentState, pending_confirmation: currentState === 'pendiente_confirmacion', booking_confirmed: currentState === 'pagado' };
    else if (path === '/v1/cliente/me') data = { ...profile, perfil_completo: true };
    else if (path.includes('/planes/estado')) data = { planes_activos: [] };
    else if (method !== 'GET' && !path.startsWith('/v1/auth/')) {
      errors.push('Operación inesperada: ' + method + ' ' + path);
      status = 400;
    }
    return route.fulfill({ status, json: { ok: status === 200, data } });
  });
  if (resume) await context.addInitScript(({ key, group, paymentIntent, email }) => {
    sessionStorage.setItem(key, JSON.stringify({ id_grupo_cita: group, id_intent: paymentIntent.id_intent, titular_email: email, paymentIntent }));
  }, { key: KEY, group: GROUP, paymentIntent: intent, email: EMAIL });
  return {
    page, context, calls, errors, state,
    finishSale: () => { assert.ok(saleFinish, 'Debe existir una sola Sale pendiente'); saleFinish({ ...intent, estado_intent_codigo: 'pendiente_confirmacion', pending_confirmation: true, booking_confirmed: false }); },
  };
}

async function healthy(session) {
  await session.page.waitForTimeout(150);
  assert.equal(await session.page.getByText('Ocurrió un error en esta vista', { exact: true }).count(), 0, 'RouteErrorBoundary no debe aparecer');
  assert.deepEqual(session.errors, [], 'No debe haber excepciones, rechazos ni errores de consola');
  assert.equal(session.calls.filter(call => call.method === 'DELETE').length, 0, 'No liberar un hold vinculado a un intento');
}

async function openPayment(session) {
  await session.page.goto(baseURL + '/agendar/pagar?id_grupo_cita=' + GROUP + '&id_intent=' + INTENT);
  if (session.state === 'pagado') await session.page.waitForURL(/\/agendar\/exito/);
  else if (session.state === 'fallido') await session.page.waitForURL(/\/agendar\/agenda/);
  else {
    await session.page.getByRole('button', { name: 'Salir del pago', exact: true }).waitFor();
    await session.page.getByText('Verificando pago', { exact: true }).waitFor({ state: 'hidden' });
  }
  await healthy(session);
}

async function fullJourney(session) {
  const { page } = session;
  await page.goto(baseURL + '/agendar');
  await page.getByRole('button', { name: 'Seleccionar a Barbero sintético' }).click();
  await page.getByRole('button', { name: /Corte sintético/ }).waitFor();
  for (const [id, value] of [['first-name', 'Cliente'], ['last-name', 'Sintético'], ['email', EMAIL], ['phone', '99999999']]) {
    const field = page.locator('#booking-contact-' + id);
    if (await field.count() && await field.isEditable()) await field.fill(value);
  }
  await page.getByRole('button', { name: /Corte sintético/ }).click();
  await page.locator('.citas-day-btn.is-available:not(:disabled)').last().click();
  await page.locator('.public-booking-time-block:not(:disabled)').first().click();
  await page.getByRole('button', { name: 'Continuar a resumen' }).click();
  await page.getByRole('heading', { name: 'Resumen de cita', exact: true }).waitFor();
  await healthy(session);
  await page.getByRole('button', { name: 'Continuar al pago', exact: true }).click();
  await page.getByLabel('Numero de tarjeta', { exact: true }).waitFor();
  await healthy(session);
}

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  test(engineName + ': App real, hooks reales y build compilado', { timeout: 240000 }, async t => {
    const browser = await engine.launch();
    try {
      for (const mobile of [true, false]) for (const cliente of [false, true]) {
        if (process.env.MASTERFADE_BROWSER_SMOKE && (!mobile || cliente)) continue;
        const label = (mobile ? 'iPhone 390x844' : 'desktop 1440x900') + (cliente ? ' Cliente' : ' visitante');
        await t.test(label + ': Agendar → Resumen → Tarjeta y botones', async () => {
          const session = await setup(browser, { mobile, cliente, resume: false });
          try {
            await fullJourney(session);
            const { page } = session;
            if (process.env.MASTERFADE_BROWSER_ARTIFACTS) {
              await mkdir(process.env.MASTERFADE_BROWSER_ARTIFACTS, { recursive: true });
              await page.screenshot({ path: path.join(process.env.MASTERFADE_BROWSER_ARTIFACTS, engineName + '-' + (mobile ? 'iphone' : 'desktop') + (cliente ? '-cliente' : '-visitante') + '.png'), fullPage: true, mask: [page.locator('#pay-receipt-email')] });
            }
            await page.getByLabel('Nombre del titular', { exact: true }).fill('Cliente Sintético');
            await page.getByLabel('Numero de tarjeta', { exact: true }).fill('4111111111111111');
            await page.getByLabel('CVV', { exact: true }).fill('123');
            await page.getByRole('button', { name: 'Inicio MasterFade', exact: true }).click();
            await page.getByRole('dialog').waitFor();
            await healthy(session);
            await page.getByRole('button', { name: 'Continuar pagando', exact: true }).click();
            assert.equal(await page.getByLabel('Nombre del titular', { exact: true }).inputValue(), 'Cliente Sintético');
            assert.ok((await page.getByLabel('Numero de tarjeta', { exact: true }).inputValue()).replaceAll(' ', '') === '4111111111111111');
            assert.ok(await page.getByLabel('CVV', { exact: true }).inputValue() === '123');
            await page.getByRole('button', { name: 'Volver al resumen', exact: true }).click();
            await page.getByRole('heading', { name: 'Resumen de cita', exact: true }).waitFor();
            await healthy(session);
            await page.getByRole('button', { name: 'Continuar al pago', exact: true }).click();
            await page.getByLabel('Nombre del titular', { exact: true }).waitFor();
            assert.equal(await page.getByLabel('Nombre del titular', { exact: true }).inputValue(), '');
            assert.ok(await page.getByLabel('Numero de tarjeta', { exact: true }).inputValue() === '');
            assert.ok(await page.getByLabel('CVV', { exact: true }).inputValue() === '');
            await page.getByRole('button', { name: 'Salir del pago', exact: true }).click();
            await page.getByRole('button', { name: 'Continuar pagando', exact: true }).click();
            await page.getByRole('button', { name: 'Salir del pago', exact: true }).click();
            await page.getByRole('dialog').getByRole('button', { name: 'Salir', exact: true }).click();
            await page.waitForURL(baseURL + (cliente ? '/home/cliente' : '/'));
            await healthy(session);
            assert.equal(session.calls.filter(call => call.path.endsWith('/crear-intent')).length, 1);
            assert.equal(session.calls.filter(call => call.path.endsWith('/pixelpay/sale')).length, 0);
            assert.ok(await page.evaluate(key => sessionStorage.getItem(key), KEY));
          } finally { await session.context.close(); }
        });
        await t.test(label + ': Atrás/Adelante con cobro en curso conserva seguimiento y una sola Sale', async () => {
          const session = await setup(browser, { mobile, cliente, resume: false });
          try {
            await fullJourney(session);
            const { page } = session;
            const fillCard = async () => {
              for (const [name, value] of [['Nombre del titular', 'Cliente Sintético'], ['Numero de tarjeta', '4111111111111111'], ['Expiracion', '12/39'], ['CVV', '123'], ['Telefono de contacto', '99999999'], ['Direccion de facturacion', 'Calle sintética uno'], ['Ciudad', 'Tegucigalpa']]) {
                await page.getByLabel(name, { exact: true }).fill(value);
              }
            };
            await fillCard();
            const saleRequest = page.waitForRequest(request => request.url().endsWith('/pixelpay/sale'));
            await page.getByRole('button', { name: 'Pagar con PixelPay Sandbox', exact: true }).click();
            await saleRequest;
            await page.getByRole('button', { name: 'Inicio MasterFade', exact: true }).click();
            assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Salir', exact: true }).isEnabled(), false);
            await page.getByRole('button', { name: 'Continuar pagando', exact: true }).click();
            await page.goBack();
            await page.getByRole('heading', { name: 'Resumen de cita', exact: true }).waitFor();
            await healthy(session);
            await page.goForward();
            await page.getByLabel('Nombre del titular', { exact: true }).waitFor();
            await fillCard();
            await page.getByRole('button', { name: 'Pagar con PixelPay Sandbox', exact: true }).click();
            session.finishSale();
            await page.getByText('Tu pago requiere verificación. No vuelvas a realizar el pago.', { exact: true }).waitFor();
            await healthy(session);
            assert.equal(session.calls.filter(call => call.path.endsWith('/pixelpay/sale')).length, 1);
            assert.equal(session.calls.filter(call => call.path.endsWith('/crear-intent')).length, 1);
            const stored = await page.evaluate(key => sessionStorage.getItem(key), KEY);
            assert.ok(stored.includes(INTENT));
            assert.ok(!stored.includes('4111111111111111') && !stored.includes('"cvv"'));
          } finally { await session.context.close(); }
        });
        for (const state of ['link_generado', 'pendiente_confirmacion', 'fallido', 'pagado']) {
          if (process.env.MASTERFADE_BROWSER_SMOKE) continue;
          await t.test(label + ': recuperación ' + state, async () => {
            const session = await setup(browser, { mobile, cliente, state });
            try {
              await openPayment(session);
              const { page } = session;
              if (state === 'fallido') {
                await healthy(session);
                assert.equal(session.calls.filter(call => call.path.endsWith('/crear-intent') || call.path.endsWith('/pixelpay/sale')).length, 0);
                return;
              }
              if (state !== 'pagado') {
                await page.getByRole('button', { name: 'Inicio MasterFade', exact: true }).click();
                await healthy(session);
                await page.getByRole('button', { name: 'Continuar pagando', exact: true }).click();
                await page.getByRole('button', { name: 'Volver al resumen', exact: true }).click();
                await page.getByRole('dialog').waitFor();
                assert.equal(await page.getByRole('heading', { name: 'Resumen de cita', exact: true }).count(), 0);
                await page.getByRole('button', { name: 'Continuar pagando', exact: true }).click();
                await healthy(session);
                await page.getByRole('button', { name: 'Salir del pago', exact: true }).click();
                await page.getByRole('dialog').getByRole('button', { name: 'Salir', exact: true }).click();
              } else {
                await page.waitForURL(/\/agendar\/exito/);
                await page.getByRole('button', { name: 'Inicio MasterFade', exact: true }).click();
                assert.equal(await page.getByRole('dialog').count(), 0);
              }
              await page.waitForURL(baseURL + (cliente ? '/home/cliente' : '/'));
              await healthy(session);
              assert.equal(session.calls.filter(call => call.path.endsWith('/crear-intent') || call.path.endsWith('/pixelpay/sale')).length, 0);
              assert.ok(await page.evaluate(key => sessionStorage.getItem(key), KEY));
            } finally { await session.context.close(); }
          });
        }
      }
    } finally { await browser.close(); }
  });
}
