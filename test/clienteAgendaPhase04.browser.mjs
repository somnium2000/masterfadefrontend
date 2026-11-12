import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import process from 'node:process';
const engines=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4187';
const active=['en_espera','pendiente_pago','confirmada','en_salon','en_atencion'],history=['completada','cancelada','cancelada_por_cliente','expirada','no_show','anulada'];
for(const engine of ['chromium','webkit'])for(const width of [390,1440])test(engine+' '+width+': clasificación real Cliente y detalle HN',{skip:!existsSync(engines[engine].executablePath()),timeout:45000},async()=>{
 const browser=await engines[engine].launch();
 try{
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const rows=[...active,...history].map((state,i)=>({id_cita:state,estado_cita_codigo:state,nombre_sucursal:'Reserva '+state,nombre_barbero:'Barbero Fixture',inicio_at:i%2?'2040-11-13T05:30:00Z':'2020-11-13T05:30:00Z',total_pagar_hnl:0,servicios:[]}));
  await page.route('**/v1/**',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,q=url.searchParams;let data={};if(request.method()!=='GET'&&p!=='/v1/auth/session/touch')writes.push(p);
   if(p==='/v1/auth/me')data={user:{id_usuario:'A',nombres:'Cliente Fixture'},roles:['cliente'],cliente_id:'A'};
   if(p==='/v1/citas'){if(!q.get('apartado'))data={citas:[...rows,...rows]};else{const source=q.get('apartado')==='historial'?rows.slice(5):rows.slice(0,5),n=Number(q.get('page')||1);data={citas:source.slice((n-1)*5,n*5),totals:{proximas:5,historial:6,total:11,pendientes_pago:1},pagination:{page:n,limit:5,total:source.length,total_pages:Math.ceil(source.length/5),has_next:n*5<source.length,has_prev:n>1}};}}
   if(p==='/v1/citas/pendiente')data={pendiente:null};
   if(p.startsWith('/v1/citas/')&&!p.endsWith('/pendiente'))data={cita:rows.find(r=>p.endsWith('/'+r.id_cita)),detalles:[]};
   await route.fulfill({json:{ok:true,data}});
  });
  await page.goto(base+'/home/cliente/citas');await page.getByRole('button',{name:'Próximas (5)',exact:true}).waitFor();
  for(const s of active){await page.getByText('Reserva '+s,{exact:true}).filter({visible:true}).waitFor();assert.equal(await page.getByText('Reserva '+s,{exact:true}).filter({visible:true}).count(),1);}
  for(const s of history)assert.equal(await page.getByText('Reserva '+s,{exact:true}).count(),0);
  await page.getByRole('button',{name:/Ver detalle completo de la cita en Reserva en_atencion del/}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText('Estado:',{exact:true}).waitFor();
  assert.match(await dialog.innerText(),/12 nov.*11:30|12 nov.*23:30/i);
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();await dialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Historial (6)',exact:true}).click();await page.getByText('Página 1 de 2',{exact:true}).waitFor();
  for(const s of history.slice(0,5)){await page.getByText('Reserva '+s,{exact:true}).filter({visible:true}).waitFor();assert.equal(await page.getByText('Reserva '+s,{exact:true}).filter({visible:true}).count(),1);}
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByText('Página 2 de 2',{exact:true}).waitFor();await page.getByText('Reserva anulada',{exact:true}).filter({visible:true}).waitFor();assert.equal(await page.getByText('Reserva anulada',{exact:true}).filter({visible:true}).count(),1);
  for(const s of active)assert.equal(await page.getByText('Reserva '+s,{exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  const evidence=path.join(tmpdir(),'mf-phase04-evidence');await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,engine+'-'+width+'.png'),fullPage:true});
 }finally{await browser.close();}
});
