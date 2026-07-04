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
const adminCitasApiMock = vi.hoisted(() => ({
  postAdminCitasHold: vi.fn(),
  deleteAdminCitasHold: vi.fn(),
  postAdminCitasHoldConfirmar: vi.fn(),
  postAdminCitasHoldPaymentLink: vi.fn(),
}));

vi.mock('../../../public/booking/publicBookingApi.js', () => publicBookingApiMock);
vi.mock('../../../admin/lib/adminCitasApi.js', () => adminCitasApiMock);

beforeEach(() => {
  window.sessionStorage.clear();
  publicBookingApiMock.createPublicCitaHold.mockReset();
  publicBookingApiMock.createClienteCitaHold.mockReset();
  publicBookingApiMock.releasePublicCitaHold.mockReset();
  publicBookingApiMock.releaseClienteCitaHold.mockReset();
  publicBookingApiMock.confirmClienteCitaHoldWithoutPayment.mockReset();
  adminCitasApiMock.postAdminCitasHold.mockReset();
  adminCitasApiMock.deleteAdminCitasHold.mockReset();
  adminCitasApiMock.postAdminCitasHoldConfirmar.mockReset();
  adminCitasApiMock.postAdminCitasHoldPaymentLink.mockReset();
});

describe('booking adapters integration', () => {
  it('selects guest, customer and preview adapters by mode', () => {
    expect(resolveBookingAdapter({ mode: 'public' }).actor.type).toBe('guest');
    expect(resolveBookingAdapter({ mode: 'authenticated', actor: { customerId: 'c-1' } }).actor).toMatchObject({
      type: 'customer',
      customerId: 'c-1',
    });
    expect(resolveBookingAdapter({ mode: 'preview' })).toBe(previewBookingAdapter);
    expect(resolveBookingAdapter({ mode: 'admin', actor: { role: 'admin' } }).actor.type).toBe('admin');
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

  it('uses adminBookingAdapter for assisted admin hold creation', async () => {
    adminCitasApiMock.postAdminCitasHold.mockResolvedValue({ data: { id_grupo_cita: 'admin-group' } });
    const adapter = resolveBookingAdapter({ mode: 'admin', actor: { role: 'admin' } });

    const hold = await adapter.createHold({ id_sucursal: 'branch-1' }, { headers: { 'x-idempotency-key': 'key-1' } });

    expect(adapter.writesBackend).toBe(true);
    expect(adapter.supportsMembership).toBe(true);
    expect(adapter.supportsRewards).toBe(true);
    expect(adapter.supportsAutomaticPromotions).toBe(true);
    expect(adapter.supportsManualPromotion).toBe(false);
    expect(adapter.supportsCourtesy).toBe(false);
    expect(adapter.supportsCashPending).toBe(true);
    expect(adapter.supportsPaymentLink).toBe(false);
    expect(hold.id_grupo_cita).toBe('admin-group');
    expect(adminCitasApiMock.postAdminCitasHold).toHaveBeenCalledWith(
      { id_sucursal: 'branch-1' },
      { headers: { 'x-idempotency-key': 'key-1' } }
    );
    expect(publicBookingApiMock.createPublicCitaHold).not.toHaveBeenCalled();
    expect(publicBookingApiMock.createClienteCitaHold).not.toHaveBeenCalled();
  });

  it('does not let an admin actor self-grant super admin capabilities from frontend payload', async () => {
    adminCitasApiMock.postAdminCitasHold.mockResolvedValue({ data: { id_grupo_cita: 'admin-group' } });
    const adapter = resolveBookingAdapter({ mode: 'admin', actor: { role: 'admin' } });

    await adapter.createHold({
      id_sucursal: 'branch-1',
      roles: ['super_admin'],
      beneficios: {
        promocionManualId: 'promo-1',
        cortesia: { aplicar: true, tipo: 'total', valor: 100 },
      },
    });

    expect(adapter.supportsManualPromotion).toBe(false);
    expect(adapter.supportsCourtesy).toBe(false);
    expect(adminCitasApiMock.postAdminCitasHold).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['super_admin'],
        beneficios: expect.objectContaining({
          promocionManualId: 'promo-1',
        }),
      }),
      {}
    );
    expect(publicBookingApiMock.createPublicCitaHold).not.toHaveBeenCalled();
  });

  it('uses explicit admin endpoints for release and cash pending while payment link is not operational', async () => {
    adminCitasApiMock.deleteAdminCitasHold.mockResolvedValue({ data: { liberado: true } });
    adminCitasApiMock.postAdminCitasHoldConfirmar.mockResolvedValue({ data: { confirmado: true } });
    adminCitasApiMock.postAdminCitasHoldPaymentLink.mockResolvedValue({ data: { id_intent: 'intent-1' } });
    const adapter = resolveBookingAdapter({ mode: 'admin', actor: { roles: ['super_admin'] } });

    await expect(adapter.releaseHold('group-1')).resolves.toEqual({ liberado: true });
    await expect(adapter.confirmCashPending('group-1', { motivo: 'caja' })).resolves.toEqual({ confirmado: true });
    await expect(adapter.createPaymentLink('group-1', { canal: 'whatsapp' })).resolves.toEqual({ id_intent: 'intent-1' });

    expect(adapter.supportsCourtesy).toBe(true);
    expect(adapter.supportsManualPromotion).toBe(true);
    expect(adapter.supportsPaymentLink).toBe(false);
    expect(adminCitasApiMock.deleteAdminCitasHold).toHaveBeenCalledWith('group-1', {});
    expect(adminCitasApiMock.postAdminCitasHoldConfirmar).toHaveBeenCalledWith(
      'group-1',
      { motivo: 'caja', metodo_pago_codigo: 'efectivo' },
      {}
    );
    expect(adminCitasApiMock.postAdminCitasHoldPaymentLink).toHaveBeenCalledWith('group-1', { canal: 'whatsapp' }, {});
    expect(publicBookingApiMock.releasePublicCitaHold).not.toHaveBeenCalled();
    expect(publicBookingApiMock.confirmClienteCitaHoldWithoutPayment).not.toHaveBeenCalled();
  });

  it('admin confirmation strips benefit claims and only sends pending close methods', async () => {
    adminCitasApiMock.postAdminCitasHoldConfirmar.mockResolvedValue({ data: { confirmado: true } });
    const adapter = resolveBookingAdapter({ mode: 'admin', actor: { role: 'admin' } });

    await adapter.confirmWithoutPayment('group-1', {
      metodo_pago_codigo: 'recompensa',
      canje_context_token: 'editable-token',
      recompensa: { aplicar: true },
      membresia: { aplicar: true },
      cortesia: { aplicar: true },
      motivo: 'revision',
    });

    expect(adminCitasApiMock.postAdminCitasHoldConfirmar).toHaveBeenCalledWith(
      'group-1',
      { motivo: 'revision', metodo_pago_codigo: 'sin_pago' },
      {}
    );
  });

  it('does not send release_token through admin release or confirmation calls', async () => {
    adminCitasApiMock.deleteAdminCitasHold.mockResolvedValue({ data: { liberado: true } });
    adminCitasApiMock.postAdminCitasHoldConfirmar.mockResolvedValue({ data: { confirmado: true } });
    const adapter = resolveBookingAdapter({ mode: 'admin', actor: { role: 'admin' } });

    await adapter.releaseHold('group-1', { body: { release_token: 'public-token' } });
    await adapter.confirmWithoutPayment('group-1', { release_token: 'public-token' });

    expect(adminCitasApiMock.deleteAdminCitasHold).toHaveBeenCalledWith('group-1', { body: {} });
    expect(adminCitasApiMock.postAdminCitasHoldConfirmar).toHaveBeenCalledWith(
      'group-1',
      { metodo_pago_codigo: 'sin_pago' },
      {}
    );
    expect(publicBookingApiMock.releasePublicCitaHold).not.toHaveBeenCalled();
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
