import { describe, expect, it } from 'vitest';
import { resolveBookingMode } from '../../../public/booking/hooks/useBookingMode.js';

describe('booking mode compatibility', () => {
  it('keeps guest users on /agendar public mode', () => {
    expect(resolveBookingMode({
      isHydrating: false,
      isHydrated: true,
      isAuthenticated: false,
      roles: [],
    })).toBe('public');
  });

  it('keeps authenticated customers on /agendar authenticated mode', () => {
    expect(resolveBookingMode({
      isHydrating: false,
      isHydrated: true,
      isAuthenticated: true,
      roles: ['cliente'],
    })).toBe('authenticated');
  });

  it('keeps authenticated non-customer users on the current public fallback', () => {
    expect(resolveBookingMode({
      isHydrating: false,
      isHydrated: true,
      isAuthenticated: true,
      roles: ['admin'],
    })).toBe('public');
  });

  it('reports loading while auth hydration is pending', () => {
    expect(resolveBookingMode({
      isHydrating: true,
      isHydrated: false,
      isAuthenticated: false,
      roles: [],
    })).toBe('loading');
  });
});
