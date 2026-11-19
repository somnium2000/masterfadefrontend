const QA_VIP_HOSTNAME = "qa.masterfadeapp.com";

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isStrictlyEnabled(value) {
  return normalize(value) === "true";
}

export function resolveQaVipPurchaseSimulation({
  hostname = typeof globalThis !== "undefined" ? globalThis.location?.hostname : "",
  entorno = import.meta.env.VITE_ENTORNO,
  provider = import.meta.env.VITE_PAYMENT_PROVIDER || import.meta.env.VITE_PAYMENT_PROVIDER_CODE,
  todoPagoMode = import.meta.env.VITE_TODOPAGO_MODE,
  todoPagoSimulatedEnabled = import.meta.env.VITE_TODOPAGO_SIMULATED_ENABLED,
  paymentSimulatorEnabled = import.meta.env.VITE_ENABLE_PAYMENT_SIMULATOR,
  qaPaymentSimulationEnabled = import.meta.env.VITE_ENABLE_QA_PAYMENT_SIMULATION,
  membershipSimulatorEnabled = import.meta.env.VITE_MEMBERSHIP_PAYMENT_SIMULATOR_ENABLED,
  vipPurchaseSimulationEnabled = import.meta.env.VITE_ENABLE_QA_VIP_PURCHASE_SIMULATION,
} = {}) {
  return normalize(hostname) === QA_VIP_HOSTNAME
    && normalize(entorno) === "qa"
    && normalize(provider) === "todopago"
    && normalize(todoPagoMode) === "preprod_simulated"
    && isStrictlyEnabled(todoPagoSimulatedEnabled)
    && isStrictlyEnabled(paymentSimulatorEnabled)
    && isStrictlyEnabled(qaPaymentSimulationEnabled)
    && isStrictlyEnabled(membershipSimulatorEnabled)
    && isStrictlyEnabled(vipPurchaseSimulationEnabled);
}

export function isQaVipPurchaseSimulationEnabled() {
  return resolveQaVipPurchaseSimulation();
}
