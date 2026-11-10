// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import App from '../App.jsx';
const session=vi.hoisted(()=>({roles:['admin'],user:{id_usuario:'A'},branchIds:[],empresaId:null,isAuthenticated:true,isHydrated:true,isHydrating:false,hydrateSession:vi.fn()}));
const metrics=vi.hoisted(()=>vi.fn());
vi.mock('../context/AuthContext.jsx',()=>({useAuth:()=>session}));
vi.mock('../features/admin/lib/superAdminDashboardApi.js',()=>({getSuperAdminDashboardSummary:metrics}));
vi.mock('../components/layout/DashboardLayout.jsx',()=>({default:()=> <Outlet/>,ROLE_META:{}}));
vi.mock('../features/cliente/layouts/ClienteAppShell.jsx',()=>({default:()=> <Outlet/>}));
vi.mock('../features/auth/pages/LoginPage.jsx',()=>({default:()=> <div>LoginPage</div>}));
vi.mock('../features/auth/pages/ForgotPasswordPage.jsx',()=>({default:()=> <div>ForgotPasswordPage</div>}));
vi.mock('../features/auth/pages/RegisterPage.jsx',()=>({default:()=> <div>RegisterPage</div>}));
vi.mock('../features/auth/pages/GuestRegistrationConfirmPage.jsx',()=>({default:()=> <div>GuestRegistrationConfirmPage</div>}));
vi.mock('../features/auth/pages/ResetPasswordPage.jsx',()=>({default:()=> <div>ResetPasswordPage</div>}));
vi.mock('../features/auth/pages/AuthCallbackPage.jsx',()=>({default:()=> <div>AuthCallbackPage</div>}));
vi.mock('../features/home/pages/HomePage.jsx',()=>({default:()=> <div>HomePage</div>}));
vi.mock('../features/landing/pages/LandingPage.jsx',()=>({default:()=> <div>LandingPage</div>}));
vi.mock('../features/public/pages/MembershipPlansPage.jsx',()=>({default:()=> <div>MembershipPlansPage</div>}));
vi.mock('../features/public/pages/PromotionsPage.jsx',()=>({default:()=> <div>PromotionsPage</div>}));
vi.mock('../features/public/pages/ServicesPage.jsx',()=>({default:()=> <div>ServicesPage</div>}));
vi.mock('../features/public/pages/BarbersLandingPage.jsx',()=>({default:()=> <div>BarbersLandingPage</div>}));
vi.mock('../features/public/pages/AccountDeletionProgressPage.jsx',()=>({default:()=> <div>AccountDeletionProgressPage</div>}));
vi.mock('../features/account/pages/InternalAccountDeletionRequestPage.jsx',()=>({default:()=> <div>InternalAccountDeletionRequestPage</div>}));
vi.mock('../features/unauthorized/pages/UnauthorizedPage.jsx',()=>({default:()=> <div>UnauthorizedPage</div>}));
vi.mock('../features/admin/pages/AdminServicesCatalogPage.jsx',()=>({default:()=> <div>AdminServicesCatalogPage</div>}));
vi.mock('../features/admin/pages/AdminCortesiasCatalogPage.jsx',()=>({default:()=> <div>AdminCortesiasCatalogPage</div>}));
vi.mock('../features/admin/pages/AdminPackagesCatalogPage.jsx',()=>({default:()=> <div>AdminPackagesCatalogPage</div>}));
vi.mock('../features/admin/pages/AdminPlansCatalogPage.jsx',()=>({default:()=> <div>AdminPlansCatalogPage</div>}));
vi.mock('../features/cliente/pages/ClienteHomePage.jsx',()=>({default:()=> <div>ClienteHomePage</div>}));
vi.mock('../features/cliente/pages/ClienteCatalogoPage.jsx',()=>({default:()=> <div>ClienteCatalogoPage</div>}));
vi.mock('../features/cliente/pages/ClienteHistorialCitasPage.jsx',()=>({default:()=> <div>ClienteHistorialCitasPage</div>}));
vi.mock('../features/cliente/pages/ClientePerfilPage.jsx',()=>({default:()=> <div>ClientePerfilPage</div>}));
vi.mock('../features/cliente/pages/ClientePlanesPage.jsx',()=>({default:()=> <div>ClientePlanesPage</div>}));
vi.mock('../features/barbero/pages/BarberoHomePage.jsx',()=>({default:()=> <div>BarberoHomePage</div>}));
vi.mock('../features/barbero/pages/BarberoProfilePage.jsx',()=>({default:()=> <div>BarberoProfilePage</div>}));
vi.mock('../features/barbero/pages/BarberoCalendarioPage.jsx',()=>({default:()=> <div>BarberoCalendarioPage</div>}));
vi.mock('../features/admin/pages/AdminEmpleadosPage.jsx',()=>({default:()=> <div>AdminEmpleadosPage</div>}));
vi.mock('../features/admin/pages/AdminSucursalesPage.jsx',()=>({default:()=> <div>AdminSucursalesPage</div>}));
vi.mock('../features/admin/pages/AdminClientesPage.jsx',()=>({default:()=> <div>AdminClientesPage</div>}));
vi.mock('../features/admin/pages/AdminUsuariosPage.jsx',()=>({default:()=> <div>AdminUsuariosPage</div>}));
vi.mock('../features/admin/pages/AdminAccountDeletionPage.jsx',()=>({default:()=> <div>AdminAccountDeletionPage</div>}));
vi.mock('../features/admin/pages/AdminConfiguracionComunicacionPage.jsx',()=>({default:()=> <div>AdminConfiguracionComunicacionPage</div>}));
vi.mock('../features/admin/pages/AdminConfiguracionPromocionesPage.jsx',()=>({default:()=> <div>AdminConfiguracionPromocionesPage</div>}));
vi.mock('../features/admin/pages/AdminCitasPage.jsx',()=>({default:()=> <div>AdminCitasPage</div>}));
vi.mock('../features/admin/pages/AdminReportesIngresosPage.jsx',()=>({default:()=> <div>AdminReportesIngresosPage</div>}));
vi.mock('../features/admin/pages/AdminReportesMembresiasPage.jsx',()=>({default:()=> <div>AdminReportesMembresiasPage</div>}));
vi.mock('../features/admin/pages/AdminReportesBarberosPage.jsx',()=>({default:()=> <div>AdminReportesBarberosPage</div>}));
vi.mock('../features/admin/pages/AdminReportesConcurrenciaPage.jsx',()=>({default:()=> <div>AdminReportesConcurrenciaPage</div>}));
vi.mock('../features/admin/pages/AdminAgendamientoCitasPage.jsx',()=>({default:()=> <div>AdminAgendamientoCitasPage</div>}));
vi.mock('../features/admin/pages/AdminAgendamientoHistorialPage.jsx',()=>({default:()=> <div>AdminAgendamientoHistorialPage</div>}));
vi.mock('../features/admin/pages/UnderConstructionPage.jsx',()=>({default:()=> <div>UnderConstructionPage</div>}));
vi.mock('../features/admin/pages/AdminMasterPuntosPage.jsx',()=>({default:()=> <div>AdminMasterPuntosPage</div>}));
vi.mock('../features/admin/pages/AdminServiciosCatalogoPublicoPage.jsx',()=>({default:()=> <div>AdminServiciosCatalogoPublicoPage</div>}));
vi.mock('../features/admin/pages/AdminSeguridadAlertasPage.jsx',()=>({default:()=> <div>AdminSeguridadAlertasPage</div>}));
vi.mock('../features/admin/pages/AdminSeguridadLoginLogsPage.jsx',()=>({default:()=> <div>AdminSeguridadLoginLogsPage</div>}));
vi.mock('../features/admin/pages/AdminSeguridadSesionesPage.jsx',()=>({default:()=> <div>AdminSeguridadSesionesPage</div>}));
vi.mock('../features/admin/pages/AdminSeguridadUsuariosPage.jsx',()=>({default:()=> <div>AdminSeguridadUsuariosPage</div>}));
function Probe(){const location=useLocation();return <output data-testid="route">{location.pathname}|{useNavigationType()}</output>;}
function view(path){return <MemoryRouter initialEntries={[path]}><Probe/><App/></MemoryRouter>;}
beforeEach(()=>{
 session.roles=['admin'];session.user={id_usuario:'A'};session.isAuthenticated=true;
 metrics.mockReset().mockImplementation(periodo=>Promise.resolve({data:{total_citas:4,periodo,ingresos_serie:[],actividad_serie:[]}}));
});
afterEach(cleanup);
test.each(['/home/admin','/home/admin/kpis','/home','/login','/login?next=%2Fhome%2Fadmin%2Fkpis'])('Admin entra por %s a empleados con replace',async path=>{
 render(view(path));await screen.findByText('AdminEmpleadosPage');
 expect(screen.getByTestId('route')).toHaveTextContent('/home/admin/empleados|REPLACE');expect(metrics).not.toHaveBeenCalled();
});
for(const roles of [['admin'],['admin','barbero'],['cliente'],['barbero'],['root'],['security_admin'],['security_auditor']])test.each(['/home/super','/home/super/kpis'])('rechaza '+roles.join('+')+' en %s antes de montar metricas',async path=>{
 session.roles=roles;render(view(path));await screen.findByText('UnauthorizedPage');expect(metrics).not.toHaveBeenCalled();expect(screen.queryByText('Panel Ejecutivo')).not.toBeInTheDocument();
});
test.each([['super_admin'],['admin','super_admin']])('solo roles con super_admin montan el ejecutivo %j',async(...roles)=>{
 session.roles=roles;render(view('/home/super/kpis'));await screen.findByText('Panel Ejecutivo');expect(metrics).toHaveBeenCalledTimes(1);expect(screen.getByTestId('route')).toHaveTextContent('/home/super|REPLACE');
});
test('retirada de super_admin desmonta ejecutivo sin nueva consulta',async()=>{
 session.roles=['admin','super_admin'];const rendered=render(view('/home/super'));await screen.findByText('Panel Ejecutivo');
 session.roles=['admin','barbero'];session.user={id_usuario:'B'};rendered.rerender(view('/home/super'));
 await screen.findByText('UnauthorizedPage');expect(metrics).toHaveBeenCalledTimes(1);expect(screen.queryByText('Panel Ejecutivo')).not.toBeInTheDocument();
});
test('sin sesion redirige a login sin metricas',async()=>{
 session.isAuthenticated=false;render(view('/home/super'));await screen.findByText('LoginPage');expect(metrics).not.toHaveBeenCalled();
});
