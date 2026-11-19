import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import { test } from 'node:test';

// AM: node --test contra vite preview; Playwright puede instalarse fuera del repositorio.
const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MASTERFADE_BROWSER_URL || 'http://127.0.0.1:4187';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const row=(id,state='confirmada',start='2026-11-12T16:00:00Z',barber=A)=>({id_cita:id,nombre_cliente:id,alias_integrante:id,id_empleado_barbero:barber,estado_cita_codigo:state,inicio_at:start,servicios:[]});
const active=['confirmada','en_salon','en_atencion'].map(state=>row(state,state));
const excluded=['confirmada','en_salon','en_atencion','completada'].flatMap(state=>[
  row('AYER-'+state,state,'2026-11-12T05:59:59.999Z'),
  row('MANANA-'+state,state,'2026-11-13T06:00:00Z'),
  row('OTRO-'+state,state,'2026-11-12T16:00:00Z',B),
]);

for(const width of [390,1440]) test('Chromium '+width+': jornada, contadores, medianoche y Agendamiento', {timeout:60000}, async()=>{
  const browser=await chromium.launch();
  try{
    const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'});
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    const errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.clock.install({time:new Date('2026-11-12T18:00:00Z')});
    await page.clock.pauseAt(new Date('2026-11-13T05:59:59Z'));
    await page.route('**/v1/**',async route=>{
      const url=new URL(route.request().url()),path=url.pathname;
      requests.push({path,day:url.searchParams.get('fecha_desde'),zone:url.searchParams.get('zona_horaria')});
      let data={};
      if(path==='/v1/auth/me')data={user:{id_usuario:'U',nombres:'Fixture'},roles:['barbero','admin'],empleado_id:A,branch_ids:['S']};
      if(path.endsWith('/operativas/contexto'))data={sucursales:[{id_sucursal:'S',nombre_sucursal:'Sucursal'}],barberos:[{id_empleado:A,id_sucursal:'S',nombre_completo:'Fixture'}]};
      if(path.endsWith('/operativas'))data={citas:url.searchParams.get('fecha_desde')==='2026-11-13'
        ? [row('NEW','confirmada','2026-11-13T16:00:00Z')]
        : [...active,...active,...excluded,row('DONE','confirmada')]};
      if(path.endsWith('/completadas-hoy'))data={citas:url.searchParams.get('fecha_desde')==='2026-11-13'
        ? [row('NEW-DONE','completada','2026-11-13T17:00:00Z')]
        : [row('DONE','completada'),row('DONE','completada'),...excluded]};
      if(path.endsWith('/operativas/events'))return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
      await route.fulfill({json:{ok:true,data}});
    });
    await page.goto(base+'/home/barbero');
    await page.clock.runFor(500);
    await page.getByText('Citas Totales',{exact:true}).filter({visible:true}).first().waitFor();
    const values=()=>page.evaluate(()=>['Citas Totales','Citas Completadas','Citas Restantes'].map(label=>{
      const node=[...document.querySelectorAll('p')].find(item=>item.textContent===label && item.getClientRects().length);
      return Number(node.parentElement.lastElementChild.textContent);
    }));
    assert.deepEqual(await values(),[4,1,3]);
    assert.equal(await page.getByText(/AYER-|MANANA-|OTRO-/).count(),0);
    for(const path of ['/operativas','/operativas/completadas-hoy']){
      const request=requests.find(item=>item.path.endsWith(path));
      assert.equal(request.zone,'America/Tegucigalpa');assert.equal(request.day,'2026-11-12');
    }
    await page.clock.runFor(1200);
    await page.getByText('Fecha 2026-11-13',{exact:true}).filter({visible:true}).first().waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('p')].find(node=>node.textContent==='Citas Restantes' && node.getClientRects().length)?.parentElement.lastElementChild.textContent==='1');
    assert.deepEqual(await values(),[2,1,1]);
    assert.ok(requests.some(item=>item.path.endsWith('/operativas')&&item.day==='2026-11-13'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    await context.close();
    // AM: Audita las rutas reales Admin/Super sin cambiar el código ya corregido.
    for(const role of ['admin','super_admin']){
      const admin=await browser.newContext({viewport:{width,height:900}});
      const tab=await admin.newPage();
      tab.on('pageerror',error=>errors.push(error.message));
      tab.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      await tab.clock.setFixedTime(new Date('2026-11-12T18:00:00Z'));
      await tab.route('**/v1/**',async route=>{
        const path=new URL(route.request().url()).pathname;
        let data={};
        if(path==='/v1/auth/me')data={user:{id_usuario:'U'},roles:[role],branch_ids:['S']};
        if(path.endsWith('/operativas/contexto'))data={sucursales:[{id_sucursal:'S',nombre_sucursal:'Sucursal'}],barberos:[]};
        if(path.endsWith('/operativas'))data={citas:[...active,...excluded]};
        if(path.endsWith('/operativas/events'))return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
        await route.fulfill({json:{ok:true,data}});
      });
      await tab.goto(base+(role==='admin'?'/home/admin/citas':'/home/super/citas'));
      await tab.getByText('confirmada',{exact:true}).filter({visible:true}).first().waitFor();
      for(const state of ['confirmada','en_salon','en_atencion']){
        if(width===390)await tab.getByRole('button',{name:state==='confirmada'?/Confirmadas/:state==='en_salon'?/En salón/:/En atención/}).click();
        await tab.getByText(state,{exact:true}).filter({visible:true}).first().waitFor();
        assert.equal(await tab.getByText(/AYER-|MANANA-/).count(),0);
      }
      assert.ok(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(errors,[]);
      await admin.close();
    }
  }finally{await browser.close();}
});
