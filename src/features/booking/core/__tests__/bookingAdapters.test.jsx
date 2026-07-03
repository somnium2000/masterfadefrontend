// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import useBookingHold from '../../../public/booking/hooks/useBookingHold.js';
import {
  resolveConfirmWithoutPaymentState,
  resolveHoldPricing,
} from '../../../public/booking/bookingFlowSelectors.js';
import resolveBookingAdapter from '../../adapters/bookingAdapterResolver.js';
import previewBookingAdapter from '../../adapters/previewBookingAdapter.js';

const publicBookingApiMock = vi.hoisted(() => ({
  createPublicCitaHold: vi.fn(),
  createClienteCitaHold: vi.fn(),
  releasePublicCitaHold: vi.fn(),
  releaseClienteCitaHold: vi.fn(),
  confirmClienteCitaHoldWithoutPayment: vi.fn(),
}));

vi.mock('../../../public/booking/publicBookingApi.js', () => publicBookingApiMock);

beforeEach(() => {
  window.sessionStorage.clear();
  publicBookingApiMock.createPublicCitaHold.mockReset();
  publicBookingApiMock.createClienteCitaHold.mockReset();
  publicBookingApiMock.releasePublicCitaHold.mockReset();
  publicBookingApiMock.releaseClienteCitaHold.mockReset();
  publicBookingApiMock.confirmClienteCitaHoldWithoutPayment.mockReset();
});

describe('booking adapters integration', () => {
  it('selects guest, customer and preview adapters by mode', () => {
    expect(resolveBookingAdapter({ mode: 'public' }).actor.type).toBe('guest');
    expect(resolveBookingAdapter({ mode: 'authenticated', actor: { customerId: 'c-1' } }).actor).toMatchObject({
      type: 'customer',
      customerId: 'c-1',
    });
    expect(resolveBookingAdapter({ mode: 'preview' })).toBe(previewBookingAdapter);
  });

  it('uses guestBookingAdapter for public hold creation', async () => {
    publicBookingApiMock.createPublicCitaHold.mockResolvedValue({ data: { id_grupo_cita: 'public-group' } });
    const adapter = resolveBookingAdapter({ mode: 'public' });
    const { result } = renderHook(() => useBookingHold({
      mode: 'public',
      isAuthenticatedBooking: false,
      bookingAdapter: adapter,
      selectionFingerprint: 'public-selection',
    }));

    let hold;
    await act(async () => {
      hold = await result.current.createHold({ id_sucursal: 'branch-1' });
    });

    expect(hold.id_grupo_cita).toBe('public-group');
    expect(publicBookingApiMock.createPublicCitaHold).toHaveBeenCalledTimes(1);
    expect(publicBookingApiMock.createClienteCitaHold).not.toHaveBeenCalled();
  });

  it('uses customerBookingAdapter for authenticated hold creation', async () => {
    publicBookingApiMock.createClienteCitaHold.mockResolvedValue({ data: { id_grupo_cita: 'customer-group' } });
    const adapter = resolveBookingAdapter({ mode: 'authenticated', actor: { customerId: 'c-1' } });
    const { result } = renderHook(() => useBookingHold({
      mode: 'authenticated',
      isAuthenticatedBooking: true,
      bookingAdapter: adapter,
      selectionFingerprint: 'customer-selection',
    }));

    let hold;
    await act(async () => {
      hold = await result.current.createHold({ id_sucursal: 'branch-1' });
    });

    expect(hold.id_grupo_cita).toBe('customer-group');
    expect(publicBookingApiMock.createClienteCitaHold).toHaveBeenCalledTimes(1);
    expect(publicBookingApiMock.createPublicCitaHold).not.toHaveBeenCalled();
  });

  it('uses previewBookingAdapter without backend write calls', async () => {
    const adapter = resolveBookingAdapter({ mode: 'preview' });
    const { result } = renderHook(() => useBookingHold({
      mode: 'preview',
      isAuthenticatedBooking: false,
      bookingAdapter: adapter,
      selectionFingerprint: 'preview-selection',
    }));

    let hold;
    await act(async () => {
      hold = await result.current.createHold({ totalHnl: 125, blocks: [{ orden_integrante: 1 }] });
    });

    expect(adapter.writesBackend).toBe(false);
    expect(hold.groupStatus).toBe('simulado');
    expect(publicBookingApiMock.createPublicCitaHold).not.toHaveBeenCalled();
    expect(publicBookingApiMock.createClienteCitaHold).not.toHaveBeenCalled();
  });

  it('keeps preview hold canonical aliases compatible with confirmation flow logic', async () => {
    const hold = await previewBookingAdapter.createHold({
      totalHnl: 225,
      blocks: [{ orden_integrante: 1, alias: 'Titular' }],
    });
    const holdPricing = resolveHoldPricing(hold);

    expect(hold.groupId).toBe(hold.id_grupo_cita);
    expect(hold.totalPayableHnl).toBe(hold.total_pagar_hnl);
    expect(hold.expiresAt).toBe(hold.expires_at);
    expect(hold.blocks).toBe(hold.bloques);
    expect(hold).toMatchObject({
      request_id: hold.requestId,
      estado_grupo_codigo: 'simulado',
      subtotal_hnl: 225,
      descuento_total_hnl: 0,
      extras_a_pagar_hnl: 225,
      monto_total_hnl: 225,
      total_hnl: 225,
    });
    expect(hold.release_token).toBeUndefined();
    expect(holdPricing).toMatchObject({
      source: 'hold',
      subtotal_hnl: 225,
      total_pagar_hnl: 225,
      extras_a_pagar_hnl: 225,
    });
    expect(resolveConfirmWithoutPaymentState({
      canUseClienteHold: true,
      holdResult: hold,
      holdTotalToPay: 0,
    })).toBe(true);
    expect(publicBookingApiMock.createPublicCitaHold).not.toHaveBeenCalled();
    expect(publicBookingApiMock.createClienteCitaHold).not.toHaveBeenCalled();
    expect(publicBookingApiMock.releasePublicCitaHold).not.toHaveBeenCalled();
    expect(publicBookingApiMock.releaseClienteCitaHold).not.toHaveBeenCalled();
  });
});
