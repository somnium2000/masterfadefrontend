import { useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { getTitularState } from '../bookingUtils.js';

function resolveBookingMode({ isHydrating, isHydrated, isAuthenticated, roles }) {
  if (isHydrating || !isHydrated) return 'loading';
  if (isAuthenticated && Array.isArray(roles) && roles.includes('cliente')) return 'authenticated';
  return 'public';
}

export default function useBookingMode() {
  const { isAuthenticated, isHydrating, isHydrated, roles, user } = useAuth();

  const mode = useMemo(
    () => resolveBookingMode({ isHydrating, isHydrated, isAuthenticated, roles }),
    [isHydrating, isHydrated, isAuthenticated, roles]
  );
  const loadingMode = mode === 'loading';
  const isAuthenticatedBooking = mode === 'authenticated';
  const isPublicBooking = mode === 'public';

  const titularFromSession = useMemo(
    () => getTitularState(isAuthenticatedBooking ? user : null),
    [isAuthenticatedBooking, user]
  );

  return useMemo(
    () => ({
      mode,
      loadingMode,
      isPublicBooking,
      isAuthenticatedBooking,
      titularFromSession,
      bookingMode: mode,
      canUseClienteHold: isAuthenticatedBooking,
      titularState: titularFromSession,
    }),
    [
      mode,
      loadingMode,
      isPublicBooking,
      isAuthenticatedBooking,
      titularFromSession,
    ]
  );
}
