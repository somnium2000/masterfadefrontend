import { useEffect, useRef } from "react";

export const MEMBERSHIP_PAYMENT_POLL_INTERVAL_MS = 30_000;

export default function useMembershipPaymentPolling({
  active,
  idPaymentIntent,
  queryStatus,
  onResult,
  intervalMs = MEMBERSHIP_PAYMENT_POLL_INTERVAL_MS,
}) {
  const inFlightRef = useRef(false);
  const callbackRef = useRef(onResult);
  callbackRef.current = onResult;

  useEffect(() => {
    const safeIntentId = String(idPaymentIntent || "").trim();
    if (!active || !safeIntentId || typeof queryStatus !== "function") return undefined;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const result = await queryStatus(safeIntentId);
        if (!cancelled) callbackRef.current?.(result);
      } catch {
        if (!cancelled) callbackRef.current?.({ normalized_status: "PENDIENTE" });
      } finally {
        inFlightRef.current = false;
      }
    };
    void poll();
    const timer = globalThis.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [active, idPaymentIntent, intervalMs, queryStatus]);
}
