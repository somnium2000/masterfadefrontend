// @vitest-environment jsdom
import {StrictMode,useState} from 'react';
import {act,cleanup,render,renderHook,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import useBookingCompanions from '../hooks/useBookingCompanions.js';
import {createBookingBlock} from '../utils/bookingMappers.js';
import {BookingFlowProvider} from '../BookingFlowContext.jsx';
import Summary from '../PublicBookingConfirmStep.jsx';
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>({})}));
afterEach(cleanup);
test('actualizaciones React pendientes no pierden foco, fecha o activación del nuevo acompañante',()=>{
 const {result}=renderHook(()=>{
  const [blocks,setBlocks]=useState(()=>[{...createBookingBlock({alias:'Titular',idBarbero:'B'}),selectedDate:'2030-06-30',selectedTime:'10:00',serviceIds:['S']}]);
  const [active,setActive]=useState(0),[focus,setFocus]=useState('');
  const api=useBookingCompanions({allowCompanions:true,maxCompanions:3,bookingBlocks:blocks,setBookingBlocks:setBlocks,activeBlockIndex:active,setActiveBlockIndex:setActive,effectiveActiveBlockIndex:active,pendingCompanionFocusId:focus,setPendingCompanionFocusId:setFocus,titularSelectedDate:blocks[0].selectedDate});
  return {blocks,active,focus,api,queue:()=>setBlocks(prev=>[...prev])};
 },{wrapper:StrictMode});
 for(let n=1;n<=2;n++){
  act(()=>{result.current.queue();result.current.api.addCompanionBlock();});
  expect(result.current.active).toBe(n);expect(result.current.focus).toBe(result.current.blocks[n].id);
  expect(result.current.blocks[n]).toMatchObject({selectedDate:'2030-06-30',idBarbero:'B',selectedTime:'',serviceIds:[]});
 }
 act(()=>result.current.api.removeCompanionBlock(result.current.blocks[2].id));
 act(()=>result.current.api.addCompanionBlock());expect(result.current.blocks).toHaveLength(3);expect(result.current.focus).toBe(result.current.blocks[2].id);
});
test.each([0,300,450])('resumen real: plan solo titular, extras acompañantes %i, sin operaciones',extra=>{
 const titular={id:'T',total_hnl:300,selectedServices:[{id_servicio:'S',nombre_servicio:'Corte',precio_hnl:300,coveredByPlan:true}]};
 const companion={id:'C',total_hnl:extra,selectedServices:extra===450?[{id_servicio:'S',nombre_servicio:'Corte',precio_hnl:300,coveredByPlan:false},{id_servicio:'E',nombre_servicio:'Barba',precio_hnl:150,coveredByPlan:false}]:[{id_servicio:'S',nombre_servicio:'Corte',precio_hnl:extra,coveredByPlan:false}]};
 render(<BookingFlowProvider value={{bookingBlocksSummary:extra?[titular,companion]:[titular],holdResult:null,holdPricing:null,membershipHasContext:true,paymentRequired:true}}><Summary/></BookingFlowProvider>);
 expect(screen.getByText('Los MasterPuntos se acreditan al completar las citas que califican, según las reglas vigentes.')).toBeTruthy();
 const total=screen.getByText('Total a pagar hoy').parentElement;expect(total.textContent.replace(/\s/g,'')).toContain(extra.toFixed(2));
 expect(screen.queryByText('Cubierto completamente por tu plan.')!==null).toBe(extra===0);
 if(extra)expect(screen.getByText('Extras y acompañantes').parentElement.textContent.replace(/\s/g,'')).toContain(extra.toFixed(2));
});

// AM: Se comunica la politica sin cambiar contactos, cobertura ni importes del resumen.
for (const companions of [1, 2, 3, 4]) for (const membership of [false, true]) {
 test(`grupo autenticado: ${companions} acompanantes, membresia ${membership}`, () => {
  const blocks = Array.from({length:companions+1},(_,index)=>({id:`B${index}`,alias:index?'Invitado '+index:'Titular',contactEmail:index?'registered'+index+'@example.test':'owner@example.test',total_hnl:300,
   selectedServices:[{id_servicio:'S',nombre_servicio:'Corte',precio_hnl:300,coveredByPlan:index===0&&membership}]}));
  const original=structuredClone(blocks);
  render(<BookingFlowProvider value={{bookingBlocksSummary:blocks,canUseClienteHold:true,mode:'authenticated',membershipHasContext:membership,paymentRequired:true}}><Summary/></BookingFlowProvider>);
  expect(screen.getAllByText(/se acreditan solo al titular que/)).toHaveLength(1);
  expect(screen.getByText(/acompañantes con o sin cuenta/)).toBeTruthy();
  expect(screen.queryByText('Los MasterPuntos se acreditan al completar las citas que califican, según las reglas vigentes.')).toBeNull();
  expect(document.querySelectorAll('.citas-confirm-service-item')).toHaveLength(companions+1);
  expect(blocks).toEqual(original);
 });
}

// AM: La cobertura incluida en descuento_total no debe descontarse ni mostrarse dos veces.
for (const count of [1,2,3,4]) for (const ready of [false,true]) test(`canje grupal: ${count} acompanantes, hold=${ready}`,()=>{
 const reward={id:'T',alias:'Titular',selection_type:'services',total_hnl:450,selectedServices:[{id_servicio:'S',nombre_servicio:'Corte',precio_hnl:300,coveredByReward:true},{id_servicio:'E',nombre_servicio:'Extra',precio_hnl:150}]};
 const blocks=[reward,...Array.from({length:count},(_,i)=>({id:`C${i}`,alias:'Invitado',selection_type:'services',total_hnl:300,selectedServices:[{id_servicio:'S',nombre_servicio:'Corte',precio_hnl:300}]}))];
 const total=count*300+150;
 render(<BookingFlowProvider value={{bookingBlocksSummary:blocks,canUseClienteHold:true,paymentRequired:true,
  holdResult:ready?{id_grupo_cita:'G',subtotal_hnl:total+300,descuento_total_hnl:300,total_pagar_hnl:total}:null,
  holdPricing:ready?{subtotal_hnl:total+300,descuento_total_hnl:300,cubierto_por_recompensa_hnl:300,total_pagar_hnl:total}:null}}><Summary/></BookingFlowProvider>);
 expect(screen.getByText('Total a pagar').parentElement.textContent.replace(/[^0-9.]/g,'')).toContain(total.toFixed(2));
 expect(screen.queryByText('Descuento',{exact:true})).toBeNull();
 expect(screen.getByText('Cubierto por recompensa',{exact:true}).parentElement.textContent).toContain('300.00');
 expect(screen.getByText('Extras y acompañantes',{exact:true}).parentElement.textContent.replace(/[^0-9.]/g,'')).toContain(total.toFixed(2));
 expect(screen.getByText(/El servicio canjeado del titular no genera puntos/)).toBeTruthy();
 expect(screen.getByText(/10 puntos una sola vez/)).toBeTruthy();
 expect(document.querySelectorAll('.citas-confirm-service-item')).toHaveLength(count+1);
});
