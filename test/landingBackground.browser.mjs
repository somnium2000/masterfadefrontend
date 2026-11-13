import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const engines = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4189';
const evidence = path.join(process.env.TEMP || process.cwd(), 'mf-landing-photo-evidence');

async function contrastAudit(page) {
  const texts = await page.evaluate(() => {
    const entries = [], walker = document.createTreeWalker(document.querySelector('.mf-landing'), NodeFilter.SHOW_TEXT);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    while (walker.nextNode()) {
      const node = walker.currentNode, element = node.parentElement;
      if (!node.textContent.trim() || element.closest('.sr-only')) continue;
      const style = getComputedStyle(element), range = document.createRange(); range.selectNodeContents(node);
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = style.color; ctx.fillRect(0, 0, 1, 1);
      const rgba = [...ctx.getImageData(0, 0, 1, 1).data];
      const rects = [...range.getClientRects()].map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })).filter(r => r.width > 1 && r.height > 1 && r.x >= 0 && r.y >= 0 && r.y < innerHeight);
      if (!rects.length) continue;
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700);
      entries.push({ text: node.textContent.trim(), rgba, rects, threshold: large ? 3 : 4.5 });
    }
    return entries;
  });
  // AM: Mide el fondo compuesto real manteniendo fotografía, degradados y superficies.
  const mask = await page.addStyleTag({ content: '.mf-landing * { color: transparent !important; text-shadow: none !important; }' });
  const background = await page.screenshot();
  await mask.evaluate(node => node.remove());
  return page.evaluate(async ({ data, texts }) => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance = rgb => rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
    return texts.map(entry => {
      let min = Infinity;
      for (const r of entry.rects) for (let y = Math.ceil(r.y); y < Math.min(canvas.height, r.y + r.height); y++) for (let x = Math.ceil(r.x); x < Math.min(canvas.width, r.x + r.width); x++) {
        const offset = (y * canvas.width + x) * 4, bg = [...pixels.slice(offset, offset + 3)];
        const alpha = entry.rgba[3] / 255, fg = entry.rgba.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha));
        const a = luminance(fg), b = luminance(bg); min = Math.min(min, (Math.max(a, b) + .05) / (Math.min(a, b) + .05));
      }
      return { text: entry.text, ratio: min, threshold: entry.threshold };
    });
  }, { data: 'data:image/png;base64,' + background.toString('base64'), texts });
}

for (const engine of ['chromium', 'webkit']) for (const width of [390, 1440]) for (const theme of ['dark', 'light']) {
  test(`${engine} ${width} ${theme}: foto responsive, AA y navegación`, { skip: !existsSync(engines[engine].executablePath()), timeout: 90000 }, async () => {
    const browser = await engines[engine].launch();
    try {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, hasTouch: width === 390, isMobile: width === 390 });
      await context.addInitScript(value => { if (location.protocol === 'http:' || location.protocol === 'https:') localStorage.setItem('mf_theme_variant', value); }, theme);
      const page = await context.newPage(), errors = [], writes = [], photos = [], forbiddenImages = [];
      let booking = false;
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => {
        if (/masterfade-barbershop/.test(request.url())) photos.push(new URL(request.url()).pathname);
        if (/pexels|\.dng(?:$|[?#])/i.test(request.url())) forbiddenImages.push(request.url());
      });
      await page.route('**/v1/**', async route => {
        const request = route.request(), endpoint = new URL(request.url()).pathname;
        if (request.method() !== 'GET' && endpoint !== '/v1/auth/session/touch') writes.push(endpoint);
        let data = {};
        if (endpoint === '/v1/auth/me') data = { user: booking ? { id_usuario: 'fixture-client', nombres: 'Cliente' } : null, roles: booking ? ['cliente'] : [], cliente_id: booking ? 'fixture-client' : null };
        if (endpoint === '/v1/commerce/eligibility') data = { booking, vipPurchase: false };
        await route.fulfill({ json: { ok: true, data } });
      });
      const ready = async () => {
        await page.getByRole('main').waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('.mf-landing img')].every(image => image.complete && image.naturalWidth > 0));
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => [...document.querySelectorAll('main button')].filter(button => button.offsetWidth).every(button => Number(getComputedStyle(button).opacity) > .99));
      };
      const photoReady = page.waitForResponse(response => /masterfade-barbershop/.test(response.url()));
      await page.goto(base + '/'); await photoReady; await ready();
      const info = await page.locator('.mf-landing__photo').evaluate(node => ({ src: getComputedStyle(node).backgroundImage, filter: getComputedStyle(node).filter, fit: getComputedStyle(node).backgroundSize }));
      assert.match(info.src, width === 390 ? /barbershop-mobile.*\.webp/ : /barbershop-desktop.*\.webp/);
      assert.equal(info.filter, 'none'); assert.equal(info.fit, 'cover'); assert.equal(photos.length, 1); assert.deepEqual(forbiddenImages, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.getByRole('navigation').getByRole('button').count(), 5);
      const ctas = [];
      for (const label of ['Reservas pausadas', 'Barberos', 'Planes de Membresía VIP']) ctas.push(await page.getByRole('main').getByRole('button', { name: label, exact: true }).filter({ visible: true }).boundingBox());
      for (let index = 1; index < ctas.length; index++) assert.ok(Math.abs(ctas[index].y - ctas[index - 1].y - ctas[index - 1].height - 12) < 1, 'Separación original de 12px entre CTA');
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, `${engine}-${width}-${theme}.png`), fullPage: true });
      const contrast = await contrastAudit(page); await writeFile(path.join(evidence, `${engine}-${width}-${theme}-contrast.json`), JSON.stringify(contrast, null, 2));
      assert.ok(contrast.length >= 12);
      assert.deepEqual(contrast.filter(result => result.ratio < result.threshold), []);
      await page.getByRole('button', { name: 'Pausado', exact: true }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Reservas pausadas', exact: true }).filter({ visible: true }).dispatchEvent('click');
      assert.equal(new URL(page.url()).pathname, '/');
      for (const [label, destination] of [['Servicios', '/servicios'], ['Barberos', '/barberos'], ['Planes de Membresía VIP', '/membresias-vip'], ['Promociones', '/promociones'], ['Iniciar sesión', '/login']]) {
        await page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).click();
        await page.waitForURL(url => url.pathname === destination);
        await page.goBack(); await ready();
      }
      await page.getByRole('button', { name: 'Inicio', exact: true }).click(); assert.equal(new URL(page.url()).pathname, '/');
      const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Cambiar a tema claro elegante' : 'Cambiar a tema oscuro premium' }).filter({ visible: true });
      await toggle.click(); assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'dark' ? 'light' : 'dark');
      booking = true;
      await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === '/v1/commerce/eligibility'), page.goto(base + '/home/cliente/citas')]);
      const homeInApp = async () => page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
      await homeInApp(); await page.getByRole('button', { name: 'Agendar', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Agendar', exact: true }).click(); await page.waitForURL('**/agendar/barberos');
      await homeInApp(); await page.getByRole('button', { name: 'Agendar Cita', exact: true }).filter({ visible: true }).click(); await page.waitForURL('**/agendar/barberos');
      assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
