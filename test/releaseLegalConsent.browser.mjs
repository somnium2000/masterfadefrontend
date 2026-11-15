import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

// AM: Chromium contra build local; OAuth/API sinteticos, sin identidades ni consentimientos reales.
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4211';
const evidence=process.env.MASTERFADE_LEGAL_EVIDENCE||path.join(process.env.TEMP||process.cwd(),'mf-release11-legal-evidence');
for(const width of [390,1440])for(const theme of ['light','dark'])test(`Release11 ${width} ${theme}: landing, OAuth y pausas sin aceptar por lectura`,{timeout:60000},async()=>{
 const browser=await chromium.launch(process.env.MASTERFADE_CHROMIUM_CHANNEL?{channel:process.env.MASTERFADE_CHROMIUM_CHANNEL}:{});
 try{
  const context=await browser.newContext({viewport:{width,height:900}}),writes=[],errors=[];
  await context.addInitScript(value=>{if(location.protocol.startsWith('http'))localStorage.setItem('mf_theme_variant',value);},theme);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.fulfill({status:200,contentType:'text/css',body:''});
   assert.equal(url.origin,new URL(base).origin,'Ninguna red externa');
   if(!url.pathname.startsWith('/v1/'))return route.continue();
   if(request.method()!=='GET'){
    assert.equal(url.pathname,'/v1/auth/social/confirm');const payload=request.postDataJSON();writes.push(payload);
    assert.equal(payload.acepta_terminos,undefined);assert.equal(payload.consentimiento_marketing,undefined);
    return route.fulfill({status:409,json:{ok:false,error:{code:'AUTH_SOCIAL_CONSENT_REQUIRED',message:'Confirma tus decisiones para completar el registro.'}}});
   }
   const data=url.pathname==='/v1/auth/me'?{user:null,roles:[]}:url.pathname==='/v1/commerce/eligibility'?{booking:false,vipPurchase:false,pixelpaySale:false}:[];
   return route.fulfill({json:{ok:true,data}});
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('409'))errors.push(m.text());});
  await page.goto(base+'/');
  const close=page.getByRole('button',{name:'Cerrar comunicado',exact:true});if(await close.isVisible())await close.click();
  await page.getByRole('link',{name:'Términos y condiciones',exact:true}).click();
  await page.getByRole('heading',{name:'Términos y condiciones',level:1}).waitFor();assert.equal(await page.getByRole('article').count(),8);
  assert.equal(writes.length,0);
  await page.goto(base+'/');
  const reserve=page.getByRole('button',{name:'Reservas pausadas',exact:true});
  assert.ok(await reserve.count()>0);for(const button of await reserve.all())assert.equal(await button.isDisabled(),true);
  await page.goto(base+'/auth/callback?social_confirm_token=synthetic-legal-review');
  await page.getByText('COMPLETAR REGISTRO',{exact:true}).waitFor();
  const terms=page.getByRole('checkbox',{name:'Acepto los términos y condiciones para crear mi cuenta.',exact:true}),marketing=page.getByRole('checkbox',{name:'Acepto recibir comunicaciones comerciales.',exact:true});
  assert.equal(await terms.isChecked(),false);assert.equal(await marketing.isChecked(),false);assert.equal(writes.length,1);
  for(const name of ['Términos y condiciones','Política de privacidad']){
   const [reading]=await Promise.all([context.waitForEvent('page'),page.getByRole('link',{name,exact:true}).click()]);
   await reading.getByRole('heading',{name:'Términos y condiciones',level:1}).waitFor();assert.equal(await reading.evaluate(()=>opener===null),true);await reading.close();
   assert.equal(await terms.isChecked(),false);assert.equal(await marketing.isChecked(),false);assert.equal(writes.length,1);
  }
  await page.getByRole('button',{name:'Completar registro',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Debes aceptar los terminos'}).waitFor();assert.equal(writes.length,1);
  await terms.focus();await page.keyboard.press('Space');assert.equal(await terms.isChecked(),true);assert.equal(await marketing.isChecked(),false);assert.equal(writes.length,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,`oauth-${width}-${theme}.png`),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
