// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import useBookingPayment from '../hooks/useBookingPayment.js';
import { getPublicPaymentStatus } from '../publicBookingApi.js';

vi.mock('../publicBookingApi.js', () => ({
  completePublicMockPayment: vi.fn(),
  completePublicSimulatorPayment: vi.fn(),
  createPublicPaymentIntent: vi.fn(),
  getPublicPaymentStatus: vi.fn(),
  queryPublicPixelPayStatus: vi.fn(),
  salePublicPixelPay: vi.fn(),
}));

const GROUP_ID = '11111111-2222-4333-8444-555555555555';
const INTENT_ID = '99999999-9999-4999-8999-999999999999';
const EMAIL = 'qa@example.com';
const BOOKING_CONTEXT_KEY = 'masterfade.publicBookingPayment.v1';
const PENDING_CONTEXT_KEY = 'mf_pending_payment_context_v1';

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

test('un estado incierto sobrevive al remount y la confirmacion limpia contextos por etapas', async () => {
  const storedContext = JSON.stringify({
    id_grupo_cita: GROUP_ID,
    id_intent: INTENT_ID,
    titular_email: EMAIL,
  });
  window.sessionStorage.setItem(BOOKING_CONTEXT_KEY, storedContext);
  window.sessionStorage.setItem(PENDING_CONTEXT_KEY, storedContext);
  getPublicPaymentStatus.mockResolvedValueOnce({
    estado_intent_codigo: 'pendiente_confirmacion',
    pending_confirmation: true,
    booking_confirmed: false,
  });
  const firstMount = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));

  await act(async () => {
    const restored = firstMount.result.current.restorePaymentContext(GROUP_ID);
    expect(restored).toMatchObject({ id_grupo_cita: GROUP_ID, id_intent: INTENT_ID });
    await firstMount.result.current.fetchPaymentStatusOnce({
      groupId: GROUP_ID,
      intentId: INTENT_ID,
      titularEmail: EMAIL,
    });
  });
  expect(window.sessionStorage.getItem(BOOKING_CONTEXT_KEY)).not.toBeNull();
  expect(window.sessionStorage.getItem(PENDING_CONTEXT_KEY)).not.toBeNull();
  firstMount.unmount();

  getPublicPaymentStatus.mockResolvedValueOnce({
    estado_intent_codigo: 'pagado',
    booking_confirmed: true,
  });
  const secondMount = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
  await act(async () => {
    const restored = secondMount.result.current.restorePaymentContext(GROUP_ID);
    expect(restored).toMatchObject({ id_grupo_cita: GROUP_ID, id_intent: INTENT_ID });
    await secondMount.result.current.fetchPaymentStatusOnce({
      groupId: GROUP_ID,
      intentId: INTENT_ID,
      titularEmail: EMAIL,
    });
  });
  expect(window.sessionStorage.getItem(BOOKING_CONTEXT_KEY)).not.toBeNull();
  expect(window.sessionStorage.getItem(PENDING_CONTEXT_KEY)).toBeNull();

  act(() => secondMount.result.current.clearPaymentState());
  expect(window.sessionStorage.getItem(BOOKING_CONTEXT_KEY)).toBeNull();
});
