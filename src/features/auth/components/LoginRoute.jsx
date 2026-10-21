import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import { getSafeLoginReturnPath } from '../lib/loginReturnPath.js';

export default function LoginRoute() {
  const { isAuthenticated } = useAuth();
  const { search, hash } = useLocation();
  if (new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery') {
    return <Navigate to={'/reset-password' + hash} replace />;
  }
  if (!isAuthenticated) return <LoginPage />;
  const next = getSafeLoginReturnPath(new URLSearchParams(search).get('next'));
  return <Navigate to={next || '/home'} replace />;
}
