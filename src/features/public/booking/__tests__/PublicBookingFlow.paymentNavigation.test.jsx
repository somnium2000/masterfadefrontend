// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Flow from '../PublicBookingFlow.jsx';
import Payment from '../PublicBookingPaymentStep.jsx';
import { useBookingFlow } from '../BookingFlowContext.jsx';
const auth=vi.hoisted(()=>({}));
const mocks=vi.hoisted(()=>{
 const noop=vi.fn();const data={contextLoading:false,contextError:'',contextData:{},selectedBranchId:'',branchList:[],barbers:[],services:[],packages:[],promotions:[],membershipStateData:null,availabilityMap:{},slots:[],slotsCurated:[],slotSuggestions:[],slotMetrics:{},hold:null,paymentIntent:null,paymentResult:null,bookingSuccessResult:null,rootRedirectPath:null,homePath:'/',homeLabel:'Inicio',connectionState:'disabled',companionRuleValidation:{valid:true},canAddCompanionBlock:false};
 return {noop,data,hook:new Proxy(data,{get:(target,key)=>key in target?target[key]:noop}),release:vi.fn(),clear:vi.fn()};
});
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>auth}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>({error:mocks.noop,info:mocks.noop,warning:mocks.noop,success:mocks.noop})}));
vi.mock('../hooks/useBookingCatalogs.js',()=>({default:()=>mocks.hook}));
vi.mock('../hooks/useBookingAvailability.js',()=>({default:()=>mocks.hook}));
vi.mock('../hooks/useBookingHold.js',()=>({default:()=>({...mocks.hook,hold:mocks.data.hold,releaseHold:mocks.release,clearHoldLocalState:mocks.clear})}));
vi.mock('../hooks/useBookingPayment.js',()=>({default:()=>mocks.hook}));
vi.mock('../hooks/useBookingCompanions.js',()=>({default:()=>mocks.hook}));
vi.mock('../hooks/useBookingWizardNavigation.js',()=>({default:()=>mocks.hook}));
vi.mock('../hooks/usePublicAgendaEvents.js',()=>({default:()=>mocks.hook,parseAgendaSseEnabled:()=>false}));
vi.mock('../usePublicAgendaPolling.js',()=>({default:()=>undefined}));
vi.mock('../../../../components/branding/MasterfadeLogo.jsx',()=>({default:()=>null}));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx',()=>({default:()=>null}));
const GROUP='11111111-1111-4111-8111-111111111111', INTENT='22222222-2222-4222-8222-222222222222';
const KEY='masterfade.publicBookingPayment.v1';
function Back(){const go=useNavigate();return <button onClick={()=>go(-1)}>Atrás navegador</button>;}
function Probe(){const flow=useBookingFlow();return <><button onClick={()=>flow.cancelBookingFlow('payment_step')}>Salida de prueba</button><Payment/></>;}
function Where(){return <output data-testid="where">{useLocation().pathname}</output>;}
function mount(resume=true){return render(<MemoryRouter initialEntries={['/agendar/confirmar','/agendar/pagar'+(resume?'?id_grupo_cita='+GROUP+'&id_intent='+INTENT:'')]}><Where/><Back/><Routes><Route path="/" element={<p>Landing</p>}/><Route path="/home/cliente" element={<p>Cliente</p>}/><Route path="/agendar" element={<Flow/>}><Route path="pagar" element={<Probe/>}/><Route path="confirmar" element={<p>Resumen</p>}/><Route path="exito" element={<p>Éxito</p>}/></Route></Routes></MemoryRouter>);}
beforeEach(()=>{
 vi.stubEnv('VITE_PAYMENT_PROVIDER','pixelpay');vi.stubEnv('VITE_PIXELPAY_ENV','sandbox');
 Object.assign(auth,{user:null,roles:[],isAuthenticated:false,isHydrated:true,isHydrating:false});
 Object.assign(mocks.data,{creatingPaymentIntent:false,checkingPaymentStatus:false,creatingHold:false,hold:{id_grupo_cita:GROUP,total_pagar_hnl:300,hold_expires_at:'2099-01-01T00:00:00Z'},paymentIntent:{id_grupo_cita:GROUP,id_intent:INTENT,estado_intent_codigo:'link_generado',monto_hnl:300},paymentResult:{id_grupo_cita:GROUP,id_intent:INTENT,estado_intent_codigo:'link_generado',monto_hnl:300},homePath:'/'});
 mocks.noop.mockReset();mocks.release.mockReset().mockResolvedValue({released:true});mocks.clear.mockReset();sessionStorage.clear();localStorage.clear();
 sessionStorage.setItem(KEY,JSON.stringify({id_grupo_cita:GROUP,id_intent:INTENT,titular_email:'synthetic@example.test',paymentIntent:mocks.data.paymentIntent}));
});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
test.each([320,390,768,1440])('Inicio con tarjeta conserva formulario al continuar y permite salir a %ipx',async width=>{
 Object.defineProperty(window,'innerWidth',{configurable:true,value:width});mount();
 fireEvent.change(screen.getByLabelText('CVV'),{target:{value:'123'}});
 fireEvent.change(screen.getByLabelText('Numero de tarjeta'),{target:{value:'4111111111111111'}});
 fireEvent.click(screen.getByRole('button',{name:'Inicio'}));
 let dialog=await screen.findByRole('dialog');fireEvent.click(within(dialog).getByRole('button',{name:'Continuar pagando'}));
 expect(screen.getByLabelText('CVV')).toHaveValue('123');
 expect(screen.getByLabelText('Numero de tarjeta')).toHaveValue('4111 1111 1111 1111');
 fireEvent.click(screen.getByRole('button',{name:'Salir del pago'}));dialog=await screen.findByRole('dialog');
 fireEvent.click(within(dialog).getByRole('button',{name:'Salir'}));await screen.findByText('Landing');
 expect(mocks.release).not.toHaveBeenCalled();expect(mocks.clear).not.toHaveBeenCalled();
 expect(sessionStorage.getItem(KEY)).toContain(INTENT);expect(JSON.stringify({...sessionStorage,...localStorage})).not.toContain('123');
 expect(JSON.stringify({...sessionStorage,...localStorage})).not.toContain('4111111111111111');expect(screen.queryByLabelText('CVV')).not.toBeInTheDocument();
});
test('volver al resumen no revalida contactos ni elimina el intento',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Volver al resumen'}));await screen.findByText('Resumen');
 expect(mocks.release).not.toHaveBeenCalled();expect(sessionStorage.getItem(KEY)).toContain(INTENT);
});
test('Inicio desde tarjeta vacia sin hold o intento sale directamente',async()=>{
 mocks.data.hold=null;mocks.data.paymentIntent=null;mocks.data.paymentResult=null;sessionStorage.clear();mount(false);
 fireEvent.click(screen.getByRole('button',{name:'Inicio'}));await screen.findByText('Landing');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(mocks.release).not.toHaveBeenCalled();
});
test('hold sin intento puede liberarse y navegar al Inicio Cliente',async()=>{
 mocks.data.paymentIntent=null;mocks.data.paymentResult=null;mocks.data.homePath='/home/cliente';Object.assign(auth,{user:{id_usuario:'U',cliente_id:'C'},roles:['cliente'],isAuthenticated:true});
 sessionStorage.clear();mount(false);fireEvent.click(screen.getByRole('button',{name:'Inicio'}));const dialog=await screen.findByRole('dialog');fireEvent.click(within(dialog).getByRole('button',{name:'Salir'}));
 await screen.findByText('Cliente');expect(mocks.release).toHaveBeenCalledOnce();
});
test.each(['pendiente_confirmacion','fallido','processing'])('salida segura conserva intento en estado %s',async state=>{
 mocks.data.paymentResult={...mocks.data.paymentResult,estado_intent_codigo:state,pending_confirmation:state!=='fallido'};
 mount();fireEvent.click(screen.getByRole('button',{name:'Inicio'}));fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button',{name:'Salir'}));await screen.findByText('Landing');expect(mocks.release).not.toHaveBeenCalled();expect(sessionStorage.getItem(KEY)).toContain(INTENT);
});
test('pago confirmado nunca libera hold al intentar salir',async()=>{
 mocks.data.paymentResult={...mocks.data.paymentResult,booking_confirmed:true};mount();
 fireEvent.click(screen.getByRole('button',{name:'Salida de prueba'}));fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button',{name:'Salir'}));
 await screen.findByText('Éxito');expect(mocks.release).not.toHaveBeenCalled();
});
test.each([false,true])('Inicio con pago confirmado navega directamente sin cancelar (cliente=%s)',async cliente=>{
 mocks.data.paymentResult={...mocks.data.paymentResult,booking_confirmed:true};
 if(cliente){mocks.data.homePath='/home/cliente';Object.assign(auth,{user:{id_usuario:'U',cliente_id:'C'},roles:['cliente'],isAuthenticated:true});}
 mount();fireEvent.click(screen.getByRole('button',{name:'Inicio'}));
 await screen.findByText(cliente?'Cliente':'Landing');
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(mocks.release).not.toHaveBeenCalled();expect(mocks.clear).not.toHaveBeenCalled();
 expect(sessionStorage.getItem(KEY)).toContain(INTENT);
});
test('atras de navegador vuelve al resumen sin cancelar el pago',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Atrás navegador'}));await screen.findByText('Resumen');expect(mocks.release).not.toHaveBeenCalled();expect(sessionStorage.getItem(KEY)).toContain(INTENT);
});
test('cobro en curso espera resultado; salida posterior preserva recuperacion sin segundo cobro',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});const sale=vi.fn(()=>pending);mocks.data.salePixelPayOnce=sale;
 mount();
 for(const [label,value]of [['Nombre del titular','Cliente Sintetico'],['Numero de tarjeta','4111111111111111'],['Expiracion','12/39'],['CVV','123'],['Telefono de contacto','99999999'],['Direccion de facturacion','Barrio Centro calle uno'],['Ciudad','Tegucigalpa']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Pagar con PixelPay Sandbox'}));await waitFor(()=>expect(sale).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByRole('button',{name:'Inicio'}));
 const dialog=await screen.findByRole('dialog');expect(within(dialog).getByRole('button',{name:'Salir'})).toBeDisabled();
 expect(within(dialog).getByText(/Espere|Espera el resultado/i)).toBeInTheDocument();expect(mocks.release).not.toHaveBeenCalled();
 mocks.data.paymentResult={...mocks.data.paymentResult,estado_intent_codigo:'pendiente_confirmacion',pending_confirmation:true};
 await act(async()=>{finish(mocks.data.paymentResult);await pending;});
 await waitFor(()=>expect(within(dialog).getByRole('button',{name:'Salir'})).toBeEnabled());
 fireEvent.click(within(dialog).getByRole('button',{name:'Salir'}));await screen.findByText('Landing');
 expect(sale).toHaveBeenCalledOnce();expect(mocks.release).not.toHaveBeenCalled();expect(sessionStorage.getItem(KEY)).toContain(INTENT);
});
test('resultado incierto no permite editar resumen; ofrece salida segura',async()=>{
 mocks.data.paymentResult={...mocks.data.paymentResult,pending_confirmation:true};mount();
 fireEvent.click(screen.getByRole('button',{name:'Volver al resumen'}));
 expect(await screen.findByRole('dialog')).toHaveTextContent(/verifica el resultado/i);
 expect(screen.getByTestId('where')).toHaveTextContent('/agendar/pagar');expect(mocks.release).not.toHaveBeenCalled();
});
test('verificacion sin respuesta no atrapa al cliente autenticado',async()=>{
 mocks.data.paymentResult=null;mocks.data.homePath='/home/cliente';Object.assign(auth,{user:{id_usuario:'U',cliente_id:'C'},roles:['cliente'],isAuthenticated:true});
 mount();fireEvent.click(screen.getByRole('button',{name:'Inicio'}));const dialog=await screen.findByRole('dialog');
 expect(within(dialog).getByRole('button',{name:'Salir'})).toBeEnabled();fireEvent.click(within(dialog).getByRole('button',{name:'Salir'}));await screen.findByText('Cliente');expect(mocks.release).not.toHaveBeenCalled();expect(sessionStorage.getItem(KEY)).toContain(INTENT);
});
