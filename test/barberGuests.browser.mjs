import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4189';
const BRANCH='11111111-1111-4111-8111-111111111111',BARBER='22222222-2222-4222-8222-222222222222',OTHER='33333333-3333-4333-8333-333333333333',GROUP='44444444-4444-4444-8444-444444444444';
const row=(id,name,start,barber=BARBER)=>({id_cita:id,id_grupo_cita:GROUP,id_sucursal:BRANCH,id_empleado_barbero:barber,estado_cita_codigo:'confirmada',inicio_at:start,alias_integrante:name,nombre_cliente:name,id_persona_cliente:id==='T'?'registered-person':null,nombre_barbero:'Barbero fixture',nombre_sucursal:'Sucursal fixture',servicios_detalle:[{nombre_servicio:'Corte reservado'}],servicios:[],duracion_total_min:30});
const appointments=[row('T','Titular registrado','2030-06-15T14:00:00Z'),row('G1','Invitado sin cuenta','2030-06-15T15:00:00Z'),row('G2','Segundo invitado','2030-06-15T16:00:00Z',OTHER)];
for(const width of [390,1440])for(const role of ['barbero','admin','super_admin'])test(role+' '+width+': invitados en calendario/operativas y Buscar reserva',{timeout:30000},async()=>{
 const browser=await chromium.launch();try{
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'});const page=await context.newPage(),errors=[],queries=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.clock.setFixedTime(new Date('2030-06-15T16:10:00Z'));
  await page.route('**/v1/**',async route=>{
   const r=route.request(),url=new URL(r.url()),p=url.pathname;let data={};
   if(r.method()!=='GET'&&p!=='/v1/auth/session/touch')writes.push(p);
   if(p==='/v1/auth/me')data={user:{id_usuario:'fixture',empleado_id:BARBER},roles:[role],empleado_id:BARBER,branch_ids:[BRANCH]};
   if(p.endsWith('/operativas/contexto'))data={sucursales:[{id_sucursal:BRANCH,nombre_sucursal:'Sucursal fixture'}],barberos:[]};
   if(p.endsWith('/operativas')){queries.push(url.searchParams);data={citas:role==='barbero'?appointments.slice(0,2):appointments};}
   if(p.endsWith('/reservas/buscar'))data={reservas:[{id_grupo_cita:GROUP,codigo_reserva:'ABCDE',citas:appointments}]};
   if(p.endsWith('/operativas/events'))return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   await route.fulfill({json:{ok:true,data}});
  });
  await page.goto(base+(role==='barbero'?'/home/barbero/citas':role==='admin'?'/home/admin/citas':'/home/super/citas'));
  for(const name of ['Titular registrado','Invitado sin cuenta'])await page.getByText(name,{exact:true}).filter({visible:true}).first().waitFor();
  assert.ok(queries.length);assert.equal(queries[0].get('zona_horaria'),'America/Tegucigalpa');
  if(role==='barbero'){
   assert.equal(queries[0].get('fecha_desde'),'2030-06-01');assert.equal(queries[0].get('fecha_hasta'),'2030-06-30');assert.equal(await page.getByText('Segundo invitado',{exact:true}).count(),0);
  }else{
   await page.getByText('Segundo invitado',{exact:true}).filter({visible:true}).first().waitFor();
   await page.getByRole('button',{name:'Buscar reserva',exact:true}).click();await page.getByLabel('Código de reserva').fill('ABCDE');await page.getByRole('button',{name:'Buscar',exact:true}).click();
   const dialog=page.getByRole('dialog');for(const name of ['Invitado sin cuenta','Segundo invitado'])await dialog.getByText(name,{exact:true}).first().waitFor();
   await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();await dialog.waitFor({state:'detached'});
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  const evidence=path.join(process.env.TEMP,'mf-barber-guests-evidence');await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,role+'-'+width+'.png'),fullPage:true});
 }finally{await browser.close();}
});
