// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Page from '../ClienteHistorialCitasPage.jsx';
const fixture=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),notify:vi.fn(),enabled:true}));
const notices={error:fixture.notify,info:fixture.notify,warning:fixture.notify,success:fixture.notify};
const auth={isAuthenticated:true,isHydrated:true,isHydrating:false,user:{id_usuario:'A'},logout:fixture.notify};
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>auth}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>notices}));
vi.mock('../../../../services/httpClient.js',()=>({http:{get:fixture.get,post:fixture.post}}));
vi.mock('../../lib/clientFeatureFlags.js',()=>({get CLIENT_CITAS_ENABLED(){return fixture.enabled;},CLIENT_LOCK_MESSAGE:'Pausa de reservas'}));
const active=['en_espera','pendiente_pago','confirmada','en_salon','en_atencion'];
const history=['completada','cancelada','cancelada_por_cliente','expirada','no_show','anulada'];
const row=(state,date)=>({id_cita:state,nombre_sucursal:'Reserva '+state,estado_cita_codigo:state,inicio_at:date,servicios:[],total_pagar_hnl:0});
let rows=[];
function listResult(url){
 const q=new URL(url,'http://fixture').searchParams,section=q.get('apartado'),unique=[...new Map(rows.map(r=>[r.id_cita,r])).values()];
 const upcoming=unique.filter(r=>active.includes(r.estado_cita_codigo)),past=unique.filter(r=>history.includes(r.estado_cita_codigo));
 const source=section==='historial'?past:upcoming,total=source.length,total_pages=Math.max(1,Math.ceil(total/4)),page=Math.min(Number(q.get('page')||1),total_pages);
 return {citas:source.slice((page-1)*4,page*4),totals:{proximas:upcoming.length,historial:past.length,total:unique.length,pendientes_pago:upcoming.filter(r=>r.estado_cita_codigo==='pendiente_pago').length},pagination:{apartado:section,page,limit:4,total,total_pages,has_next:page<total_pages,has_prev:page>1}};
}
function respond(url){return {data:url==='/v1/commerce/eligibility'?{booking:true,vipPurchase:false}:url.startsWith('/v1/citas?')?listResult(url):url.endsWith('/pendiente')?{pendiente:null}:{cita:rows.find(r=>url.endsWith('/'+r.id_cita)),detalles:[]}};}
beforeEach(()=>{
 fixture.enabled=true;auth.user={id_usuario:'A'};
 sessionStorage.clear();fixture.notify.mockClear();fixture.get.mockReset().mockImplementation(async url=>respond(url));fixture.post.mockReset();
});
const dataset=(n,m)=>[...Array.from({length:n},(_,i)=>({...row('confirmada','2020-11-15T14:00:00Z'),id_cita:'P'+i,nombre_sucursal:'Próxima '+i})),...Array.from({length:m},(_,i)=>({...row('completada','2026-11-15T14:00:00Z'),id_cita:'H'+i,nombre_sucursal:'Histórica '+i}))];
const pageReady=()=>screen.findByRole('navigation',{name:'Paginación de citas'});
const next=async()=>{fireEvent.click(screen.getByRole('button',{name:'Siguiente',exact:true}));await pageReady();};
test.each([0,4,5,8,9])('%i citas por apartado: páginas SQL de cuatro sin ocultar tarjetas',async count=>{
 rows=dataset(count,count);await mount();
 for(const tab of ['Próximas','Historial']){
  if(tab==='Historial'){fireEvent.click(screen.getByRole('button',{name:`Historial (${count})`}));await pageReady();}
  const totalPages=Math.max(1,Math.ceil(count/4));
  for(let page=1;page<=totalPages;page++){
   expect(screen.getByText(`Página ${page} de ${totalPages}`)).toBeTruthy();
   expect(document.querySelectorAll('.client-cita-card')).toHaveLength(Math.min(4,Math.max(0,count-(page-1)*4)));
   expect(screen.getByRole('button',{name:'Anterior'}).disabled).toBe(page===1);
   expect(screen.getByRole('button',{name:'Siguiente'}).disabled).toBe(page===totalPages);
   if(page<totalPages)await next();
  }
 }
 expect(fixture.get.mock.calls.filter(([url])=>url.startsWith('/v1/citas?')).every(([url])=>new URL(url,'http://fixture').searchParams.get('limit')==='4')).toBe(true);
});
test.each([['membresia','Membresía',0,[]],['cortesia','Cortesía',0,[{nombre_servicio:'Corte cabello'}]],['cortesia_acompanantes','Cortesía + acompañantes',150,[]],['pago_normal','Pago normal',1250.5,[{nombre_servicio:'Corte cabello'},{nombre_servicio:'Barba'}]]])('tarjeta de cuatro áreas: %s, importe %s y detalle bajo demanda',async(tipo,label,amount,services)=>{
 const branch='MasterFade Boulevard Suyapa · Sucursal con nombre extenso',barber='Fernando Miranda · Profesional con nombre extenso';
 rows=[{...row('cancelada_por_cliente','2026-11-16T05:30:00Z'),nombre_sucursal:branch,nombre_barbero:barber,tipo_cita_visual:tipo,tipo_cita_label:label,total_pagar_hnl:amount,servicios:services}];
 await mount();fireEvent.click(screen.getByRole('button',{name:'Historial (1)'}));await pageReady();
 const card=screen.getByRole('article',{name:'Cita en '+branch});
 expect([...card.children].map(node=>node.tagName)).toEqual(['HEADER','DIV','DIV','FOOTER']);
 expect(card.querySelector('h2').textContent).toBe(branch);
 expect(card.textContent).toContain('Cancelada por el cliente');expect(card.textContent).toContain(label);
 expect(card.textContent).toContain(barber);expect(card.textContent).toContain('L '+amount.toFixed(2));
 expect(card.textContent).toMatch(/15 nov.*11:30|15 nov.*23:30/i);expect(card.textContent).not.toMatch(/Gratis|Pagado|Pago recibido/i);
 expect(card.querySelectorAll('button')).toHaveLength(1);expect(card.querySelector('button button')).toBeNull();
 const detailUrl='/v1/citas/cancelada_por_cliente';expect(fixture.get).not.toHaveBeenCalledWith(detailUrl);
 fireEvent.click(card.querySelector('button'));await screen.findByRole('heading',{name:'Detalle de cita'});
 await waitFor(()=>expect(fixture.get).toHaveBeenCalledWith(detailUrl));
 expect(fixture.get.mock.calls.filter(([url])=>url===detailUrl)).toHaveLength(1);
});
test('páginas independientes 41/56, regreso y ajuste al desaparecer la última',async()=>{
 rows=dataset(41,56);await mount();for(let i=0;i<2;i++)await next();
 expect(screen.getByText('Página 3 de 11')).toBeTruthy();expect(screen.getAllByText('Próxima 8',{exact:true})).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Historial (56)'}));await pageReady();for(let i=0;i<13;i++)await next();
 expect(screen.getByText('Página 14 de 14')).toBeTruthy();expect(screen.getAllByText('Histórica 55',{exact:true})).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Próximas (41)'}));await pageReady();expect(screen.getByText('Página 3 de 11')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Anterior'}));await pageReady();expect(screen.getByText('Página 2 de 11')).toBeTruthy();
 rows=dataset(41,6);fireEvent.click(screen.getByRole('button',{name:'Historial (56)'}));await pageReady();
 expect(screen.getByText('Página 2 de 2')).toBeTruthy();expect(screen.getByRole('button',{name:'Historial (6)'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Siguiente'}).disabled).toBe(true);
});
test('vacío válido tiene contadores cero y controles deshabilitados',async()=>{
 rows=[];await mount();expect(screen.getByText('Página 1 de 1')).toBeTruthy();
 expect(screen.getByText('No tienes citas próximas.')).toBeTruthy();
 for(const name of ['Anterior','Siguiente'])expect(screen.getByRole('button',{name}).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Historial (0)'})).toBeTruthy();
});
test('cambio rápido de pestaña aborta la petición y descarta su respuesta obsoleta',async()=>{
 rows=dataset(6,6);await mount();let finish,signal;
 fixture.get.mockImplementation((url,options)=>url.includes('apartado=proximas')&&url.includes('page=2')?(signal=options.signal,new Promise(resolve=>{finish=resolve;})):Promise.resolve(respond(url)));
 fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));await waitFor(()=>expect(finish).toBeTypeOf('function'));
 fireEvent.click(screen.getByRole('button',{name:'Historial (6)'}));await pageReady();expect(signal.aborted).toBe(true);
 await act(async()=>finish({data:{...listResult('/v1/citas?apartado=proximas&page=2'),citas:[{...rows[0],nombre_sucursal:'Respuesta obsoleta'}]}}));
 expect(screen.queryByText('Respuesta obsoleta')).toBeNull();expect(screen.getAllByText('Histórica 0',{exact:true})).toHaveLength(1);
 fixture.get.mockImplementation(async url=>respond(url));fireEvent.click(screen.getByRole('button',{name:'Próximas (6)'}));await pageReady();expect(screen.getByText('Página 2 de 2')).toBeTruthy();
});
test('error de página no parece vacío, permite reintentar y conserva los contadores',async()=>{
 rows=dataset(6,1);await mount();fixture.get.mockImplementation(async url=>{if(url.includes('page=2'))throw new Error('SQL privado');return respond(url);});
 fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));await screen.findByRole('alert');
 expect(screen.queryByText('No tienes citas próximas.')).toBeNull();expect(screen.queryByText('SQL privado')).toBeNull();
 expect(screen.getByRole('button',{name:'Próximas (6)'})).toBeTruthy();fixture.get.mockImplementation(async url=>respond(url));
 fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));await pageReady();expect(screen.getByText('Página 2 de 2')).toBeTruthy();
});
test('otra identidad reinicia páginas y descarta los datos del Cliente anterior',async()=>{
 rows=dataset(6,0);const view=render(<MemoryRouter><Page/></MemoryRouter>);await pageReady();let finish;
 fixture.get.mockImplementation(url=>url.includes('page=2')?new Promise(resolve=>{finish=resolve;}):Promise.resolve(respond(url)));
 fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));await waitFor(()=>expect(finish).toBeTypeOf('function'));
 auth.user={id_usuario:'B'};rows=[{...dataset(1,0)[0],nombre_sucursal:'Cliente B'}];view.rerender(<MemoryRouter><Page/></MemoryRouter>);await pageReady();
 await act(async()=>finish({data:{...listResult('/v1/citas?apartado=proximas&page=1'),citas:[{...rows[0],nombre_sucursal:'Cliente A obsoleto'}]}}));
 expect(screen.getByText('Página 1 de 1')).toBeTruthy();expect(screen.queryByText('Cliente A obsoleto')).toBeNull();expect(screen.getAllByText('Cliente B',{exact:true})).toHaveLength(1);
});
test('comercio privado denegado permite consultar sin reanudar ni iniciar reservas',async()=>{
 rows=dataset(6,0);fixture.get.mockImplementation(async url=>url==='/v1/commerce/eligibility'?{data:{booking:false,vipPurchase:false}}:url.endsWith('/pendiente')?{data:{pendiente:{id_grupo_cita:'group',citas:[]}}}:respond(url));await mount();
 expect(screen.getByRole('button',{name:'Nueva cita'}).disabled).toBe(true);
 const continueButton=screen.getByRole('button',{name:'Continuar pago'});expect(continueButton.disabled).toBe(true);fireEvent.click(continueButton);
 expect(screen.queryByRole('dialog')).toBeNull();expect(fixture.post).not.toHaveBeenCalled();await next();expect(screen.getByText('Página 2 de 2')).toBeTruthy();
});
test('CLIENT_CITAS_ENABLED desactivado mantiene la pantalla bloqueada',async()=>{
 fixture.enabled=false;render(<MemoryRouter><Page/></MemoryRouter>);expect(screen.getByRole('heading',{name:'Pausa de reservas'})).toBeTruthy();
 expect(fixture.get.mock.calls.some(([url])=>url.startsWith('/v1/citas'))).toBe(false);
});
test('un fallo del listado no impide recuperar la reserva pendiente existente',async()=>{
 rows=[];fixture.get.mockImplementation(async url=>{
  if(url.startsWith('/v1/citas?'))throw new Error('Fallo privado');
  if(url.endsWith('/pendiente'))return {data:{pendiente:{id_grupo_cita:'group',citas:[],total_pendiente_hnl:100}}};
  return respond(url);
 });
 fixture.post.mockResolvedValue({data:{payment_intent:{id_intent:'existing',estado_intent_codigo:'pendiente'}}});
 render(<MemoryRouter initialEntries={['/citas']}><Routes><Route path='/citas' element={<Page/>}/><Route path='/agendar/pagar' element={<p>Recuperación existente</p>}/></Routes></MemoryRouter>);
 await screen.findByRole('alert');fireEvent.click(await screen.findByRole('button',{name:'Continuar pago'}));await screen.findByRole('heading',{name:'Reserva pendiente de pago'});
 fireEvent.click(screen.getAllByRole('button',{name:'Continuar pago'}).at(-1));await screen.findByText('Recuperación existente');
 expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/v1/citas/pendiente/group/retomar',{});
});
afterEach(cleanup);
async function mount(){render(<MemoryRouter initialEntries={['/citas']}><Routes><Route path='/citas' element={<Page/>}/><Route path='/agendar/pagar' element={<p>Recuperación existente</p>}/></Routes></MemoryRouter>);await screen.findByRole('navigation',{name:'Paginación de citas'});}
for(const date of ['2020-11-13T05:30:00Z','2040-11-13T05:30:00Z'])test('11 estados sin pérdidas ni duplicados, hora HN: '+date,async()=>{
 rows=[...active,...history].map(s=>row(s,date));rows=[...rows,...rows];await mount();
 expect(screen.getByRole('button',{name:'Próximas (5)'})).toBeTruthy();expect(screen.getByRole('button',{name:'Historial (6)'})).toBeTruthy();
 for(const state of active.slice(0,4))expect(screen.getAllByText('Reserva '+state,{exact:true})).toHaveLength(1);
 for(const state of history)expect(screen.queryByText('Reserva '+state,{exact:true})).toBeNull();
 await next();
 fireEvent.click(screen.getByText('Reserva en_atencion',{exact:true}).closest('article').querySelector('button'));
 await screen.findByRole('heading',{name:'Detalle de cita'});await waitFor(()=>expect(screen.getByRole('dialog').textContent).toContain('Estado: En atención'));
 expect(screen.getByRole('dialog').textContent).toMatch(/12 nov.*11:30|12 nov.*23:30/i);
 fireEvent.click(screen.getByRole('button',{name:'Cerrar',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'Historial (6)'}));await screen.findByRole('navigation',{name:'Paginación de citas'});
 for(const state of history.slice(0,4))expect(screen.getAllByText('Reserva '+state,{exact:true})).toHaveLength(1);
 for(const state of active)expect(screen.queryByText('Reserva '+state,{exact:true})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));await screen.findByText('Página 2 de 2');expect(screen.getAllByText('Reserva anulada',{exact:true})).toHaveLength(1);expect(screen.getAllByText('Reserva no_show',{exact:true})).toHaveLength(1);
 expect(fixture.get).toHaveBeenCalledWith(expect.stringContaining('apartado=historial'),expect.objectContaining({cache:false,dedupe:false}));
});
test.each([
 ['en_espera','En espera'],['pendiente_pago','Pendiente de pago'],['confirmada','Confirmada'],
 ['en_salon','En salón'],['en_atencion','En atención'],['completada','Completada'],
 ['cancelada','Cancelada'],['cancelada_por_cliente','Cancelada por el cliente'],
 ['expirada','Expirada'],['no_show','No asistió'],['anulada','Anulada'],
])('Cliente: %s legible en tarjeta y detalle; contrato intacto',async(code,label)=>{
 rows=[{...row(code,'2026-11-15T14:00:00Z'),nombre_sucursal:'Sucursal fixture'}];await mount();
 if(history.includes(code)){fireEvent.click(screen.getByRole('button',{name:'Historial (1)'}));await screen.findByRole('navigation',{name:'Paginación de citas'});}
 expect(screen.getAllByText(label,{exact:true})).toHaveLength(1);
 fireEvent.click(screen.getByText('Sucursal fixture',{exact:true}).closest('article').querySelector('button'));
 await waitFor(()=>expect(screen.getByRole('dialog').textContent).toContain('Estado: '+label));
 expect(fixture.get).toHaveBeenCalledWith('/v1/citas/'+code);
 expect(rows[0].estado_cita_codigo).toBe(code);
 expect(screen.getByRole('dialog').textContent).not.toMatch(/no_show|en_salon|en_atencion|pendiente_pago|cancelada_por_cliente/);
});
test('recuperación pendiente conserva intención existente y navegación',async()=>{
 rows=[row('pendiente_pago','2020-11-13T05:30:00Z')];
 fixture.get.mockImplementation(async url=>url.endsWith('/pendiente')?{data:{pendiente:{id_grupo_cita:'group',citas:[],total_pendiente_hnl:100}}}:respond(url));
 fixture.post.mockResolvedValue({data:{payment_intent:{id_intent:'existing',estado_intent_codigo:'pendiente'}}});await mount();
 fireEvent.click(await screen.findByRole('button',{name:'Continuar pago'}));await screen.findByRole('heading',{name:'Reserva pendiente de pago'});
 fireEvent.click(screen.getAllByRole('button',{name:'Continuar pago'}).at(-1));await screen.findByText('Recuperación existente');
 expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/v1/citas/pendiente/group/retomar',{});
 expect(JSON.parse(sessionStorage.getItem('mf_pending_payment_context_v1')).id_intent).toBe('existing');
});
test('cancelación pendiente conserva confirmación y código interno original',async()=>{
 rows=[{...row('pendiente_pago','2026-11-15T14:00:00Z'),nombre_sucursal:'Sucursal fixture'}];
 fixture.get.mockImplementation(async url=>url.endsWith('/pendiente')?{data:{pendiente:{id_grupo_cita:'group',citas:[],total_pendiente_hnl:100}}}:respond(url));
 fixture.post.mockResolvedValue({data:{}});await mount();
 fireEvent.click(await screen.findByRole('button',{name:'Descartar reserva pendiente'}));
 await screen.findByRole('heading',{name:'Reserva pendiente de pago'});
 expect(fixture.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Sí, descartar reserva'}));
 await waitFor(()=>expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/v1/citas/pendiente/group/descartar',{}));
 expect(rows[0].estado_cita_codigo).toBe('pendiente_pago');
 expect(fixture.notify).toHaveBeenCalledWith('Reserva pendiente descartada correctamente.');
});
