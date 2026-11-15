import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
// AM: App compilada y navegador reales; solo APIs sinteticas y reloj controlado.
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4204';
const evidence=path.join(process.env.TEMP||process.cwd(),'mf-prod04-notice');
for(const width of [390,1440])for(const theme of ['dark','light'])test(`Comunicado equivalente ${width} ${theme}`,{timeout:40000},async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
  await context.addInitScript(t=>localStorage.setItem('mf_theme_variant',t),theme);
  const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url());
   if(!u.pathname.startsWith('/v1/'))return u.origin===base?route.continue():route.fulfill({status:204});
   if(r.method()!=='GET')writes.push(r.method()+' '+u.pathname);
   await route.fulfill({json:{ok:true,data:{sucursales:[]}}});
  });
  await page.clock.install({time:new Date('2026-11-16T23:59:50-06:00')});
  await page.goto(base+'/');
  const notice=page.getByRole('status',{name:'Comunicado temporal sobre el agendamiento en MasterFade'});
  await notice.waitFor();assert.ok(await notice.getByText(/no es atribuible a MasterFade/).isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const close=page.getByRole('button',{name:'Cerrar comunicado'});await close.focus();await page.keyboard.press('Enter');
  await notice.waitFor({state:'detached'});await page.reload();assert.equal(await notice.count(),0);
  await page.evaluate(()=>sessionStorage.clear());await page.reload();await notice.waitFor();
  await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,`${width}-${theme}.png`)});
  await page.clock.fastForward(11000);await notice.waitFor({state:'detached'});
  await page.reload();assert.equal(await notice.count(),0);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 }finally{await browser.close();}
});
