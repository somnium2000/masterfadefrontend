// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import useMembershipPaymentPolling, { MEMBERSHIP_PAYMENT_POLL_INTERVAL_MS } from "../useMembershipPaymentPolling.js";

afterEach(() => {
  vi.useRealTimers();
});

test("consulta inmediatamente, cada 30 segundos y limpia el temporizador", async () => {
  vi.useFakeTimers();
  const queryStatus = vi.fn().mockResolvedValue({ normalized_status: "PENDIENTE" });
  const onResult = vi.fn();
  const { unmount } = renderHook(() => useMembershipPaymentPolling({
    active: true,
    idPaymentIntent: "11111111-1111-4111-8111-111111111111",
    queryStatus,
    onResult,
  }));
  await act(async () => { await Promise.resolve(); });
  expect(queryStatus).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(MEMBERSHIP_PAYMENT_POLL_INTERVAL_MS); });
  expect(queryStatus).toHaveBeenCalledTimes(2);
  unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(MEMBERSHIP_PAYMENT_POLL_INTERVAL_MS); });
  expect(queryStatus).toHaveBeenCalledTimes(2);
});

test("no superpone consultas del mismo intent", async () => {
  vi.useFakeTimers();
  let resolveQuery;
  const queryStatus = vi.fn(() => new Promise((resolve) => { resolveQuery = resolve; }));
  renderHook(() => useMembershipPaymentPolling({
    active: true,
    idPaymentIntent: "11111111-1111-4111-8111-111111111111",
    queryStatus,
    onResult: vi.fn(),
  }));
  await act(async () => { await vi.advanceTimersByTimeAsync(MEMBERSHIP_PAYMENT_POLL_INTERVAL_MS * 2); });
  expect(queryStatus).toHaveBeenCalledTimes(1);
  await act(async () => { resolveQuery({ normalized_status: "PENDIENTE" }); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(MEMBERSHIP_PAYMENT_POLL_INTERVAL_MS); });
  expect(queryStatus).toHaveBeenCalledTimes(2);
});

test("detiene el polling cuando el resultado deja de estar pendiente", async () => {
  vi.useFakeTimers();
  const queryStatus = vi.fn().mockResolvedValue({ normalized_status: "PAGADO" });
  const onResult = vi.fn();
  const { rerender } = renderHook(({ active }) => useMembershipPaymentPolling({
    active,
    idPaymentIntent: "11111111-1111-4111-8111-111111111111",
    queryStatus,
    onResult,
  }), { initialProps: { active: true } });
  await act(async () => { await Promise.resolve(); });
  rerender({ active: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(MEMBERSHIP_PAYMENT_POLL_INTERVAL_MS * 2); });
  expect(queryStatus).toHaveBeenCalledTimes(1);
});
