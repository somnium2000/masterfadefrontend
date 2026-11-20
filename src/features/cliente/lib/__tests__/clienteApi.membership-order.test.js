import { beforeEach, describe, expect, test, vi } from 'vitest';
import { confirmMembershipPayment, createMembershipOrder } from '../clienteApi.js';

import { preparePublicPixelPay3ds } from '../../../payments/publicPixelPay3ds.js';

vi.mock('../../../payments/publicPixelPay3ds.js', async importOriginal => ({
  ...await importOriginal(),
  preparePublicPixelPay3ds: vi.fn(),
}));

const http = vi.hoisted(() => ({ post: vi.fn() }));
const simulation = vi.hoisted(() => ({ enabled: false }));
vi.mock('../../../../services/httpClient.js', () => ({ http }));
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: {} }));
vi.mock('../../../plans/lib/qaVipPurchaseSimulation.js', () => ({
  isQaVipPurchaseSimulationEnabled: () => simulation.enabled,
}));
const KEY = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const OFFER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => {
  http.post.mockReset();
  simulation.enabled = false;
});

describe('contrato opcional de idempotencia de orden VIP', () => {
  test('envía oferta y clave explícita sin cliente ni campos comerciales; conserva resumen', async () => {
    const summary = { id_order: 'order-backend', totales: { total_hnl: 975 } };
    http.post.mockResolvedValue({ data: summary });
    expect(await createMembershipOrder(OFFER, { idempotencyKey: KEY })).toBe(summary);
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/v1/cliente/planes/orden', {
      id_plan_sucursal: OFFER, idempotency_key: KEY,
    });
  });
  test('conserva la llamada legacy de otros consumidores', async () => {
    http.post.mockResolvedValue({ data: {} });
    await createMembershipOrder(OFFER);
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/v1/cliente/planes/orden', { id_plan_sucursal: OFFER });
  });
  test.each(['invalid', '', null, 123])('rechaza clave inválida %s sin solicitud legacy', async (idempotencyKey) => {
    await expect(createMembershipOrder(OFFER, { idempotencyKey })).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
  });
  test('no genera otra clave ni reintenta ante rechazo HTTP', async () => {
    const error = { status: 503, data: { error: { code: 'MEMBERSHIP_PURCHASE_IDEMPOTENCY_SCHEMA_NOT_READY' } } };
    http.post.mockRejectedValue(error);
    await expect(createMembershipOrder(OFFER, { idempotencyKey: KEY })).rejects.toBe(error);
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});

test('confirmación PixelPay marca el cuerpo sensible y no permite dedupe ni cache', async () => {
  const card = { number: '4111111111111111', holder: 'Cliente QA', expire: '3012', cvv: '123' };
  const billing = { address: 'Calle 1', country: 'HN', state: 'HN-FM', city: 'Tegucigalpa', phone: '99999999' };
  http.post.mockResolvedValue({ data: { processed: true } });

  await expect(confirmMembershipPayment(KEY, { card, billing })).resolves.toEqual({ processed: true });
  expect(http.post).toHaveBeenCalledExactlyOnceWith('/v1/cliente/planes/confirmar-pago', {
    id_payment_intent: KEY,
    card,
    billing,
  }, {
    sensitiveBody: true,
    dedupe: false,
    cache: false,
  });
});

test('simulación VIP envía solo intent y escenario, sin tarjeta ni facturación', async () => {
  simulation.enabled = true;
  http.post.mockResolvedValue({ data: { processed: true, normalized_status: 'PAID' } });

  await confirmMembershipPayment(KEY, {
    monto_prueba_hnl: 1,
    card: { number: '4111111111111111', holder: 'Cliente QA', expire: '3012', cvv: '123' },
    billing: { address: 'Blvd Suyapa', country: 'HN', state: 'HN-FM', city: 'Tegucigalpa', phone: '99999999' },
  });

  expect(http.post).toHaveBeenCalledExactlyOnceWith('/v1/cliente/planes/simulator/event', {
    id_payment_intent: KEY,
    monto_prueba_hnl: 1,
  }, undefined);
});


test('VIP reusa el contexto 3DS y espera la confirmación financiera autenticada', async () => {
  const handoff = { token: 'opaque-membership-token', expiresAt: Date.now() + 60000 };
  const payment = { processed: true, estado_intent_codigo: 'confirmado', confirmation: { estado: 'activa' } };
  const onChallenge = vi.fn();
  preparePublicPixelPay3ds.mockResolvedValueOnce(async ({ transport }) => {
    await transport('lookup', { reference: 'opaque-reference' });
    await transport('retry', {});
    return transport('status', {});
  });
  http.post.mockResolvedValueOnce({ data: { public_3ds_handoff: handoff, pending_confirmation: true } })
    .mockResolvedValueOnce({ data: { status: 200, success: true } })
    .mockResolvedValueOnce({ data: { status: 200, success: true, payment } });
  await expect(confirmMembershipPayment(KEY, { public3ds: true, onChallenge })).resolves.toEqual(payment);
  expect(http.post.mock.calls.map(([path]) => path)).toEqual([
    '/v1/cliente/planes/confirmar-pago', '/v1/cliente/planes/pixelpay/3ds/continuar', '/v1/cliente/planes/pixelpay/3ds/continuar',
  ]);
  expect(http.post.mock.calls[0][1]).toHaveProperty('supports_public_3ds', true);
  expect(http.post.mock.calls[1][1]).toEqual({
    id_payment_intent: KEY, token: handoff.token, operation: 'lookup', data: { reference: 'opaque-reference' },
  });
  expect(onChallenge.mock.calls).toEqual([[true], [false]]);
});

test('VIP conserva una continuación fallida como pendiente sin reenviar venta', async () => {
  const handoff = { token: 'opaque-membership-token', expiresAt: Date.now() + 60000 };
  preparePublicPixelPay3ds.mockResolvedValueOnce(async ({ transport }) => transport('retry', {}));
  http.post.mockResolvedValueOnce({ data: { public_3ds_handoff: handoff, pending_confirmation: true } })
    .mockRejectedValueOnce({ code: 'PIXELPAY_PUBLIC_3DS_PROOF_UNAVAILABLE' });
  await expect(confirmMembershipPayment(KEY, { public3ds: true })).resolves.toEqual({
    processed: false, booking_confirmed: false, estado_intent_codigo: 'pendiente_confirmacion',
    pending_confirmation: true, public_3ds_pending: true,
    public_3ds_browser_diagnostic: { code: 'PIXELPAY_3DS_CHALLENGE_INTERRUPTED' },
  });
  expect(http.post).toHaveBeenCalledTimes(2);
});

test('VIP sin SDK no inicia la venta pública', async () => {
  preparePublicPixelPay3ds.mockRejectedValueOnce(Object.assign(new Error(), { code: 'PIXELPAY_3DS_SDK_LOAD_FAILED' }));
  await expect(confirmMembershipPayment(KEY, { public3ds: true })).rejects.toMatchObject({ code: 'PIXELPAY_3DS_SDK_LOAD_FAILED' });
  expect(http.post).not.toHaveBeenCalled();
});
