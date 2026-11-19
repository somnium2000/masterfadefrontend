import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const engines = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4189';
const branchA = '11111111-1111-4111-8111-111111111111';
const branchB = '22222222-2222-4222-8222-222222222222';
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-vip-design02-evidence');

for (const engine of ['chromium', 'webkit']) {
  for (const width of [366, 390, 768, 1440]) {
    for (const theme of ['dark', 'light']) {
      test(`${engine} ${width} ${theme}: FAB habilitado/pausado y VIP compacto 1/2/3/5`, {
        skip: !existsSync(engines[engine].executablePath()), timeout: 90000,
      }, async () => {
        const browser = await engines[engine].launch();
        try {
          const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 640, isMobile: width < 640 });
          const page = await context.newPage();
          page.setDefaultTimeout(10000);
          await page.addInitScript(value => localStorage.setItem('mf_theme_variant', value), theme);
          const errors = [], writes = [], planBranches = [];
          let empty = false, planCount = 2, bookingEnabled = false, longBenefits = false;
          const longName = 'Tratamiento y asesoría personalizada con todos los beneficios de cuidado profesional para cada cliente';
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
          await page.route('**/v1/**', async route => {
            const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
            const branch = url.searchParams.get('id_sucursal');
            const name = branch === branchB ? 'Norte' : 'Centro';
            let data = {};
            if (request.method() !== 'GET' && endpoint !== '/v1/auth/session/touch') writes.push(`${request.method()} ${endpoint}`);
            if (endpoint === '/v1/auth/me') data = { user: { id_usuario: 'synthetic-client', nombres: 'Cliente sintético' }, roles: ['cliente'], cliente_id: 'synthetic-client' };
            if (endpoint === '/v1/commerce/eligibility') data = { booking: bookingEnabled, vipPurchase: false };
            if (endpoint === '/v1/public/catalog/sucursales') data = { sucursales: [
              { id_sucursal: branchA, nombre_sucursal: 'Centro', estado: true },
              { id_sucursal: branchB, nombre_sucursal: 'Norte', estado: true },
            ] };
            if (endpoint === '/v1/public/catalog/servicios') data = { servicios: [
              { id_servicio: 'corte', nombre_servicio: `Corte ${name}`, agendable: true, precio_hnl: 150, duracion_min: 30 },
              { id_servicio: 'info', nombre_servicio: `Consulta ${name}`, servicio_informativo: true, agendable: false, precio_hnl: 0 },
            ] };
            if (endpoint === '/v1/public/catalog/paquetes') data = { paquetes: [
              { id_paquete: 'combo', nombre_paquete: `Combo ${name}`, precio_hnl: 450, items: [{ nombre_servicio: 'Corte', cantidad: 2 }] },
            ] };
            if (endpoint === '/v1/public/catalog/planes') {
              planBranches.push(branch);
              data = { planes: empty ? [] : Array.from({ length: planCount }, (_, offset) => offset + 1).map(index => ({
                id_plan: `plan-${index}`, id_plan_sucursal: `oferta-${name}-${index}`, id_sucursal: branch,
                nombre_plan: `VIP ${name} ${index}`, categoria_nivel: index === 1 ? 2 : 5,
                descripcion: longBenefits ? longName.repeat(4) : 'Una experiencia de cuidado personal con beneficios exclusivos.',
                periodo_membresia_codigo: 'mensual', periodo_membresia_label: 'Mensual', precio_hnl: index * 950,
                beneficios: longBenefits ? Array.from({ length: 6 }, (_, n) => ({ tipo: 'servicio', nombre: `${longName} ${n + 1}`, cantidad: n + 1 })) : [
                  { tipo: 'servicio', nombre: 'Corte premium', cantidad: index + 1 },
                  { tipo: 'cortesia', nombre: 'Bebida de cortesía', cantidad: 1 },
                ],
              })) };
            }
            await route.fulfill({ json: { ok: true, data } });
          });
          await mkdir(evidence, { recursive: true });
          await page.goto(`${base}/`);
          const central = () => page.getByRole('navigation').getByRole('button', { name: bookingEnabled ? 'Agendar' : 'Pausado', exact: true });
          await central().waitFor();
          assert.equal(await central().isDisabled(), true);
          assert.equal(await central().locator('svg.lucide-plus').count(), 1);
          assert.equal(await page.getByRole('navigation').getByRole('button').count(), 5);
          const primary = page.getByRole('button', { name: 'Reservas pausadas', exact: true }).filter({ visible: true });
          assert.equal(await primary.isDisabled(), true);
          await central().dispatchEvent('click');
          await primary.dispatchEvent('click');
          assert.equal(new URL(page.url()).pathname, '/');
          await page.waitForFunction(() => [...document.querySelectorAll('main button')].filter(node => node.offsetWidth > 0).every(node => Number(getComputedStyle(node).opacity) > 0.99));
          await page.screenshot({ path: path.join(evidence, `${engine}-${width}-${theme}-landing-paused.png`), fullPage: true });
          // AM: Las rutas públicas no hidratan sesión al arrancar; se conserva una sesión
          // AM: hidratada al navegar dentro del Router, sin sustituir Auth ni elegibilidad.
          const navigateInApp = async pathname => page.evaluate(destination => {
            window.history.pushState({}, '', destination);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }, pathname);
          const hydrate = async () => {
            await Promise.all([
              page.waitForResponse(response => new URL(response.url()).pathname === '/v1/commerce/eligibility'),
              page.goto(`${base}/home/cliente/citas`),
            ]);
          };
          bookingEnabled = true;
          await hydrate();
          await navigateInApp('/');
          await central().waitFor();
          assert.equal(await central().isEnabled(), true);
          await central().click();
          await page.waitForURL('**/agendar/barberos');
          await navigateInApp('/');
          await page.getByRole('button', { name: 'Agendar Cita', exact: true }).filter({ visible: true }).click();
          await page.waitForURL('**/agendar/barberos');
          bookingEnabled = false;
          await page.goto(`${base}/servicios`);
          const vip = page.getByRole('region', { name: 'Membresías VIP', exact: true });
          const track = page.getByRole('region', { name: 'Planes de membresías VIP', exact: true });
          const previous = vip.getByRole('button', { name: 'Membresía VIP anterior', exact: true });
          const next = vip.getByRole('button', { name: 'Membresía VIP siguiente', exact: true });
          const resync = async () => {
            // AM: Expira la caché GET existente antes de comprobar la resincronización.
            await page.clock.setSystemTime(await page.evaluate(() => Date.now() + 11000));
            await page.evaluate(() => window.dispatchEvent(new CustomEvent('mf:catalog-sync')));
          };
          const scrollPosition = () => track.evaluate(node => node.scrollLeft);
          const waitPosition = async expected => page.waitForFunction(target => Math.abs(document.getElementById('services-vip-plans').scrollLeft - target) < 1, expected);
          await vip.getByText('VIP Centro 1', { exact: true }).waitFor();
          await page.getByText('Corte Centro', { exact: true }).waitFor();
          assert.deepEqual(await page.getByRole('heading', { level: 2 }).allTextContents(), [
            'Membresías VIP', 'Servicios agendables', 'Servicios informativos', 'Combos / Paquetes',
          ]);
          await vip.getByText('Silver', { exact: true }).waitFor();
          await vip.getByText('2 × Corte premium', { exact: true }).waitFor();
          await vip.getByText('L 950.00', { exact: true }).waitFor();
          const link = vip.getByRole('link', { name: 'Ver membresías VIP' });
          assert.equal(await link.getAttribute('href'), '/membresias-vip');
          await central().waitFor();
          assert.equal(await central().isDisabled(), true);
          await central().dispatchEvent('click');
          assert.equal(new URL(page.url()).pathname, '/servicios');
          for (const count of [1, 2, 3, 5]) {
            planCount = count;
            await resync();
            await page.waitForFunction(n => document.querySelectorAll('#services-vip-plans article').length === n, count);
            const layout = await track.evaluate(node => ({
              width: node.clientWidth,
              cardWidth: node.querySelector('article').getBoundingClientRect().width,
              top: [...node.querySelectorAll('article')].map(card => card.getBoundingClientRect().top),
              overflow: node.scrollWidth > node.clientWidth + 1,
              max: node.scrollWidth - node.clientWidth,
              snap: getComputedStyle(node).scrollSnapType,
              scrollbar: getComputedStyle(node).scrollbarWidth,
              webkitScrollbar: getComputedStyle(node, '::-webkit-scrollbar').display,
              cardHeight: node.querySelector('article').getBoundingClientRect().height,
              innerOverflow: [...node.querySelectorAll('*')].filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).map(el => el.tagName),
            }));
            assert.equal(await vip.getByRole('article').count(), count);
            const visibleCards = width < 640 ? 1 : width < 1024 ? 2 : 3;
            const expectedWidth = visibleCards === 1 ? Math.min(layout.width, 320) : (layout.width - (visibleCards - 1) * 16) / visibleCards;
            assert.ok(Math.abs(layout.cardWidth - expectedWidth) < 2, JSON.stringify({ count, layout }));
            assert.ok(layout.cardHeight < 400, `Tarjeta compacta: ${layout.cardHeight}`);
            assert.equal(layout.scrollbar, 'none');
            assert.equal(layout.webkitScrollbar, 'none');
            assert.ok(layout.top.every(top => Math.abs(top - layout.top[0]) < 1));
            assert.equal(layout.snap, 'x mandatory');
            assert.deepEqual(layout.innerOverflow, []);
            assert.equal(layout.overflow, count > visibleCards);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            if (layout.overflow) {
              await next.waitFor();
              await waitPosition(0);
              await page.waitForFunction(() => document.querySelector('[aria-label="Membresía VIP anterior"]').disabled && !document.querySelector('[aria-label="Membresía VIP siguiente"]').disabled);
              assert.equal(await previous.isDisabled(), true);
              assert.equal(await next.isEnabled(), true);
              for (const button of [previous, next]) assert.ok(await button.evaluate(node => node.getBoundingClientRect().height >= 44 && node.getBoundingClientRect().width >= 44));
              const headingBounds = await page.getByRole('heading', { name: 'Membresías VIP', exact: true }).boundingBox(), arrowBounds = await next.boundingBox();
              assert.ok(Math.abs(arrowBounds.y + arrowBounds.height / 2 - headingBounds.y - headingBounds.height / 2) < 24);
              assert.ok(arrowBounds.x > headingBounds.x + headingBounds.width);
              await next.focus();
              await page.keyboard.press('Enter');
              await waitPosition(Math.min(layout.max, (layout.cardWidth + 16) * (width >= 1024 ? 3 : 1)));
              assert.equal(await previous.isEnabled(), true);
              await previous.click();
              await waitPosition(0);
              await track.evaluate(node => node.scrollTo({ left: 0, behavior: 'instant' }));
              await waitPosition(0);
              for (let step = 0; step < count && await scrollPosition() < layout.max - 1; step++) {
                const expected = Math.min(layout.max, await scrollPosition() + (layout.cardWidth + 16) * (width >= 1024 ? 3 : 1));
                await next.click();
                await waitPosition(expected);
              }
              await waitPosition(layout.max);
              await page.waitForFunction(() => document.querySelector('[aria-label="Membresía VIP siguiente"]').disabled);
              assert.equal(await next.isDisabled(), true);
              if (width < 640 && engine === 'chromium') {
                await track.evaluate(node => node.scrollTo({ left: 0, behavior: 'instant' }));
                await waitPosition(0);
              }
              if (width < 640 && engine === 'chromium') {
                await track.scrollIntoViewIfNeeded();
                const bounds = await track.boundingBox();
                const session = await context.newCDPSession(page);
                const x = bounds.x + bounds.width - 30, y = Math.max(30, bounds.y + 80);
                await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
                for (let step = 1; step <= 8; step++) {
                  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - (bounds.width - 50) * step / 8, y }] });
                }
                await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await page.waitForFunction(() => document.getElementById('services-vip-plans').scrollLeft > 10);
                await session.detach();
                // AM: Espera a que termine la inercia del gesto antes de probar las flechas.
                await track.evaluate(node => new Promise(resolve => {
                  let previous = node.scrollLeft, stable = 0;
                  const check = () => {
                    stable = Math.abs(node.scrollLeft - previous) < 0.1 ? stable + 1 : 0;
                    previous = node.scrollLeft;
                    if (stable >= 8) resolve(); else requestAnimationFrame(check);
                  };
                  requestAnimationFrame(check);
                }));
              }

            } else {
              assert.equal(await next.count(), 0);
              assert.equal(await previous.count(), 0);
            }
            const lastPrice = vip.getByRole('article').last().locator('p').filter({ hasText: /^L [0-9]/ });
            await lastPrice.scrollIntoViewIfNeeded();
            await lastPrice.evaluate(node => window.scrollBy({ top: node.getBoundingClientRect().top - innerHeight / 2, behavior: 'instant' }));
            const bounds = await lastPrice.boundingBox(), navBounds = await page.getByRole('navigation').boundingBox();
            assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= navBounds.y, 'Precio accesible sobre la barra inferior');
            await page.evaluate(() => window.scrollTo({ top: document.querySelector('[aria-labelledby="services-vip-heading"]').getBoundingClientRect().top + scrollY - 16, behavior: 'instant' }));
            await page.screenshot({ path: path.join(evidence, `after-${engine}-${width}-${theme}-${count}.png`) });
          }
          longBenefits = true;
          await resync();
          await vip.getByText('+ 4 beneficios más', { exact: true }).first().waitFor();
          const detailButton = vip.getByRole('button', { name: 'Ver detalle de VIP Centro 1', exact: true });
          await detailButton.click();
          const dialog = page.getByRole('dialog');
          await dialog.getByText(longName.repeat(4), { exact: true }).waitFor();
          assert.equal(await dialog.getByRole('listitem').count(), 6);
          for (let n = 1; n <= 6; n++) await dialog.getByText(`${n} × ${longName} ${n}`, { exact: true }).waitFor();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
          await page.screenshot({ path: path.join(evidence, `after-${engine}-${width}-${theme}-detail.png`) });
          await page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'detached' });
          await page.waitForFunction(node => document.activeElement === node, await detailButton.elementHandle());
          longBenefits = false;
          await page.getByRole('button', { name: 'Norte', exact: true }).click();
          await vip.getByText('VIP Norte 1', { exact: true }).waitFor();
          await page.getByText('Corte Norte', { exact: true }).waitFor();
          await page.getByText('Combo Norte', { exact: true }).waitFor();
          assert.equal(await vip.getByText('VIP Centro 1', { exact: true }).count(), 0);
          assert.equal(planBranches.at(-1), branchB);
          assert.equal(await scrollPosition(), 0);
          empty = true;
          await resync();
          await vip.getByText('No hay membresías VIP disponibles en esta sucursal.', { exact: true }).waitFor();
          await page.getByText('Corte Norte', { exact: true }).waitFor();
          assert.equal(planBranches.at(-1), branchB);
          await link.click();
          await page.waitForURL('**/membresias-vip');
          bookingEnabled = true;
          await hydrate();
          await navigateInApp('/servicios');
          await central().waitFor();
          await central().click();
          await page.waitForURL('**/agendar/barberos');
          assert.deepEqual(writes, []);
          assert.deepEqual(errors, []);
        } finally {
          await browser.close();
        }
      });
    }
  }
}
