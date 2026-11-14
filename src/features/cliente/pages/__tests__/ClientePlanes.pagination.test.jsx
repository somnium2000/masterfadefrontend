// @vitest-environment jsdom
// AM: APIs sinteticas; cada respuesta contiene citas completas ya paginadas por el servidor.
import {act,cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {StrictMode} from 'react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import Page from '../ClientePlanesPage.jsx';
const fixture=vi.hoisted(()=>({state:vi.fn(),list:vi.fn(),cancel:vi.fn(),notify:vi.fn(),catalog:vi.fn(),branches:vi.fn(),total:0,auth:{user:{id_usuario:'U'},clienteId:'C'},memberships:[]}));
const notifications={error:fixture.notify,success:fixture.notify,warning:fixture.notify};
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>fixture.auth}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>notifications}));
vi.mock('../../../../hooks/usePrivateCommerce.js',()=>({default:()=>({booking:false,vipPurchase:false})}));
vi.mock('../../lib/clienteApi.js',()=>({getClientePlanEstado:fixture.state,listClientePlanConsumosPorCita:fixture.list,cancelClientePlanBySubscription:fixture.cancel,confirmMembershipPayment:vi.fn(),createMembershipOrder:vi.fn(),createMembershipPaymentIntent:vi.fn(),queryMembershipPaymentStatus:vi.fn()}));
vi.mock('../../../public/lib/catalogApi.js',()=>({listPublicCatalogBranches:fixture.branches,listPublicPlansByBranch:fixture.catalog}));
vi.mock('../../../plans/components/PlanPurchaseFlowDialog.jsx',()=>({default:()=>null}));
vi.mock('../../../plans/hooks/useMembershipPaymentPolling.js',()=>({default:()=>{}}));
const plan=(id='S',branch='A',status='activa')=>({id_suscripcion:id,id_sucursal_contratada:branch,nombre_plan:'VIP '+id,sucursal_nombre:branch==='A'?'Centro':'Norte',estado_visible:status,inicio_at:'2030-01-01T06:00:00Z',fin_at:'2030-12-31T06:00:00Z',tiempo_restante:{dias:25,horas:3},remanentes:{totales:{servicios_restantes:6,servicios_total:8,cortesias_restantes:2,cortesias_total:4},servicios:[{nombre:'Corte',restante:6,total:8}],cortesias:[{nombre:'Lavado',restante:2,total:4}]}});
const group=(index,subscription='S',count=3)=>({key:'cita:'+index,id_cita:'CITA-'+index,tipo:'cita',inicio_at:'2030-01-02T02:00:00Z',created_at:'2030-01-02T03:00:00Z',nombre_sucursal:'Centro',planes:[{id_suscripcion:subscription,nombre_plan:'VIP '+subscription}],consumos:Array.from({length:count},(_,i)=>({id_consumo:index+'-'+i,item_nombre:`Beneficio ${index}-${i}`,item_tipo:i===2?'cortesia':'servicio',cantidad:i+1,id_suscripcion:subscription,nombre_plan:'VIP '+subscription,created_at:'2030-01-02T03:00:00Z'}))});
const result=({page=1,id_suscripcion}={})=>{
 const total=fixture.total,current=Math.min(page,Math.max(1,Math.ceil(total/5)));
 return {citas:Array.from({length:Math.min(5,Math.max(0,total-(current-1)*5))},(_,i)=>group((current-1)*5+i,id_suscripcion||'S')),
  membresias:fixture.memberships,pagination:{page:current,total,total_pages:Math.max(1,Math.ceil(total/5)),limit:5,has_previous:current>1,has_next:current<Math.ceil(total/5)},total_consumos:total*3};
};
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{
 fixture.total=0;fixture.auth={user:{id_usuario:'U'},clienteId:'C'};fixture.memberships=[plan(),plan('OLD','A','cancelada')];localStorage.clear();
 fixture.notify.mockClear();fixture.state.mockReset().mockResolvedValue({estado_plan:'activa',planes_activos:[plan()],historial_membresias:fixture.memberships});
 fixture.list.mockReset().mockImplementation(async params=>result(params));fixture.cancel.mockReset().mockResolvedValue({});
 fixture.catalog.mockReset().mockResolvedValue({plans:[]});fixture.branches.mockReset().mockResolvedValue({branches:[{id_sucursal:'A',nombre_sucursal:'Centro'},{id_sucursal:'B',nombre_sucursal:'Norte'}]});
 Element.prototype.scrollIntoView=vi.fn();
});
afterEach(cleanup);
const mount=async()=>{const view=render(<Page/>);await screen.findByText(/Página 1 de/);return {...view,area:screen.getByRole('region',{name:'Historial de consumos'})};};
const cards=area=>area.querySelectorAll('.cliente-plans-consumption-card');
const membershipHistory=()=>{const details=screen.getByText('Historial de membresías').closest('details');if(!details.open)fireEvent.click(details.querySelector('summary'));expect(details.open).toBe(true);return details;};

test.each([0,1,5,6,10,41,56])('pagina %i citas completas, tres beneficios por cita sin dividir ni duplicar',async total=>{
 fixture.total=total;const {area}=await mount();const seen=[];
 for(let page=1;page<=Math.max(1,Math.ceil(total/5));page++){
  expect(within(area).getByText(new RegExp(`Página ${page} de ${Math.max(1,Math.ceil(total/5))}`))).toBeTruthy();
  const entries=cards(area);expect(entries.length).toBe(Math.min(5,Math.max(0,total-(page-1)*5)));
  for(const card of entries){expect(within(card).getAllByRole('listitem')).toHaveLength(3);seen.push(within(card).getAllByRole('listitem')[0].textContent.match(/Beneficio \d+-0/)[0]);}
  expect(within(area).getByRole('button',{name:'Anterior'}).disabled).toBe(page===1);
  if(page<Math.ceil(total/5)){fireEvent.click(within(area).getByRole('button',{name:'Siguiente'}));await within(area).findByText(new RegExp(`Página ${page+1} de`));}
 }
 expect(new Set(seen).size).toBe(total);expect(within(area).getByRole('button',{name:'Siguiente'}).disabled).toBe(true);
});

test('plan activo conserva cantidades, cobertura, vigencia y modal de Información',async()=>{
 await mount();expect(screen.getByRole('heading',{level:1,name:'VIP S'})).toBeTruthy();expect(screen.getByText('Servicios disponibles:').textContent).toContain('6 de 8');expect(screen.getByText('Cortesías disponibles:').textContent).toContain('2 de 4');expect(screen.getByText('Beneficios disponibles')).toBeTruthy();expect(screen.getByText('6/8')).toBeTruthy();expect(screen.getByText('2/4')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Información'}));expect(screen.getByRole('dialog').textContent).toContain('solo al titular');
});

test.each(['vencida','cancelada','agotada','sin_plan_activo'])('sin activos: encabezado correcto y plan %s en seccion secundaria',async status=>{
 const old=plan('OLD','A',status);fixture.memberships=status==='sin_plan_activo'?[]:[old];
 fixture.state.mockResolvedValue({estado_plan:status,planes_activos:[],ultimo_plan:fixture.memberships[0]||null,historial_membresias:fixture.memberships});
 const {area}=await mount();expect(screen.getByRole('heading',{level:1,name:'Sin membresía activa'})).toBeTruthy();
 const catalog=screen.getByRole('heading',{name:'Planes por sucursal'});expect(catalog.compareDocumentPosition(area)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 if(status!=='sin_plan_activo'){const history=membershipHistory();expect(within(history).getByText('VIP OLD')).toBeTruthy();expect(screen.getAllByText('VIP OLD').some(node=>node.tagName==='H1')).toBe(false);}
});

test('membresía anterior cancelada permanece junto a una nueva activa y consumos historicos',async()=>{
 fixture.total=1;fixture.list.mockImplementation(async()=>({...result(),citas:[group(1,'OLD')]}));
 const {area}=await mount();expect(screen.getByRole('heading',{level:1,name:'VIP S'})).toBeTruthy();
 expect(within(area).getByText('VIP OLD')).toBeTruthy();expect(within(membershipHistory()).getByText('VIP OLD')).toBeTruthy();
 expect(screen.getByLabelText('Plan consultado').textContent).toContain('VIP OLD');
});

test('las fechas de citas se muestran en Honduras y cada registro sin cita permanece separado',async()=>{
 fixture.total=3;fixture.list.mockResolvedValue({...result(),citas:[group(1),...['L1','L2'].map(id=>({key:'consumo:'+id,id_cita:null,tipo:'sin_cita',created_at:'2030-01-02T02:00:00Z',nombre_sucursal:'Centro',planes:[],consumos:[{id_consumo:id,item_nombre:'Registro '+id,item_tipo:'cortesia',cantidad:1}]}))]});
 const {area}=await mount();expect(cards(area)).toHaveLength(3);
 expect(within(area).getAllByText('Consumo sin cita asociada')).toHaveLength(2);
 const date=cards(area)[0].querySelector('time');expect(date.dateTime).toBe('2030-01-02T02:00:00Z');expect(date.textContent).toMatch(/^01/);expect(date.textContent).toContain('08:00');
 expect(within(cards(area)[0]).getByText('Beneficio 1-2')).toBeTruthy();expect(within(cards(area)[0]).getByLabelText('Cantidad: 3').textContent).toBe('×3');expect(within(cards(area)[0]).getByText('Cortesía',{exact:true})).toBeTruthy();
});

test('cada cambio de filtro reinicia pagina y la reduccion se ajusta al servidor',async()=>{
 fixture.total=6;const {area}=await mount();fireEvent.click(within(area).getByRole('button',{name:'Siguiente'}));await within(area).findByText(/Página 2 de 2/);
 fireEvent.change(screen.getByLabelText('Plan consultado'),{target:{value:'OLD'}});await within(area).findByText(/Página 1 de 2/);expect(fixture.list.mock.calls.at(-1)[0]).toEqual({page:1,id_suscripcion:'OLD'});
 fireEvent.click(within(area).getByRole('button',{name:'Siguiente'}));await within(area).findByText(/Página 2 de 2/);fixture.total=1;
 fireEvent.click(within(area).getByRole('button',{name:'Actualizar consumos'}));await within(area).findByText(/Página 1 de 1/);expect(cards(area)).toHaveLength(1);
 fixture.total=6;fireEvent.click(within(area).getByRole('button',{name:'Actualizar consumos'}));await within(area).findByText(/Página 1 de 2/);expect(fixture.list.mock.calls.at(-1)[0].page).toBe(1);
});

test('carga, error y vacio son diferentes y el reintento conserva datos seguros',async()=>{
 const pending=deferred();fixture.list.mockReturnValueOnce(pending.promise);render(<Page/>);await screen.findByText('Cargando consumos...');expect(screen.queryByText('No hay consumos del plan para mostrar.')).toBeNull();
 await act(async()=>pending.resolve(result()));await screen.findByText(/Página 1 de/);
 fixture.list.mockRejectedValueOnce(new Error('SQL PRIVATE DETAIL'));fireEvent.click(screen.getByRole('button',{name:'Actualizar consumos'}));await screen.findByRole('alert');
 expect(screen.queryByText('SQL PRIVATE DETAIL')).toBeNull();expect(screen.queryByText('No hay consumos del plan para mostrar.')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Reintentar consumos'}));await screen.findByText(/Página 1 de/);
});

test('respuesta tardia de otro filtro no reemplaza la pagina vigente',async()=>{
 fixture.total=1;const {area}=await mount(),pending=deferred();fixture.list.mockReturnValueOnce(pending.promise);
 fireEvent.change(screen.getByLabelText('Plan consultado'),{target:{value:'S'}});fireEvent.change(screen.getByLabelText('Plan consultado'),{target:{value:'OLD'}});await within(area).findByText('VIP OLD');
 await act(async()=>pending.resolve({...result(),citas:[{...group(99),consumos:[{id_consumo:'stale',item_nombre:'Obsoleta'}]}]}));
 expect(within(area).queryByText('Obsoleta')).toBeNull();expect(within(area).getByText('VIP OLD')).toBeTruthy();
});

test('cambio de identidad retira la membresia y consumos anteriores y descarta su respuesta tardia',async()=>{
 fixture.total=1;const {rerender,area}=await mount(),pending=deferred();fixture.list.mockReturnValueOnce(pending.promise);
 fireEvent.click(within(area).getByRole('button',{name:'Actualizar consumos'}));
 fixture.auth={user:{id_usuario:'USER-B'},clienteId:'CLIENT-B'};fixture.state.mockResolvedValue({estado_plan:'sin_plan_activo',planes_activos:[],historial_membresias:[]});fixture.memberships=[];fixture.total=0;
 rerender(<Page/>);expect(screen.queryByRole('heading',{name:'VIP S'})).toBeNull();await screen.findByRole('heading',{name:'Sin membresía activa'});
 await act(async()=>pending.resolve({...result(),citas:[group('PRIVATE-A')]}));expect(screen.queryByText(/PRIVATE-A/)).toBeNull();
});

test('cancelacion sintetica refresca estado sin volver a promover el plan cancelado',async()=>{
 const {area}=await mount();const previous=fixture.list.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:'Cancelar plan',exact:true}));expect(fixture.cancel).not.toHaveBeenCalled();
 const old=plan('S','A','cancelada');fixture.memberships=[old];fixture.state.mockResolvedValue({estado_plan:'cancelada',planes_activos:[],ultimo_plan:old,historial_membresias:[old]});
 fireEvent.click(screen.getByRole('button',{name:'Si, cancelar plan',exact:true}));
 await screen.findByRole('heading',{level:1,name:'Sin membresía activa'});expect(fixture.cancel).toHaveBeenCalledExactlyOnceWith('S');
 expect(within(membershipHistory()).getByText('VIP S')).toBeTruthy();await waitFor(()=>expect(fixture.list.mock.calls.length).toBeGreaterThan(previous));
 expect(screen.getByRole('heading',{name:'Planes por sucursal'}).compareDocumentPosition(area)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test.each([['B','B'],['invalid','A']])('recupera sucursal anterior %s solo si sigue siendo valida',async(stored,expected)=>{
 localStorage.setItem('mf_cliente_catalog_sucursal',stored);await mount();expect(screen.getByLabelText('Sucursal').value).toBe(expected);expect(fixture.catalog).toHaveBeenCalledWith(expected);
 fireEvent.click(screen.getByRole('button',{name:'Explorar planes'}));expect(document.activeElement).toBe(screen.getByRole('heading',{name:'Planes por sucursal'}));
});

test('error de membresia no se confunde con ausencia y permite explorar el catalogo',async()=>{
 fixture.state.mockRejectedValueOnce(new Error('SQL PRIVATE MEMBERSHIP'));render(<Page/>);
 await screen.findByText('No se pudo consultar tu membresía. Intenta nuevamente.');
 expect(screen.queryByRole('heading',{name:'Sin membresía activa'})).toBeNull();expect(screen.queryByText('SQL PRIVATE MEMBERSHIP')).toBeNull();
 expect(screen.getByRole('heading',{name:'Planes por sucursal'})).toBeTruthy();expect(fixture.catalog).toHaveBeenCalledWith('A');
 fireEvent.click(screen.getByRole('button',{name:'Reintentar membresía'}));await screen.findByRole('heading',{name:'VIP S'});await screen.findByText(/Página 1 de/);
});

test('error de catalogo no oculta consumos y se recupera sin cambiar sucursal',async()=>{
 fixture.catalog.mockRejectedValueOnce(new Error('SQL PRIVATE CATALOG'));const {area}=await mount();
 expect(screen.getByText('No se pudieron cargar los planes de esta sucursal.')).toBeTruthy();expect(screen.queryByText('SQL PRIVATE CATALOG')).toBeNull();
 expect(within(area).getByText(/Página 1 de/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Reintentar catálogo'}));
 await waitFor(()=>expect(screen.queryByText('No se pudieron cargar los planes de esta sucursal.')).toBeNull());expect(screen.getByLabelText('Sucursal').value).toBe('A');
});

test('respuestas antiguas de catalogo no sustituyen la sucursal seleccionada',async()=>{
 await mount();const pending=deferred(),offer=name=>({id_plan:name,id_plan_sucursal:name,nombre_plan:name,precio_hnl:300,periodo_membresia_codigo:'mensual',categoria_nivel:1,beneficios:[]});
 fixture.catalog.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({plans:[offer('Plan vigente')]});
 fireEvent.change(screen.getByLabelText('Sucursal'),{target:{value:'B'}});fireEvent.change(screen.getByLabelText('Sucursal'),{target:{value:'A'}});
 await screen.findByRole('heading',{name:'Plan vigente'});await act(async()=>pending.resolve({plans:[offer('Plan obsoleto')]}));
 expect(screen.queryByText('Plan obsoleto')).toBeNull();expect(screen.getByLabelText('Sucursal').value).toBe('A');
});

test('tras cancelar, un error de refresco no conserva beneficios activos obsoletos',async()=>{
 await mount();fireEvent.click(screen.getByRole('button',{name:'Cancelar plan',exact:true}));fixture.state.mockRejectedValueOnce(new Error('PRIVATE REFRESH'));
 fireEvent.click(screen.getByRole('button',{name:'Si, cancelar plan',exact:true}));await screen.findByText('No se pudo consultar tu membresía. Intenta nuevamente.');
 expect(screen.queryByRole('heading',{name:'VIP S'})).toBeNull();expect(screen.queryByText('Beneficios disponibles')).toBeNull();expect(screen.queryByText('PRIVATE REFRESH')).toBeNull();
});

test('StrictMode descarta la carga inicial antigua sin reemplazar la sucursal elegida',async()=>{
 const oldBranches=deferred(),oldMembership=deferred(),currentBranches=deferred(),currentMembership=deferred();
 fixture.branches.mockReset().mockReturnValueOnce(oldBranches.promise).mockReturnValueOnce(currentBranches.promise);
 fixture.state.mockReset().mockReturnValueOnce(oldMembership.promise).mockReturnValueOnce(currentMembership.promise);
 fixture.catalog.mockImplementation(async branch=>({plans:[{id_plan:branch,id_plan_sucursal:branch,nombre_plan:branch==='A'?'Plan Centro':'Plan Norte',precio_hnl:300,periodo_membresia_codigo:'mensual',categoria_nivel:1,beneficios:[]}]}));
 render(<StrictMode><Page/></StrictMode>);
 expect(fixture.branches).toHaveBeenCalledTimes(2);expect(fixture.state).toHaveBeenCalledTimes(2);
 await act(async()=>{
  currentBranches.resolve({branches:[{id_sucursal:'A',nombre_sucursal:'Centro'},{id_sucursal:'B',nombre_sucursal:'Norte'}]});
  currentMembership.resolve({estado_plan:'activa',planes_activos:[plan()],historial_membresias:fixture.memberships});
 });
 await screen.findByRole('heading',{name:'Plan Centro'});
 fireEvent.change(screen.getByLabelText('Sucursal'),{target:{value:'B'}});await screen.findByRole('heading',{name:'Plan Norte'});
 const catalogCalls=fixture.catalog.mock.calls.length;
 await act(async()=>{
  oldBranches.resolve({branches:[{id_sucursal:'A',nombre_sucursal:'Centro'}]});
  oldMembership.resolve({estado_plan:'activa',planes_activos:[plan('ANTERIOR')],historial_membresias:[plan('ANTERIOR')]});
 });
 expect(screen.getByLabelText('Sucursal').value).toBe('B');expect(screen.getByRole('option',{name:'Norte'})).toBeTruthy();
 expect(screen.getByRole('heading',{name:'Plan Norte'})).toBeTruthy();expect(screen.queryByRole('heading',{name:'Plan Centro'})).toBeNull();
 expect(screen.getByRole('heading',{level:1,name:'VIP S'})).toBeTruthy();expect(screen.queryByText('VIP ANTERIOR')).toBeNull();
 expect(fixture.catalog).toHaveBeenCalledTimes(catalogCalls);expect(localStorage.getItem('mf_cliente_catalog_sucursal')).toBe('B');
});
