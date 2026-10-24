import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpMock = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock('../../../../services/httpClient.js', () => ({
  http: httpMock,
}));

import {
  createPublicPaymentIntent,
  getPublicPaymentStatus,
  queryPublicPixelPayStatus,
  salePublicPixelPay,
} from '../publicBookingApi.js';

describe('getPublicPaymentStatus', () => {
  beforeEach(() => {
    httpMock.post.mockReset();
    httpMock.post.mockResolvedValue({ ok: true });
  });

  it('envia el correo solo en un body sensible sin cache ni deduplicacion HTTP', async () => {
    const payload = {
      id_grupo_cita: '11111111-2222-4333-8444-555555555555',
      id_intent: '99999999-9999-4999-8999-999999999999',
      titular_email: 'cliente@example.com',
    };
    const signal = new AbortController().signal;

    await getPublicPaymentStatus(payload, { signal });

    expect(httpMock.post).toHaveBeenCalledWith(
      '/v1/public/pagos/estado',
      payload,
      {
        signal,
        sensitiveBody: true,
        dedupe: false,
        cache: false,
      },
    );
    expect(httpMock.post.mock.calls[0][0]).not.toContain('titular_email');
    expect(httpMock.post.mock.calls[0][0]).not.toContain(payload.titular_email);
  });

  it('usa las rutas autenticadas sin filtrar la bandera interna al cliente HTTP', async () => {
    const payload = {
      id_grupo_cita: '11111111-2222-4333-8444-555555555555',
      id_intent: '99999999-9999-4999-8999-999999999999',
    };

    await createPublicPaymentIntent(payload, { authenticated: true });
    await getPublicPaymentStatus(payload, { authenticated: true });
    await salePublicPixelPay(payload, { authenticated: true });
    await queryPublicPixelPayStatus(payload, { authenticated: true });

    expect(httpMock.post.mock.calls).toEqual([
      ['/v1/pagos/reservas/crear-intent', payload, {}],
      ['/v1/pagos/reservas/estado', payload, {
        sensitiveBody: true,
        dedupe: false,
        cache: false,
      }],
      ['/v1/pagos/reservas/pixelpay/sale', payload, {
        sensitiveBody: true,
        dedupe: false,
        cache: false,
      }],
      ['/v1/pagos/reservas/pixelpay/status', payload, {
        dedupe: false,
        cache: false,
      }],
    ]);
  });
});
