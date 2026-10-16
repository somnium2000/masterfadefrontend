// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { resolvePaymentExecutionContext } from '../PublicBookingFlow.jsx';
import useBookingPayment from '../hooks/useBookingPayment.js';
import { createPublicPaymentIntent } from '../publicBookingApi.js';

vi.mock('../publicBookingApi.js', () => ({
  confirmClienteCitaHoldWithoutPayment: vi.fn(), createClienteCitaHold: vi.fn(),
  createPublicCitaHold: vi.fn(), releaseClienteCitaHold: vi.fn(),
  releasePublicCitaHold: vi.fn(), validatePublicBookingContacts: vi.fn(),
  completePublicMockPayment: vi.fn(), completePublicSimulatorPayment: vi.fn(),
  createPublicPaymentIntent: vi.fn(), getPublicPaymentStatus: vi.fn(),
  queryPublicPixelPayStatus: vi.fn(), salePublicPixelPay: vi.fn(),
}));
const OLD = 'c41503b4-95a3-4c6d-baf1-4e95464234a1';
const NEW = '6a9a0dfd-963c-4614-855d-b9a9577dabb8';
const oldIntent = { id_grupo_cita: OLD, id_intent: 'fb372b25-8ba7-4aac-8d38-450505fa6e60', estado_intent_codigo: 'pendiente_confirmacion' };
const newIntent = { id_grupo_cita: NEW, id_intent: '72d2b189-f739-4d22-bd5f-f43b4d73299b' };
const resume = { ...oldIntent, titular_email: 'qa@example.com' };
beforeEach(() => { vi.resetAllMocks(); window.sessionStorage.clear(); });

test('A: PR07 pendiente nunca se combina con hold PR08, ni siquiera antes de efectos', () => {
  expect(resolvePaymentExecutionContext({ holdResult: { id_grupo_cita: NEW }, paymentIntent: oldIntent, pendingResumeContext: resume }).intentId).toBe('');
});
test('B: grupo nuevo utiliza exclusivamente su intent nuevo', () => {
  expect(resolvePaymentExecutionContext({ holdResult: { id_grupo_cita: NEW }, paymentIntent: newIntent, pendingResumeContext: resume })).toMatchObject({ groupId: NEW, intentId: newIntent.id_intent });
});
test('C: resume valido del mismo grupo se conserva', () => {
  expect(resolvePaymentExecutionContext({ holdResult: { id_grupo_cita: OLD }, pendingResumeContext: resume })).toMatchObject({ groupId: OLD, intentId: oldIntent.id_intent, titularEmail: 'qa@example.com' });
});
test('D: adoptar grupo nuevo descarta intent, resultado y resume anteriores', () => {
  const { result, rerender } = renderHook(({ group }) => useBookingPayment({ currentGroupId: group }), { initialProps: { group: OLD } });
  act(() => { result.current.setPaymentIntent(oldIntent); result.current.setPaymentResult({ ...oldIntent, pending_confirmation: true }); });
  window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({ ...resume, paymentIntent: oldIntent }));
  window.sessionStorage.setItem('mf_pending_payment_context_v1', JSON.stringify(resume));
  rerender({ group: NEW });
  expect(result.current.paymentIntent).toBeNull();
  expect(result.current.paymentResult).toBeNull();
  expect(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).toBeNull();
  expect(window.sessionStorage.getItem('mf_pending_payment_context_v1')).toBeNull();
  act(() => { expect(result.current.restorePaymentContext(NEW, resume)).toBeNull(); });
});
test('E: adoptar el mismo grupo preserva pago pendiente y recuperacion legitima', () => {
  const { result, rerender } = renderHook(({ group }) => useBookingPayment({ currentGroupId: group }), { initialProps: { group: '' } });
  act(() => { result.current.restorePaymentContext(OLD, resume); result.current.setPaymentResult({ ...oldIntent, pending_confirmation: true }); });
  rerender({ group: OLD });
  expect(result.current.paymentIntent.id_intent).toBe(oldIntent.id_intent);
  expect(result.current.paymentResult.pending_confirmation).toBe(true);
});
test('F: crea normalmente intent nuevo despues del cambio y no reutiliza el viejo', async () => {
  createPublicPaymentIntent.mockResolvedValue({ data: { id_intent: newIntent.id_intent } });
  const { result, rerender } = renderHook(({ group }) => useBookingPayment({ currentGroupId: group }), { initialProps: { group: OLD } });
  act(() => result.current.setPaymentIntent(oldIntent));
  rerender({ group: NEW });
  await act(async () => { await result.current.createPaymentIntentOnce({ groupId: NEW, titularEmail: 'qa@example.com', payload: { id_grupo_cita: NEW } }); });
  expect(createPublicPaymentIntent).toHaveBeenCalledTimes(1);
  expect(result.current.paymentIntent).toMatchObject(newIntent);
  act(() => { expect(result.current.restorePaymentContext(NEW, resume)).toBeNull(); });
  expect(result.current.paymentIntent).toMatchObject(newIntent);
  await act(async () => { await result.current.createPaymentIntentOnce({ groupId: NEW }); });
  expect(createPublicPaymentIntent).toHaveBeenCalledTimes(1);
});

test('descarta resultado pendiente sin IDs al cambiar de grupo, pero no al adoptar el mismo', () => {
  const { result, rerender } = renderHook(({ group }) => useBookingPayment({ currentGroupId: group }), { initialProps: { group: OLD } });
  act(() => result.current.setPaymentResult({ pending_confirmation: true }));
  rerender({ group: OLD });
  expect(result.current.paymentResult.pending_confirmation).toBe(true);
  rerender({ group: NEW });
  expect(result.current.paymentResult).toBeNull();
});

test('respuesta tardia de creacion anterior no reemplaza el intent del grupo nuevo', async () => {
  let resolveOld;
  createPublicPaymentIntent.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce({ data: newIntent });
  const { result, rerender } = renderHook(({ group }) => useBookingPayment({ currentGroupId: group }), { initialProps: { group: OLD } });
  let pending;
  act(() => { pending = result.current.createPaymentIntentOnce({ groupId: OLD, payload: {} }); });
  rerender({ group: NEW });
  await act(async () => { await result.current.createPaymentIntentOnce({ groupId: NEW, payload: {} }); });
  await act(async () => { resolveOld({ data: oldIntent }); await pending; });
  expect(result.current.paymentIntent).toMatchObject(newIntent);
});
