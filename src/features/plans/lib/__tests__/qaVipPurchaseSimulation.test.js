import { describe, expect, test } from "vitest";
import { resolveQaVipPurchaseSimulation } from "../qaVipPurchaseSimulation.js";

function authorizedQa(overrides = {}) {
  return {
    hostname: "qa.masterfadeapp.com",
    entorno: "qa",
    provider: "todopago",
    todoPagoMode: "preprod_simulated",
    todoPagoSimulatedEnabled: "true",
    paymentSimulatorEnabled: "true",
    qaPaymentSimulationEnabled: "true",
    membershipSimulatorEnabled: "true",
    vipPurchaseSimulationEnabled: "true",
    ...overrides,
  };
}

describe("habilitacion frontend de compra VIP simulada", () => {
  test("permite el build optimizado de QA cuando host y matriz son exactos", () => {
    expect(resolveQaVipPurchaseSimulation(authorizedQa())).toBe(true);
  });

  test.each([
    ["hostname", "masterfadeapp.com"],
    ["entorno", "production"],
    ["provider", "pixelpay"],
    ["todoPagoMode", "preprod_real"],
    ["todoPagoSimulatedEnabled", "false"],
    ["paymentSimulatorEnabled", "false"],
    ["qaPaymentSimulationEnabled", "false"],
    ["membershipSimulatorEnabled", "false"],
    ["vipPurchaseSimulationEnabled", "false"],
  ])("falla cerrado cuando %s no coincide", (name, value) => {
    expect(resolveQaVipPurchaseSimulation(authorizedQa({ [name]: value }))).toBe(false);
  });

  test("solo acepta el booleano textual true", () => {
    expect(resolveQaVipPurchaseSimulation(authorizedQa({ vipPurchaseSimulationEnabled: "1" }))).toBe(false);
  });
});
