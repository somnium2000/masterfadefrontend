import { createContext, useContext } from 'react';

export const PublicBookingContext = createContext(null);

export function PublicBookingProvider({ value, children }) {
  return <PublicBookingContext.Provider value={value}>{children}</PublicBookingContext.Provider>;
}

export function usePublicBookingFlow() {
  const context = useContext(PublicBookingContext);
  if (!context) {
    throw new Error('usePublicBookingFlow debe usarse dentro de PublicBookingFlow.');
  }
  return context;
}
