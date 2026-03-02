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

      <Route
        path="/home/super/*"
        element={
          <ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.super_admin}>
            <HomePage pageRole="super_admin" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/home/admin/*"
        element={
          <ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.admin}>
            <HomePage pageRole="admin" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/home/barbero/*"
        element={
          <ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.barbero}>
            <HomePage pageRole="barbero" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/home/cliente/*"
        element={
          <ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.cliente}>
            <HomePage pageRole="cliente" />
          </ProtectedRoute>
        }
      />

      <Route path="/home/super_admin/*" element={<Navigate to="/home/super" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
