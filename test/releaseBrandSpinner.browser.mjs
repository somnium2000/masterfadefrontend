import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// AM: Build real con APIs sinteticas; no llama servicios productivos.
const {chromium}=createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MASTERFADE_BROWSER_URL||'http://127.0.0.1:4201';
const evidence=path.join(process.env.TEMP||process.cwd(),'mf-prod-lote01-evidence','brand');
for(const width of [390,1440])for(const theme of ['dark','light'])test(`Marca ${width} ${theme}`,{timeout:45000},async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
  await context.addInitScript(t=>localStorage.setItem('mf_theme_variant',t),theme);
  const page=await context.newPage(),errors=[],retired=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
  page.on('request',r=>{if(/favicon-mf\.png|mf-logo\.png|mf-logo-circle\.svg/.test(r.url()))retired.push(r.url());});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(!url.pathname.startsWith('/v1/'))return url.origin===base?route.continue():route.fulfill({status:204});
   if(req.method()!=='GET')writes.push(req.method()+' '+url.pathname);
   if(url.pathname.endsWith('/sucursales'))await new Promise(resolve=>setTimeout(resolve,1800));
   await route.fulfill({json:{ok:true,data:{sucursales:[],barberos:[]}}});
  });
  await page.clock.install({time:new Date('2026-11-16T23:59:58-06:00')});
  await page.goto(base+'/');
  const notice=page.getByRole('status',{name:'Comunicado temporal sobre el agendamiento en MasterFade'});
  await notice.waitFor();
  await page.clock.fastForward(3000);
  await notice.waitFor({state:'detached'});
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'/masterfade-icon.jpeg');
  assert.equal((await page.request.get(base+'/masterfade-icon.jpeg')).status(),200);
  await page.goto(base+'/barberos');
  const spinner=page.getByRole('status').filter({hasText:'Cargando...'});
  await spinner.waitFor();
  assert.equal(await spinner.locator('img').count(),0);
  await mkdir(evidence,{recursive:true});
  await page.screenshot({path:path.join(evidence,`${width}-${theme}-spinner.png`),fullPage:true});
  await page.goto(base+'/login');
  await page.getByRole('heading',{name:/iniciar sesi[oó]n/i}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(evidence,`${width}-${theme}-login.png`),fullPage:true});
  assert.deepEqual(retired,[]);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
