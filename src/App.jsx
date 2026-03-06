import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ForgotPasswordPage from './features/auth/pages/ForgotPasswordPage.jsx';
import LoginPage from './features/auth/pages/LoginPage.jsx';
import ResetPasswordPage from './features/auth/pages/ResetPasswordPage.jsx';
import HomePage from './features/home/pages/HomePage.jsx';
import HomeRedirectPage from './features/home/pages/HomeRedirectPage.jsx';
import { ROLE_ROUTE_ALLOWED_ROLES } from './features/home/lib/roleRouting.js';
import LandingPage from './features/landing/pages/LandingPage.jsx';
import ServicesPage from './features/public/pages/ServicesPage.jsx';
import UnauthorizedPage from './features/unauthorized/pages/UnauthorizedPage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AdminServicesCatalogPage from './features/admin/pages/AdminServicesCatalogPage.jsx';
import AdminPackagesCatalogPage from './features/admin/pages/AdminPackagesCatalogPage.jsx';
import BarberoHomePage from './features/barbero/pages/BarberoHomePage.jsx';
import ClienteHomePage from './features/cliente/pages/ClienteHomePage.jsx';
import SuperAdminHomePage from './features/admin/pages/SuperAdminHomePage.jsx';
import AdminEmpleadosPage from './features/admin/pages/AdminEmpleadosPage.jsx';
import AdminSucursalesPage from './features/admin/pages/AdminSucursalesPage.jsx';
import UnderConstructionPage from './features/admin/pages/UnderConstructionPage.jsx';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import RouteErrorBoundary from './components/errors/RouteErrorBoundary.jsx';

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/login" element={isAuthenticated ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/servicios" element={<ServicesPage />} />
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
        <Route index element={<SuperAdminHomePage />} />
        <Route path="kpis" element={<UnderConstructionPage title="KPIs" subtitle="Indicadores clave de rendimiento" />} />
        {/* Personas */}
        <Route path="empleados" element={<RouteErrorBoundary><AdminEmpleadosPage /></RouteErrorBoundary>} />
        <Route path="clientes" element={<UnderConstructionPage title="Clientes" />} />
        <Route path="usuarios" element={<UnderConstructionPage title="Usuarios" />} />
        {/* Servicios */}
        <Route path="catalog/servicios" element={<RouteErrorBoundary><AdminServicesCatalogPage /></RouteErrorBoundary>} />
        <Route path="catalog/paquetes" element={<AdminPackagesCatalogPage />} />
        <Route path="catalog/planes" element={<UnderConstructionPage title="Planes" />} />
        {/* Sucursales */}
        <Route path="sucursales" element={<AdminSucursalesPage />} />
        {/* Citas */}
        <Route path="citas/preview" element={<UnderConstructionPage title="Vista Previa de Citas" />} />
        <Route path="citas/config" element={<UnderConstructionPage title="Configuración de Citas" />} />
        {/* Seguridad */}
        <Route path="seguridad/logs" element={<UnderConstructionPage title="Logs del Sistema" />} />
        <Route path="seguridad/sesiones" element={<UnderConstructionPage title="Sesiones Activas" />} />
        <Route path="seguridad/bitacoras" element={<UnderConstructionPage title="Bitácoras de Auditoría" />} />
        {/* Reportes */}
        <Route path="reportes/ventas" element={<UnderConstructionPage title="Ventas" />} />
        <Route path="reportes/ingresos" element={<UnderConstructionPage title="Reporte de Ingresos" />} />
        <Route path="reportes/barberos" element={<UnderConstructionPage title="Productividad Barberos" />} />
        <Route path="reportes/concurrencia" element={<UnderConstructionPage title="Concurrencia de Clientes" />} />
        {/* Superpuntos */}
        <Route path="superpuntos" element={<UnderConstructionPage title="Superpuntos" />} />
        {/* Configuración */}
        <Route path="configuracion/notificaciones" element={<UnderConstructionPage title="Notificaciones" />} />
        <Route path="configuracion/perfil" element={<UnderConstructionPage title="Perfil" />} />
        <Route path="configuracion/spam" element={<UnderConstructionPage title="Spam" />} />
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
        <Route index element={<HomePage pageRole="admin" />} />
        <Route path="kpis" element={<UnderConstructionPage title="KPIs" />} />
        {/* Personas */}
        <Route path="empleados" element={<RouteErrorBoundary><AdminEmpleadosPage /></RouteErrorBoundary>} />
        <Route path="clientes" element={<UnderConstructionPage title="Clientes" />} />
        <Route path="usuarios" element={<UnderConstructionPage title="Usuarios" />} />
        {/* Servicios */}
        <Route path="catalog/servicios" element={<RouteErrorBoundary><AdminServicesCatalogPage /></RouteErrorBoundary>} />
        <Route path="catalog/paquetes" element={<AdminPackagesCatalogPage />} />
        <Route path="catalog/planes" element={<UnderConstructionPage title="Planes" />} />
        {/* Sucursales */}
        <Route path="sucursales" element={<AdminSucursalesPage />} />
        {/* Citas */}
        <Route path="citas/preview" element={<UnderConstructionPage title="Vista Previa de Citas" />} />
        <Route path="citas/config" element={<UnderConstructionPage title="Configuración de Citas" />} />
        {/* Seguridad */}
        <Route path="seguridad/logs" element={<UnderConstructionPage title="Logs del Sistema" />} />
        <Route path="seguridad/sesiones" element={<UnderConstructionPage title="Sesiones Activas" />} />
        <Route path="seguridad/bitacoras" element={<UnderConstructionPage title="Bitácoras de Auditoría" />} />
        {/* Reportes */}
        <Route path="reportes/ventas" element={<UnderConstructionPage title="Ventas" />} />
        <Route path="reportes/ingresos" element={<UnderConstructionPage title="Reporte de Ingresos" />} />
        <Route path="reportes/barberos" element={<UnderConstructionPage title="Productividad Barberos" />} />
        <Route path="reportes/concurrencia" element={<UnderConstructionPage title="Concurrencia de Clientes" />} />
        {/* Superpuntos */}
        <Route path="superpuntos" element={<UnderConstructionPage title="Superpuntos" />} />
        {/* Configuración */}
        <Route path="configuracion/notificaciones" element={<UnderConstructionPage title="Notificaciones" />} />
        <Route path="configuracion/perfil" element={<UnderConstructionPage title="Perfil" />} />
        <Route path="configuracion/spam" element={<UnderConstructionPage title="Spam" />} />
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
        <Route index element={<BarberoHomePage />} />
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
