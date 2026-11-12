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
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));localStorage.clear();sources=[];vi.stubGlobal('EventSource',Source);mock.roles=['admin'];
 mock.context.mockReset().mockResolvedValue({data:{sucursales:[{id_sucursal:'A',nombre_sucursal:'Sucursal A'}],barberos:[]}});
 mock.list.mockReset().mockResolvedValue({data:{citas:[]}});mock.search.mockReset();mock.save.mockReset().mockResolvedValue({data:{}});mock.notify.mockReset();
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
async function mount(){render(<MemoryRouter><Page/></MemoryRouter>);await flush();}
async function lookup(cita){
 mock.search.mockResolvedValue({data:{reservas:[{id_grupo_cita:'G',codigo_reserva:'ABCDE',citas:[cita]}]}});
 fireEvent.click(screen.getByRole('button',{name:'Buscar reserva'}));fireEvent.change(screen.getByLabelText('Código de reserva'),{target:{value:'ABCDE'}});
 fireEvent.click(screen.getByRole('button',{name:'Buscar',exact:true}));await flush();
 return screen.getByRole('dialog');
}
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
