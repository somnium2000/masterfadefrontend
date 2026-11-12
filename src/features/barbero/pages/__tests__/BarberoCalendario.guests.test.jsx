// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import Page from '../BarberoCalendarioPage.jsx';
const mock=vi.hoisted(()=>({list:vi.fn()}));
vi.mock('../../../admin/lib/adminCitasApi.js',()=>({listAdminCitasOperativas:mock.list}));
const row=(id,name,start)=>({id_cita:id,nombre_cliente:name,inicio_at:start,estado_cita_codigo:'confirmada',id_persona_cliente:id==='holder'?'persona':null,servicios_detalle:[{nombre_servicio:'Corte reservado'}]});
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2030-06-15T16:00:00Z'));mock.list.mockReset();});
afterEach(()=>{cleanup();vi.useRealTimers();});
test('consulta jornada HN explícita y muestra titular e invitado a las 08:00/09:00',async()=>{
 mock.list.mockResolvedValue({data:{citas:[row('holder','Titular registrado','2030-06-15T14:00:00Z'),row('guest','Invitado sin cuenta','2030-06-15T15:00:00Z'),row('next','Mañana','2030-06-16T06:00:00Z')]}});
 render(<MemoryRouter><Page/></MemoryRouter>);await act(async()=>{});
 expect(mock.list.mock.calls[0][0]).toMatchObject({zona_horaria:'America/Tegucigalpa',fecha_desde:'2030-06-01',fecha_hasta:'2030-06-30',estado:'confirmada'});
 expect(screen.getByText('Titular registrado')).toBeTruthy();expect(screen.getByText('Invitado sin cuenta')).toBeTruthy();expect(screen.queryByText('Mañana',{exact:true})).toBeNull();
 expect(screen.getAllByText('Corte reservado')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Mes siguiente'}));await act(async()=>{});expect(mock.list.mock.calls.at(-1)[0]).toMatchObject({zona_horaria:'America/Tegucigalpa',fecha_desde:'2030-07-01',fecha_hasta:'2030-07-31'});
});
