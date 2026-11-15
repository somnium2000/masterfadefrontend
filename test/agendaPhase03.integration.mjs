import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import process from 'node:process';

// AM: Solo cluster efímero local; no lee .env ni usa conexiones QA. APIs/auth con fixtures sintéticos.
const ROOT=process.env.MASTERFADE_BACKEND_ROOT, BIN=process.env.MASTERFADE_PHASE03_PG_BIN;
assert.ok(ROOT && BIN, 'Indicar MASTERFADE_BACKEND_ROOT y MASTERFADE_PHASE03_PG_BIN para ejecutar SQL real aislado');
const requireBackend=createRequire(path.join(ROOT,'package.json'));
const {default:Fastify}=await import(pathToFileURL(requireBackend.resolve('fastify')));
const {default:cookie}=await import(pathToFileURL(requireBackend.resolve('@fastify/cookie')));
const {default:pg}=await import(pathToFileURL(requireBackend.resolve('pg')));
const {default:jwt}=await import(pathToFileURL(requireBackend.resolve('jsonwebtoken')));
const {default:auth}=await import(pathToFileURL(path.join(ROOT,'src/plugins/auth.js')));
const {default:routes}=await import(pathToFileURL(path.join(ROOT,'src/routes/v1/admin/citas.js')));
const BRANCH=randomUUID(), OTHER=randomUUID(), BARBER=randomUUID(), PERSON=randomUUID(), CPERSON=randomUUID(), SERVICE=randomUUID();
const code=id=>{let h=0;for(const c of id.toUpperCase())h=((h<<5)-h+c.charCodeAt(0))|0;return Math.abs(h).toString(36).toUpperCase().padStart(5,'0').slice(-5);};
const fixtureSchema = `
    CREATE TABLE citas(id_cita uuid PRIMARY KEY, id_grupo_cita uuid, id_sucursal uuid, id_empleado_barbero uuid,
      deleted_at timestamptz, estado_cita_codigo text, orden_integrante int, alias_integrante text,
      id_persona_cliente uuid, id_cliente uuid, inicio_at timestamptz, fin_at timestamptz,
      atencion_iniciada_at timestamptz, atencion_finalizada_at timestamptz,
      retraso_inicio_min int, duracion_total_min int, buffer_total_min int, selection_type text,
      id_paquete uuid, total_pagar_hnl numeric, moneda_codigo text, asignada_automaticamente boolean, notas text);
    CREATE TABLE sucursales(id_sucursal uuid,nombre_sucursal text,deleted_at timestamptz,estado boolean);
    CREATE TABLE personas(id_persona uuid,nombres text,apellidos text,telefono_principal text);
    CREATE TABLE empleados(id_empleado uuid,id_persona uuid);
    CREATE TABLE correos(id_correo uuid,id_persona uuid,direccion_correo text,deleted_at timestamptz,es_principal boolean,verificado boolean);
    CREATE TABLE citas_detalles(id_cita_detalle uuid,id_cita uuid,id_servicio uuid);
    CREATE TABLE servicios(id_servicio uuid,nombre_servicio text);
    CREATE TABLE citas_holds(id_cita uuid,estado_hold_codigo text,expires_at timestamptz,created_at timestamptz);
    CREATE TABLE payment_intents(id_cita uuid,estado_intent_codigo text,expires_at timestamptz,created_at timestamptz);
    CREATE TABLE citas_reagendaciones(id_cita uuid,id_lote_reagendacion uuid,id_cita_causante uuid,retraso_min int,tipo_reagendacion_codigo text,created_at timestamptz,id_reagendacion uuid);
  `;

test('FASE-03: emergencia y PostgreSQL NOTIFY → SSE → Chromium', {timeout:180000}, async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'mf-agenda-fase03-')),data=path.join(directory,'data');
 const binary=(name,args)=>{const r=spawnSync(path.join(BIN,name+(process.platform==='win32'?'.exe':'')),args,{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stderr||r.error?.message);};
 const free=createServer();await new Promise(r=>free.listen(0,'127.0.0.1',r));const port=free.address().port;await new Promise(r=>free.close(r));
 let started=false,pool,listenPool,app,bridge,browser;
 t.after(async()=>{
  if(browser)await browser.close();if(bridge){bridge.closeAllConnections();await new Promise(r=>bridge.close(r));}
  if(app)await app.close();if(listenPool)await listenPool.end();if(pool)await pool.end();
  if(started)binary('pg_ctl',['-D',data,'-m','fast','-w','stop']);
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('mf-agenda-fase03-'));await rm(directory,{recursive:true,force:true});
 });
 binary('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C','--no-sync']);
 binary('pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);started=true;
 const config={host:'127.0.0.1',port,user:'postgres',database:'postgres',max:6};pool=new pg.Pool(config);listenPool=new pg.Pool(config);
 t.diagnostic((await pool.query('select version()')).rows[0].version);
 await pool.query(fixtureSchema);
 await pool.query(`
 ALTER TABLE citas ADD COLUMN llegada_real_at timestamptz, ADD COLUMN no_show_at timestamptz, ADD COLUMN updated_at timestamptz;
 ALTER TABLE empleados ADD COLUMN id_sucursal uuid, ADD COLUMN estado boolean DEFAULT true, ADD COLUMN es_barbero boolean DEFAULT true, ADD COLUMN deleted_at timestamptz;
 ALTER TABLE personas ADD COLUMN foto_perfil_path text, ADD COLUMN foto_perfil_asset_id uuid;
 ALTER TABLE servicios ADD COLUMN activo boolean DEFAULT true, ADD COLUMN agendable boolean DEFAULT true, ADD COLUMN duracion_min int DEFAULT 30, ADD COLUMN buffer_min int DEFAULT 0, ADD COLUMN deleted_at timestamptz;
 ALTER TABLE citas_reagendaciones ADD COLUMN id_sucursal uuid, ADD COLUMN id_empleado_barbero_anterior uuid, ADD COLUMN id_empleado_barbero_nuevo uuid, ADD COLUMN inicio_at_anterior timestamptz, ADD COLUMN fin_at_anterior timestamptz, ADD COLUMN inicio_at_nuevo timestamptz, ADD COLUMN fin_at_nuevo timestamptz, ADD COLUMN motivo text, ADD COLUMN id_usuario_accion uuid;
 CREATE TABLE parametros_sistema(clave text,valor_numero numeric);
 CREATE TABLE servicios_tarifas(id_tarifa uuid,id_sucursal uuid,id_servicio uuid,id_empleado uuid,precio_hnl numeric,incluye_isv boolean,isv_porcentaje numeric,duracion_min int,buffer_min int,servicio_informativo boolean,deleted_at timestamptz,activo boolean,vigente_desde date,vigente_hasta date,updated_at timestamptz);
 CREATE TABLE barberos_perfiles_publicos(id_empleado uuid,alias_publico text,resumen_publico text,certificaciones_titulos text[],visible_en_landing boolean,deleted_at timestamptz);
 CREATE TABLE storage_assets(id_asset uuid,updated_at timestamptz,visibility text,public_url text,deleted_at timestamptz);
 CREATE TABLE horarios_semanales_sucursales(id_horario_sucursal uuid,id_sucursal uuid,estado_horario_codigo text,vigencia_desde date,vigencia_hasta date,created_at timestamptz);
 CREATE TABLE horarios_semanales_sucursales_bloques(id_bloque_horario uuid,id_horario_sucursal uuid,dia_semana smallint,hora_inicio time,hora_fin time);
 CREATE TABLE agenda_excepciones_sucursal(id_excepcion_sucursal uuid PRIMARY KEY,id_sucursal uuid,fecha date,modo_excepcion_codigo text,motivo text,created_at timestamptz);
 CREATE TABLE agenda_excepciones_sucursal_bloques(id_bloque_excepcion uuid,id_excepcion_sucursal uuid,hora_inicio time,hora_fin time,minuto_inicio int,minuto_fin int,orden_visual int);
 CREATE TABLE agenda_bloqueos_empleados(id_empleado uuid,rango tstzrange);
 CREATE TABLE bloqueos_agenda(id_empleado uuid,rango tstzrange);
 `);
 await pool.query("INSERT INTO sucursales VALUES($1,'Sucursal A',NULL,true),($2,'Sucursal B',NULL,true)",[BRANCH,OTHER]);
 await pool.query("INSERT INTO personas(id_persona,nombres,apellidos) VALUES($1,'Barbero','Fixture'),($2,'Cliente','Fixture')",[PERSON,CPERSON]);
 await pool.query('INSERT INTO empleados(id_empleado,id_persona,id_sucursal) VALUES($1,$2,$3)',[BARBER,PERSON,BRANCH]);
 await pool.query("INSERT INTO servicios(id_servicio,nombre_servicio) VALUES($1,'Corte cabello')",[SERVICE]);
 await pool.query("INSERT INTO servicios_tarifas(id_tarifa,id_sucursal,id_servicio,precio_hnl,activo,vigente_desde,duracion_min,buffer_min) VALUES(gen_random_uuid(),$1,$2,100,true,'2020-01-01',30,0)",[BRANCH,SERVICE]);
 const schedule=randomUUID();await pool.query("INSERT INTO horarios_semanales_sucursales VALUES($1,$2,'publicado','2020-01-01',NULL,now())",[schedule,BRANCH]);
 await pool.query("INSERT INTO horarios_semanales_sucursales_bloques SELECT gen_random_uuid(),$1,d,'08:00','18:00' FROM generate_series(0,6) d",[schedule]);
 // AM: Trigger sintético equivalente al contrato NOTIFY; no afirma inspeccionar el trigger remoto QA.
 await pool.query(`CREATE FUNCTION fixture_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('mf_citas_operativas_events',json_build_object('id_sucursal',NEW.id_sucursal,'id_barbero',NEW.id_empleado_barbero,'reason','booking_created')::text);RETURN NEW;END $$;
 CREATE TRIGGER fixture_changed AFTER INSERT OR UPDATE ON citas FOR EACH ROW EXECUTE FUNCTION fixture_notify();`);
 const profiles=new Map();process.env.JWT_SECRET=randomBytes(48).toString('hex');
 const token=(role='admin',branch=BRANCH)=>{const id=randomUUID();profiles.set(id,{id_usuario:id,roles:[role],branch_ids:Array.isArray(branch)?branch:[branch],empleado_id:BARBER});return jwt.sign({sub:id,sid:randomUUID(),jti:randomUUID(),token_type:'app'},process.env.JWT_SECRET,{issuer:'masterfade-api',audience:'masterfade-app',expiresIn:'1h'});};
 let lastSqlError=null;
 const query=async(client,sql,params)=>{
  if(sql.includes('WITH base_user'))return {rows:profiles.has(params[0])?[profiles.get(params[0])]:[]};
  if(sql.includes('token_jti_hash = $3'))return {rows:[{estado:'activa',ultimo_uso_at:new Date(),expira_at:new Date(Date.now()+3600000),revocada_at:null}]};
  // AM: Mantenimiento financiero/caducidad excluido; consultas, autorización y transacciones de esta fase reales.
  if(sql.includes('UPDATE public.citas_holds')||sql.includes('WITH target_intents')||sql.includes('no_show_at = COALESCE'))return {rows:[],rowCount:0};
  try{return await client.query(sql,params);}catch(e){lastSqlError=e;throw e;}
 };
 app=Fastify();app.decorate('db',{query:(s,p)=>query(pool,s,p),connect:async()=>{const c=await pool.connect();return {query:(s,p)=>query(c,s,p),release:()=>c.release()};}});
 app.decorate('dbListenPool',listenPool);await app.register(cookie);await app.register(auth);await app.register(routes,{prefix:'/v1/admin/citas'});
 const address=await app.listen({host:'127.0.0.1',port:0}),adminToken=token();
 const inject=(url,options={})=>app.inject({url:'/v1/admin/citas'+url,headers:{cookie:'mf_session='+(options.token||adminToken)},...options});
 const insert=async(name,state='confirmada',start='2030-06-15T16:00:00Z',branch=BRANCH)=>{
  const id=randomUUID(),group=randomUUID();await pool.query("INSERT INTO citas(id_cita,id_grupo_cita,id_sucursal,id_empleado_barbero,id_persona_cliente,alias_integrante,inicio_at,fin_at,estado_cita_codigo,duracion_total_min,buffer_total_min) VALUES($1,$2,$3,$4,$5,$6,$7,$7::timestamptz+interval '30 minutes',$8,30,0)",[id,group,branch,BARBER,CPERSON,name,start,state]);
  await pool.query('INSERT INTO citas_detalles VALUES(gen_random_uuid(),$1,$2)',[id,SERVICE]);return {id,group,code:code(group)};
 };
 const change=(id,options={})=>inject('/'+id+'/reagendar-emergencia',{method:'POST',payload:{fecha_inicio_nueva:'2030-06-17T16:00:00Z',id_empleado_barbero_nuevo:BARBER,motivo:'Fixture'},...options});
 await t.test('búsqueda futura/finalizada y emergencia: roles, estado, sucursal, disponibilidad y rollback',async()=>{
  for(const role of ['admin','super_admin']){
   const item=await insert(role,'en_salon');const r=await change(item.id,{token:token(role)});assert.equal(r.statusCode,200,r.body+' '+lastSqlError?.message);
   assert.equal(r.json().data.reagendacion.inicio_at_nuevo,'2030-06-17T16:00:00.000Z');assert.equal(r.json().data.reagendacion.estado_cita_codigo,'confirmada');
   await pool.query('DELETE FROM citas_detalles; DELETE FROM citas; DELETE FROM citas_reagendaciones');
  }
  const future=await insert('Futura'),done=await insert('Finalizada','completada'),other=await insert('Otra','confirmada','2030-06-15T16:00:00Z',OTHER);
  for(const item of [future,done]){const r=await inject('/reservas/buscar?codigo='+item.code+'&id_sucursal='+BRANCH);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.reservas[0].citas[0].id_cita,item.id);}
  assert.deepEqual((await inject('/reservas/buscar?codigo='+other.code+'&id_sucursal='+BRANCH)).json().data.reservas,[]);
  assert.equal((await inject('/reservas/buscar?codigo='+other.code+'&id_sucursal='+OTHER)).statusCode,403);
  for(const role of ['barbero','cliente'])assert.equal((await change(future.id,{token:token(role)})).statusCode,403);
  assert.equal((await change(done.id)).statusCode,409);assert.equal((await change(other.id)).statusCode,404);
  await insert('Ocupada','confirmada','2030-06-17T16:00:00Z');assert.equal((await change(future.id)).statusCode,409);
  assert.equal((await pool.query('SELECT inicio_at FROM citas WHERE id_cita=$1',[future.id])).rows[0].inicio_at.toISOString(),'2030-06-15T16:00:00.000Z');
  assert.equal((await pool.query('SELECT count(*)::int n FROM citas_reagendaciones')).rows[0].n,0);
 });
 await t.test('LISTEN real entrega NOTIFY solo tras commit y filtra sucursal',async()=>{
  const stop=new AbortController();const response=await fetch(address+'/v1/admin/citas/operativas/events?id_sucursal='+BRANCH,{headers:{cookie:'mf_session='+adminToken},signal:stop.signal});
  assert.equal(response.status,200);const reader=response.body.getReader();let text='';const next=async()=>{const r=await reader.read();text+=new TextDecoder().decode(r.value);};await next();assert.match(text,/event: ready/);
  const tx=await pool.connect();
  try {
   await tx.query('BEGIN');
   await tx.query("SELECT pg_notify('mf_citas_operativas_events',$1)",[JSON.stringify({id_sucursal:BRANCH,reason:'rollback_event'})]);
   await tx.query('ROLLBACK');
   await tx.query('BEGIN');
   await tx.query("SELECT pg_notify('mf_citas_operativas_events',$1)",[JSON.stringify({id_sucursal:OTHER,reason:'otra'})]);
   await tx.query("SELECT pg_notify('mf_citas_operativas_events',$1)",[JSON.stringify({id_sucursal:BRANCH,reason:'committed'})]);
   const pending=next();
   assert.equal(await Promise.race([pending.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),60))]),false);
   await tx.query('COMMIT');await pending;
   assert.match(text,/citas.operativas.changed/);assert.match(text,/committed/);assert.doesNotMatch(text,/otra|rollback_event/);
   await insert('Notify');await next();assert.match(text,/booking_created/);
  }finally{tx.release();stop.abort();await reader.cancel().catch(()=>{});}

 });
 const browserModule=process.env.MASTERFADE_PLAYWRIGHT_MODULE;
 if(!browserModule){t.diagnostic('Chromium pendiente: indicar MASTERFADE_PLAYWRIGHT_MODULE');return;}
 const {chromium}=createRequire(import.meta.url)(browserModule);browser=await chromium.launch();
 const browserToken=token('admin',[BRANCH,OTHER]);
 const dist=path.resolve(process.env.MASTERFADE_PHASE03_BUILD_DIR||'dist'),streams=new Set(),requests=[];
 let disconnect=false;
 bridge=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture'),p=url.pathname;
  const cors={'access-control-allow-origin':req.headers.origin||'*','access-control-allow-credentials':'true'};
  const json=data=>{res.writeHead(200,{'content-type':'application/json',...cors});res.end(JSON.stringify({ok:true,data}));};
  if(p==='/v1/auth/me')return json({user:{id_usuario:'fixture',nombres:'Fixture'},roles:['admin'],branch_ids:[BRANCH,OTHER]});
  if(p.endsWith('/operativas/contexto'))return json({sucursales:[{id_sucursal:BRANCH,nombre_sucursal:'Sucursal A'},{id_sucursal:OTHER,nombre_sucursal:'Sucursal B'}],barberos:[{id_empleado:BARBER,id_sucursal:BRANCH,nombre_completo:'Barbero Fixture'}]});
  if(p.startsWith('/v1/admin/citas')){
   requests.push({path:p,query:url.searchParams,method:req.method});
   const isStream=p.endsWith('/events');if(isStream&&disconnect){res.writeHead(503,cors);res.end();return;}
   const upstream=httpRequest(address+req.url,{method:req.method,headers:{...req.headers,cookie:'mf_session='+browserToken,host:new URL(address).host}},response=>{
    res.writeHead(response.statusCode,{...response.headers,...cors});response.pipe(res);
   });
   if(isStream){streams.add(res);res.on('close',()=>{streams.delete(res);upstream.destroy();});}
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);return;
  }
  if(p.startsWith('/v1/'))return json({});
  const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.html':'text/html'};
  let filename=path.resolve(dist,'.'+decodeURIComponent(p));
  if(!filename.startsWith(dist+path.sep)||!path.extname(filename))filename=path.join(dist,'index.html');
  try{res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(await readFile(filename));}catch{res.end();}
 });
 await new Promise(r=>bridge.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+bridge.address().port;
 for(const width of [390,1440])await t.test('Chromium '+width+': dos sesiones, emergencia HN, NOTIFY, reconexión y sucursal',{timeout:60000},async()=>{
  await pool.query('DELETE FROM citas_detalles; DELETE FROM citas; DELETE FROM citas_reagendaciones');
  const initial=await insert('Buscar futura','confirmada','2030-06-17T14:00:00Z');
  const contexts=[],pages=[],errors=[],expectedDisconnects=[];let outageStarted=false;
  try{
   for(let i=0;i<2;i++){
    const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'});contexts.push(context);
    await context.addInitScript(branch=>localStorage.setItem('masterfade.admin.agendamiento.selectedSucursalId',branch),BRANCH);
    const page=await context.newPage();pages.push(page);page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{
     if(m.type()!=='error')return;
     // AM: El corte intencional del stream produce errores de red esperados, no excepciones JS.
     if(outageStarted && m.location().url.includes('/operativas/events') && /503|ERR_INCOMPLETE_CHUNKED_ENCODING/.test(m.text()))expectedDisconnects.push(m.text());
     else errors.push(m.text()+' @ '+m.location().url);
    });
    await page.clock.setFixedTime(new Date('2030-06-15T18:00:00Z'));
    await page.route('**/v1/**',route=>{const u=new URL(route.request().url());return route.continue({url:base+u.pathname+u.search});});
    await page.goto(base+'/home/admin/citas');await page.getByText('Conectado en vivo',{exact:true}).filter({visible:true}).first().waitFor();
   }
   const page=pages[0];await page.getByRole('button',{name:'Buscar reserva',exact:true}).click();
   await page.getByLabel('Código de reserva').fill(initial.code);await page.getByRole('button',{name:'Buscar',exact:true}).click();
   await page.getByRole('button',{name:'Reagendación de emergencia',exact:true}).click();
   await page.getByRole('heading',{name:'Reagendación de emergencia',exact:true}).waitFor();
   await page.locator('[role=dialog][data-state=closed]').waitFor({state:'detached'});assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.locator('input[type=datetime-local]').inputValue(),'2030-06-17T08:00');
   await page.locator('input[type=datetime-local]').fill('2030-06-17T10:00');
   await page.getByRole('dialog').locator('select').selectOption(BARBER);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const evidence=process.env.MASTERFADE_PHASE03_EVIDENCE||path.join(tmpdir(),'mf-phase03-evidence');await mkdir(evidence,{recursive:true});
   await page.screenshot({path:path.join(evidence,'emergencia-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'Reagendar sin cobro',exact:true}).click();
   await page.getByText('Cita reagendada por emergencia sin cobro adicional.',{exact:true}).waitFor();
   await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(await page.getByRole('dialog').count(),0);
   assert.equal((await pool.query('SELECT inicio_at FROM citas WHERE id_cita=$1',[initial.id])).rows[0].inicio_at.toISOString(),'2030-06-17T16:00:00.000Z');
   assert.equal((await pool.query('SELECT count(*)::int n FROM citas_reagendaciones WHERE id_cita=$1',[initial.id])).rows[0].n,1);
   await insert('Nueva automática');
   for(const tab of pages)await tab.getByText('Nueva automática',{exact:true}).filter({visible:true}).first().waitFor();
   outageStarted=true;disconnect=true;for(const stream of streams)stream.destroy();
   for(const tab of pages)await tab.getByText('Reconectando',{exact:true}).filter({visible:true}).first().waitFor();
   await insert('Perdida desconectada','confirmada','2030-06-15T17:00:00Z');disconnect=false;
   for(const tab of pages){await tab.getByText('Perdida desconectada',{exact:true}).filter({visible:true}).first().waitFor();assert.ok(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await page.screenshot({path:path.join(evidence,'reconectado-'+width+'.png'),fullPage:true});
   await insert('Sucursal B','confirmada','2030-06-15T18:00:00Z',OTHER);
   const branchSelect=page.locator('select').filter({has:page.locator('option',{hasText:'Sucursal B'})}).filter({visible:true}).first();
   await branchSelect.selectOption(OTHER);await page.getByRole('heading',{name:'Sucursal B',exact:true}).filter({visible:true}).first().waitFor();
   assert.equal(await page.getByRole('heading',{name:'Nueva automática',exact:true}).count(),0,await page.locator('body').innerText());
   await page.clock.setFixedTime(new Date('2030-06-16T06:00:01Z'));
   const nextDay=page.waitForResponse(r=>r.url().includes('/operativas?')&&new URL(r.url()).searchParams.get('fecha_desde')==='2030-06-16');
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await nextDay;
   await page.getByRole('heading',{name:'Sucursal B',exact:true}).first().waitFor({state:'detached'});
   assert.equal(await page.getByRole('heading',{name:'Perdida desconectada',exact:true}).count(),0);
   assert.ok(requests.some(r=>r.path.endsWith('/operativas')&&r.query.get('id_sucursal')===OTHER&&r.query.get('zona_horaria')==='America/Tegucigalpa'));
   assert.ok(expectedDisconnects.length>=2);assert.deepEqual(errors,[]);
  }finally{for(const context of contexts)await context.close();disconnect=false;}
 });
});
