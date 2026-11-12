// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import Page from '../ClientePlanesPage.jsx';
const fixture=vi.hoisted(()=>({state:vi.fn(),list:vi.fn(),cancel:vi.fn(),notify:vi.fn(),total:0}));
const notifications={error:fixture.notify,success:fixture.notify,warning:fixture.notify};
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>({user:{id_usuario:'U'},clienteId:'C'})}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>notifications}));
vi.mock('../../lib/clienteApi.js',()=>({getClientePlanEstado:fixture.state,listClientePlanConsumos:fixture.list,cancelClientePlanBySubscription:fixture.cancel,confirmMembershipPayment:vi.fn(),createMembershipOrder:vi.fn(),createMembershipPaymentIntent:vi.fn(),queryMembershipPaymentStatus:vi.fn()}));
vi.mock('../../../public/lib/catalogApi.js',()=>({listPublicCatalogBranches:async()=>({branches:[{id_sucursal:'A',nombre_sucursal:'Centro'},{id_sucursal:'B',nombre_sucursal:'Norte'}]}),listPublicPlansByBranch:async()=>({plans:[]})}));
vi.mock('../../../plans/components/PlanPurchaseFlowDialog.jsx',()=>({default:()=>null}));
vi.mock('../../../plans/hooks/useMembershipPaymentPolling.js',()=>({default:()=>{}}));
const plan=(id='S',branch='A')=>({id_suscripcion:id,id_sucursal_contratada:branch,nombre_plan:'VIP '+id,sucursal_nombre:branch==='A'?'Centro':'Norte',estado_visible:'activa',inicio_at:'2030-01-01T06:00:00Z',fin_at:'2030-12-31T06:00:00Z',tiempo_restante:{dias:25,horas:3},remanentes:{totales:{servicios_restantes:6,servicios_total:8,cortesias_restantes:2,cortesias_total:4},servicios:[{nombre:'Corte',restante:6,total:8}],cortesias:[{nombre:'Lavado',restante:2,total:4}]}});
const result=({page=1,id_suscripcion}={})=>{const total=fixture.total,current=Math.min(page,Math.max(1,Math.ceil(total/5)));return {consumos:Array.from({length:Math.min(5,Math.max(0,total-(current-1)*5))},(_,i)=>({id_consumo:String((current-1)*5+i),item_nombre:'Consumo '+((current-1)*5+i),item_tipo:'servicio',cantidad:1,nombre_plan:id_suscripcion||'VIP S',nombre_sucursal:'Centro',created_at:'2030-01-01T16:00:00Z'})),pagination:{page:current,total,total_pages:Math.max(1,Math.ceil(total/5)),limit:5}};};
beforeEach(()=>{fixture.total=0;fixture.notify.mockClear();fixture.state.mockReset().mockResolvedValue({estado_plan:'activa',planes_activos:[plan()],historial_consumos:[]});fixture.list.mockReset().mockImplementation(async params=>result(params));fixture.cancel.mockReset().mockResolvedValue({});});
afterEach(cleanup);
const mount=async()=>{render(<Page/>);await screen.findByText(/Página 1 de/);return screen.getByRole('region',{name:'Últimos consumos del plan'});};
test.each([0,1,5,6,10,41,56])('paginación completa de %i consumos, sin duplicados ni límite 40',async total=>{
 fixture.total=total;const area=await mount();const seen=[];
 for(let page=1;page<=Math.max(1,Math.ceil(total/5));page++){
  expect(within(area).getByText(`Página ${page} de ${Math.max(1,Math.ceil(total/5))} · ${total} consumos`)).toBeTruthy();
  const items=within(area).queryAllByRole('listitem');expect(items.length).toBe(Math.min(5,Math.max(0,total-(page-1)*5)));seen.push(...items.map(n=>n.textContent.match(/Consumo \d+/)[0]));
  expect(within(area).getByRole('button',{name:'Anterior'}).disabled).toBe(page===1);
  if(page<Math.ceil(total/5)){fireEvent.click(within(area).getByRole('button',{name:'Siguiente'}));await screen.findByText(`Página ${page+1} de ${Math.ceil(total/5)} · ${total} consumos`);}
 }
 expect(new Set(seen).size).toBe(total);expect(within(area).getByRole('button',{name:'Siguiente'}).disabled).toBe(true);
});
test('nombre único, cantidades dinámicas, desglose, vigencia e Información',async()=>{
 await mount();expect(screen.getAllByText('VIP S',{exact:true})).toHaveLength(1);expect(screen.getByText('Servicios disponibles:').textContent).toContain('6 de 8');expect(screen.getByText('Cortesías disponibles:').textContent).toContain('2 de 4');expect(screen.getByText('Beneficios disponibles')).toBeTruthy();expect(screen.getByText('6/8')).toBeTruthy();expect(screen.getByText('2/4')).toBeTruthy();expect(screen.queryByText(/Titular:|Integrantes:|Cobertura: Operativo/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Información'}));expect(screen.getByRole('dialog').textContent).toContain('solo al titular');
});
test.each(['vencida','cancelada','agotada','sin_plan_activo'])('estado %s y ausencia de activos conserva lectura histórica',async state=>{
 fixture.state.mockResolvedValue({estado_plan:state,ultimo_plan:state==='sin_plan_activo'?null:{nombre_plan:'Plan anterior'}});await mount();expect(screen.getByText(state==='sin_plan_activo'?'Sin plan activo':state==='vencida'?'Vencida':state==='cancelada'?'Cancelada':'Agotada')).toBeTruthy();expect(screen.getByText('No tienes planes activos en este momento.')).toBeTruthy();expect(fixture.list).toHaveBeenCalled();
});
test('varios planes: filtrar reinicia página; reducción de resultados se ajusta al servidor',async()=>{
 fixture.state.mockResolvedValue({estado_plan:'activa',planes_activos:[plan(),plan('T','B')]});fixture.total=10;const area=await mount();
 fireEvent.click(within(area).getByRole('button',{name:'Siguiente'}));await screen.findByText('Página 2 de 2 · 10 consumos');
 fireEvent.change(screen.getByLabelText('Plan consultado'),{target:{value:'T'}});await screen.findByText('Página 1 de 2 · 10 consumos');expect(fixture.list.mock.calls.at(-1)[0]).toEqual({page:1,id_suscripcion:'T'});
 fireEvent.click(within(area).getByRole('button',{name:'Siguiente'}));await screen.findByText('Página 2 de 2 · 10 consumos');fixture.total=1;
 fireEvent.click(within(area).getByRole('button',{name:'Actualizar consumos'}));await screen.findByText('Página 1 de 1 · 1 consumos');expect(within(area).getAllByRole('listitem')).toHaveLength(1);
 fixture.total=10;fireEvent.click(within(area).getByRole('button',{name:'Actualizar consumos'}));await screen.findByText('Página 1 de 2 · 10 consumos');expect(fixture.list.mock.calls.at(-1)[0].page).toBe(1);
});
test('error no se presenta como vacío; reintento recupera la página',async()=>{
 fixture.list.mockRejectedValueOnce(new Error('detalle técnico privado'));render(<Page/>);await screen.findByRole('alert');expect(screen.queryByText('No hay consumos del plan para mostrar.')).toBeNull();expect(screen.queryByText('detalle técnico privado')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Reintentar consumos'}));await screen.findByText(/Página 1 de/);
});
test('réplicas tardías de otro filtro no reemplazan la página vigente',async()=>{
 fixture.state.mockResolvedValue({estado_plan:'activa',planes_activos:[plan(),plan('T','B')]});fixture.total=1;const area=await mount();let resolve;
 fixture.list.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));fireEvent.change(screen.getByLabelText('Plan consultado'),{target:{value:'S'}});
 fireEvent.change(screen.getByLabelText('Plan consultado'),{target:{value:'T'}});await screen.findByText('T · Centro');
 await act(async()=>resolve({consumos:[{id_consumo:'old',item_nombre:'Obsoleta'}],pagination:{page:1,total:1,total_pages:1}}));
 expect(within(area).queryByText(/Obsoleta/)).toBeNull();expect(within(area).getByText('T · Centro')).toBeTruthy();
});
test('cancelación conserva confirmación y endpoint existentes; actualiza consumos después',async()=>{
 fixture.state.mockImplementation(async()=>({estado_plan:'activa',planes_activos:[plan()]}));
 await mount();const previous=fixture.list.mock.calls.length;fireEvent.click(screen.getByRole('button',{name:'Cancelar plan',exact:true}));
 expect(fixture.cancel).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Si, cancelar plan',exact:true}));
 await screen.findByText('Página 1 de 1 · 0 consumos');expect(fixture.cancel).toHaveBeenCalledExactlyOnceWith('S');
 await waitFor(()=>expect(fixture.list.mock.calls.length).toBeGreaterThan(previous));
});
