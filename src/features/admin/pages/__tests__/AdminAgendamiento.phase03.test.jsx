// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Page from '../AdminAgendamientoCitasPage.jsx';

const mock=vi.hoisted(()=>({roles:['admin'],list:vi.fn(),search:vi.fn(),save:vi.fn(),notify:vi.fn(),context:vi.fn()}));
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>({roles:mock.roles,isAuthenticated:true,invalidateSession:mock.notify})}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>({warning:mock.notify,error:mock.notify,success:mock.notify})}));
vi.mock('../../lib/adminCitasApi.js',()=>({
 getAdminCitasOperativasContexto:mock.context,listAdminCitasOperativas:mock.list,searchAdminReservation:mock.search,
 postAdminCitaReagendarEmergencia:mock.save,listAdminCitasAfectadasReagendacion:vi.fn(),listPublicAgendaHorarios:vi.fn(),
 postAdminCitaFinalizarAtencion:vi.fn(),postAdminCitaIniciarAtencion:vi.fn(),postAdminCitaRegistrarLlegada:vi.fn(),postAdminCitasReagendarEmergenciaLote:vi.fn(),
}));
const row=(id,state='confirmada',branch='A',start='2026-11-12T16:00:00Z')=>({id_cita:id,nombre_cliente:id,alias_integrante:id,id_sucursal:branch,inicio_at:start,estado_cita_codigo:state,servicios:[],nombre_barbero:'Barbero'});
let sources=[];
class Source {
 constructor(url){this.url=url;this.listeners={};this.closed=false;sources.push(this);}
 addEventListener(name,fn){this.listeners[name]=fn;}
 emit(name){(name==='open'?this.onopen:name==='error'?this.onerror:this.listeners[name])?.();}
 close(){this.closed=true;}
}
const flush=async(ms=500)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function dates(desde,hasta){
 fireEvent.click(screen.getByRole('button',{name:/^Filtros/}));
 fireEvent.change(screen.getByLabelText('Desde'),{target:{value:desde}});
 fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:hasta}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar fechas'}));await flush();
}
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));localStorage.clear();sources=[];vi.stubGlobal('EventSource',Source);mock.roles=['admin'];
 mock.context.mockReset().mockResolvedValue({data:{sucursales:[{id_sucursal:'A',nombre_sucursal:'Sucursal A'}],barberos:[]}});
 mock.list.mockReset().mockResolvedValue({data:{citas:[]}});mock.search.mockReset();mock.save.mockReset().mockResolvedValue({data:{}});mock.notify.mockReset();
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
test.each([['admin','cards'],['super_admin','table']])('%s/%s: rango futuro, invitados, orden y acciones seguras',async(role,view)=>{
 mock.roles=[role];localStorage.setItem('mf-view-agendamiento-citas',view);await mount();
 expect(screen.getByText('Hoy — Honduras')).toBeTruthy();
 const guest={...row('Invitado sin cuenta','confirmada','A','2026-11-15T15:00:00Z'),id_persona_cliente:null};
 const holder=row('Titular','confirmada','A','2026-11-15T14:00:00Z');
 mock.list.mockResolvedValue({data:{citas:[guest,holder,holder,row('Otra fecha','confirmada','A','2026-11-16T06:00:00Z')]}});
 await dates('2026-11-15','2026-11-15');
 expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({fecha_desde:'2026-11-15',fecha_hasta:'2026-11-15',zona_horaria:'America/Tegucigalpa',page:1,limit:400});
 expect(screen.getByText('Modo consulta — Honduras')).toBeTruthy();expect(screen.queryByText('Otra fecha',{exact:true})).toBeNull();
 const surfaces=[...document.querySelectorAll(view==='cards'?'article h3':'tbody tr')];
 expect(surfaces.length).toBeGreaterThan(0);
 for(let i=0;i<surfaces.length;i+=2){expect(surfaces[i].textContent).toContain('Titular');expect(surfaces[i+1].textContent).toContain('Invitado sin cuenta');}
 for(const button of screen.getAllByRole('button',{name:'Registrar llegada'})){expect(button.disabled).toBe(true);fireEvent.click(button);}
 expect(screen.queryByRole('heading',{name:'Confirmar cambio de estado'})).toBeNull();
 expect(screen.getAllByRole('button',{name:'Reagendación de emergencia'}).length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('button',{name:'Volver a hoy'}));await flush();
 expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({fecha_desde:'2026-11-12',fecha_hasta:'2026-11-12'});
 expect(screen.queryByText('Invitado sin cuenta',{exact:true})).toBeNull();
});
test('fechas vacías e invertidas no consultan; aplicar mismas fechas no borra los resultados',async()=>{
 mock.list.mockResolvedValue({data:{citas:[row('Hoy')]}});await mount();await flush();mock.list.mockClear();
 await dates('','2026-11-15');expect(screen.getByRole('alert').textContent).toContain('fecha válida');expect(mock.list).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-11-16'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar fechas'}));await flush();
 expect(screen.getByRole('alert').textContent).toContain('posterior');expect(mock.list).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-11-12'}});fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-11-12'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar fechas'}));await flush();
 expect(screen.getAllByText('Hoy',{exact:true}).length).toBeGreaterThan(0);expect(mock.list).not.toHaveBeenCalled();
});
test('recupera todas las páginas, distingue fechas y no publica un resultado parcial fallido',async()=>{
 await mount();mock.list.mockImplementation(async({page})=>({data:{citas:page===1?[row('Día 15','confirmada','A','2026-11-15T14:00:00Z')]:[row('Día 16','en_salon','A','2026-11-16T14:00:00Z')],pagination:{has_next:page===1}}}));
 await dates('2026-11-15','2026-11-16');
 expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({page:2,fecha_hasta:'2026-11-16'});
 expect(screen.getAllByText(/15\/11\/2026/).length).toBeGreaterThan(0);expect(screen.getAllByText(/16\/11\/2026/).length).toBeGreaterThan(0);
 expect(screen.getAllByRole('button',{name:'Iniciar atención'}).every(b=>b.disabled)).toBe(true);
 mock.list.mockImplementation(async({page})=>{if(page===2)throw new Error('No fue posible cargar las citas.');return {data:{citas:[row('Parcial')],pagination:{has_next:true}}};});
 fireEvent.click(screen.getByRole('button',{name:'Actualizar'}));await flush();expect(screen.queryByText('Parcial',{exact:true})).toBeNull();
 expect(screen.getByText('No fue posible cargar las citas.')).toBeTruthy();
});
test('rango conserva filtros en SSE y medianoche; respuesta de hoy obsoleta no lo reemplaza',async()=>{
 await mount();const old=deferred();mock.list.mockReturnValueOnce(old.promise).mockResolvedValue({data:{citas:[row('Futura','confirmada','A','2026-11-15T14:00:00Z')]}});
 sources.at(-1).emit('open');await flush();await dates('2026-11-15','2026-11-15');
 await act(async()=>old.resolve({data:{citas:[row('Obsoleta')]}}));await flush();
 expect(screen.queryByText('Obsoleta',{exact:true})).toBeNull();expect(screen.getAllByText('Futura',{exact:true}).length).toBeGreaterThan(0);
 sources.at(-1).emit('error');sources.at(-1).emit('open');sources.at(-1).emit('ready');await flush();
 expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({fecha_desde:'2026-11-15',fecha_hasta:'2026-11-15'});
 vi.setSystemTime(new Date('2026-11-13T06:00:01Z'));await act(async()=>window.dispatchEvent(new Event('focus')));await flush();
 expect(screen.getByText('Modo consulta — Honduras')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Volver a hoy'}));await flush();
 expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({fecha_desde:'2026-11-13',fecha_hasta:'2026-11-13'});
});
test('405 resultados recuperados; no acepta un límite lleno sin metadatos',async()=>{
 await mount();
 const first=Array.from({length:400},(_,i)=>row('Pendiente '+i,'pendiente_pago','A','2026-11-15T14:00:00Z'));
 const last=Array.from({length:5},(_,i)=>row('Última página '+i,'confirmada','A','2026-11-15T16:00:00Z'));
 mock.list.mockImplementation(async({page})=>({data:{citas:page===1?first:last,pagination:{has_next:page===1}}}));
 await dates('2026-11-15','2026-11-15');expect(screen.getByText('405 cita(s)')).toBeTruthy();
 expect(screen.getAllByText('Última página 4',{exact:true}).length).toBeGreaterThan(0);
 mock.list.mockResolvedValue({data:{citas:first}});fireEvent.click(screen.getByRole('button',{name:'Actualizar'}));await flush();
 expect(screen.getByText('No fue posible recuperar el rango completo. Actualiza e inténtalo de nuevo.')).toBeTruthy();
});
test('una segunda página anterior no reemplaza el retorno a hoy',async()=>{
 await mount();const pending=deferred();
 mock.list.mockImplementation(({fecha_desde,page})=>fecha_desde==='2026-11-15'?(page===1?Promise.resolve({data:{citas:[row('Parcial futura')],pagination:{has_next:true}}}):pending.promise):Promise.resolve({data:{citas:[row('Hoy vigente')]}}));
 await dates('2026-11-15','2026-11-15');fireEvent.click(screen.getByRole('button',{name:'Volver a hoy'}));await flush();
 await act(async()=>pending.resolve({data:{citas:[row('Página obsoleta','confirmada','A','2026-11-15T14:00:00Z')],pagination:{has_next:false}}}));await flush();
 expect(screen.queryByText('Página obsoleta',{exact:true})).toBeNull();expect(screen.getAllByText('Hoy vigente',{exact:true}).length).toBeGreaterThan(0);
});
test.each([['confirmada','Registrar llegada'],['en_salon','Iniciar atención'],['en_atencion','Finalizar atención']])('%s: operación de hoy habilitada y futura bloqueada',async(state,label)=>{
 mock.list.mockResolvedValue({data:{citas:[row('Operativa',state)]}});await mount();
 expect(screen.getAllByRole('button',{name:label}).every(b=>!b.disabled)).toBe(true);
 mock.list.mockResolvedValue({data:{citas:[row('Consulta futura',state,'A','2026-11-15T14:00:00Z')]}});
 await dates('2026-11-15','2026-11-15');expect(screen.getAllByRole('button',{name:label}).every(b=>b.disabled)).toBe(true);
});
async function mount(){render(<MemoryRouter><Page/></MemoryRouter>);await flush();}
async function lookup(cita){
 mock.search.mockResolvedValue({data:{reservas:[{id_grupo_cita:'G',codigo_reserva:'ABCDE',citas:[cita]}]}});
 fireEvent.click(screen.getByRole('button',{name:'Buscar reserva'}));fireEvent.change(screen.getByLabelText('Código de reserva'),{target:{value:'ABCDE'}});
 fireEvent.click(screen.getByRole('button',{name:'Buscar',exact:true}));await flush();
 return screen.getByRole('dialog');
}
test('Buscar reserva conserva las operaciones autorizadas de una cita anterior aún activa',async()=>{
 await mount();const dialog=await lookup(row('Antigua activa','en_salon','A','2026-11-10T16:00:00Z'));
 expect(within(dialog).getByRole('button',{name:'Iniciar atención'}).disabled).toBe(false);
});
test.each(['en_espera','pendiente_pago','confirmada','en_salon','en_atencion'])('Buscar reserva: %s abre el formulario existente con cita futura y hora HN',async state=>{
 await mount();const dialog=await lookup(row('Futura',state,'A','2026-11-14T05:30:00Z'));
 fireEvent.click(within(dialog).getByRole('button',{name:'Reagendación de emergencia'}));await flush();
 expect(screen.queryByRole('heading',{name:'Buscar reserva'})).toBeNull();expect(screen.getAllByRole('dialog')).toHaveLength(1);
 const field=document.querySelector('input[type="datetime-local"]');expect(field.value).toBe('2026-11-13T23:30');
 fireEvent.change(field,{target:{value:'2026-11-14T10:00'}});
 fireEvent.click(screen.getByRole('button',{name:'Reagendar sin cobro'}));await flush();
 expect(mock.save).toHaveBeenCalledExactlyOnceWith('Futura',expect.objectContaining({fecha_inicio_nueva:'2026-11-14T16:00:00.000Z'}));
 expect(screen.queryByRole('dialog')).toBeNull();expect(mock.notify).toHaveBeenCalledWith('Cita reagendada por emergencia sin cobro adicional.',expect.anything());
 expect(mock.list.mock.calls.length).toBeGreaterThan(1);
});
test.each([['completada','A','admin'],['cancelada','A','admin'],['confirmada','B','admin'],['confirmada','A','barbero'],['confirmada','A','cliente']])('no ofrece emergencia: %s/%s/%s',async(state,branch,role)=>{
 mock.roles=[role];await mount();const dialog=await lookup(row('Consulta',state,branch));
 expect(within(dialog).queryByRole('button',{name:'Reagendación de emergencia'})).toBeNull();expect(within(dialog).getAllByText('Consulta',{exact:true})).toBeTruthy();
});
test('super_admin conserva formulario al fallar; cierre sin cambios permite volver a buscar',async()=>{
 mock.roles=['super_admin'];await mount();let dialog=await lookup(row('Elegida'));
 fireEvent.click(within(dialog).getByRole('button',{name:'Reagendación de emergencia'}));await flush();
 mock.save.mockRejectedValueOnce({data:{error:{code:'SLOT_NOT_AVAILABLE',message:'Horario ocupado'}}});
 fireEvent.click(screen.getByRole('button',{name:'Reagendar sin cobro'}));await flush();
 expect(screen.getByRole('heading',{name:'Reagendación de emergencia'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Cancelar',exact:true}));await flush();
 dialog=await lookup(row('Otra'));expect(within(dialog).getAllByText('Otra',{exact:true})).toBeTruthy();
});
test('open + ready sincronizan una vez; reconexión recupera citas perdidas y ráfagas se agrupan',async()=>{
 await mount();const source=sources.at(-1);mock.list.mockClear();
 source.emit('open');source.emit('ready');await flush();expect(mock.list).toHaveBeenCalledTimes(1);
 mock.list.mockResolvedValue({data:{citas:[row('Perdida')]}});source.emit('error');source.emit('open');source.emit('ready');await flush();
 expect(mock.list).toHaveBeenCalledTimes(2);expect(screen.getAllByText('Perdida',{exact:true}).length).toBeGreaterThan(0);
 for(let i=0;i<5;i++)source.emit('citas.operativas.changed');await flush();expect(mock.list).toHaveBeenCalledTimes(3);
 source.emit('ping');await flush();expect(mock.list).toHaveBeenCalledTimes(3);
});
test('evento durante consulta mantiene una sola solicitud y hace una resincronización pendiente',async()=>{
 await mount();const d=deferred();mock.list.mockClear().mockReturnValueOnce(d.promise).mockResolvedValue({data:{citas:[row('Nueva')]}});
 const source=sources.at(-1);source.emit('open');await flush();source.emit('citas.operativas.changed');await flush();
 expect(mock.list).toHaveBeenCalledTimes(1);await act(async()=>d.resolve({data:{citas:[]}}));await flush();
 expect(mock.list).toHaveBeenCalledTimes(2);expect(screen.getAllByText('Nueva',{exact:true}).length).toBeGreaterThan(0);
});
test('cambio de sucursal ignora respuesta anterior; filtros no recrean EventSource',async()=>{
 mock.context.mockResolvedValue({data:{sucursales:[{id_sucursal:'A',nombre_sucursal:'Sucursal A'},{id_sucursal:'B',nombre_sucursal:'Sucursal B'}],barberos:[]}});
 localStorage.setItem('masterfade.admin.agendamiento.selectedSucursalId','A');await mount();
 const d=deferred(),latest=deferred();mock.list.mockReturnValueOnce(d.promise).mockReturnValueOnce(latest.promise).mockResolvedValue({data:{citas:[row('Nueva B','confirmada','B')]}});
 sources.at(-1).emit('open');await flush();
 const select=[...document.querySelectorAll('select')].find(n=>[...n.options].some(o=>o.text==='Sucursal B'));
 fireEvent.change(select,{target:{value:'B'}});await flush();
 await act(async()=>d.resolve({data:{citas:[row('Obsoleta A')]}}));
 expect(screen.queryByText('Obsoleta A',{exact:true})).toBeNull();
 await act(async()=>latest.resolve({data:{citas:[row('Nueva B','confirmada','B')]}}));await flush();
 expect(mock.list.mock.calls.at(-1)[0].id_sucursal).toBe('B');expect(sources[0].closed).toBe(true);
 const count=sources.length;
 const search=screen.getByPlaceholderText(/Buscar por cliente/);fireEvent.change(search,{target:{value:'Nueva'}});await flush();
 expect(sources).toHaveLength(count);sources.at(-1).emit('error');sources.at(-1).emit('open');await flush();
 expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({id_sucursal:'B',q:'Nueva'});
});
test('conexión inicial agrupa carga inicial, open y ready; ready aislado también resincroniza',async()=>{
 render(<MemoryRouter><Page/></MemoryRouter>);await flush(50);sources.at(-1).emit('open');sources.at(-1).emit('ready');await flush();
 expect(mock.list).toHaveBeenCalledTimes(1);
 sources.at(-1).emit('error');sources.at(-1).emit('ready');await flush();expect(mock.list).toHaveBeenCalledTimes(2);
});
test('medianoche descarta respuesta tardía y reconecta sin recuperar citas del día previo',async()=>{
 vi.setSystemTime(new Date('2026-11-13T05:59:58Z'));await mount();
 const d=deferred();mock.list.mockReturnValueOnce(d.promise).mockResolvedValue({data:{citas:[row('Hoy nuevo','confirmada','A','2026-11-13T16:00:00Z')]}});
 sources.at(-1).emit('open');await flush(500);await flush(1800);
 await act(async()=>d.resolve({data:{citas:[row('Ayer tardía')]}}));await flush();
 expect(screen.queryByText('Ayer tardía',{exact:true})).toBeNull();expect(screen.getAllByText('Hoy nuevo',{exact:true}).length).toBeGreaterThan(0);
 expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({fecha_desde:'2026-11-13',fecha_hasta:'2026-11-13'});
 sources.at(-1).emit('error');sources.at(-1).emit('open');await flush();expect(mock.list.mock.calls.at(-1)[0].fecha_desde).toBe('2026-11-13');
});
