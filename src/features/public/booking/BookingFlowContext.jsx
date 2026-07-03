import { createContext, useContext } from 'react';

export const BookingFlowContext = createContext(null);
export const PublicBookingContext = BookingFlowContext;

export function BookingFlowProvider({ value, children }) {
  return <BookingFlowContext.Provider value={value}>{children}</BookingFlowContext.Provider>;
}

export function PublicBookingProvider({ value, children }) {
  return <BookingFlowProvider value={value}>{children}</BookingFlowProvider>;
}

export function useBookingFlow() {
  const context = useContext(BookingFlowContext);
  if (!context) {
    throw new Error('useBookingFlow debe usarse dentro de BookingFlowProvider.');
  }
  return context;
}

export function usePublicBookingFlow() {
  return useBookingFlow();
}
