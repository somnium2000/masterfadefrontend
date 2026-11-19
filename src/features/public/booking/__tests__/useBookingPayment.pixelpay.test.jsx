// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useBookingPayment from '../hooks/useBookingPayment.js';
import { runDelegatedPixelPay } from '../../../payments/experimental/delegatedPixelPay.js';
import { readBookingPaymentContext } from '../paymentResumeContext.js';
import {
  getPublicPaymentStatus,
  queryPublicPixelPayStatus,
  requestQaDelegatedPayment,
  salePublicPixelPay,
} from '../publicBookingApi.js';

vi.mock('../publicBookingApi.js', () => ({
  completePublicMockPayment: vi.fn(),
  completePublicSimulatorPayment: vi.fn(),
  createPublicPaymentIntent: vi.fn(),
  getPublicPaymentStatus: vi.fn(),
  queryPublicPixelPayStatus: vi.fn(),
  requestQaDelegatedPayment: vi.fn(),
  salePublicPixelPay: vi.fn(),
}));

vi.mock('../../../payments/experimental/delegatedPixelPay.js', () => ({
  runDelegatedPixelPay: vi.fn(async ({ transport }) => {
    await transport('lookup', { reference: 'opaque-reference' });
    return transport('status', {});
  }),
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

  it('uses QA handoff in memory and keeps an interrupted attempt pending without a second Sale', async () => {
    const handoff = { token: 'memory-only-token', expiresAt: Date.now() + 240000,
      continuation: { payload: 'memory-only-payload' } };
    salePublicPixelPay.mockResolvedValueOnce({ pending_confirmation: true, qa_3ds_handoff: handoff });
    requestQaDelegatedPayment.mockRejectedValueOnce(new Error('transport interrupted'));
    const args = { groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL, card: {}, billing: {}, delegated: true };
    const hook = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID, authenticated: true }));
    await act(async () => { await hook.result.current.salePixelPayOnce(args); });
    expect(requestQaDelegatedPayment).toHaveBeenCalledWith({
      id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, titular_email: EMAIL, token: handoff.token,
      operation: 'lookup', data: { reference: 'opaque-reference' },
    }, expect.anything());
    expect(hook.result.current.paymentResult).toMatchObject({ pending_confirmation: true });
    expect(JSON.stringify(window.sessionStorage)).not.toContain('memory-only');
    await act(async () => { expect(await hook.result.current.salePixelPayOnce(args)).toBeNull(); });
    expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
  });

  it('correlaciona un fallo del SDK y conserva el intento pendiente para conciliación', async () => {
    const response = {
      estado_intent_codigo: 'pendiente_confirmacion',
      booking_confirmed: false,
      qa_3ds_handoff: {
        token: 'private-handoff-marker',
        expiresAt: Date.now() + 240000,
        continuation: { payload: 'private-payload-marker' },
      },
    };
    Object.defineProperty(response, '__meta', { value: { headers: new Headers({ 'X-Request-Id': 'req-i' }) } });
    salePublicPixelPay.mockResolvedValueOnce(response);
    runDelegatedPixelPay.mockRejectedValueOnce(Object.assign(new Error('private-error-marker'), {
      code: 'PIXELPAY_3DS_SDK_LOAD_FAILED',
    }));
    const args = { groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL, card: {}, billing: {}, delegated: true };
    const hook = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID, authenticated: true }));
    await act(async () => { await hook.result.current.salePixelPayOnce(args); });

    expect(hook.result.current.paymentResult).toMatchObject({
      pending_confirmation: true,
      estado_intent_codigo: 'pendiente_confirmacion',
      booking_confirmed: false,
      qa_3ds_browser_diagnostic: { code: 'PIXELPAY_3DS_SDK_LOAD_FAILED', id_intent: INTENT_ID, request_id: 'req-i' },
    });
    expect(readBookingPaymentContext()?.paymentIntent?.pending_confirmation).toBe(true);
    expect(JSON.stringify([hook.result.current.paymentResult, window.sessionStorage])).not.toContain('private-');
    await act(async () => { expect(await hook.result.current.salePixelPayOnce(args)).toBeNull(); });
    expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
    expect(runDelegatedPixelPay).toHaveBeenCalledTimes(1);
    expect(requestQaDelegatedPayment).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
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

  it('bloquea invocación directa repetida tras pérdida de respuesta', async () => {
    const error = Object.assign(new Error('Sin respuesta'), { status: 0, code: 'NETWORK_UNAVAILABLE' });
    salePublicPixelPay.mockRejectedValue(error);
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    const input = { groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL, card: {}, billing: {} };
    await act(async () => { await expect(result.current.salePixelPayOnce(input)).rejects.toBe(error); });
    await act(async () => { expect(await result.current.salePixelPayOnce(input)).toBeNull(); });
    expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  it.each([
    [503, 'PIXELPAY_3DS_INTEGRATION_UNAVAILABLE', false],
    [503, 'UNKNOWN_SERVER_CODE', true],
    [422, 'PIXELPAY_SANDBOX_CARD_NOT_ALLOWED', false],
    [422, 'UNKNOWN_SERVER_CODE', true],
    [undefined, 'NETWORK_ERROR', true],
  ])('%s %s preserves whether the operation could have started', async (status, code, pending) => {
    const fresh = { id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, estado_intent_codigo: 'link_generado' };
    window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({
      id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, titular_email: EMAIL, paymentIntent: fresh,
    }));
    const error = Object.assign(new Error('Servicio no disponible'), { status, data: { error: { code } } });
    salePublicPixelPay.mockRejectedValueOnce(error);
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    act(() => result.current.restorePaymentContext(GROUP_ID));
    await act(async () => expect(result.current.salePixelPayOnce({
      groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL, card: {}, billing: {},
    })).rejects.toBe(error));
    expect(result.current.paymentIntent).toMatchObject({ ...fresh, pending_confirmation: pending });
    expect(JSON.parse(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).paymentIntent)
      .toMatchObject({ ...fresh, pending_confirmation: pending });
    expect(salePublicPixelPay).toHaveBeenCalledOnce();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  it('no envía Sale si sessionStorage no permite guardar la recuperación', async () => {
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    try {
      await act(async () => {
        await expect(result.current.salePixelPayOnce({
          groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL, card: {}, billing: {},
        })).rejects.toMatchObject({ code: 'PIXELPAY_RECOVERY_CONTEXT_UNAVAILABLE' });
      });
      expect(salePublicPixelPay).not.toHaveBeenCalled();
      expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
    } finally { write.mockRestore(); }
  });

  it.each(['confirmado', 'fallido'])('GET terminal %s actualiza el contexto persistido tras recarga', async (state) => {
    window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({
      id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, titular_email: EMAIL,
      paymentIntent: { id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, estado_intent_codigo: 'link_generado', pending_confirmation: true },
    }));
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    act(() => { result.current.restorePaymentContext(GROUP_ID); });
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, estado_intent_codigo: state, booking_confirmed: state === 'confirmado',
    });
    await act(async () => { await result.current.fetchPaymentStatusOnce({ groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL }); });
    expect(result.current.paymentIntent).toMatchObject({ pending_confirmation: false, estado_intent_codigo: state });
    expect(JSON.parse(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).paymentIntent)
      .toMatchObject({ pending_confirmation: false, estado_intent_codigo: state });
    expect(salePublicPixelPay).not.toHaveBeenCalled();
  });

  it('GET tardío no reconstruye el contexto eliminado mientras esperaba', async () => {
    let finish;
    getPublicPaymentStatus.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    let pending;
    act(() => { pending = result.current.fetchPaymentStatusOnce({ groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL }); });
    act(() => { result.current.clearPaymentState(); });
    await act(async () => {
      finish({ id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, booking_confirmed: true, estado_intent_codigo: 'confirmado' });
      await pending;
    });
    expect(result.current.paymentIntent).toBeNull();
    expect(result.current.paymentResult).toBeNull();
    expect(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).toBeNull();
  });

  it.each([ALTERNATE_INTENT_ID, undefined])('GET terminal con intent %s no elimina incertidumbre del intent solicitado', async (responseIntentId) => {
    window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({
      id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, titular_email: EMAIL,
      paymentIntent: { id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, pending_confirmation: true },
    }));
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    act(() => { result.current.restorePaymentContext(GROUP_ID); });
    getPublicPaymentStatus.mockResolvedValue({ id_grupo_cita: GROUP_ID, id_intent: responseIntentId, booking_confirmed: true });
    await act(async () => {
      expect(await result.current.fetchPaymentStatusOnce({ groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL })).toBeNull();
    });
    expect(result.current.paymentResult).toBeNull();
    expect(result.current.paymentIntent.pending_confirmation).toBe(true);
    expect(JSON.parse(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).paymentIntent.pending_confirmation).toBe(true);
    expect(salePublicPixelPay).not.toHaveBeenCalled();
  });

  it.each(['definitive', 'preflight'])('resultado tardío %s no reconstruye un contexto borrado', async (outcome) => {
    let finish;
    let fail;
    salePublicPixelPay.mockReturnValue(new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    let pending;
    act(() => {
      pending = result.current.salePixelPayOnce({ groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL, card: {}, billing: {} }).catch(() => null);
    });
    act(() => { result.current.clearPaymentState(); });
    await act(async () => {
      if (outcome === 'definitive') finish({ booking_confirmed: true, estado_intent_codigo: 'confirmado' });
      else fail(Object.assign(new Error('Rechazado'), { status: 403, data: { error: { code: 'PRIVATE_COMMERCE_RESTRICTED' } } }));
      await pending;
    });
    expect(result.current.paymentIntent).toBeNull();
    expect(result.current.paymentResult).toBeNull();
    expect(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).toBeNull();
    expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
  });

  it('resultado del hook desmontado no sobrescribe el contexto de otro checkout', async () => {
    let finish;
    salePublicPixelPay.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { result, unmount } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    let pending;
    act(() => { pending = result.current.salePixelPayOnce({ groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL, card: {}, billing: {} }); });
    unmount();
    const nextContext = { id_grupo_cita: ALTERNATE_GROUP_ID, id_intent: ALTERNATE_INTENT_ID, titular_email: EMAIL };
    window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify(nextContext));
    await act(async () => { finish({ booking_confirmed: true, estado_intent_codigo: 'confirmado' }); await pending; });
    expect(JSON.parse(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1'))).toEqual(nextContext);
  });

  it.each(['confirmado', 'fallido'])('callback obsoleto no repite Sale después de %s', async (state) => {
    salePublicPixelPay.mockResolvedValue({ estado_intent_codigo: state, booking_confirmed: state === 'confirmado' });
    const { result } = renderHook(() => useBookingPayment({ currentGroupId: GROUP_ID }));
    const callback = result.current.salePixelPayOnce;
    const input = { groupId: GROUP_ID, intentId: INTENT_ID, titularEmail: EMAIL, card: {}, billing: {} };
    await act(async () => { await callback(input); expect(await callback(input)).toBeNull(); });
    expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).paymentIntent.estado_intent_codigo).toBe(state);
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
    expect(JSON.parse(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1'))).toEqual({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      titular_email: EMAIL,
      paymentIntent: { id_grupo_cita: GROUP_ID, id_intent: INTENT_ID, pending_confirmation: true },
    });
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
