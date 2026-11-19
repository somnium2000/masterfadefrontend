import { describe, expect, test } from "vitest";
import { resolveQaVipCommercialVideoMode } from "../qaVipCommercialVideoMode.js";

describe("presentación comercial VIP para video QA", () => {
  test("requiere simultáneamente el simulador VIP estricto y el flag de video", () => {
    expect(resolveQaVipCommercialVideoMode({
      purchaseSimulationEnabled: true,
      videoDemoEnabled: "true",
    })).toBe(true);
  });

  test.each([
    [false, "true"],
    [true, "false"],
    [true, "1"],
    [true, undefined],
  ])("falla cerrado con simulador=%s y video=%s", (purchaseSimulationEnabled, videoDemoEnabled) => {
    expect(resolveQaVipCommercialVideoMode({ purchaseSimulationEnabled, videoDemoEnabled })).toBe(false);
  });
});
