import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4189';
const A='11111111-1111-4111-8111-111111111111',B='99999999-9999-4999-8999-999999999999',BARBER='22222222-2222-4222-8222-222222222222',OTHER='33333333-3333-4333-8333-333333333333';
const row=(id,name,start,branch=A,barber=BARBER)=>({id_cita:id,id_grupo_cita:'44444444-4444-4444-8444-444444444444',id_sucursal:branch,id_empleado_barbero:barber,estado_cita_codigo:'confirmada',inicio_at:start,alias_integrante:name,nombre_cliente:name,id_persona_cliente:id==='G'?null:'fixture',nombre_barbero:'Barbero fixture',nombre_sucursal:'Sucursal fixture',servicios_detalle:[{nombre_servicio:'Corte reservado'}],servicios:[],duracion_total_min:30});
const appointments=[row('H','Cita de hoy','2026-11-12T14:00:00Z'),row('T','Titular futuro','2026-11-15T14:00:00Z'),row('G','Invitado futuro','2026-11-15T15:00:00Z'),row('N','Día siguiente','2026-11-16T14:00:00Z'),row('B','Otra sucursal','2026-11-15T16:00:00Z',B,OTHER)];
for(const width of [390,1440])for(const role of ['admin','super_admin'])test(role+' '+width+': Hoy, fechas futuras, rango, filtros y retorno',{timeout:40000},async()=>{
 const browser=await chromium.launch();try{
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'});
  const page=await context.newPage(),errors=[],queries=[],writes=[];
  await page.addInitScript(({branch})=>localStorage.setItem('masterfade.admin.agendamiento.selectedSucursalId',branch),{branch:A});
  await page.clock.setFixedTime(new Date('2026-11-12T18:00:00Z'));
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/v1/**',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;let data={};
   if(request.method()!=='GET'&&p!=='/v1/auth/session/touch')writes.push(p);
   if(p==='/v1/auth/me')data={user:{id_usuario:'fixture'},roles:[role],branch_ids:[A,B]};
   if(p.endsWith('/operativas/contexto'))data={sucursales:[{id_sucursal:A,nombre_sucursal:'Sucursal A'},{id_sucursal:B,nombre_sucursal:'Sucursal B'}],barberos:[{id_empleado:BARBER,nombre_completo:'Barbero A'},{id_empleado:OTHER,nombre_completo:'Barbero B'}]};
   if(p.endsWith('/operativas')){
    const q=url.searchParams;queries.push(Object.fromEntries(q));
    const citas=appointments.filter(c=>{
     const day=new Date(new Date(c.inicio_at).getTime()-6*3600000).toISOString().slice(0,10);
     return day>=q.get('fecha_desde')&&day<=q.get('fecha_hasta')&&c.id_sucursal===q.get('id_sucursal')&&(!q.get('id_empleado_barbero')||q.get('id_empleado_barbero')===c.id_empleado_barbero);
    });
    data={citas,pagination:{page:1,limit:400,total:citas.length,total_pages:1,has_next:false}};
   }
   if(p.endsWith('/operativas/events'))return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   await route.fulfill({json:{ok:true,data}});
  });
  const visible=name=>page.getByText(name,{exact:true}).filter({visible:true}).first();
  const filters=async()=>{await page.getByRole('button',{name:/^Filtros/}).click();};
  const queryDates=async(desde,hasta)=>{await filters();await page.getByLabel('Desde',{exact:true}).fill(desde);await page.getByLabel('Hasta',{exact:true}).fill(hasta);await page.getByRole('button',{name:'Consultar fechas'}).click();await page.getByRole('dialog').waitFor({state:'detached'});};
  await page.goto(base+(role==='admin'?'/home/admin/citas':'/home/super/citas'));
  await visible('Cita de hoy').waitFor();assert.equal(await page.getByText('Titular futuro',{exact:true}).count(),0);await visible('Hoy — Honduras').waitFor();
  await queryDates('2026-11-15','2026-11-15');await visible('Titular futuro').waitFor();await visible('Invitado futuro').waitFor();await visible('Modo consulta — Honduras').waitFor();
  assert.equal(queries.at(-1).zona_horaria,'America/Tegucigalpa');assert.equal(queries.at(-1).fecha_desde,'2026-11-15');
  for(const button of await page.getByRole('button',{name:'Registrar llegada'}).all())assert.equal(await button.isDisabled(),true);
  const card=page.locator('article').filter({has:page.getByText('Invitado futuro',{exact:true})}).filter({visible:true}).first();
  await card.locator('summary').click();assert.equal(await card.getByRole('button',{name:'Reagendación de emergencia'}).isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});for(const node of document.querySelectorAll('.overflow-y-auto'))node.scrollTo({top:0,left:0,behavior:'instant'});});
  const evidence=path.join(process.env.TEMP,'mf-agenda-dates-evidence');await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,role+'-'+width+'.png'),fullPage:true});
  await queryDates('2026-11-15','2026-11-16');await visible('Día siguiente').waitFor();
  assert.ok(await page.getByText(/16\/11\/2026/).filter({visible:true}).count());
  await filters();await page.getByLabel('Desde',{exact:true}).fill('2026-11-17');await page.getByRole('button',{name:'Consultar fechas'}).click();
  await page.getByRole('alert').getByText('Hasta debe ser igual o posterior a Desde.').waitFor();
  assert.ok(queries.every(q=>q.fecha_desde<=q.fecha_hasta));
  await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).first().click();await page.getByRole('dialog').waitFor({state:'detached'});
  await page.locator('#operational-branch').filter({visible:true}).selectOption(B);await visible('Otra sucursal').waitFor();
  await filters();await page.getByLabel('Barbero',{exact:true}).selectOption(OTHER);await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).first().click();await page.getByRole('dialog').waitFor({state:'detached'});
  const refreshed=page.waitForResponse(response=>response.url().includes('/operativas?')&&response.url().includes(OTHER));await page.getByRole('button',{name:'Actualizar',exact:true}).click();await refreshed;await visible('Otra sucursal').waitFor();
  assert.equal(queries.at(-1).id_empleado_barbero,OTHER);assert.equal(queries.at(-1).fecha_hasta,'2026-11-16');
  const todayResponse=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname.endsWith('/operativas')&&url.searchParams.get('fecha_desde')==='2026-11-12'&&url.searchParams.get('id_sucursal')===B&&url.searchParams.get('id_empleado_barbero')===OTHER;});
  await page.getByRole('button',{name:'Volver a hoy'}).click();await todayResponse;await visible('Hoy — Honduras').waitFor();
  await page.locator('header[aria-label="Herramientas de citas"]').filter({visible:true}).getByText('0 cita(s)',{exact:true}).waitFor();
  assert.equal(await page.getByText('Otra sucursal',{exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 }finally{await browser.close();}
});
