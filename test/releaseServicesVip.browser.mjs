import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// AM: Router/build reales; solo catalogos sinteticos y ninguna mutacion comercial.
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4202';
const evidence=path.join(process.env.TEMP||process.cwd(),'mf-prod-lote01-evidence','vip');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
for(const width of [366,390,768,1440])for(const theme of ['dark','light'])test(`VIP ${width} ${theme}`,{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
  await context.addInitScript(t=>localStorage.setItem('mf_theme_variant',t),theme);
  const page=await context.newPage(),errors=[],writes=[];let count=1,fail=false;
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/503|Failed to load resource/.test(m.text()))errors.push(m.text());});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),endpoint=u.pathname;
   if(!endpoint.startsWith('/v1/'))return u.origin===base?route.continue():route.fulfill({status:204});
   if(req.method()!=='GET')writes.push(req.method()+' '+endpoint);
   let data={};const branch=u.searchParams.get('id_sucursal'),name=branch===B?'Norte':'Centro';
   if(endpoint.endsWith('/sucursales'))data={sucursales:[{id_sucursal:A,nombre_sucursal:'Centro'},{id_sucursal:B,nombre_sucursal:'Norte'}]};
   if(endpoint.endsWith('/servicios'))data={servicios:[{id_servicio:'corte',nombre_servicio:'Corte '+name,agendable:true,precio_hnl:150,duracion_min:30}]};
   if(endpoint.endsWith('/paquetes'))data={paquetes:[]};
   if(endpoint.endsWith('/planes')){
    if(fail)return route.fulfill({status:503,json:{ok:false,error:{message:'fixture unavailable'}}});
    data={planes:Array.from({length:count},(_,i)=>({id_plan:'plan'+i,id_plan_sucursal:'offer'+i,id_sucursal:branch,nombre_plan:`VIP ${name} ${i+1}`,categoria_nivel:2,precio_hnl:950,periodo_membresia_label:'Mensual',descripcion:'Informacion completa',beneficios:Array.from({length:6},(_,j)=>({nombre:'Beneficio de nombre largo para cuidado y asesoria profesional '+(j+1),cantidad:j+1}))}))};
   }
   await route.fulfill({json:{ok:true,data}});
  });
  await mkdir(evidence,{recursive:true});
  for(count of [1,2,3,5]){
   await page.goto(base+'/servicios');
   const notice=page.getByRole('button',{name:'Cerrar comunicado'});if(await notice.isVisible())await notice.click();
   const vip=page.getByRole('region',{name:'Membresías VIP',exact:true}),track=page.getByRole('region',{name:'Planes de membresías VIP'});
   await vip.getByRole('article').first().waitFor();assert.equal(await vip.getByRole('article').count(),count);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await track.evaluate(n=>getComputedStyle(n).scrollbarWidth),'none');
   const w=await vip.getByRole('article').first().evaluate(n=>n.getBoundingClientRect().width);assert.ok(w<=(width>=640&&width<1024?361:321));
   assert.equal(await vip.getByRole('button',{name:/comprar|adquirir|agendar/i}).count(),0);
   if(count===5){
    const next=vip.getByRole('button',{name:'Membresía VIP siguiente'});await next.waitFor();
    await next.click();await page.waitForFunction(()=>document.querySelector('#services-vip-plans').scrollLeft>0);
    await track.evaluate(n=>n.scrollTo({left:0,behavior:'instant'}));
    await track.focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('#services-vip-plans').scrollLeft>0);
    if(width<600){
     await track.evaluate(n=>n.scrollTo({left:0,behavior:'instant'}));
     await page.waitForTimeout(250);
     await track.scrollIntoViewIfNeeded();
     const cdp=await context.newCDPSession(page),box=await track.boundingBox();
     const y=(Math.max(100,box.y)+Math.min(780,box.y+box.height))/2;
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width-20,y}]});
     for(let i=1;i<=6;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width-20-(box.width-40)*i/6,y}]});
      await page.waitForTimeout(30);
     }
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await page.waitForFunction(()=>document.querySelector('#services-vip-plans').scrollLeft>0);
     await cdp.detach();
    }
   }
   await track.evaluate(n=>n.scrollTo({left:0,behavior:'instant'}));
   await page.getByText('Corte Centro',{exact:true}).scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>[...document.querySelectorAll('article[data-catalog-card]')].every(n=>Number(getComputedStyle(n).opacity)>0.99));
   await page.screenshot({path:path.join(evidence,`${width}-${theme}-${count}.png`),fullPage:true});
  }
  const detail=page.getByRole('button',{name:'Ver detalle de VIP Centro 1',exact:true});await detail.click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByRole('listitem').count(),6);
  assert.ok(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1));await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Norte',exact:true}).click();await page.getByRole('heading',{name:'VIP Norte 1',exact:true}).waitFor();
  await page.getByRole('link',{name:'Ver membresías VIP',exact:true}).click();await page.waitForURL('**/membresias-vip');
  fail=true;await page.goto(base+'/servicios');await page.getByText('No se pudieron cargar las membresías VIP de esta sucursal.').waitFor();await page.getByText('Corte Centro',{exact:true}).waitFor();
  fail=false;count=0;await page.getByRole('button',{name:'Reintentar',exact:true}).click();await page.getByText('No hay membresías VIP disponibles en esta sucursal.').waitFor();
  await page.getByRole('navigation').getByRole('button',{name:'Agendar',exact:true}).click();
  await page.getByRole('heading',{name:'Reservas temporalmente pausadas',exact:true}).waitFor();
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
