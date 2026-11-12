import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const engines=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4189';
const active=['en_espera','pendiente_pago','confirmada','en_salon','en_atencion'],history=['completada','cancelada','cancelada_por_cliente','expirada','no_show','anulada'];
for(const engine of ['chromium','webkit'])for(const width of [320,390,768,1024,1440])for(const theme of ['dark','light'])test(`${engine} ${width} ${theme}: cuatro áreas, contraste y detalle accesible`,{skip:!existsSync(engines[engine].executablePath()),timeout:40000},async()=>{
 const browser=await engines[engine].launch();try{
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'}),page=await context.newPage(),errors=[],writes=[],details=[];
  page.setDefaultTimeout(10000);await page.addInitScript(t=>localStorage.setItem('mf_theme_variant',t),theme);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const types=[['pago_normal','Pago normal'],['membresia','Membresía'],['cortesia_acompanantes','Cortesía + acompañantes'],['cortesia','Cortesía']];
  const rows=[...active,...history].map((state,i)=>({id_cita:'fixture-'+i,estado_cita_codigo:state,
   nombre_sucursal:i===1?'MasterFade Plaza de las Américas · Boulevard Juan Pablo II':i===3?'MasterFade '+('SucursalCentro'.repeat(6)):'MasterFade · Boulevard Suyapa '+(i+1),
   nombre_barbero:i===1?'Fernando Alejandro Miranda · Especialista en cortes y barba':'Fernando Miranda',inicio_at:'2026-11-16T05:30:00Z',total_pagar_hnl:i%2?1250.5:0,
   tipo_cita_visual:types[i%4][0],tipo_cita_label:types[i%4][1],servicios:i%2?[]:[{nombre_servicio:'Corte cabello'},{nombre_servicio:'Barba'}]}));
  await page.route('**/v1/**',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname,q=url.searchParams;let data={};
   if(request.method()!=='GET'&&p!=='/v1/auth/session/touch')writes.push(p);
   if(p==='/v1/auth/me')data={user:{id_usuario:'fixture',nombres:'Cliente fixture'},roles:['cliente'],cliente_id:'fixture'};
   if(p==='/v1/commerce/eligibility')data={booking:false,vipPurchase:false};
   if(p==='/v1/citas'){
    if(!q.get('apartado'))data={citas:rows};else{const source=q.get('apartado')==='historial'?rows.slice(5):rows.slice(0,5),n=Number(q.get('page')||1);data={citas:source.slice((n-1)*5,n*5),totals:{proximas:5,historial:6,total:11,pendientes_pago:1},pagination:{apartado:q.get('apartado'),page:n,limit:5,total:source.length,total_pages:Math.ceil(source.length/5),has_next:n*5<source.length,has_prev:n>1}};}
   }
   if(p==='/v1/citas/pendiente')data={pendiente:null};
   if(p.startsWith('/v1/citas/fixture-')){details.push(p);data={cita:rows.find(r=>p.endsWith('/'+r.id_cita)),detalles:[]};}
   await route.fulfill({json:{ok:true,data}});
  });
  const cards=page.locator('.client-cita-card');
  const ready=async text=>{await page.getByText(text,{exact:true}).waitFor();await cards.first().waitFor();};
  const layout=async()=>{
   const result=await cards.evaluateAll(nodes=>{
    const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
    const luminance=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};
    return nodes.map(n=>({bounds:rect(n),areas:[...n.children].map(rect),button:rect(n.querySelector('button')),
     overflow:[n,...n.querySelectorAll('*')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>el.className),
     nested:n.querySelectorAll('button button').length,
     ratios:[...n.querySelectorAll('.client-cita-card__badge')].map(el=>{const s=getComputedStyle(el),a=luminance(s.color),b=luminance(s.backgroundColor);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);})}));
   });
   for(const card of result){assert.equal(card.areas.length,4);for(let i=1;i<4;i++)assert.ok(card.areas[i].top>=card.areas[i-1].bottom-1);assert.ok(card.button.height>=44);assert.deepEqual(card.overflow,[]);assert.equal(card.nested,0);assert.ok(card.ratios.every(r=>r>=4.5),JSON.stringify(card.ratios));}
   const grid=page.locator('.client-citas-grid'),gridWidth=await grid.evaluate(n=>n.getBoundingClientRect().width),columns=await grid.evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);
   assert.equal(columns,gridWidth>=800?2:1);if(columns===2)assert.ok(Math.abs(result[0].bounds.height-result[1].bounds.height)<1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  };
  await page.goto(base+'/home/cliente/citas');await ready('Página 1 de 1');assert.equal(await cards.count(),5);assert.deepEqual(details,[]);
  await cards.first().getByText('L 0.00',{exact:true}).waitFor();await cards.nth(1).getByText('L 1250.50',{exact:true}).waitFor();
  assert.match(await cards.first().innerText(),/15 nov.*11:30|15 nov.*23:30/i);assert.doesNotMatch(await cards.first().innerText(),/Gratis|Pagado|Pago recibido/i);
  await layout();const evidence=path.join(process.env.TEMP,'mf-client-citas-cards-evidence');await mkdir(evidence,{recursive:true});
  await page.screenshot({path:path.join(evidence,`${engine}-${width}-${theme}-proximas.png`),fullPage:true});await cards.nth(1).screenshot({path:path.join(evidence,`${engine}-${width}-${theme}-long.png`)});
  for(const [index,method]of [[0,'click'],[1,'Enter'],[2,'Space']]){
   const action=cards.nth(index).getByRole('button',{name:/Ver detalle completo/});
   if(method==='click')await action.click();else{await action.focus();await page.keyboard.press(method);}
   const d=page.getByRole('dialog');await d.getByText('Sucursal:',{exact:true}).waitFor();assert.ok((await d.innerText()).includes(rows[index].nombre_sucursal));
   await d.getByRole('button',{name:'Cerrar',exact:true}).first().click();await d.waitFor({state:'detached'});
   await page.waitForFunction(n=>n===document.activeElement,await action.elementHandle(),{timeout:1000});
  }
  assert.deepEqual(details,rows.slice(0,3).map(r=>'/v1/citas/'+r.id_cita));
  await page.getByRole('button',{name:'Historial (6)'}).click();await ready('Página 1 de 2');assert.equal(await cards.count(),5);
  await cards.nth(2).getByText('Cancelada por el cliente',{exact:true}).waitFor();await cards.last().getByText('No asistió',{exact:true}).waitFor();await layout();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(evidence,`${engine}-${width}-${theme}-historial.png`),fullPage:true});
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();await ready('Página 2 de 2');assert.equal(await cards.count(),1);await cards.getByText('Anulada',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Próximas (5)'}).click();await ready('Página 1 de 1');await page.getByRole('button',{name:'Historial (6)'}).click();await ready('Página 2 de 2');
  assert.equal(await page.getByRole('button',{name:'Nueva cita'}).isDisabled(),true);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
