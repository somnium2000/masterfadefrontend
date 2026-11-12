import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

// AM: Ejecutar con node --test contra vite preview; Playwright puede instalarse fuera del repositorio.
const { chromium, webkit, devices } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4173';
const BRANCH = '33333333-3333-4333-8333-333333333333';
const BARBER = '44444444-4444-4444-8444-444444444444';
const SERVICE = '55555555-5555-4555-8555-555555555555';
const EMAIL = 'synthetic@example.test';
const branch = { id_sucursal: BRANCH, nombre_sucursal: 'Sucursal sintética' };
const profile = { id_usuario: '66666666-6666-4666-8666-666666666666', nombres: 'Cliente', apellidos: 'Sintético', email: EMAIL, telefono_principal: '99999999' };

async function setup(browser, { cliente = false, mobile = true } = {}) {
  const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } });
  await context.addInitScript(theme=>localStorage.setItem('mf_theme_variant',theme),mobile?'dark':'light');
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  await page.clock.setFixedTime(new Date('2030-06-15T12:00:00Z'));
  const errors = [];
  const calls = [];
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
    if(method !== 'GET' && !path.startsWith('/v1/auth/') && !path.endsWith('/validar-contactos') && !path.endsWith('/validar-titular')) throw new Error('Operación fuera de alcance: '+path);
    calls.push({ method, path, query: url.search });
    if (path === '/v1/public/agenda/eventos') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
    let data = {};
    let status = 200;
    if (path === '/v1/auth/me') {
      if (!cliente) return route.fulfill({ status: 401, json: { ok: false, error: { code: 'UNAUTHORIZED' } } });
      data = { user: profile, roles: ['cliente'], cliente_id: '77777777-7777-4777-8777-777777777777' };
    } else if (path === '/v1/auth/csrf') data = { csrf_token: 'synthetic-csrf' };
    else if (path === '/v1/public/citas/contexto') data = { sucursales: [branch], parametros: { pago_total_obligatorio: true } };
    else if (path === '/v1/public/agenda/barberos') data = { barberos: [{ id_empleado: BARBER, nombre_completo: 'Barbero sintético' }, {id_empleado:'88888888-8888-4888-8888-888888888888',nombre_completo:'Segundo barbero'}] };
    else if (path === '/v1/public/catalog/servicios') data = { servicios: [{ id_servicio: SERVICE, nombre_servicio: 'Corte sintético', activo: true, agendable: true, precio_hnl: 300, duracion_min: 30 },{id_servicio:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nombre_servicio:'Barba sintética',activo:true,agendable:true,precio_hnl:150,duracion_min:30}] };
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
    } else if (path === '/v1/public/agenda/horarios') data = { horarios: [{ hora: '10:00', disponible: true }, { hora: '10:30', disponible: true }, { hora: '11:00', disponible: true }, { hora: '16:00', disponible: true }], duracion_total_min: 30, buffer_total_min: 0 };
    else if (path.endsWith('/validar-contactos') || path.endsWith('/validar-titular')) data = { valid: true };
    else if (path === '/v1/cliente/me') data = { ...profile, perfil_completo: true };
    else if (path.includes('/planes/estado')) data = { planes_activos: [{id_suscripcion:'99999999-9999-4999-8999-999999999999',id_sucursal_contratada:BRANCH,estado_visible:'activa',remanentes:{servicios:[{id_servicio:SERVICE,restante:2}]}}] };
    else if (method !== 'GET' && !path.startsWith('/v1/auth/')) {
      errors.push('Operación inesperada: ' + method + ' ' + path);
      status = 400;
    }
    return route.fulfill({ status, json: { ok: status === 200, data } });
  });
  return {page,context,calls,errors};
}


for(const engine of [chromium,webkit])for(const width of [390,1440])test(engine.name()+' '+width+': primer acompañante, fecha, foco y horarios',{timeout:45000},async()=>{
 const browser=await engine.launch();try{
 const session=await setup(browser,{cliente:true,mobile:width===390,resume:false});const {page}=session;
 await page.setViewportSize({width,height:900});await page.goto(baseURL+'/agendar');
 await page.getByRole('button',{name:'Seleccionar a Barbero sintético'}).click();
 const titularService=page.getByRole('button',{name:/Corte sintético/});if(await titularService.isEnabled())await titularService.click();
 await page.locator('.citas-day-btn.is-available:not(:disabled)').last().click();
 await page.locator('.public-booking-time-block:not(:disabled)').first().click();
 await page.getByRole('button',{name:'Añadir acompañante',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.id==='booking-contact-first-name',{},{polling:100,timeout:2000});
 await page.waitForFunction(()=>{const r=document.querySelector('#booking-contact-first-name')?.getBoundingClientRect();return r&&r.top>=0&&r.bottom<innerHeight;},{},{polling:100,timeout:3000});
 await page.locator('#booking-contact-first-name').fill('Primer');await page.locator('#booking-contact-last-name').fill('Invitado');
 await page.getByRole('button',{name:/Corte sintético/}).click();
 await page.locator('.public-booking-time-block:not(:disabled)').first().waitFor().catch(async e=>{throw new Error(e.message+'\n'+await page.locator('body').innerText());});
 const changedServices=page.waitForResponse(r=>r.url().includes('/agenda/horarios')&&r.url().includes('aaaaaaaa'));
 await page.getByRole('button',{name:/Barba sintética/}).click();await changedServices;
 await page.getByRole('button',{name:/Barba sintética/}).click();
 await page.locator('.public-booking-time-block:not(:disabled)').first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Promociones',exact:true}).count(),0);
 const tab=page.getByRole('button',{name:'Servicios',exact:true});
 assert.equal(await tab.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(201, 169, 110)');
 assert.ok((await tab.boundingBox()).height>=44);
 const agendaEvidence=path.join(process.env.TEMP,'mf118-evidence');await mkdir(agendaEvidence,{recursive:true});await page.screenshot({path:path.join(agendaEvidence,engine.name()+'-'+width+'-agenda.png'),fullPage:true});
 const firstDate=new URLSearchParams(session.calls.filter(c=>c.path.endsWith('/horarios')).at(-1).query).get('fecha');
 assert.ok(firstDate);
 await page.locator('.public-booking-time-block:not(:disabled)').first().click();
 await page.getByRole('button',{name:'Añadir acompañante',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.id==='booking-contact-first-name',{},{polling:100,timeout:2000});
 await page.locator('#booking-contact-first-name').fill('Segundo');await page.locator('#booking-contact-last-name').fill('Invitado');
 await page.getByRole('button',{name:/Corte sintético/}).click();
 await page.locator('.public-booking-time-block:not(:disabled)').first().waitFor();
 assert.equal(new URLSearchParams(session.calls.filter(c=>c.path.endsWith('/horarios')).at(-1).query).get('fecha'),firstDate);
 await page.locator('.public-booking-active-barber-select').selectOption('88888888-8888-4888-8888-888888888888');
 await page.locator('.public-booking-time-block:not(:disabled)').first().waitFor();
 await page.getByRole('button',{name:'Eliminar Segundo Invitado',exact:true}).click();
 await page.getByRole('button',{name:'Añadir acompañante',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.id==='booking-contact-first-name',{},{polling:100,timeout:2000});
 await page.locator('#booking-contact-first-name').fill('Recreado');await page.locator('#booking-contact-last-name').fill('Invitado');
 await page.getByRole('button',{name:/Corte sintético/}).click();await page.locator('.public-booking-time-block:not(:disabled)').first().click();
 await page.getByRole('button',{name:'Continuar a resumen',exact:true}).click();await page.getByRole('heading',{name:'Resumen de cita',exact:true}).waitFor();
 const detail=page.locator('.citas-confirm-service-item');assert.equal(await detail.count(),3);
 assert.match(await detail.nth(0).innerText(),/Cubierto por tu plan/);assert.doesNotMatch(await detail.nth(1).innerText(),/Cubierto por tu plan/);assert.doesNotMatch(await detail.nth(2).innerText(),/Cubierto por tu plan/);
 assert.equal(await page.getByText('Cubierto completamente por tu plan.',{exact:true}).count(),0);
 assert.match((await page.getByText('Total a pagar',{exact:true}).locator('..').innerText()).replace(/\s/g,''),/600\.00/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const evidence=path.join(process.env.TEMP,'mf118-evidence');await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,engine.name()+'-'+width+'.png'),fullPage:true});
 assert.deepEqual(session.errors,[]);
 }finally{await browser.close();}
});
