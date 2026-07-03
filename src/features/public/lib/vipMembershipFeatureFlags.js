function readEnvFlag(value, fallback = true) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return true;
}

export const VIP_MEMBERSHIPS_PURCHASE_ENABLED = readEnvFlag(
  import.meta.env.VITE_VIP_MEMBERSHIPS_PURCHASE_ENABLED,
  true
);

export const VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE = String(
  import.meta.env.VITE_VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE || "Proximamente..."
).trim() || "Proximamente...";
