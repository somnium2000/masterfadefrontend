import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import process from 'node:process';
import {test} from 'node:test';

// AM: App compilada y router reales; APIs sinteticas, sin compras, cancelaciones ni trafico remoto.
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4193';
const before=process.env.MASTERFADE_PLANES_BASELINE==='true';
const evidence=path.join(process.env.TEMP||process.cwd(),'mf-cliente-planes-ux05',before?'before':'after');
const USER='11111111-1111-4111-8111-111111111111',CLIENT='22222222-2222-4222-8222-222222222222';
const BRANCH='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444';
const OLD='55555555-5555-4555-8555-555555555555',ACTIVE='66666666-6666-4666-8666-666666666666';
const branchName='MasterFade Boulevard Suyapa — Sucursal de nombre extenso';
const subscription=(active=false)=>({id_suscripcion:active?ACTIVE:OLD,id_plan:active?'new':'old',nombre_plan:active?'MASTER ELITE actual':'MASTER EXPERIENCIA anterior',estado_visible:active?'activa':'cancelada',estado_suscripcion_codigo:active?'activa':'cancelada',id_sucursal_contratada:BRANCH,sucursal_nombre:branchName,inicio_at:active?'2030-04-01T06:00:00Z':'2030-01-01T06:00:00Z',fin_at:active?'2030-05-01T06:00:00Z':'2030-02-01T06:00:00Z',tiempo_restante:{dias:20,horas:2},remanentes:{totales:{servicios_restantes:4,servicios_total:6,cortesias_restantes:2,cortesias_total:3},servicios:[{nombre:'Corte de cabello premium',restante:4,total:6}],cortesias:[{nombre:'Lavado y peinado',restante:2,total:3}]}});
const groups=Array.from({length:6},(_,index)=>({key:'cita:'+index,id_cita:'70000000-0000-4000-8000-'+String(index).padStart(12,'0'),tipo:'cita',inicio_at:`2030-03-${String(20-index).padStart(2,'0')}T05:30:00Z`,created_at:`2030-03-${String(20-index).padStart(2,'0')}T05:40:00Z`,id_sucursal:BRANCH,nombre_sucursal:branchName,planes:[{id_suscripcion:OLD,nombre_plan:'MASTER EXPERIENCIA anterior'}],consumos:['Corte de cabello premium','Diseño de barba y contornos prolongados','Lavado y peinado de cortesía'].map((name,i)=>({id_consumo:`${index}-${i}`,id_cita:'70000000-0000-4000-8000-'+String(index).padStart(12,'0'),id_suscripcion:OLD,nombre_plan:'MASTER EXPERIENCIA anterior',item_nombre:name,item_tipo:i===2?'cortesia':'servicio',cantidad:i===2?2:1,nombre_sucursal:branchName,inicio_at:`2030-03-${String(20-index).padStart(2,'0')}T05:30:00Z`,created_at:`2030-03-${String(20-index).padStart(2,'0')}T05:40:00Z`}))}));
for(let i=0;i<2;i++)groups.push({key:'consumo:legacy-'+i,id_cita:null,tipo:'sin_cita',inicio_at:null,created_at:'2030-01-15T18:00:00Z',id_sucursal:BRANCH,nombre_sucursal:branchName,planes:[{id_suscripcion:OLD,nombre_plan:'MASTER EXPERIENCIA anterior'}],consumos:[{id_consumo:'legacy-'+i,id_cita:null,id_suscripcion:OLD,nombre_plan:'MASTER EXPERIENCIA anterior',item_tipo:'servicio',item_nombre:'Beneficio histórico '+(i+1),cantidad:1,nombre_sucursal:branchName,created_at:'2030-01-15T18:00:00Z'}]});
const plans=[{id_plan:'99999999-9999-4999-8999-999999999999',id_plan_sucursal:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id_sucursal:BRANCH,nombre_plan:'MASTER ELITE disponible',precio_hnl:650,periodo_membresia_codigo:'mensual',categoria_nivel:3,descripcion:'Cobertura y beneficios reales de la oferta sintética.',beneficios:[{tipo:'servicio',nombre:'Corte premium',cantidad:4},{tipo:'cortesia',nombre:'Lavado y peinado',cantidad:2}]}];
async function setup(browser,{width,theme,active=false,allowCancel=false}){
 const context=await browser.newContext({viewport:{width,height:width<600?844:900},isMobile:width<600,hasTouch:width<600,timezoneId:'Asia/Tokyo'});
 await context.addInitScript(({theme,branch})=>{localStorage.setItem('mf_theme_variant',theme);localStorage.setItem('mf_cliente_catalog_sucursal',branch);},{theme,branch:BRANCH});
 const calls=[],errors=[];let fail=false,empty=false,delay=0,canceledCurrent=false;
 const historical=()=>[subscription(false),...(canceledCurrent?[{...subscription(true),estado_visible:'cancelada',estado_suscripcion_codigo:'cancelada'}]:[])];
 const state=()=>({estado_plan:active?'activa':'cancelada',planes_activos:active?[subscription(true)]:[],plan_activo:active?subscription(true):null,ultimo_plan:canceledCurrent?historical()[1]:subscription(false),historial_membresias:historical(),membresias:historical(),historial_consumos:[]});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),endpoint=url.pathname;
  if(!endpoint.startsWith('/v1/')){if(url.origin===base)return route.continue();return route.fulfill({status:200,body:''});}
  calls.push({method:request.method(),path:endpoint,query:url.search});
  if(allowCancel&&request.method()==='PATCH'&&endpoint===`/v1/cliente/planes/${ACTIVE}/cancelar`){active=false;canceledCurrent=true;return route.fulfill({json:{ok:true,data:{cancelada:true}}});}
  if(request.method()!=='GET'&&!['/v1/auth/session/touch','/v1/auth/csrf'].includes(endpoint))throw new Error('Mutacion inesperada: '+endpoint);
  let data={};
  if(endpoint==='/v1/auth/me')data={user:{id_usuario:USER,nombres:'Cliente',apellidos:'Sintético',email:'fixture@example.test'},roles:['cliente'],cliente_id:CLIENT};
  else if(endpoint==='/v1/auth/csrf')data={csrf_token:'synthetic'};
  else if(endpoint==='/v1/commerce/eligibility')data={booking:false,vipPurchase:false};
  else if(endpoint==='/v1/cliente/me')data={id_cliente:CLIENT,id_usuario:USER,nombres:'Cliente',apellidos:'Sintético',perfil_completo:true,id_sucursal_preferida:BRANCH};
  else if(endpoint==='/v1/cliente/puntos/resumen')data={saldo_total:0,historial:[]};
  else if(endpoint==='/v1/public/catalog/sucursales')data={sucursales:[{id_sucursal:BRANCH,nombre_sucursal:branchName},{id_sucursal:OTHER,nombre_sucursal:'MasterFade Centro'}]};
  else if(endpoint==='/v1/public/catalog/planes')data={planes:url.searchParams.get('id_sucursal')===OTHER?[]:plans};
  else if(endpoint==='/v1/cliente/planes/estado')data=state();
  else if(endpoint==='/v1/cliente/planes/consumos'){
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   if(fail)return route.fulfill({status:503,json:{ok:false,error:{code:'FIXTURE_UNAVAILABLE',message:'Error privado que no debe mostrarse'}}});
   const page=Number(url.searchParams.get('page')||1),all=empty?[]:groups,total=all.length,current=Math.min(page,Math.max(1,Math.ceil(total/5)));
   if(url.searchParams.get('agrupar_por')==='cita')data={citas:all.slice((current-1)*5,current*5),membresias:[...(active?[subscription(true)]:[]),...historical()],pagination:{page:current,limit:5,total,total_pages:Math.max(1,Math.ceil(total/5)),has_previous:current>1,has_next:current<Math.ceil(total/5)},total_consumos:empty?0:20};
   else {const items=all.flatMap(group=>group.consumos),n=items.length;data={consumos:items.slice((page-1)*5,page*5),pagination:{page,limit:5,total:n,total_pages:Math.max(1,Math.ceil(n/5))}};}
  }
  return route.fulfill({json:{ok:true,data}});
 });
 const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error'&&!/503|Failed to load resource/.test(message.text()))errors.push(message.text());});
 return {page,context,calls,errors,setFail:value=>{fail=value;},setEmpty:value=>{empty=value;},setDelay:value=>{delay=value;}};
}
for(const width of [320,393,1440])for(const theme of ['dark','light'])for(const active of [false,true])test(`Planes UX05 ${before?'antes':'despues'} ${width} ${theme} activa=${active}`,{timeout:60000},async()=>{
 const browser=await chromium.launch({channel:process.env.MASTERFADE_CHROMIUM_CHANNEL||'chrome'});
 try{
  const session=await setup(browser,{width,theme,active}),{page}=session;
  await page.goto(base+'/home/cliente/planes');
  await page.getByText(/Página 1 de/).waitFor();
  if(before){await page.locator('select').filter({has:page.locator('option[value="'+BRANCH+'"]')}).first().selectOption(BRANCH);await page.getByRole('heading',{name:'MASTER ELITE disponible',exact:true}).waitFor();}
  else{
   if(!active)await page.getByRole('heading',{name:'Sin membresía activa',exact:true}).waitFor();
   else await page.getByRole('heading',{name:'MASTER ELITE actual',exact:true}).waitFor();
   const catalog=page.getByRole('heading',{name:'Planes por sucursal',exact:true});
   const history=page.getByRole('heading',{name:'Historial de consumos',exact:true});
   await catalog.waitFor();await history.waitFor();
   assert.ok(await catalog.evaluate((node)=>{const history=[...document.querySelectorAll('h1,h2,h3')].find(n=>n.textContent==='Historial de consumos');return Boolean(node.compareDocumentPosition(history)&Node.DOCUMENT_POSITION_FOLLOWING);}));
   await page.getByRole('heading',{name:'MASTER ELITE disponible',exact:true}).waitFor();
   assert.equal(session.calls.some(call=>call.path.endsWith('/consumos')&&new URLSearchParams(call.query).get('agrupar_por')==='cita'),true);
   const area=page.getByRole('region',{name:'Historial de consumos'});
   const cards=area.locator('[data-consumption-key]');assert.equal(await cards.count(),5);
   assert.match(await cards.nth(0).getByRole('heading').innerText(),/19.*mar.*2030.*11:30/);
   for(let i=0;i<5;i++){assert.equal(await cards.nth(i).getByText('Corte de cabello premium',{exact:true}).count(),1);assert.equal(await cards.nth(i).getByText('Diseño de barba y contornos prolongados',{exact:true}).count(),1);assert.equal(await cards.nth(i).getByText('Lavado y peinado de cortesía',{exact:true}).count(),1);}
   const firstKeys=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.consumptionKey));
   await area.getByRole('button',{name:'Siguiente',exact:true}).click();await area.getByText(/Página 2 de 2/).waitFor();assert.equal(await cards.count(),3);
   const secondKeys=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.consumptionKey));assert.equal(new Set([...firstKeys,...secondKeys]).size,8);
   assert.equal(await area.getByText('Beneficio histórico 1',{exact:true}).count(),1);assert.equal(await area.getByText('Beneficio histórico 2',{exact:true}).count(),1);
   await area.getByRole('button',{name:'Anterior',exact:true}).click();await area.getByText(/Página 1 de 2/).waitFor();
   const memberships=page.getByRole('heading',{name:'Historial de membresías',exact:true});await memberships.waitFor();
   const disclosure=memberships.locator('..');await disclosure.focus();await page.keyboard.press('Enter');
   await page.locator('details[open]').getByRole('heading',{name:'MASTER EXPERIENCIA anterior',exact:true}).waitFor();
   await disclosure.click();
   const explore=page.getByRole('button',{name:'Explorar planes',exact:true});await explore.focus();assert.equal(await explore.evaluate(node=>node===document.activeElement),true);await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>document.activeElement?.id),'plans-catalog-title');
   const paused=page.getByRole('button',{name:/Pr[oó]ximamente|Pausad|disponible pr[oó]ximamente/}).first();assert.equal(await paused.count(),1);assert.equal(await paused.isDisabled(),true);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sin overflow horizontal');
  await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,`${width}-${theme}-${active?'active':'cancelled'}.png`),fullPage:true});
  assert.deepEqual(session.errors,[]);assert.equal(session.calls.filter(call=>!['GET'].includes(call.method)&&!call.path.startsWith('/v1/auth/')).length,0);
  await session.context.close();
 }finally{await browser.close();}
});

if(!before)for(const theme of ['dark','light'])test(`Planes UX05 estados, reintento y cancelacion sintetica ${theme}`,{timeout:60000},async()=>{
 const browser=await chromium.launch({channel:process.env.MASTERFADE_CHROMIUM_CHANNEL||'chrome'});
 try{
  const session=await setup(browser,{width:393,theme,active:true,allowCancel:true}),{page}=session;
  session.setDelay(600);await page.goto(base+'/home/cliente/planes');await page.getByText('Cargando consumos...',{exact:true}).waitFor();
  const area=page.getByRole('region',{name:'Historial de consumos'});await area.getByText(/Página 1 de/).waitFor();session.setDelay(0);
  session.setFail(true);await area.getByRole('button',{name:'Actualizar consumos',exact:true}).click();await area.getByRole('alert').waitFor();
  assert.equal(await area.getByText('Error privado que no debe mostrarse',{exact:true}).count(),0);
  await page.screenshot({path:path.join(evidence,'393-'+theme+'-consumptions-error.png'),fullPage:true});
  session.setFail(false);await area.getByRole('button',{name:'Reintentar consumos',exact:true}).click();await area.getByText(/Página 1 de/).waitFor();
  session.setEmpty(true);await area.getByRole('button',{name:'Actualizar consumos',exact:true}).click();await area.getByText(/No hay consumos/).waitFor();
  assert.equal(await area.locator('[data-consumption-key]').count(),0);
  await page.screenshot({path:path.join(evidence,'393-'+theme+'-consumptions-empty.png'),fullPage:true});
  session.setEmpty(false);await area.getByRole('button',{name:'Actualizar consumos',exact:true}).click();await area.getByText(/Página 1 de/).waitFor();
  const branchSelect=page.getByLabel('Sucursal',{exact:true});await branchSelect.selectOption(OTHER);
  await page.getByText('No hay planes publicados para la sucursal seleccionada.',{exact:true}).waitFor();
  await branchSelect.selectOption(BRANCH);await page.getByRole('heading',{name:'MASTER ELITE disponible',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('mf_cliente_catalog_sucursal')),BRANCH);
  await page.getByRole('button',{name:'Cancelar plan',exact:true}).click();await page.getByRole('dialog').waitFor();
  assert.equal(session.calls.filter(call=>call.method==='PATCH').length,0);
  await page.getByRole('button',{name:'Si, cancelar plan',exact:true}).click();await page.getByRole('heading',{name:'Sin membresía activa',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Planes por sucursal',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Historial de membresías',exact:true}).waitFor();
  await page.getByText('MASTER EXPERIENCIA anterior',{exact:true}).first().waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(session.errors,[]);
  await session.context.close();
 }finally{await browser.close();}
});
