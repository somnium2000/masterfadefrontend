import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Ruta protegida con soporte de roles.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string[]} [props.allowedRoles] - Roles permitidos (ej: ['super_admin', 'admin']).
 *   Si no se pasa, solo verifica autenticación.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si hay restricción por roles, verificar
  if (allowedRoles && allowedRoles.length > 0) {
    const userRoles = user?.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return children;
}
