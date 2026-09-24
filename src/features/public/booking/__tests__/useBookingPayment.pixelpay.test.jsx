// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useBookingPayment from '../hooks/useBookingPayment.js';
import {
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
const INTENT_ID = '99999999-9999-4999-8999-999999999999';
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
    await waitFor(() => expect(result.current.paymentResult).toMatchObject({
      provider_status: 'PENDING',
      estado_intent_codigo: 'pendiente_confirmacion',
    }));
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
});
