import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID,randomBytes} from 'node:crypto';
import process from 'node:process';
// AM: Cluster local efímero; no usa .env ni bases externas. Metadatos de sesión sintéticos, guardas y SQL reales.
const root=process.env.MASTERFADE_BACKEND_ROOT,bin=process.env.MASTERFADE_PHASE03_PG_BIN;
assert.ok(root&&bin,'Indicar MASTERFADE_BACKEND_ROOT y MASTERFADE_PHASE03_PG_BIN');
const req=createRequire(path.join(root,'package.json'));
const pg=req('pg'),Fastify=req('fastify'),jwt=req('jsonwebtoken'),cookie=req('@fastify/cookie');
const {default:auth}=await import(pathToFileURL(path.join(root,'src/plugins/auth.js')));
const {default:routes}=await import(pathToFileURL(path.join(root,'src/routes/v1/citas.js')));
test('FASE-04: API real, 11 estados y aislamiento de dos clientes en PostgreSQL',{timeout:90000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'mf-cliente-fase04-')),data=path.join(directory,'data');let pool,app,started=false;
 const binary=(name,args)=>{const r=spawnSync(path.join(bin,name+(process.platform==='win32'?'.exe':'')),args,{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stderr);};
 t.after(async()=>{if(app)await app.close();if(pool)await pool.end();if(started)binary('pg_ctl',['-D',data,'-m','fast','-w','stop']);assert.equal(path.dirname(directory),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('mf-cliente-fase04-'));await rm(directory,{recursive:true,force:true});});
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 binary('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C','--no-sync']);binary('pg_ctl',['-D',data,'-l',path.join(directory,'pg.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);started=true;
 pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres'});
 await pool.query(`CREATE TABLE citas(id_cita uuid,id_cliente uuid,id_persona_cliente uuid,id_grupo_cita uuid,id_sucursal uuid,id_empleado_barbero uuid,estado_cita_codigo text,inicio_at timestamptz,fin_at timestamptz,deleted_at timestamptz,duracion_total_min int DEFAULT 30,buffer_total_min int DEFAULT 0,total_pagar_hnl numeric DEFAULT 0,notas text,es_canje_recompensa boolean DEFAULT false,orden_integrante int DEFAULT 1);
 CREATE TABLE sucursales(id_sucursal uuid,nombre_sucursal text);CREATE TABLE empleados(id_empleado uuid,id_persona uuid);CREATE TABLE personas(id_persona uuid,nombres text,apellidos text);CREATE TABLE subscription_consumptions(id_cita uuid);`);
 const branch=randomUUID(),barber=randomUUID(),person=randomUUID();await pool.query("INSERT INTO sucursales VALUES($1,'Sucursal')",[branch]);await pool.query("INSERT INTO personas VALUES($1,'Barbero','Fixture')",[person]);await pool.query('INSERT INTO empleados VALUES($1,$2)',[barber,person]);
 const states=['en_espera','pendiente_pago','confirmada','en_salon','en_atencion','completada','cancelada','cancelada_por_cliente','expirada','no_show','anulada'];
 const profiles=new Map(),clients=[];process.env.JWT_SECRET=randomBytes(48).toString('hex');
 for(let n=0;n<2;n++){
  const id=randomUUID(),cliente=randomUUID(),persona=randomUUID(),ids=[];profiles.set(id,{id_usuario:id,roles:['cliente'],cliente_id:cliente,id_persona:persona});
  for(const state of states){const cita=randomUUID();ids.push(cita);await pool.query("INSERT INTO citas(id_cita,id_cliente,id_persona_cliente,id_sucursal,id_empleado_barbero,estado_cita_codigo,inicio_at,fin_at) VALUES($1,$2,$3,$4,$5,$6,'2020-11-12T16:00:00Z','2020-11-12T16:30:00Z')",[cita,cliente,persona,branch,barber,state]);}
  clients.push({ids,cliente,token:jwt.sign({sub:id,sid:randomUUID(),jti:randomUUID(),token_type:'app'},process.env.JWT_SECRET,{issuer:'masterfade-api',audience:'masterfade-app',expiresIn:'1h'})});
 }
 app=Fastify();app.decorate('db',{query(sql,params){if(sql.includes('WITH base_user'))return {rows:profiles.has(params[0])?[profiles.get(params[0])]:[]};if(sql.includes('token_jti_hash = $3'))return {rows:[{estado:'activa',ultimo_uso_at:new Date(),expira_at:new Date(Date.now()+3600000),revocada_at:null}]};return pool.query(sql,params);}});
 await app.register(cookie);await app.register(auth);await app.register(routes,{prefix:'/v1/citas'});
 for(const [i,c]of clients.entries()){
  const response=await app.inject({url:'/v1/citas',headers:{cookie:'mf_session='+c.token}});assert.equal(response.statusCode,200,response.body);
  const rows=response.json().data.citas;assert.equal(rows.length,11);assert.deepEqual(new Set(rows.map(r=>r.estado_cita_codigo)),new Set(states));assert.deepEqual(new Set(rows.map(r=>r.id_cita)),new Set(c.ids));
  const denied=await app.inject({url:'/v1/citas/'+clients[1-i].ids[0],headers:{cookie:'mf_session='+c.token}});assert.equal(denied.statusCode,404,denied.body);
  const spoof=await app.inject({url:'/v1/citas?id_cliente='+clients[1-i].cliente,headers:{cookie:'mf_session='+c.token}});assert.equal(spoof.statusCode,200,spoof.body);assert.deepEqual(new Set(spoof.json().data.citas.map(r=>r.id_cita)),new Set(c.ids));
 }
 for(const headers of [{},{cookie:'mf_session=invalid'}])assert.equal((await app.inject({url:'/v1/citas',headers})).statusCode,401);
});
