import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const engines=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4189';
const active=['en_espera','pendiente_pago','confirmada','en_salon','en_atencion'],past=['completada','cancelada','cancelada_por_cliente','expirada','no_show','anulada'];
for(const engine of ['chromium','webkit'])for(const width of [390,768,1440])for(const theme of ['light','dark'])test(`${engine} ${width} ${theme}: paginación Cliente independiente`,{skip:!existsSync(engines[engine].executablePath()),timeout:45000},async()=>{
 const browser=await engines[engine].launch();let inspected;try{
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'}),page=await context.newPage(),errors=[],writes=[],queries=[];
  await page.addInitScript(theme=>localStorage.setItem('mf_theme_variant',theme),theme);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  inspected=page;page.setDefaultTimeout(10000);let historyCount=41;
  const rows=[...Array.from({length:56},(_,i)=>({id_cita:'p'+(i+1),nombre_sucursal:'Próxima '+(i+1),estado_cita_codigo:active[i%5],inicio_at:'2020-11-15T14:00:00Z'})),...Array.from({length:41},(_,i)=>({id_cita:'h'+(i+1),nombre_sucursal:'Histórica '+(i+1),estado_cita_codigo:past[i%6],inicio_at:'2026-11-15T14:00:00Z'}))].map(r=>({...r,nombre_barbero:'Barbero fixture',servicios:[],total_pagar_hnl:0}));
  await page.route('**/v1/**',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,q=url.searchParams;let data={};
   if(request.method()!=='GET'&&p!=='/v1/auth/session/touch')writes.push(p);
   if(p==='/v1/auth/me')data={user:{id_usuario:'fixture',nombres:'Cliente fixture'},roles:['cliente'],cliente_id:'fixture'};
   if(p==='/v1/commerce/eligibility')data={booking:false,vipPurchase:false};
   if(p==='/v1/citas'){
    queries.push(Object.fromEntries(q));if(!q.get('apartado'))data={citas:rows};else{
     const section=q.get('apartado'),source=section==='proximas'?rows.slice(0,56).reverse():rows.slice(56,56+historyCount).reverse(),total=source.length,total_pages=Math.max(1,Math.ceil(total/5)),n=Math.min(Number(q.get('page')||1),total_pages);
     data={citas:source.slice((n-1)*5,n*5),totals:{proximas:56,historial:historyCount,total:56+historyCount,pendientes_pago:11},pagination:{apartado:section,page:n,limit:5,total,total_pages,has_next:n<total_pages,has_prev:n>1}};
    }
   }
   if(p==='/v1/citas/pendiente')data={pendiente:null};
   if(/^\/v1\/citas\/[ph]\d+$/.test(p))data={cita:rows.find(r=>p.endsWith('/'+r.id_cita)),detalles:[]};
   await route.fulfill({json:{ok:true,data}});
  });
  const ready=async text=>{await page.getByText(text,{exact:true}).waitFor();await page.locator('.client-cita-card').filter({visible:true}).first().waitFor();};
  const cards=()=>page.locator('.client-cita-card').filter({visible:true});
  const next=async text=>{await page.getByRole('button',{name:'Siguiente',exact:true}).click();await ready(text);};
  await page.goto(base+'/home/cliente/citas');await ready('Página 1 de 12');assert.equal(await cards().count(),5);
  assert.equal(await page.getByRole('button',{name:'Nueva cita'}).isDisabled(),true);
  await next('Página 2 de 12');await next('Página 3 de 12');assert.equal(await cards().count(),5);
  await page.getByRole('button',{name:'Historial (41)'}).click();await ready('Página 1 de 9');await next('Página 2 de 9');
  await page.getByRole('button',{name:'Próximas (56)'}).click();await ready('Página 3 de 12');
  await page.getByRole('button',{name:'Anterior',exact:true}).click();await ready('Página 2 de 12');assert.equal(await cards().count(),5);
  await page.getByRole('button',{name:/Ver detalle completo de la cita en Próxima 51 del/}).click();const d=page.getByRole('dialog');await d.getByText(/Estado: En espera/).waitFor();
  assert.doesNotMatch(await d.innerText(),/en_espera|pendiente_pago|en_atencion/);await d.getByRole('button',{name:'Cerrar',exact:true}).first().click();await d.waitFor({state:'detached'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const evidence=path.join(process.env.TEMP,'mf-client-citas-pagination-evidence');await mkdir(evidence,{recursive:true});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(evidence,`${engine}-${width}-${theme}.png`),fullPage:true});
  historyCount=1;await page.getByRole('button',{name:'Historial (41)'}).click();await ready('Página 1 de 1');assert.equal(await cards().count(),1);
  assert.equal(await page.getByRole('button',{name:'Historial (1)'}).isVisible(),true);assert.equal(await page.getByRole('button',{name:'Siguiente',exact:true}).isDisabled(),true);
  assert.ok(queries.some(q=>q.apartado==='historial'&&q.page==='2'));assert.ok(queries.some(q=>q.apartado==='proximas'&&q.page==='3'));
  assert.ok(queries.filter(q=>q.apartado).every(q=>q.limit==='5'));assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }catch(error){if(inspected)error.message+='\nBotones: '+JSON.stringify(await inspected.getByRole('button').allTextContents())+'\nContenido: '+(await inspected.locator('body').innerText()).slice(-2000);throw error;}finally{await browser.close();}
});
