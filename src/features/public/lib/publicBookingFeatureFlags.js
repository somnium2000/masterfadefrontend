import { readEnvFlag } from './vipMembershipFeatureFlags.js';

export const PUBLIC_BOOKING_ENABLED = readEnvFlag(
  import.meta.env.VITE_PUBLIC_BOOKING_ENABLED,
  false
);

export const PUBLIC_BOOKING_LOCK_MESSAGE = String(
  import.meta.env.VITE_PUBLIC_BOOKING_LOCK_MESSAGE || 'Reservas temporalmente no disponibles.'
).trim() || 'Reservas temporalmente no disponibles.';
