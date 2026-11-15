// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../BarberoHomePage.jsx';
const fixture=vi.hoisted(()=>({user:{id_usuario:'U',empleado_id:'A'},list:vi.fn(),completed:vi.fn(),noop:vi.fn()}));
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>({user:fixture.user,isAuthenticated:true,invalidateSession:fixture.noop}),getUserDisplayName:()=> 'Fixture'}));
vi.mock('react-router-dom',()=>({useNavigate:()=>fixture.noop}));
vi.mock('../../../admin/lib/adminCitasApi.js',()=>({
  getAdminCitasOperativasContexto:async()=>({data:{sucursales:[],barberos:[]}}),
  listAdminCitasOperativas:fixture.list,getAdminCitasOperativasCompletadasHoy:fixture.completed,
}));
const row=(id,state='confirmada',start='2026-11-12T14:00:00Z',barber='A')=>({id_cita:id,nombre_cliente:id,id_empleado_barbero:barber,estado_cita_codigo:state,inicio_at:start});
const flush=async()=>{await act(async()=>{await vi.advanceTimersByTimeAsync(10);});};
const stats=()=>['Citas Totales','Citas Completadas','Citas Restantes'].map(label=>Number(screen.getByText(label).parentElement.lastElementChild.textContent));
beforeEach(()=>{
  fixture.user={id_usuario:'U',empleado_id:'A'};vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));
  fixture.list.mockReset().mockResolvedValue({data:{citas:[]}});
  fixture.completed.mockReset().mockResolvedValue({data:{citas:[]}});
});
afterEach(()=>{cleanup();vi.useRealTimers();});
test('insignias legibles conservan colores, códigos y conteo diario',async()=>{
 const cases=[['confirmada','Confirmada','text-emerald-300'],['en_salon','En salón','text-amber-300'],['en_atencion','En atención','text-indigo-300'],['en_espera','En espera','text-sky-300'],['pendiente_pago','Pendiente de pago','text-[var(--mf-accent)]']];
 const rows=cases.map(([state],i)=>row('Cliente '+i,state));fixture.list.mockResolvedValue({data:{citas:rows}});
 render(<Page/>);await flush();expect(stats()).toEqual([5,0,5]);
 for(const [,label,color]of cases){
  const badges=screen.getAllByText(label,{exact:true});expect(badges.length).toBeGreaterThan(0);
  expect(badges.some(node=>node.classList.contains(color))).toBe(true);
 }
 expect(rows.map(r=>r.estado_cita_codigo)).toEqual(cases.map(([state])=>state));
});
test('cuenta únicos de la jornada y del barbero: total = completadas + restantes',async()=>{
  const active=['confirmada','en_salon','en_atencion'].map(state=>row(state,state));
  const foreign=['confirmada','en_salon','en_atencion','completada'].flatMap(state=>[
    row('ayer-'+state,state,'2026-11-12T05:59:59.999Z'),
    row('mañana-'+state,state,'2026-11-13T06:00:00Z'),
    row('otro-'+state,state,'2026-11-12T18:00:00Z','B'),
  ]);
  fixture.list.mockResolvedValue({data:{citas:[...active,...active,...foreign,row('done','confirmada')]}});
  fixture.completed.mockResolvedValue({data:{citas:[row('done','completada'),row('done','completada'),...foreign]}});
  render(<Page/>);await flush();
  expect(stats()).toEqual([4,1,3]);
  expect(screen.queryByText(/ayer-|mañana-|otro-/)).toBeNull();
  for(const mock of [fixture.list,fixture.completed])expect(mock.mock.calls[0][0]).toMatchObject({fecha_desde:'2026-11-12',fecha_hasta:'2026-11-12',zona_horaria:'America/Tegucigalpa',id_empleado_barbero:'A'});
});
test('medianoche descarta toda la lectura vieja, incluso si contenía citas del nuevo día',async()=>{
  vi.setSystemTime(new Date('2026-11-13T05:59:59Z'));
  let finish;
  fixture.list.mockResolvedValueOnce({data:{citas:[row('ayer-viejo'),row('mañana-viejo','confirmada','2026-11-13T14:00:00Z')]}})
    .mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(<Page/>);await flush();expect(stats()).toEqual([1,0,1]);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1100);});await flush();
  expect(screen.getByText('Cargando...')).toBeTruthy();
  expect(screen.queryByText('ayer-viejo')).toBeNull();expect(screen.queryByText('mañana-viejo')).toBeNull();
  expect(fixture.list.mock.calls.at(-1)[0].fecha_desde).toBe('2026-11-13');
  await act(async()=>{finish({data:{citas:[row('nuevo','confirmada','2026-11-13T14:00:00Z')]}});});await flush();
  expect(screen.getByText('Fecha 2026-11-13')).toBeTruthy();expect(stats()).toEqual([1,0,1]);
});
test('respuestas fuera de orden no reponen datos de otro barbero',async()=>{
  let finish;
  fixture.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}))
    .mockResolvedValue({data:{citas:[row('propio-B','confirmada','2026-11-12T14:00:00Z','B')]}});
  const view=render(<Page/>);await flush();
  fixture.user={id_usuario:'U2',empleado_id:'B'};view.rerender(<Page/>);await flush();
  expect(stats()).toEqual([1,0,1]);
  await act(async()=>{finish({data:{citas:[row('lectura-A')]}});});await flush();
  expect(stats()).toEqual([1,0,1]);expect(screen.queryByText('lectura-A')).toBeNull();
});
test('sin empleado autenticado no consulta ni muestra datos',async()=>{
  fixture.user={id_usuario:'U'};render(<Page/>);await flush();
  expect(stats()).toEqual([0,0,0]);expect(fixture.list).not.toHaveBeenCalled();
});
test('una respuesta pendiente de ayer no reemplaza la lectura de la jornada nueva',async()=>{
  vi.setSystemTime(new Date('2026-11-13T05:59:59Z'));
  let finish;
  fixture.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}))
    .mockResolvedValue({data:{citas:[row('vigente','confirmada','2026-11-13T14:00:00Z')]}});
  render(<Page/>);await flush();
  await act(async()=>{await vi.advanceTimersByTimeAsync(1100);});await flush();
  expect(stats()).toEqual([1,0,1]);
  await act(async()=>{finish({data:{citas:[row('respuesta-obsoleta')]}});});await flush();
  expect(stats()).toEqual([1,0,1]);expect(screen.queryByText('respuesta-obsoleta')).toBeNull();
});
