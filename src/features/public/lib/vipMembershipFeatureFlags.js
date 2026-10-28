export function readEnvFlag(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return true;
}

export const VIP_MEMBERSHIPS_PURCHASE_ENABLED = readEnvFlag(
  import.meta.env.VITE_VIP_MEMBERSHIPS_PURCHASE_ENABLED,
  false
);

export const VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE = String(
  import.meta.env.VITE_VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE || "Las compras en línea todavía no están disponibles."
).trim() || "Las compras en línea todavía no están disponibles.";
