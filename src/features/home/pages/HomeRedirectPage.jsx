import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { PHASE0_SUPER_ADMIN_ONLY, resolveHomePath } from '../lib/roleRouting.js';

export default function HomeRedirectPage() {
  const { roles } = useAuth();

  // AM: Guard explícito para Fase 0, evitando rebotes ambiguos hacia homes no operativos.
  if (PHASE0_SUPER_ADMIN_ONLY && !roles.includes('super_admin')) {
    return <Navigate to="/unauthorized" replace />;
  }

  const nextPath = resolveHomePath(roles);

  return <Navigate to={nextPath || '/unauthorized'} replace />;
}
