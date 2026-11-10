import { describe, expect, it } from 'vitest';
import { PUBLIC_BOOKING_ENABLED, PUBLIC_BOOKING_LOCK_MESSAGE } from './publicBookingFeatureFlags.js';

describe('public booking safety defaults', () => {
  it('keeps public booking disabled when the build flag is absent', () => {
    expect(PUBLIC_BOOKING_ENABLED).toBe(false);
  });

  it('provides a visible temporary lock message', () => {
    expect(PUBLIC_BOOKING_LOCK_MESSAGE).toContain('temporalmente');
  });
});
