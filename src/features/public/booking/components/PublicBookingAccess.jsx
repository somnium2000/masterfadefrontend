import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { getSafeLoginReturnPath } from '../../../auth/lib/loginReturnPath.js';
import BookingUnavailablePage from '../../pages/BookingUnavailablePage.jsx';
import BookingLoadingState from './BookingLoadingState.jsx';

export default function PublicBookingAccess({ commerce, children }) {
  const { isAuthenticated, isHydrating, isHydrated, roles = [] } = useAuth();
  const location = useLocation();
  if (isHydrating || isHydrated === false || commerce.checking) return <BookingLoadingState />;
  if (!isAuthenticated) {
    if (!commerce.publicBooking) return <BookingUnavailablePage />;
    const next = getSafeLoginReturnPath(location.pathname + location.search) || '/agendar/barberos';
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (!roles.includes('cliente')) return <Navigate to="/unauthorized" replace />;
  if (!commerce.booking) return <BookingUnavailablePage />;
  return children;
}
