import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4189';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const subscription=(id,branch,name)=>({id_suscripcion:id,id_sucursal_contratada:branch,sucursal_nombre:branch===A?'Centro':'Norte',nombre_plan:name,estado_visible:'activa',inicio_at:'2030-01-01T06:00:00Z',fin_at:'2030-12-31T06:00:00Z',tiempo_restante:{dias:25,horas:3},remanentes:{totales:{servicios_restantes:6,servicios_total:8,cortesias_restantes:2,cortesias_total:4},servicios:[{nombre:'Corte',total:8,restante:6}],cortesias:[{nombre:'Lavado',total:4,restante:2}]}});
for(const width of [390,768,1440])for(const theme of ['light','dark'])test('Chromium '+width+' '+theme+': planes y 41 consumos',{timeout:45000},async()=>{
 const browser=await chromium.launch();try{
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'});await context.addInitScript(value=>localStorage.setItem('mf_theme_variant',value),theme);
  const page=await context.newPage(),errors=[],writes=[],requests=[];let count=41,fail=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!(m.location().url.includes('/planes/consumos')&&m.text().includes('503')))errors.push(m.text());});
  await page.route('**/v1/**',async route=>{
   const r=route.request(),url=new URL(r.url()),p=url.pathname;let data={};
   if(r.method()!=='GET'&&p!=='/v1/auth/session/touch'){writes.push(p);return route.fulfill({status:400,json:{ok:false}});}
   if(p==='/v1/auth/me')data={user:{id_usuario:'fixture',nombres:'Cliente sintético'},roles:['cliente'],cliente_id:'C'};
   if(p.endsWith('/catalog/sucursales'))data={sucursales:[{id_sucursal:A,nombre_sucursal:'Centro'},{id_sucursal:B,nombre_sucursal:'Norte'}]};
   if(p.endsWith('/planes/estado'))data={estado_plan:'activa',planes_activos:[subscription(A,A,'VIP Centro'),subscription(B,B,'VIP Norte')],historial_consumos:[],masterpuntos:{titular:9,integrante:9}};
   if(p.endsWith('/planes/consumos')){
    requests.push(url.search);assert.equal(url.searchParams.get('limit'),'5');if(fail){fail=false;return route.fulfill({status:503,json:{ok:false,error:{message:'Prueba controlada'}}});}
    const total=url.searchParams.get('id_suscripcion')?count===0?0:1:count, pages=Math.max(1,Math.ceil(total/5)),current=Math.min(Number(url.searchParams.get('page')||1),pages);
    data={consumos:Array.from({length:Math.min(5,Math.max(0,total-(current-1)*5))},(_,i)=>({id_consumo:String((current-1)*5+i),item_tipo:'servicio',item_nombre:'Consumo '+((current-1)*5+i),cantidad:1,nombre_plan:'VIP Centro',nombre_sucursal:'Centro',created_at:'2030-01-01T16:00:00Z'})),pagination:{page:current,total,total_pages:pages,limit:5}};
   }
   await route.fulfill({json:{ok:true,data}});
  });
  await page.goto(base+'/home/cliente/planes');const area=page.getByRole('region',{name:'Últimos consumos del plan'});await area.getByText('Página 1 de 9 · 41 consumos').waitFor();
  for(const name of ['VIP Centro','VIP Norte'])assert.equal(await page.getByRole('heading',{name,exact:true}).count(),1);
  assert.equal(await page.getByText(/Titular:|Integrantes:|Cobertura: Operativo/).count(),0);
  const all=[];for(let i=1;i<=9;i++){
   await area.getByText('Página '+i+' de 9 · 41 consumos',{exact:true}).waitFor();const items=await area.getByRole('listitem').allTextContents();assert.ok(items.length<=5);all.push(...items.map(t=>t.match(/Consumo \d+/)[0]));
   if(i<9)await area.getByRole('button',{name:'Siguiente',exact:true}).click();
  }
  assert.equal(new Set(all).size,41);assert.equal(await area.getByRole('button',{name:'Siguiente'}).isDisabled(),true);
  await page.getByLabel('Plan consultado').selectOption(B);await area.getByText('Página 1 de 1 · 1 consumos').waitFor();assert.ok(requests.at(-1).includes('page=1'));assert.ok(requests.at(-1).includes('id_suscripcion='+B));
  count=0;await area.getByRole('button',{name:'Actualizar consumos'}).click();await area.getByText('No hay consumos del plan para mostrar.').waitFor();
  fail=true;await area.getByRole('button',{name:'Actualizar consumos'}).click();await area.getByRole('alert').waitFor();assert.equal(await area.getByText('No hay consumos del plan para mostrar.').count(),0);
  await area.getByRole('button',{name:'Reintentar consumos'}).click();await area.getByText('Página 1 de 1 · 0 consumos').waitFor();
  const button=page.getByRole('button',{name:'Información',exact:true});assert.ok((await button.boundingBox()).height>=44);await button.click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Entendido'}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  const evidence=path.join(process.env.TEMP,'mf-planes-evidence');await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,width+'-'+theme+'.png'),fullPage:true});
 }finally{await browser.close();}
});
