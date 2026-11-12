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
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-services-vip-evidence');

for (const engine of ['chromium', 'webkit']) {
  for (const width of [390, 1440]) {
    for (const theme of ['dark', 'light']) {
      test(`${engine} ${width} ${theme}: VIP por sucursal, catálogo y enlace`, {
        skip: !existsSync(engines[engine].executablePath()), timeout: 40000,
      }, async () => {
        const browser = await engines[engine].launch();
        try {
          const context = await browser.newContext({ viewport: { width, height: 900 } });
          const page = await context.newPage();
          page.setDefaultTimeout(10000);
          await page.addInitScript(value => localStorage.setItem('mf_theme_variant', value), theme);
          const errors = [], writes = [], planBranches = [];
          let empty = false;
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
          await page.route('**/v1/**', async route => {
            const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
            const branch = url.searchParams.get('id_sucursal');
            const name = branch === branchB ? 'Norte' : 'Centro';
            let data = {};
            if (request.method() !== 'GET') writes.push(`${request.method()} ${endpoint}`);
            if (endpoint === '/v1/auth/me') data = { user: null, roles: [] };
            if (endpoint === '/v1/commerce/eligibility') data = { booking: false, vipPurchase: false };
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
              data = { planes: empty ? [] : [1, 2].map(index => ({
                id_plan: `plan-${index}`, id_plan_sucursal: `oferta-${name}-${index}`, id_sucursal: branch,
                nombre_plan: `VIP ${name} ${index}`, categoria_nivel: index === 1 ? 2 : 5,
                descripcion: 'Una experiencia de cuidado personal con beneficios exclusivos.',
                periodo_membresia_codigo: 'mensual', periodo_membresia_label: 'Mensual', precio_hnl: index * 950,
                beneficios: [
                  { tipo: 'servicio', nombre: 'Corte premium', cantidad: index + 1 },
                  { tipo: 'cortesia', nombre: 'Bebida de cortesía', cantidad: 1 },
                ],
              })) };
            }
            await route.fulfill({ json: { ok: true, data } });
          });
          await page.goto(`${base}/servicios`);
          const vip = page.getByRole('region', { name: 'Membresías VIP', exact: true });
          await vip.getByText('VIP Centro 1', { exact: true }).waitFor();
          await page.getByText('Corte Centro', { exact: true }).waitFor();
          assert.deepEqual(await page.getByRole('heading', { level: 2 }).allTextContents(), [
            'Membresías VIP', 'Servicios agendables', 'Servicios informativos', 'Combos / Paquetes',
          ]);
          assert.equal(await vip.getByRole('article').count(), 2);
          await vip.getByText('Silver', { exact: true }).waitFor();
          await vip.getByText('Diamond', { exact: true }).waitFor();
          await vip.getByText('2 × Corte premium', { exact: true }).waitFor();
          assert.equal(await vip.getByText('Vigencia: Mensual', { exact: true }).count(), 2);
          await vip.getByText('L 950.00', { exact: true }).waitFor();
          assert.equal(await vip.getByRole('button').count(), 0);
          const link = vip.getByRole('link', { name: 'Ver membresías VIP' });
          assert.equal(await link.getAttribute('href'), '/membresias-vip');
          const layout = await vip.evaluate(section => ({
            cards: [...section.querySelectorAll('article')].map(card => ({
              left: card.getBoundingClientRect().left, top: card.getBoundingClientRect().top,
            })),
            overflowing: [section, ...section.querySelectorAll('*')]
              .filter(node => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
              .map(node => node.tagName),
            linkHeight: section.querySelector('a').getBoundingClientRect().height,
            viewportOverflow: document.documentElement.scrollWidth > innerWidth,
          }));
          assert.deepEqual(layout.overflowing, []);
          assert.equal(layout.viewportOverflow, false);
          assert.ok(layout.linkHeight >= 44);
          if (width === 390) assert.equal(layout.cards[0].left, layout.cards[1].left);
          else assert.ok(Math.abs(layout.cards[0].top - layout.cards[1].top) < 1);
          await mkdir(evidence, { recursive: true });
          await vip.screenshot({ path: path.join(evidence, `${engine}-${width}-${theme}-vip.png`) });
          await page.screenshot({ path: path.join(evidence, `${engine}-${width}-${theme}-catalog.png`), fullPage: true });
          await page.getByRole('button', { name: 'Norte', exact: true }).click();
          await vip.getByText('VIP Norte 1', { exact: true }).waitFor();
          await page.getByText('Corte Norte', { exact: true }).waitFor();
          await page.getByText('Combo Norte', { exact: true }).waitFor();
          assert.equal(await vip.getByText('VIP Centro 1', { exact: true }).count(), 0);
          assert.deepEqual(planBranches, [branchA, branchB]);
          empty = true;
          // AM: Expira la caché GET existente antes de comprobar la resincronización.
          await page.clock.setSystemTime(await page.evaluate(() => Date.now() + 11000));
          await page.evaluate(() => window.dispatchEvent(new CustomEvent('mf:catalog-sync')));
          await vip.getByText('No hay membresías VIP disponibles en esta sucursal.', { exact: true }).waitFor();
          await page.getByText('Corte Norte', { exact: true }).waitFor();
          assert.deepEqual(planBranches, [branchA, branchB, branchB]);
          await link.click();
          await page.waitForURL('**/membresias-vip');
          assert.deepEqual(writes, []);
          assert.deepEqual(errors, []);
        } finally {
          await browser.close();
        }
      });
    }
  }
}
