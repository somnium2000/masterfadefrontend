// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Page from '../AdminAgendamientoCitasPage.jsx';
import History from '../AdminAgendamientoHistorialPage.jsx';
import { operationalDay, compareAppointmentStart, compareAppointmentHistory } from '../../lib/adminAppointmentOrdering.js';

const mock = vi.hoisted(()=>({list:vi.fn(),history:vi.fn(),search:vi.fn(),notify:vi.fn()}));
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>({isAuthenticated:true,invalidateSession:mock.notify})}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>({warning:mock.notify,error:mock.notify,success:mock.notify})}));
vi.mock('../../lib/adminCitasApi.js',()=>({
  getAdminCitasOperativasContexto:async()=>({data:{sucursales:[{id_sucursal:'branch',nombre_sucursal:'Sucursal'}],barberos:[]}}),
  listAdminCitasOperativas:mock.list,searchAdminReservation:mock.search,
  listAdminCitasHistorial:mock.history,
  listAdminCitasAfectadasReagendacion:vi.fn(),listPublicAgendaHorarios:vi.fn(),
  postAdminCitaFinalizarAtencion:vi.fn(),postAdminCitaIniciarAtencion:vi.fn(),
  postAdminCitaRegistrarLlegada:vi.fn(),postAdminCitaReagendarEmergencia:vi.fn(),postAdminCitasReagendarEmergenciaLote:vi.fn(),
}));
const row=(name,date,state='confirmada')=>({id_cita:name,alias_integrante:name,nombre_cliente:name,estado_cita_codigo:state,inicio_at:date,id_sucursal:'branch',servicios:[]});
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));localStorage.clear();
  vi.stubGlobal('EventSource',class{addEventListener(){}close(){}});
  mock.list.mockReset().mockResolvedValue({data:{citas:[]}});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
const flush=async()=>{await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});};

test.each([['cards',390],['table',1440]])('%s a %ipx: orden de hoy, no ayer/mañana en todos los estados',async(view,width)=>{
  Object.defineProperty(window,'innerWidth',{value:width,configurable:true});
  localStorage.setItem('mf-view-agendamiento-citas',view);
  const rows=['confirmada','en_salon','en_atencion'].flatMap(state=>[
    row(state+'-15','2026-11-12T21:00:00Z',state),row(state+'-08','2026-11-12T14:00:00Z',state),
    row(state+'-10','2026-11-12T16:00:00Z',state),row('AYER-'+state,'2026-11-12T05:59:59Z',state),
    row('MAÑANA-'+state,'2026-11-13T06:00:00Z',state),
  ]);
  mock.list.mockResolvedValue({data:{citas:rows}});
  render(<MemoryRouter><Page/></MemoryRouter>);await flush();
  expect(mock.list).toHaveBeenCalled();
  expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({fecha_desde:'2026-11-12',fecha_hasta:'2026-11-12',zona_horaria:'America/Tegucigalpa'});
  expect(screen.queryByText(/AYER-/)).toBeNull();expect(screen.queryByText(/MAÑANA-/)).toBeNull();
  for(const state of ['confirmada','en_salon','en_atencion']){
    const names=Array.from(document.querySelectorAll(view==='cards'?'h3':'tbody tr')).map(node=>node.textContent).filter(text=>text.includes(state+'-'));
    // AM: La vista móvil y la de escritorio comparten datos; JSDOM no aplica media queries.
    for(let i=0;i<names.length;i+=3)expect(names.slice(i,i+3).map(name=>name.match(/-(08|10|15)/)[1])).toEqual(['08','10','15']);
    expect(names.length).toBeGreaterThan(0);
  }
});
test('medianoche Honduras cambia fecha y recarga sin intervención',async()=>{
  vi.setSystemTime(new Date('2026-11-13T05:59:58Z'));
  mock.list.mockResolvedValue({data:{citas:[row('DIA-ANTERIOR','2026-11-12T21:00:00Z')]}});
  render(<MemoryRouter><Page/></MemoryRouter>);await flush();
  expect(mock.list.mock.calls.at(-1)[0].fecha_desde).toBe('2026-11-12');
  await act(async()=>{await vi.advanceTimersByTimeAsync(2500);});
  await flush();
  expect(mock.list.mock.calls.at(-1)[0].fecha_desde).toBe('2026-11-13');
  expect(screen.queryByText('DIA-ANTERIOR')).toBeNull();
});
test('Historial consume páginas distintas y ordena empates sin duplicar registros',async()=>{
  localStorage.setItem('mf-view-agendamiento-historial','table');
  const a=row('A','2026-11-12T14:00:00Z'),b=row('B','2026-11-12T14:00:00Z'),c=row('C','2026-11-10T14:00:00Z');
  const first=[a,b,...Array.from({length:7},(_,i)=>row('Older-'+i,'2026-11-11T14:00:00Z'))];
  mock.history.mockImplementation(async({page})=>({data:{citas:page===1?first:[c],pagination:{page,limit:9,total:10,total_pages:2,has_next:page===1,has_prev:page===2}}}));
  render(<MemoryRouter><History/></MemoryRouter>);await flush();
  const names=()=>Array.from(document.querySelectorAll('tbody tr')).map(node=>node.textContent);
  expect(names()[0]).toContain('B');expect(names()[1]).toContain('A');
  fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));await flush();
  expect(mock.history.mock.calls.at(-1)[0]).toMatchObject({page:2,limit:9});
  expect(names()).toHaveLength(1);expect(names()[0]).toContain('C');
  expect(screen.queryByText('A',{exact:true})).toBeNull();
});
test('fechas UTC distintas respetan Honduras; historial desempata por ID descendente',()=>{
  expect(operationalDay('2026-11-13T05:59:59Z')).toBe('2026-11-12');
  expect(operationalDay('2026-11-13T15:00:00+09:00')).toBe('2026-11-13');
  const data=[row('b','2026-11-12T10:00:00-06:00'),row('a','2026-11-12T08:00:00-06:00'),row('c','2026-11-12T10:00:00-06:00')];
  expect([...data].sort(compareAppointmentStart).map(x=>x.id_cita)).toEqual(['a','b','c']);
  expect([...data].sort(compareAppointmentHistory).map(x=>x.id_cita)).toEqual(['c','b','a']);
});
const serviceCases=[
  ['un servicio', {servicios_detalle:[{nombre_servicio:'Corte cabello'}]}, ['Corte cabello']],
  ['varios servicios y duplicados entre formatos', {
    servicios_detalle:[{nombre_servicio:'Corte cabello'},{nombre_servicio:'Barba'},{nombre_servicio:'Lavado'}],
    servicios_manual:[{nombre_servicio_snapshot:' Corte cabello '}],
    servicios_extra:['Barba'],servicios_incluidos:[{nombre:'Lavado'}],
  }, ['Corte cabello','Barba','Lavado']],
  ['formato anterior', {
    servicios_manual:[{nombre_servicio_snapshot:'Corte cabello'},{servicio_nombre:'Barba'}],
    servicios_incluidos:['Lavado'],servicios_extra:[{nombre:'Corte cabello'}],
  }, ['Corte cabello','Barba','Lavado']],
  ['sin servicios', {servicios_detalle:null,servicios_manual:[],servicios_extra:null,servicios_incluidos:[]}, []],
];
for(const [view,width] of [['cards',390],['table',390],['cards',1440],['table',1440]]){
  test.each(serviceCases)(view+' '+width+': %s en resumen y Ver detalle',async(_label,fields,names)=>{
    Object.defineProperty(window,'innerWidth',{value:width,configurable:true});
    localStorage.setItem('mf-view-agendamiento-citas',view);
    mock.list.mockResolvedValue({data:{citas:[{
      ...row('Reserva sintética','2026-11-12T14:00:00Z'),...fields,
    }]}});
    render(<MemoryRouter><Page/></MemoryRouter>);await flush();
    const summary=names.length>1?names[0]+' + '+(names.length-1)+' más':names[0]||'Sin servicios registrados';
    const surfaces=[...document.querySelectorAll(view==='cards'?'article':'tbody tr')];
    expect(surfaces.length).toBeGreaterThan(0);
    for(const surface of surfaces){
      const detail=surface.querySelector('details');
      expect(detail).not.toBeNull();
      expect(detail.querySelector('summary').textContent).toBe('Ver detalle');
      fireEvent.click(detail.querySelector('summary'));
      const services=[...detail.querySelectorAll('p')].find(node=>node.textContent.startsWith('Servicios: '));
      expect(services.querySelector('span').textContent).toBe(names.length?names.join(' · '):'Sin servicios registrados');
      const compact=[...surface.querySelectorAll('p')].filter(node=>!node.closest('details')).map(node=>node.textContent);
      expect(compact.some(text=>text===summary||text==='Servicio: '+summary)).toBe(true);
      if(names.length)expect(surface.textContent).not.toContain('Sin servicios registrados');
    }
  });
}
