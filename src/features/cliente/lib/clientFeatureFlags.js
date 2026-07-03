function readEnvFlag(value, fallback = true) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export const CLIENT_BOOKING_ENABLED = readEnvFlag(import.meta.env.VITE_CLIENT_BOOKING_ENABLED, true);
export const CLIENT_CITAS_ENABLED = readEnvFlag(import.meta.env.VITE_CLIENT_CITAS_ENABLED, true);
export const CLIENT_PLAN_PURCHASE_ENABLED = readEnvFlag(import.meta.env.VITE_CLIENT_PLAN_PURCHASE_ENABLED, true);
export const CLIENT_LOCK_MESSAGE = String(import.meta.env.VITE_CLIENT_LOCK_MESSAGE || 'Proximamente...').trim() || 'Proximamente...';
