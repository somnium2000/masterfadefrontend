import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { resolveHomePath } from '../lib/roleRouting.js';

export default function HomeRedirectPage() {
  const { roles } = useAuth();
  const nextPath = resolveHomePath(roles);

  return <Navigate to={nextPath || '/unauthorized'} replace />;
}
