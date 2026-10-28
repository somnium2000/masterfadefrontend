import { describe, expect, it } from "vitest";
import {
  readEnvFlag,
  VIP_MEMBERSHIPS_PURCHASE_ENABLED,
  VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE,
} from "./vipMembershipFeatureFlags.js";

describe("VIP membership purchase safety defaults", () => {
  it("keeps online purchase disabled when the environment flag is absent", () => {
    expect(readEnvFlag(undefined)).toBe(false);
    expect(VIP_MEMBERSHIPS_PURCHASE_ENABLED).toBe(false);
  });

  it("shows a clear unavailable message", () => {
    expect(VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE).toContain("compras en línea");
    expect(VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE).toContain("no están disponibles");
  });
});
