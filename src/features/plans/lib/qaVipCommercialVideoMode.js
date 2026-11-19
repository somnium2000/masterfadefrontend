import { isQaVipPurchaseSimulationEnabled } from "./qaVipPurchaseSimulation.js";

function isStrictlyEnabled(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function resolveQaVipCommercialVideoMode({
  purchaseSimulationEnabled = isQaVipPurchaseSimulationEnabled(),
  videoDemoEnabled = import.meta.env.VITE_QA_VIDEO_DEMO_MODE,
} = {}) {
  return purchaseSimulationEnabled === true && isStrictlyEnabled(videoDemoEnabled);
}

export function isQaVipCommercialVideoModeEnabled() {
  return resolveQaVipCommercialVideoMode();
}
