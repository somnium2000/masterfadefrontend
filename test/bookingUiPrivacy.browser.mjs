import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4191';
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-booking-ui-privacy-01');
const BRANCH = '11111111-1111-4111-8111-111111111111', SERVICE = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333', CLIENT = '44444444-4444-4444-8444-444444444444';
const profile = { id_usuario: USER, id_cliente: CLIENT, nombres: 'TitularPrivado', apellidos: 'ApellidoSecreto', email: 'titular@example.test', telefono_principal: '99999999', perfil_completo: true };
const shapes = [['Vertical QA', 180, 300], ['Horizontal QA', 360, 180], ['Cuadrada QA', 240, 240], ['Pequena QA', 24, 24], ['Sin Foto', 0, 0], ['Foto Fallida', -1, -1]];
const barbers = shapes.map(([name, width, height], index) => ({ id_empleado: `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
  nombre_completo: name, alias_publico: name, resumen_publico: 'Perfil profesional de prueba.',
  foto_perfil_url: width === 0 ? null : `${base}/qa-fixtures/photo-${index}.svg`, width, height }));
const message = 'Horario no disponible: coincide con otra cita del grupo';

function imageFixture(width, height) {
  // AM: Bordes y esquinas de colores permiten revisar la imagen completa; no son fotos de personas reales.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#d3ad6b"/><rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="#304859" stroke="#fff" stroke-width="3"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#d3ad6b" stroke-width="2"/><rect width="12" height="12" fill="#f05050"/><rect x="${width - 12}" width="12" height="12" fill="#50c0f0"/><rect y="${height - 12}" width="12" height="12" fill="#50d080"/><rect x="${width - 12}" y="${height - 12}" width="12" height="12" fill="#f0df50"/></svg>`;
}

for (const width of [360, 390, 768, 1440]) for (const theme of ['dark', 'light']) test(`Chrome ${width} ${theme}: fotos completas estables y horarios privados`, { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MASTERFADE_CHROMIUM_CHANNEL || 'chrome' });
  let releaseImages;
  try {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 640, hasTouch: width < 640 });
    await context.addInitScript(value => { if (/^https?:$/.test(location.protocol)) localStorage.setItem('mf_theme_variant', value); }, theme);
    const gate = new Promise(resolve => { releaseImages = resolve; });
    const writes = [], errors = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      // AM: Solo app local y respuestas sinteticas; ninguna peticion alcanza QA, Supabase o pagos.
      if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
      const endpoint = url.pathname;
      if (endpoint.startsWith('/qa-fixtures/photo-')) {
        await gate;
        const index = Number(endpoint.match(/photo-(\d+)/)[1]), photo = barbers[index];
        return route.fulfill({ status: photo.width < 0 ? 404 : 200, contentType: 'image/svg+xml', body: photo.width < 0 ? '' : imageFixture(photo.width, photo.height) });
      }
      if (!endpoint.startsWith('/v1/')) return route.continue();
      if (request.method() !== 'GET') {
        writes.push(endpoint);
        assert.ok(['/v1/auth/session/touch', '/v1/citas/hold', '/v1/citas/validar-contactos', '/v1/citas/validar-titular', '/v1/public/citas/validar-contactos', '/v1/public/citas/validar-titular'].includes(endpoint), `Escritura inesperada: ${endpoint}`);
      }
      if (endpoint.endsWith('/agenda/eventos')) return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      if (endpoint === '/v1/citas/hold') return route.fulfill({ status: 409, json: { ok: false, error: { code: 'CITAS_HOLD_CONFLICT', reason: 'AGENDA_INTERNAL_GROUP_CONFLICT', message: 'Ocupado por ClienteExternoConfidencial', details: { blockIndex: 1 } } } });
      let data = {};
      if (endpoint === '/v1/auth/me') data = { user: profile, roles: ['cliente'], cliente_id: CLIENT };
      else if (endpoint === '/v1/auth/csrf') data = { csrf_token: 'synthetic-only' };
      else if (endpoint === '/v1/commerce/eligibility') data = { booking: true, vipPurchase: false };
      else if (endpoint === '/v1/public/citas/contexto') data = { sucursales: [{ id_sucursal: BRANCH, nombre_sucursal: 'Sucursal QA' }], parametros: { pago_total_obligatorio: true, agendamiento_max_acompanantes: 4 } };
      else if (endpoint === '/v1/public/agenda/barberos') data = { barberos: barbers };
      else if (endpoint === '/v1/public/catalog/servicios') data = { servicios: [{ id_servicio: SERVICE, nombre_servicio: 'Corte QA', activo: true, agendable: true, precio_hnl: 300, duracion_min: 30 }] };
      else if (endpoint === '/v1/public/catalog/paquetes') data = { paquetes: [] };
      else if (endpoint.endsWith('/promociones')) data = { promociones: [] };
      else if (endpoint === '/v1/cliente/me') data = { ...profile, cliente: profile };
      else if (endpoint.includes('/planes/estado')) data = { planes_activos: [] };
      else if (endpoint === '/v1/citas/pendiente') data = { pendiente: null };
      else if (endpoint.endsWith('/validar-contactos')) return route.fulfill({ json: { ok: true, valido: true, errors: [], warnings: [] } });
      else if (endpoint.endsWith('/validar-titular')) data = { valid: true };
      else if (endpoint === '/v1/public/agenda/disponibilidad') {
        const start = url.searchParams.get('fecha_desde'), end = url.searchParams.get('fecha_hasta'), days = [];
        for (let day = new Date(start + 'T12:00:00Z'); day <= new Date(end + 'T12:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) days.push({ fecha: day.toISOString().slice(0, 10), disponible: true, barberos_disponibles: 6, primer_horario_disponible: '10:00' });
        data = { disponibilidad: days };
      } else if (endpoint === '/v1/public/agenda/horarios') {
        const slots = ['10:00', '10:15', '10:30', '10:45', '11:00', '11:30'].map(hora => ({ hora, disponible: true, duracion_visible_min: 30 }));
        data = { horarios: slots, horarios_curados: { manana: { recommended: slots[0], alternatives: slots.slice(1), total: slots.length, overflow: [], has_more: false }, tarde: { recommended: null, alternatives: [], overflow: [], total: 0, has_more: false }, noche: { recommended: null, alternatives: [], overflow: [], total: 0, has_more: false } }, duracion_total_min: 30, buffer_total_min: 0 };
      }
      return route.fulfill({ json: { ok: true, data } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2030-06-15T12:00:00Z'));
    await page.goto(base + '/agendar', { waitUntil: 'domcontentloaded' });
    const cards = page.locator('button.public-booking-barber-card'); await cards.nth(5).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const sizes = () => cards.evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(), media = node.querySelector('.public-booking-barber-card-media').getBoundingClientRect(); return [box.width, box.height, media.width, media.height]; }));
    const before = await sizes(); releaseImages();
    for (let index = 0; index < 4; index++) {
      const photo = cards.nth(index).locator('img'); await photo.scrollIntoViewIfNeeded();
      await photo.evaluate(node => node.complete && node.naturalWidth > 0 ? undefined : new Promise((resolve, reject) => { node.onload = resolve; node.onerror = reject; }));
      const geometry = await photo.evaluate(node => {
        const image = node.getBoundingClientRect(), frame = node.closest('.public-booking-barber-card-media').getBoundingClientRect(), style = getComputedStyle(node);
        return { width: image.width, height: image.height, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight, frameWidth: frame.width, frameHeight: frame.height, centerX: Math.abs(image.x + image.width / 2 - frame.x - frame.width / 2), centerY: Math.abs(image.y + image.height / 2 - frame.y - frame.height / 2), fit: style.objectFit };
      });
      assert.equal(geometry.fit, 'contain');
      assert.ok(geometry.width <= geometry.frameWidth && geometry.height <= geometry.frameHeight, JSON.stringify(geometry));
      assert.ok(geometry.width <= geometry.naturalWidth + 1 && geometry.height <= geometry.naturalHeight + 1, 'Sin ampliacion desproporcionada');
      assert.ok(Math.abs(geometry.width / geometry.height - geometry.naturalWidth / geometry.naturalHeight) < 0.02, 'Sin deformacion');
      assert.ok(geometry.centerX < 1 && geometry.centerY < 1, 'Imagen centrada');
    }
    await cards.nth(5).scrollIntoViewIfNeeded(); await cards.nth(5).locator('.public-booking-barber-card-avatar').waitFor();
    assert.equal(await cards.nth(4).locator('.public-booking-barber-card-avatar').textContent(), 'SF');
    assert.equal(await cards.nth(5).locator('.public-booking-barber-card-avatar').textContent(), 'FF');
    const after = await sizes();
    for (let index = 0; index < before.length; index++) for (let dimension = 0; dimension < 4; dimension++) assert.ok(Math.abs(before[index][dimension] - after[index][dimension]) < 1, 'Tarjeta estable durante carga y error de foto');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mkdir(evidence, { recursive: true });
    await cards.first().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(evidence, `${width}-${theme}-photos.png`), fullPage: true });
    await cards.first().click();
    await page.getByRole('button', { name: /Corte QA/ }).click();
    await page.locator('.citas-day-btn.is-available:not(:disabled)').last().click();
    const slot = time => page.locator('.public-booking-time-block').filter({ has: page.locator('.public-booking-time-block-range', { hasText: new RegExp('^' + time + '\\s*-') }) }).first();
    await slot('10:00 AM').click();
    assert.equal(await slot('10:00 AM').getAttribute('aria-pressed'), 'true');
    for (const [index, firstName, lastName, time] of [[1, 'AcompanantePrivado', 'ApellidoReservado', '10:45 AM'], [2, 'SegundoPrivado', 'ApellidoOculto', null]]) {
      await page.getByRole('button', { name: 'Añadir acompañante', exact: true }).click();
      await page.locator('#booking-contact-first-name').fill(firstName); await page.locator('#booking-contact-last-name').fill(lastName);
      await page.getByRole('button', { name: /Corte QA/ }).click();
      // AM: AnimatePresence conserva el bloque anterior durante su salida; validar solo al terminar.
      await page.waitForFunction(() => document.querySelectorAll('.public-booking-time-blocks-shell').length === 1);
      const blockedTime = index === 1 ? '10:00 AM' : '10:45 AM';
      const blocked = slot(blockedTime); await blocked.waitFor();
      await page.waitForFunction(({ time, text }) => [...document.querySelectorAll('.public-booking-time-block')].some(node => node.querySelector('.public-booking-time-block-range')?.textContent.startsWith(time) && node.disabled && node.title === text), { time: blockedTime, text: message });
      assert.equal(await blocked.isDisabled(), true, JSON.stringify({ index, slots: await page.locator('.public-booking-time-block').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, disabled: node.disabled, selected: node.getAttribute('aria-pressed') }))), activeBarber: await page.locator('.public-booking-active-barber-select').inputValue() })); assert.equal(await blocked.getAttribute('title'), message);
      const region = page.locator('.public-booking-time-blocks-shell');
      const accessible = await region.ariaSnapshot();
      const markup = await region.evaluate(node => node.outerHTML);
      for (const name of [profile.nombres, profile.apellidos, 'AcompanantePrivado', 'ApellidoReservado', 'SegundoPrivado', 'ApellidoOculto', 'Solapa con']) {
        assert.equal(accessible.includes(name), false); assert.equal(markup.includes(name), false);
      }
      if (time) { await slot(time).click(); assert.equal(await slot(time).getAttribute('aria-pressed'), 'true'); }
    }
    await page.locator('.public-booking-time-blocks-shell').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(evidence, `${width}-${theme}-private-conflicts.png`) });
    await page.locator('.public-booking-active-barber-select').selectOption(barbers[1].id_empleado);
    await page.waitForFunction(() => [...document.querySelectorAll('.public-booking-time-block')].every(button => !button.disabled));
    await slot('10:00 AM').click();
    await page.getByRole('button', { name: 'Continuar a resumen', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar al pago', exact: true }).click();
    const warning = page.getByRole('alert').filter({ hasText: message }); await warning.waitFor();
    assert.equal((await warning.innerText()).includes('AcompanantePrivado'), false);
    assert.equal((await warning.innerText()).includes('ClienteExternoConfidencial'), false);
    assert.ok(writes.includes('/v1/citas/hold'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []); assert.ok(writes.every(endpoint => !/pagos|puntos/.test(endpoint)));
  } finally { releaseImages?.(); await browser.close(); }
});
