import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

// AM: Prueba local con fixtures; ninguna solicitud llega a QA, Supabase o una pasarela.
const { chromium, devices } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.MASTERFADE_BROWSER_URL || 'http://qa.masterfadeapp.com:4173';
const artifacts = process.env.MASTERFADE_BROWSER_ARTIFACTS || '';
const GROUP = '11111111-1111-4111-8111-111111111111';
const INTENT = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333';
const BARBER = '44444444-4444-4444-8444-444444444444';
const SERVICE = '55555555-5555-4555-8555-555555555555';
const EMAIL = 'synthetic@example.test';
const BOOKING_PAYMENT_CONTEXT_KEY = 'masterfade.publicBookingPayment.v1';
const PENDING_PAYMENT_CONTEXT_KEY = 'mf_pending_payment_context_v1';

async function createSession(browser, mobile) {
  const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.clock.setFixedTime(new Date('2030-06-15T12:00:00Z'));
  const calls = [];
  const errors = [];
  let simulationBody = null;
  let releaseSimulation = null;
  let eligibilityGate = null;
  let paid = false;

  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) errors.push(message.text());
  });

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) return route.fulfill({ status: 204, body: '' });
    const requestPath = url.pathname;
    if (!requestPath.startsWith('/v1/')) return route.continue();
    const method = route.request().method();
    calls.push({ method, path: requestPath });
    if (requestPath === '/v1/public/agenda/eventos') {
      return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
    }

    let data = {};
    let status = 200;
    if (requestPath === '/v1/auth/me') {
      data = { user: { id_usuario: '66666666-6666-4666-8666-666666666666', nombres: 'Cliente', apellidos: 'QA', email: EMAIL, telefono_principal: '99999999' }, roles: ['cliente'], cliente_id: '77777777-7777-4777-8777-777777777777' };
    } else if (requestPath === '/v1/auth/csrf') {
      data = { csrf_token: 'synthetic-csrf' };
    } else if (requestPath === '/v1/commerce/eligibility') {
      if (eligibilityGate) await eligibilityGate.promise;
      data = { booking: true, vipPurchase: false };
    } else if (requestPath === '/v1/cliente/me') {
      const cliente = { id_cliente: '77777777-7777-4777-8777-777777777777', id_usuario: '66666666-6666-4666-8666-666666666666', nombres: 'Cliente', apellidos: 'QA', nombre_completo: 'Cliente QA', email: EMAIL, telefono_principal: '99999999', perfil_completo: true };
      data = { ...cliente, cliente, profile_completion: { is_complete: true, completion_percent: 100 } };
    } else if (requestPath === '/v1/cliente/puntos/resumen') {
      data = { saldo_total: 0, puntos_para_premio: 10, progreso_actual: 0, recompensas_disponibles: 0, puede_canjear: false, historial: [] };
    } else if (requestPath === '/v1/citas') {
      const confirmedAppointment = { id_cita: '88888888-8888-4888-8888-888888888888', id_grupo_cita: GROUP, estado_cita_codigo: 'confirmada', nombre_sucursal: 'MasterFade Suyapa', nombre_barbero: 'Daniel Martínez', inicio_at: '2030-06-16T16:00:00Z', total_pagar_hnl: 300, servicios: [{ nombre_servicio: 'Corte de cabello' }] };
      const citas = paid ? [confirmedAppointment] : [];
      data = url.searchParams.has('apartado')
        ? { citas, totals: { proximas: citas.length, historial: 0, total: citas.length, pendientes_pago: 1 }, pagination: { apartado: url.searchParams.get('apartado'), page: 1, limit: 4, total: citas.length, total_pages: 1, has_next: false, has_prev: false } }
        : { citas };
    } else if (requestPath === '/v1/citas/pendiente') {
      data = { pendiente: null };
    } else if (requestPath.includes('/planes/estado')) {
      data = { planes_activos: [] };
    } else if (requestPath === '/v1/public/citas/contexto') {
      data = { sucursales: [{ id_sucursal: BRANCH, nombre_sucursal: 'MasterFade Suyapa' }], parametros: { pago_total_obligatorio: true } };
    } else if (requestPath === '/v1/public/agenda/barberos') {
      data = { barberos: [{ id_empleado: BARBER, nombre_completo: 'Daniel Martínez' }] };
    } else if (requestPath === '/v1/public/catalog/servicios') {
      data = { servicios: [{ id_servicio: SERVICE, nombre_servicio: 'Corte de cabello', activo: true, agendable: true, precio_hnl: 300, duracion_min: 30 }] };
    } else if (requestPath === '/v1/public/catalog/sucursales') {
      data = { sucursales: [{ id_sucursal: BRANCH, nombre_sucursal: 'MasterFade Suyapa' }] };
    } else if (requestPath === '/v1/public/catalog/paquetes') {
      data = { paquetes: [] };
    } else if (requestPath.endsWith('/promociones')) {
      data = { promociones: [] };
    } else if (requestPath === '/v1/public/agenda/disponibilidad') {
      const start = url.searchParams.get('fecha_desde');
      const end = url.searchParams.get('fecha_hasta');
      const disponibilidad = [];
      for (let day = new Date(`${start}T12:00:00Z`); day <= new Date(`${end}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
        disponibilidad.push({ fecha: day.toISOString().slice(0, 10), disponible: true, barberos_disponibles: 1, primer_horario_disponible: '10:00', franjas: { manana: 1, tarde: 1, noche: 0 } });
      }
      data = { disponibilidad };
    } else if (requestPath === '/v1/public/agenda/horarios') {
      data = { horarios: [{ hora: '10:00', disponible: true }], duracion_total_min: 30, buffer_total_min: 0 };
    } else if (requestPath.endsWith('/validar-contactos') || requestPath.endsWith('/validar-titular')) {
      data = { valid: true };
    } else if (requestPath === '/v1/public/citas/hold' || requestPath === '/v1/citas/hold') {
      data = { id_grupo_cita: GROUP, total_pagar_hnl: 300, total_hnl: 300, subtotal_hnl: 300, hold_expires_at: '2099-01-01T00:00:00Z', release_token: 'synthetic-release' };
    } else if (requestPath.endsWith('/crear-intent')) {
      data = { id_grupo_cita: GROUP, id_intent: INTENT, estado_intent_codigo: 'link_generado', monto_hnl: 300, moneda_codigo: 'HNL', provider: 'todopago' };
    } else if (requestPath.endsWith('/simulator/event')) {
      simulationBody = route.request().postDataJSON();
      await new Promise(resolve => { releaseSimulation = resolve; });
      paid = true;
      data = { id_grupo_cita: GROUP, id_intent: INTENT, estado_intent_codigo: 'pagado', monto_hnl: 300, booking_confirmed: true };
    } else if (requestPath.endsWith('/estado') && requestPath.includes('/pagos/')) {
      data = { id_grupo_cita: GROUP, id_intent: INTENT, estado_intent_codigo: paid ? 'pagado' : 'link_generado', monto_hnl: 300, moneda_codigo: 'HNL', booking_confirmed: paid, codigo_cita: paid ? 'QA001' : undefined };
    } else if (method !== 'GET') {
      errors.push(`Operación inesperada: ${method} ${requestPath}`);
      status = 400;
    }
    return route.fulfill({ status, json: { ok: status === 200, data } });
  });

  return {
    page,
    context,
    calls,
    errors,
    blockNextEligibilityRefresh() {
      assert.equal(eligibilityGate, null, 'No debe existir otra elegibilidad bloqueada');
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      eligibilityGate = { promise, release };
    },
    finishEligibilityRefresh() {
      assert.ok(eligibilityGate, 'Debe existir una elegibilidad pendiente');
      const gate = eligibilityGate;
      eligibilityGate = null;
      gate.release();
    },
    finishSimulation() {
      assert.ok(releaseSimulation, 'Debe existir una simulación pendiente');
      releaseSimulation();
    },
    getSimulationBody: () => simulationBody,
  };
}

async function reachCheckout(page) {
  await page.goto(`${baseURL}/agendar`);
  try {
    await page.getByRole('button', { name: 'Seleccionar a Daniel Martínez' }).click();
  } catch (error) {
    throw new Error(`No se pudo abrir el barbero fixture. Vista: ${await page.locator('body').innerText()}`, { cause: error });
  }
  await page.getByRole('button', { name: /Corte de cabello/ }).waitFor();
  for (const [id, value] of [['first-name', 'Cliente'], ['last-name', 'QA'], ['email', EMAIL], ['phone', '99999999']]) {
    const field = page.locator(`#booking-contact-${id}`);
    if (await field.count() && await field.isEditable()) await field.fill(value);
  }
  await page.getByRole('button', { name: /Corte de cabello/ }).click();
  await page.locator('.citas-day-btn.is-available:not(:disabled)').last().click();
  await page.locator('.public-booking-time-block:not(:disabled)').first().click();
  await page.getByRole('button', { name: 'Continuar a resumen' }).click();
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await page.getByLabel('Tarjeta de prueba', { exact: true }).waitFor();
}

test('checkout QA comercial: responsive, una simulación y cero solicitudes PixelPay', { timeout: 180_000 }, async t => {
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP qa.masterfadeapp.com 127.0.0.1'] });
  try {
    for (const mobile of [true, false]) {
      await t.test(mobile ? 'iPhone 390x844' : 'desktop 1440x900', async () => {
        const session = await createSession(browser, mobile);
        try {
          const { page } = session;
          await reachCheckout(page);
          assert.equal(await page.getByText('Demostración QA · sin cobros reales', { exact: true }).count(), 1);
          assert.equal(await page.getByText(/No ingreses una tarjeta real/).count(), 1);
          assert.equal(await page.getByText('L 300.00', { exact: true }).count() > 0, true);
          assert.equal(await page.getByText(/TodoPago|Escenario simulator|Proveedor:|Intent:/i).count(), 0);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
          const payButtonBox = await page.getByRole('button', { name: 'Pagar', exact: true }).boundingBox();
          const backButtonBox = await page.getByRole('button', { name: 'Volver al resumen', exact: true }).boundingBox();
          assert.ok(payButtonBox && payButtonBox.height <= 64, `Altura inesperada del botón Pagar: ${payButtonBox?.height}`);
          assert.ok(backButtonBox && backButtonBox.height <= 64, `Altura inesperada del botón Volver: ${backButtonBox?.height}`);
          session.blockNextEligibilityRefresh();
          const eligibilityRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/v1/commerce/eligibility');
          const eligibilityResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/commerce/eligibility');
          await page.evaluate(() => {
            window.dispatchEvent(new Event('blur'));
            window.dispatchEvent(new Event('focus'));
          });
          await eligibilityRequest;
          await page.waitForTimeout(100);
          assert.match(page.url(), /\/agendar\/pagar/);
          assert.equal(await page.getByLabel('Tarjeta de prueba', { exact: true }).count(), 1);
          assert.equal(await page.getByText(/agendamiento privado no está disponible|proximamente/i).count(), 0);
          session.finishEligibilityRefresh();
          await eligibilityResponse;
          await page.reload();
          await page.getByLabel('Tarjeta de prueba', { exact: true }).waitFor();
          assert.match(page.url(), /\/agendar\/pagar/);
          assert.equal(session.calls.filter(call => call.path.endsWith('/crear-intent')).length, 1);
          if (artifacts) {
            await mkdir(artifacts, { recursive: true });
            await page.screenshot({ path: path.join(artifacts, mobile ? 'qa-checkout-mobile.png' : 'qa-checkout-desktop.png'), fullPage: true, mask: [page.locator('#pay-receipt-email')] });
          }
          for (const [name, value] of [['Nombre del titular', 'Cliente QA'], ['Tarjeta de prueba', '4111111111111111'], ['Vencimiento', '12/40'], ['CVV', '123'], ['Teléfono de contacto', '99999999']]) {
            await page.getByLabel(name, { exact: true }).fill(value);
          }
          await page.evaluate(({ pendingKey, groupId, intentId, email }) => {
            sessionStorage.setItem(pendingKey, JSON.stringify({ id_grupo_cita: groupId, id_intent: intentId, titular_email: email }));
          }, { pendingKey: PENDING_PAYMENT_CONTEXT_KEY, groupId: GROUP, intentId: INTENT, email: EMAIL });
          await page.getByRole('button', { name: 'Pagar', exact: true }).evaluate(button => {
            button.click();
            button.click();
          });
          const processingButton = page.getByRole('button', { name: 'Procesando…', exact: true });
          await processingButton.waitFor();
          assert.equal(await processingButton.isDisabled(), true);
          assert.equal(await page.getByLabel('Tarjeta de prueba', { exact: true }).isDisabled(), true);
          session.finishSimulation();
          await page.waitForURL(/\/agendar\/exito/);
          await page.getByRole('heading', { name: '¡Reserva confirmada!', exact: true }).waitFor();
          assert.equal(session.getSimulationBody()?.monto_prueba_hnl, 1);
          assert.equal(session.calls.filter(call => call.path.endsWith('/simulator/event')).length, 1);
          assert.equal(session.calls.filter(call => call.path.includes('/pixelpay/')).length, 0);
          assert.notEqual(await page.evaluate(key => sessionStorage.getItem(key), BOOKING_PAYMENT_CONTEXT_KEY), null);
          assert.equal(await page.evaluate(key => sessionStorage.getItem(key), PENDING_PAYMENT_CONTEXT_KEY), null);
          await page.reload();
          await page.waitForURL(/\/agendar\/exito/);
          await page.getByRole('heading', { name: '¡Reserva confirmada!', exact: true }).waitFor();
          assert.equal(session.calls.filter(call => call.path.endsWith('/simulator/event')).length, 1);
          assert.equal(session.calls.filter(call => call.path.includes('/pixelpay/')).length, 0);
          if (mobile) {
            await page.getByRole('button', { name: 'Entendido', exact: true }).click();
            await page.waitForURL(/\/home\/cliente\/citas$/);
            await page.getByRole('navigation', { name: 'Paginación de citas' }).waitFor();
            await page.getByText('Confirmada', { exact: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: /reserva pendiente/i }).count(), 0);
            assert.equal(await page.evaluate(key => sessionStorage.getItem(key), BOOKING_PAYMENT_CONTEXT_KEY), null);
            assert.equal(await page.evaluate(key => sessionStorage.getItem(key), PENDING_PAYMENT_CONTEXT_KEY), null);
            await page.getByRole('button', { name: 'Perfil', exact: true }).filter({ visible: true }).click();
            await page.waitForURL(/\/home\/cliente\/perfil$/);
            await page.getByRole('button', { name: 'Inicio', exact: true }).filter({ visible: true }).click();
            await page.waitForURL(/\/home\/cliente$/);
            await page.getByRole('button', { name: 'Citas', exact: true }).filter({ visible: true }).click();
            await page.waitForURL(/\/home\/cliente\/citas$/);
          }
          assert.deepEqual(session.errors, []);
        } finally {
          await session.context.close();
        }
      });
    }
  } finally {
    await browser.close();
  }
});
