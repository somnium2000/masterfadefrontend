import { afterEach, expect, test, vi } from 'vitest';
import { releaseClienteCitaHold } from '../publicBookingApi.js';
import { createCustomerBookingAdapter } from '../../../booking/adapters/customerBookingAdapter.js';

const transport = vi.hoisted(() => ({ post: vi.fn(), del: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http: transport }));
const group = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.resetAllMocks());

test('authenticated hold release uses the existing owner-checked maintenance POST', async () => {
  const response = { ok: true, data: { id_grupo_cita: group, descartada: true, idempotent: false } };
  transport.post.mockResolvedValue(response);
  expect(await releaseClienteCitaHold(group)).toBe(response);
  expect(transport.post).toHaveBeenCalledExactlyOnceWith(`/v1/citas/pendiente/${group}/descartar`, {});
  expect(transport.del).not.toHaveBeenCalled();
});

test('customer adapter delegates release to the authenticated maintenance route without guest fallback', async () => {
  const response = { ok: true, data: { id_grupo_cita: group, descartada: true, idempotent: true } };
  transport.post.mockResolvedValue(response);
  expect(await createCustomerBookingAdapter().releaseHold(group)).toBe(response);
  expect(transport.post).toHaveBeenCalledExactlyOnceWith(`/v1/citas/pendiente/${group}/descartar`, {});
  expect(transport.del).not.toHaveBeenCalled();
});

test('invalid group is rejected before making a maintenance request', async () => {
  await expect(releaseClienteCitaHold('missing-group')).rejects.toMatchObject({ status: 400 });
  expect(transport.post).not.toHaveBeenCalled();
  expect(transport.del).not.toHaveBeenCalled();
});

test('authorization failure remains an error and never falls back to another release route', async () => {
  const denied = { status: 403, data: { error: { code: 'AUTH_FORBIDDEN' } } };
  transport.post.mockRejectedValue(denied);
  await expect(releaseClienteCitaHold(group)).rejects.toBe(denied);
  expect(transport.post).toHaveBeenCalledOnce();
  expect(transport.del).not.toHaveBeenCalled();
});
