import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpMock = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http: httpMock }));
import { getPixelPayHostedPaymentStatus, startPixelPayHostedPayment } from '../pixelPayHostedApi.js';

describe('Hosted API contract', () => {
  beforeEach(() => { httpMock.post.mockReset(); });

  it.each([false, true])('usa identidad sensible en el body y la base authenticated=%s', async (authenticated) => {
    const payload = { id_grupo_cita: 'group', id_intent: 'intent', titular_email: 'cliente@example.test' };
    const result = { payment_channel: 'hosted', booking_confirmed: false };
    httpMock.post.mockResolvedValue({ ok: true, data: result });
    const signal = new AbortController().signal;
    expect(await startPixelPayHostedPayment(payload, { authenticated, signal })).toBe(result);
    expect(await getPixelPayHostedPaymentStatus(payload, { authenticated, signal })).toBe(result);
    const base = authenticated ? '/v1/pagos/reservas' : '/v1/public/pagos';
    for (const [index, action] of ['start', 'status'].entries()) {
      expect(httpMock.post.mock.calls[index]).toEqual([
        `${base}/pixelpay/hosted/${action}`,
        payload,
        { signal, sensitiveBody: true, dedupe: false, cache: false },
      ]);
    }
  });
});
