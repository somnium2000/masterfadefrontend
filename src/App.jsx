import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ForgotPasswordPage from './features/auth/pages/ForgotPasswordPage.jsx';
import LoginPage from './features/auth/pages/LoginPage.jsx';
import RegisterPage from './features/auth/pages/RegisterPage.jsx';
import ResetPasswordPage from './features/auth/pages/ResetPasswordPage.jsx';
import AuthCallbackPage from './features/auth/pages/AuthCallbackPage.jsx';
import HomePage from './features/home/pages/HomePage.jsx';
import HomeRedirectPage from './features/home/pages/HomeRedirectPage.jsx';
import { ROLE_ROUTE_ALLOWED_ROLES } from './features/home/lib/roleRouting.js';
import LandingPage from './features/landing/pages/LandingPage.jsx';
import MembershipPlansPage from './features/public/pages/MembershipPlansPage.jsx';
import PromotionsPage from './features/public/pages/PromotionsPage.jsx';
import ServicesPage from './features/public/pages/ServicesPage.jsx';
import PublicBookingFlow from './features/public/booking/PublicBookingFlow.jsx';
import PublicBookingBarberosStep from './features/public/booking/PublicBookingBarberosStep.jsx';
import PublicBookingAgendaStep from './features/public/booking/PublicBookingAgendaStep.jsx';
import PublicBookingConfirmStep from './features/public/booking/PublicBookingConfirmStep.jsx';
import UnauthorizedPage from './features/unauthorized/pages/UnauthorizedPage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AdminServicesCatalogPage from './features/admin/pages/AdminServicesCatalogPage.jsx';
import AdminPackagesCatalogPage from './features/admin/pages/AdminPackagesCatalogPage.jsx';
import AdminPlansCatalogPage from './features/admin/pages/AdminPlansCatalogPage.jsx';
import BarberoHomePage from './features/barbero/pages/BarberoHomePage.jsx';
import ClienteHomePage from './features/cliente/pages/ClienteHomePage.jsx';
import AdminEmpleadosPage from './features/admin/pages/AdminEmpleadosPage.jsx';
import AdminSucursalesPage from './features/admin/pages/AdminSucursalesPage.jsx';
import AdminClientesPage from './features/admin/pages/AdminClientesPage.jsx';
import AdminUsuariosPage from './features/admin/pages/AdminUsuariosPage.jsx';
import AdminConfiguracionNotificacionesPage from './features/admin/pages/AdminConfiguracionNotificacionesPage.jsx';
import AdminConfiguracionPerfilPage from './features/admin/pages/AdminConfiguracionPerfilPage.jsx';
import AdminConfiguracionSpamPage from './features/admin/pages/AdminConfiguracionSpamPage.jsx';
import AdminConfiguracionPromocionesPage from './features/admin/pages/AdminConfiguracionPromocionesPage.jsx';
import AdminCitasPage from './features/admin/pages/AdminCitasPage.jsx';
import AdminCitasPreviewPage from './features/admin/pages/AdminCitasPreviewPage.jsx';
import AdminAgendamientoCitasPage from './features/admin/pages/AdminAgendamientoCitasPage.jsx';
import AdminAgendamientoHistorialPage from './features/admin/pages/AdminAgendamientoHistorialPage.jsx';
import UnderConstructionPage from './features/admin/pages/UnderConstructionPage.jsx';
import AdminMasterPuntosPage from './features/admin/pages/AdminMasterPuntosPage.jsx';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import RouteErrorBoundary from './components/errors/RouteErrorBoundary.jsx';

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/login" element={isAuthenticated ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/home" replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/servicios" element={<ServicesPage />} />
      <Route path="/promociones" element={<PromotionsPage />} />
      <Route path="/agendar" element={<RouteErrorBoundary><PublicBookingFlow /></RouteErrorBoundary>}>
        <Route index element={<Navigate to="barberos" replace />} />
        <Route path="barberos" element={<PublicBookingBarberosStep />} />
        <Route path="agenda" element={<PublicBookingAgendaStep />} />
        <Route path="confirmar" element={<PublicBookingConfirmStep />} />
      </Route>
      <Route path="/membresias-vip" element={<MembershipPlansPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomeRedirectPage />
          </ProtectedRoute>
        }
      />

      {/* ── Super Admin ─────────────────────────────────────────────── */}
      <Route
        path="/home/super"
        element={
          <ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.super_admin}>
            <DashboardLayout pageRole="super_admin" />
          </ProtectedRoute>
        }
      >
        <Route index element={<UnderConstructionPage title="Inicio" />} />
        <Route path="kpis" element={<UnderConstructionPage title="KPIs" subtitle="Indicadores clave de rendimiento" />} />
        {/* Personas */}
        <Route path="empleados" element={<RouteErrorBoundary><AdminEmpleadosPage /></RouteErrorBoundary>} />
        <Route path="clientes" element={<RouteErrorBoundary><AdminClientesPage /></RouteErrorBoundary>} />
        <Route path="usuarios" element={<RouteErrorBoundary><AdminUsuariosPage /></RouteErrorBoundary>} />
        {/* Servicios */}
        <Route path="catalog/servicios" element={<RouteErrorBoundary><AdminServicesCatalogPage /></RouteErrorBoundary>} />
        <Route path="catalog/paquetes" element={<AdminPackagesCatalogPage />} />
        <Route path="catalog/planes" element={<AdminPlansCatalogPage />} />
        {/* Sucursales */}
        <Route path="sucursales" element={<AdminSucursalesPage />} />
        {/* Citas */}
        <Route path="citas" element={<RouteErrorBoundary><AdminAgendamientoCitasPage /></RouteErrorBoundary>} />
        <Route path="citas/historial" element={<RouteErrorBoundary><AdminAgendamientoHistorialPage /></RouteErrorBoundary>} />
        <Route path="citas/preview" element={<RouteErrorBoundary><AdminCitasPreviewPage /></RouteErrorBoundary>} />
        <Route path="citas/config" element={<RouteErrorBoundary><AdminCitasPage /></RouteErrorBoundary>} />
        {/* Seguridad */}
        <Route path="seguridad/logs" element={<UnderConstructionPage title="Logs del Sistema" />} />
        <Route path="seguridad/sesiones" element={<UnderConstructionPage title="Sesiones Activas" />} />
        <Route path="seguridad/bitacoras" element={<UnderConstructionPage title="Bitácoras de Auditoría" />} />
        {/* Reportes */}
        <Route path="reportes/ventas" element={<UnderConstructionPage title="Ventas" />} />
        <Route path="reportes/ingresos" element={<UnderConstructionPage title="Reporte de Ingresos" />} />
        <Route path="reportes/barberos" element={<UnderConstructionPage title="Productividad Barberos" />} />
        <Route path="reportes/concurrencia" element={<UnderConstructionPage title="Concurrencia de Clientes" />} />
        {/* Masterpuntos */}
        <Route path="superpuntos" element={<RouteErrorBoundary><AdminMasterPuntosPage /></RouteErrorBoundary>} />
        {/* Configuración */}
        <Route path="configuracion/notificaciones" element={<RouteErrorBoundary><AdminConfiguracionNotificacionesPage /></RouteErrorBoundary>} />
        <Route path="configuracion/perfil" element={<RouteErrorBoundary><AdminConfiguracionPerfilPage /></RouteErrorBoundary>} />
        <Route path="configuracion/spam" element={<RouteErrorBoundary><AdminConfiguracionSpamPage /></RouteErrorBoundary>} />
        <Route path="configuracion/promociones" element={<RouteErrorBoundary><AdminConfiguracionPromocionesPage /></RouteErrorBoundary>} />
      </Route>

      {/* ── Admin ────────────────────────────────────────────────────── */}
      <Route
        path="/home/admin"
        element={
          <ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.admin}>
            <DashboardLayout pageRole="admin" />
          </ProtectedRoute>
        }
      >
        <Route index element={<UnderConstructionPage title="Inicio" />} />
        <Route path="kpis" element={<UnderConstructionPage title="KPIs" />} />
        {/* Personas */}
        <Route path="empleados" element={<RouteErrorBoundary><AdminEmpleadosPage /></RouteErrorBoundary>} />
        <Route path="clientes" element={<RouteErrorBoundary><AdminClientesPage /></RouteErrorBoundary>} />
        <Route path="usuarios" element={<RouteErrorBoundary><AdminUsuariosPage /></RouteErrorBoundary>} />
        {/* Servicios */}
        <Route path="catalog/servicios" element={<RouteErrorBoundary><AdminServicesCatalogPage /></RouteErrorBoundary>} />
        <Route path="catalog/paquetes" element={<AdminPackagesCatalogPage />} />
        <Route path="catalog/planes" element={<AdminPlansCatalogPage />} />
        {/* Sucursales */}
        <Route path="sucursales" element={<AdminSucursalesPage />} />
        {/* Citas */}
        <Route path="citas" element={<RouteErrorBoundary><AdminAgendamientoCitasPage /></RouteErrorBoundary>} />
        <Route path="citas/historial" element={<RouteErrorBoundary><AdminAgendamientoHistorialPage /></RouteErrorBoundary>} />
        <Route path="citas/preview" element={<RouteErrorBoundary><AdminCitasPreviewPage /></RouteErrorBoundary>} />
        <Route path="citas/config" element={<RouteErrorBoundary><AdminCitasPage /></RouteErrorBoundary>} />
        {/* Seguridad */}
        <Route path="seguridad/logs" element={<UnderConstructionPage title="Logs del Sistema" />} />
        <Route path="seguridad/sesiones" element={<UnderConstructionPage title="Sesiones Activas" />} />
        <Route path="seguridad/bitacoras" element={<UnderConstructionPage title="Bitácoras de Auditoría" />} />
        {/* Reportes */}
        <Route path="reportes/ventas" element={<UnderConstructionPage title="Ventas" />} />
        <Route path="reportes/ingresos" element={<UnderConstructionPage title="Reporte de Ingresos" />} />
        <Route path="reportes/barberos" element={<UnderConstructionPage title="Productividad Barberos" />} />
        <Route path="reportes/concurrencia" element={<UnderConstructionPage title="Concurrencia de Clientes" />} />
        {/* Masterpuntos */}
        <Route path="superpuntos" element={<RouteErrorBoundary><AdminMasterPuntosPage /></RouteErrorBoundary>} />
        {/* Configuración */}
        <Route path="configuracion/notificaciones" element={<UnderConstructionPage title="Notificaciones" />} />
        <Route path="configuracion/perfil" element={<UnderConstructionPage title="Perfil" />} />
        <Route path="configuracion/spam" element={<UnderConstructionPage title="Spam" />} />
        <Route path="configuracion/promociones" element={<UnderConstructionPage title="Promociones" />} />
      </Route>

      {/* ── Barbero ─────────────────────────────────────────────────── */}
      <Route
        path="/home/barbero"
        element={
          <ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.barbero}>
            <DashboardLayout pageRole="barbero" />
          </ProtectedRoute>
        }
      >
        <Route index element={<UnderConstructionPage title="Inicio" />} />
        <Route path="citas" element={<RouteErrorBoundary><AdminAgendamientoCitasPage /></RouteErrorBoundary>} />
        <Route path="citas/historial" element={<RouteErrorBoundary><AdminAgendamientoHistorialPage /></RouteErrorBoundary>} />
      </Route>

      {/* ── Cliente ─────────────────────────────────────────────────── */}
      <Route
        path="/home/cliente"
        element={
          <ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.cliente}>
            <DashboardLayout pageRole="cliente" />
          </ProtectedRoute>
        }
      >
        <Route index element={<ClienteHomePage />} />
      </Route>

      <Route path="/home/super_admin/*" element={<Navigate to="/home/super" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

