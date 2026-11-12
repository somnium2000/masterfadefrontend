import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4189';
const labels=[['en_espera','En espera'],['pendiente_pago','Pendiente de pago'],['confirmada','Confirmada'],['en_salon','En salón'],['en_atencion','En atención'],['completada','Completada'],['cancelada','Cancelada'],['cancelada_por_cliente','Cancelada por el cliente'],['expirada','Expirada'],['no_show','No asistió'],['anulada','Anulada']];
const A='11111111-1111-4111-8111-111111111111',BARBER='22222222-2222-4222-8222-222222222222';
for(const width of [390,1440])for(const theme of ['light','dark'])for(const role of ['cliente','barbero','admin','super_admin'])test(`${role} ${width} ${theme}: estados legibles, filtros y detalle`,{timeout:60000},async()=>{
 const browser=await chromium.launch();try{
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'}),page=await context.newPage(),errors=[],writes=[],queries=[];
  await page.addInitScript(({theme})=>{localStorage.setItem('mf_theme_variant',theme);localStorage.setItem('mf-view-agendamiento-historial','table');},{theme});
  await page.clock.setFixedTime(new Date('2026-11-12T18:00:00Z'));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const rows=labels.map(([code],i)=>({id_cita:'fixture-'+i,id_grupo_cita:'44444444-4444-4444-8444-444444444444',estado_cita_codigo:code,nombre_cliente:'Persona '+(i+1),alias_integrante:'Persona '+(i+1),nombre_sucursal:'Sucursal fixture '+(i+1),nombre_barbero:'Barbero fixture',id_sucursal:A,id_empleado_barbero:BARBER,inicio_at:role==='barbero'?'2026-11-12T14:00:00Z':'2026-11-15T14:00:00Z',total_pagar_hnl:0,servicios:[]}));
  await page.route('**/v1/**',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,q=url.searchParams;let data={};
   if(request.method()!=='GET'&&p!=='/v1/auth/session/touch')writes.push(p);
   if(p==='/v1/auth/me')data={user:{id_usuario:'fixture',nombres:'Persona fixture',empleado_id:BARBER},roles:[role],empleado_id:BARBER,cliente_id:'fixture',branch_ids:[A]};
   if(p.endsWith('/operativas/contexto'))data={sucursales:[{id_sucursal:A,nombre_sucursal:'Sucursal fixture'}],barberos:[],estados:labels.map(([estado_cita_codigo])=>({estado_cita_codigo,descripcion:estado_cita_codigo}))};
   if(p.endsWith('/citas/historial')){queries.push(Object.fromEntries(q));const filtered=q.get('estado')?rows.filter(r=>r.estado_cita_codigo===q.get('estado')):rows;const n=Number(q.get('page')||1),limit=Number(q.get('limit')||9);data={citas:filtered.slice((n-1)*limit,n*limit),pagination:{page:n,limit,total:filtered.length,total_pages:Math.ceil(filtered.length/limit),has_next:n*limit<filtered.length,has_prev:n>1}};}
   if(p==='/v1/citas'){
    if(!q.get('apartado'))data={citas:rows};else{const source=q.get('apartado')==='historial'?rows.slice(5):rows.slice(0,5),n=Number(q.get('page')||1);data={citas:source.slice((n-1)*5,n*5),totals:{proximas:5,historial:6,total:11,pendientes_pago:1},pagination:{page:n,limit:5,total:source.length,total_pages:Math.ceil(source.length/5),has_next:n*5<source.length,has_prev:n>1}};}
   }
   if(p==='/v1/citas/pendiente')data={pendiente:null};
   if(p.startsWith('/v1/citas/fixture-'))data={cita:rows.find(r=>p.endsWith('/'+r.id_cita)),detalles:[]};
   if(p.endsWith('/operativas'))data={citas:rows.slice(0,5)};
   if(p.endsWith('/operativas/completadas-hoy'))data={citas:[rows[5]]};
   if(p.endsWith('/reservas/buscar'))data={reservas:[{id_grupo_cita:rows[0].id_grupo_cita,codigo_reserva:'ABCDE',citas:rows}]};
   if(p.endsWith('/operativas/events'))return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(p==='/v1/admin/reportes/contexto')data={sucursales:[{id_sucursal:A,nombre_sucursal:'Sucursal fixture'}],barberos:[{id_empleado:BARBER,id_sucursal:A,nombre_barbero:'Barbero fixture'}],rango_default:{fechaDesde:'2026-11-01',fechaHasta:'2026-11-12'}};
   if(p==='/v1/admin/reportes/dashboard')data={validacion_datos:{barberos_scope:1,citas_en_rango:10,detalles_en_rango:7},productividad_barberos:{resumen:[{id_empleado:BARBER,nombre_barbero:'Barbero fixture',servicios_realizados:7,no_show:3}]}};
   await route.fulfill({json:{ok:true,data}});
  });
  const visible=text=>page.getByText(text,{exact:true}).filter({visible:true}).first();
  const close=async()=>{const d=page.getByRole('dialog');await d.getByRole('button',{name:'Cerrar',exact:true}).first().click();await d.waitFor({state:'detached'});};
  const evidence=path.join(process.env.TEMP,'mf-readable-states-evidence');await mkdir(evidence,{recursive:true});
  const shot=async suffix=>{await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:path.join(evidence,`${role}-${width}-${theme}${suffix}.png`),fullPage:true});};
  if(role==='cliente'){
   await page.goto(base+'/home/cliente/citas');await page.getByRole('button',{name:'Próximas (5)',exact:true}).waitFor();
   for(const [,label]of labels.slice(0,5))await visible(label).waitFor();
   await page.getByRole('button',{name:'Historial (6)',exact:true}).click();
   for(const [,label]of labels.slice(5,10))await visible(label).waitFor();
   await shot('');await visible('Sucursal fixture 8').click();await page.getByRole('dialog').getByText(/Estado: Cancelada por el cliente/).waitFor();await close();await page.getByRole('button',{name:'Siguiente',exact:true}).click();await visible('Anulada').waitFor();
  }else if(role==='barbero'){
   await page.goto(base+'/home/barbero');for(const [,label]of labels.slice(0,5))await visible(label).waitFor();await shot('');
  }else{
   const root=role==='admin'?'/home/admin':'/home/super';await page.goto(base+root+'/citas/historial');
   for(const [,label]of labels.slice(0,9))await visible(label).waitFor();
   await page.getByRole('button',{name:'Siguiente',exact:true}).filter({visible:true}).click();await visible('No asistió').waitFor();await visible('Anulada').waitFor();
   await page.getByRole('button',{name:/^Filtros/}).filter({visible:true}).click();
   const select=page.getByRole('dialog').locator('select').filter({has:page.locator('option[value="no_show"]')});
   for(const [code,label]of labels)assert.equal(await select.locator(`option[value="${code}"]`).innerText(),label);
   await select.selectOption('cancelada_por_cliente');await close();await visible('Cancelada por el cliente').waitFor();
   assert.ok(queries.some(q=>q.estado==='cancelada_por_cliente'));
   await page.getByRole('button',{name:'Ver detalle',exact:true}).filter({visible:true}).click();await page.getByRole('dialog').getByText('Cancelada por el cliente',{exact:true}).waitFor();await close();await shot('');
   await page.goto(base+root+'/citas');await page.getByRole('button',{name:'Buscar reserva',exact:true}).filter({visible:true}).click();
   await page.getByLabel('Código de reserva').fill('ABCDE');await page.getByRole('dialog').getByRole('button',{name:'Buscar',exact:true}).click();
   for(const [,label]of labels)await page.getByRole('dialog').getByText('Sin servicios registrados · '+label,{exact:true}).waitFor();await close();
   if(role==='super_admin'){
    await page.goto(base+root+'/reportes/barberos');await page.getByRole('button',{name:'Filtros',exact:true}).filter({visible:true}).click();
    const d=page.getByRole('dialog');await d.locator('input[type="date"]').nth(0).fill('2026-11-01');await d.locator('input[type="date"]').nth(1).fill('2026-11-12');await d.locator('select').filter({has:page.locator(`option[value="${BARBER}"]`)}).selectOption(BARBER);
    await d.getByRole('button',{name:'Aplicar filtros'}).click();await d.waitFor({state:'detached'});await visible('Inasistencias de clientes').waitFor();await shot('-reportes');
   }
  }
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  assert.doesNotMatch(await page.locator('body').innerText(),/no[-_ ]show|inacistencias|en_salon|en_atencion|pendiente_pago|cancelada_por_cliente/i);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 }finally{await browser.close();}
});
