// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useBookingPayment from '../hooks/useBookingPayment.js';
import {
  getPublicPaymentStatus,
  queryPublicPixelPayStatus,
  salePublicPixelPay,
} from '../publicBookingApi.js';

vi.mock('../publicBookingApi.js', () => ({
  completePublicMockPayment: vi.fn(),
  completePublicSimulatorPayment: vi.fn(),
  createPublicPaymentIntent: vi.fn(),
  getPublicPaymentStatus: vi.fn(),
  queryPublicPixelPayStatus: vi.fn(),
  salePublicPixelPay: vi.fn(),
}));

const GROUP_ID = '11111111-2222-4333-8444-555555555555';
const ALTERNATE_GROUP_ID = '22222222-3333-4444-8555-666666666666';
const INTENT_ID = '99999999-9999-4999-8999-999999999999';
const ALTERNATE_INTENT_ID = '88888888-8888-4888-8888-888888888888';
const EMAIL = 'qa@example.com';

describe('useBookingPayment PixelPay guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('deduplica consultas concurrentes de status y no reintenta', async () => {
    let resolveStatus;
    queryPublicPixelPayStatus.mockReturnValue(new Promise((resolve) => {
      resolveStatus = resolve;
    }));
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));

    let first;
    let second;
    await act(async () => {
      first = result.current.queryPixelPayStatusOnce({
        groupId: GROUP_ID,
        intentId: INTENT_ID,
        titularEmail: EMAIL,
      });
      second = result.current.queryPixelPayStatusOnce({
        groupId: GROUP_ID,
        intentId: INTENT_ID,
        titularEmail: EMAIL,
      });
      resolveStatus({
        provider_status: 'PENDING',
        estado_intent_codigo: 'pendiente_confirmacion',
      });
      await Promise.all([first, second]);
    });

    expect(queryPublicPixelPayStatus).toHaveBeenCalledTimes(1);
    const requestOptions = queryPublicPixelPayStatus.mock.calls[0][1];
    expect(requestOptions.headers['X-Request-Id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await waitFor(() => expect(result.current.paymentResult).toMatchObject({
      provider_status: 'PENDING',
      estado_intent_codigo: 'pendiente_confirmacion',
    }));
  });

  it('conserva el request id en NETWORK_UNAVAILABLE sin reintentar Status', async () => {
    queryPublicPixelPayStatus.mockImplementationOnce((_payload, options) => {
      const error = Object.assign(new Error('Sin red'), {
        code: 'NETWORK_UNAVAILABLE',
        status: 0,
        requestId: options.headers['X-Request-Id'],
      });
      return Promise.reject(error);
    });
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));

    let error;
    await act(async () => {
      try {
        await result.current.queryPixelPayStatusOnce({
          groupId: GROUP_ID,
          intentId: INTENT_ID,
          titularEmail: EMAIL,
        });
      } catch (caught) {
        error = caught;
      }
    });

    expect(error).toMatchObject({ code: 'NETWORK_UNAVAILABLE', status: 0 });
    expect(error.requestId).toBe(queryPublicPixelPayStatus.mock.calls[0][1].headers['X-Request-Id']);
    expect(queryPublicPixelPayStatus).toHaveBeenCalledTimes(1);
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toContain(EMAIL);
    expect(JSON.stringify(error)).not.toContain(INTENT_ID);
    expect(JSON.stringify(error)).not.toContain(GROUP_ID);
  });

  it('deduplica sale concurrente y nunca dispara status automaticamente', async () => {
    let resolveSale;
    salePublicPixelPay.mockReturnValue(new Promise((resolve) => {
      resolveSale = resolve;
    }));
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    const input = {
      groupId: GROUP_ID,
      intentId: INTENT_ID,
      titularEmail: EMAIL,
      card: { number: '4111 1111 1111 1111', holder: 'QA', expire: '2807', cvv: '999' },
      billing: { address: 'QA', country: 'HN', state: 'HN-CR', city: 'SPS', phone: '99999999' },
    };

    await act(async () => {
      const first = result.current.salePixelPayOnce(input);
      const second = result.current.salePixelPayOnce(input);
      resolveSale({ pending_confirmation: true, estado_intent_codigo: 'pendiente_confirmacion' });
      await Promise.all([first, second]);
    });

    expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('4111111111111111')).toBeNull();
    expect(JSON.stringify(window.sessionStorage)).not.toContain('999');
  });

  it('hard reload restaura contexto antiguo y reconstruye pendiente_confirmacion desde backend', async () => {
    window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      titular_email: EMAIL,
      paymentIntent: {
        id_grupo_cita: GROUP_ID,
        id_intent: INTENT_ID,
        estado_intent_codigo: 'link_generado',
      },
    }));
    getPublicPaymentStatus.mockResolvedValue({
      estado_intent_codigo: 'pendiente_confirmacion',
      booking_confirmed: false,
    });
    const { result, rerender } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));

    await act(async () => {
      const restored = result.current.restorePaymentContext(GROUP_ID);
      await result.current.fetchPaymentStatusOnce({
        groupId: restored.id_grupo_cita,
        intentId: restored.id_intent,
        titularEmail: restored.titular_email,
      });
    });

    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(result.current.paymentIntent.estado_intent_codigo).toBe('link_generado');
    expect(result.current.paymentResult).toMatchObject({
      estado_intent_codigo: 'pendiente_confirmacion',
      booking_confirmed: false,
    });
    expect(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).not.toBeNull();
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();

    rerender();
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  it('otra sesion restaura solo ids y acepta el estado pendiente del backend', async () => {
    window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      titular_email: EMAIL,
    }));
    getPublicPaymentStatus.mockResolvedValue({
      estado_intent_codigo: 'pendiente_confirmacion',
      booking_confirmed: false,
    });
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));

    await act(async () => {
      const restored = result.current.restorePaymentContext(GROUP_ID);
      await result.current.fetchPaymentStatusOnce({
        groupId: restored.id_grupo_cita,
        intentId: restored.id_intent,
        titularEmail: restored.titular_email,
      });
    });

    expect(result.current.paymentIntent).toEqual({
      id_intent: INTENT_ID,
      id_grupo_cita: GROUP_ID,
    });
    expect(result.current.paymentResult.estado_intent_codigo).toBe('pendiente_confirmacion');
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  it('ignora storage de otro grupo y respeta el contexto explicito completo', () => {
    window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      titular_email: EMAIL,
      paymentIntent: {
        id_grupo_cita: GROUP_ID,
        id_intent: INTENT_ID,
        estado_intent_codigo: 'link_generado',
      },
    }));
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: ALTERNATE_GROUP_ID }));

    let restored;
    act(() => {
      restored = result.current.restorePaymentContext(ALTERNATE_GROUP_ID, {
        id_grupo_cita: ALTERNATE_GROUP_ID,
        id_intent: ALTERNATE_INTENT_ID,
        titular_email: EMAIL,
      });
    });

    expect(restored).toMatchObject({
      id_grupo_cita: ALTERNATE_GROUP_ID,
      id_intent: ALTERNATE_INTENT_ID,
    });
    expect(result.current.paymentIntent).toEqual({
      id_grupo_cita: ALTERNATE_GROUP_ID,
      id_intent: ALTERNATE_INTENT_ID,
    });
  });
});
