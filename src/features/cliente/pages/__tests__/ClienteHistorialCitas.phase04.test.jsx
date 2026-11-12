// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Page from '../ClienteHistorialCitasPage.jsx';
const fixture=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),notify:vi.fn()}));
const notices={error:fixture.notify,info:fixture.notify,warning:fixture.notify,success:fixture.notify};
const auth={isAuthenticated:true,isHydrated:true,isHydrating:false,user:{id_usuario:'A'},logout:fixture.notify};
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>auth}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>notices}));
vi.mock('../../../../services/httpClient.js',()=>({http:{get:fixture.get,post:fixture.post}}));
const active=['en_espera','pendiente_pago','confirmada','en_salon','en_atencion'];
const history=['completada','cancelada','cancelada_por_cliente','expirada','no_show','anulada'];
const row=(state,date)=>({id_cita:state,nombre_sucursal:'Reserva '+state,estado_cita_codigo:state,inicio_at:date,servicios:[],total_pagar_hnl:0});
let rows=[];
beforeEach(()=>{
 sessionStorage.clear();fixture.notify.mockClear();fixture.get.mockReset().mockImplementation(async url=>({data:url==='/v1/citas'?{citas:rows}:url.endsWith('/pendiente')?{pendiente:null}:{cita:rows.find(r=>url.endsWith('/'+r.id_cita)),detalles:[]}}));fixture.post.mockReset();
});
afterEach(cleanup);
async function mount(){render(<MemoryRouter initialEntries={['/citas']}><Routes><Route path='/citas' element={<Page/>}/><Route path='/agendar/pagar' element={<p>Recuperación existente</p>}/></Routes></MemoryRouter>);await screen.findByRole('button',{name:/Próximas \(/});}
for(const date of ['2020-11-13T05:30:00Z','2040-11-13T05:30:00Z'])test('11 estados sin pérdidas ni duplicados, hora HN: '+date,async()=>{
 rows=[...active,...history].map(s=>row(s,date));rows=[...rows,...rows];await mount();
 expect(screen.getByRole('button',{name:'Próximas (5)'})).toBeTruthy();expect(screen.getByRole('button',{name:'Historial (6)'})).toBeTruthy();
 for(const state of active)expect(screen.getAllByText('Reserva '+state,{exact:true})).toHaveLength(2);
 for(const state of history)expect(screen.queryByText('Reserva '+state,{exact:true})).toBeNull();
 fireEvent.click(screen.getAllByText('Reserva en_atencion',{exact:true})[0]);
 await screen.findByRole('heading',{name:'Detalle de cita'});await waitFor(()=>expect(screen.getByRole('dialog').textContent).toContain('en_atencion'));
 expect(screen.getByRole('dialog').textContent).toMatch(/12 nov.*11:30|12 nov.*23:30/i);
 fireEvent.click(screen.getByRole('button',{name:'Cerrar',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'Historial (6)'}));
 for(const state of history)expect(screen.getAllByText('Reserva '+state,{exact:true})).toHaveLength(2);
 for(const state of active)expect(screen.queryByText('Reserva '+state,{exact:true})).toBeNull();
 expect(fixture.get.mock.calls[0]).toEqual(['/v1/citas']);
});
test('recuperación pendiente conserva intención existente y navegación',async()=>{
 rows=[row('pendiente_pago','2020-11-13T05:30:00Z')];
 fixture.get.mockImplementation(async url=>({data:url.endsWith('/pendiente')?{pendiente:{id_grupo_cita:'group',citas:[],total_pendiente_hnl:100}}:{citas:rows}}));
 fixture.post.mockResolvedValue({data:{payment_intent:{id_intent:'existing',estado_intent_codigo:'pendiente'}}});await mount();
 fireEvent.click(await screen.findByRole('button',{name:'Continuar pago'}));await screen.findByRole('heading',{name:'Reserva pendiente de pago'});
 fireEvent.click(screen.getAllByRole('button',{name:'Continuar pago'}).at(-1));await screen.findByText('Recuperación existente');
 expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/v1/citas/pendiente/group/retomar',{});
 expect(JSON.parse(sessionStorage.getItem('mf_pending_payment_context_v1')).id_intent).toBe('existing');
});
