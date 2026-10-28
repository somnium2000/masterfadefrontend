import { beforeEach, describe, expect, test, vi } from 'vitest';
import { confirmMembershipPayment, createMembershipOrder } from '../clienteApi.js';

const http = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http }));
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: {} }));
const KEY = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const OFFER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => { http.post.mockReset(); });

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
