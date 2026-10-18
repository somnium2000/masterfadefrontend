import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from './httpClient.js';

describe('httpClient sensitiveBody', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      url: 'http://localhost/v1/public/pagos/pixelpay/sale',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('no serializa PAN/CVV para construir claves ni deduplica el body', async () => {
    let panReads = 0;
    let cvvReads = 0;
    const body = { id_intent: 'qa-intent' };
    Object.defineProperty(body, 'card_number', {
      enumerable: true,
      get() { panReads += 1; return '4111111111111111'; },
    });
    Object.defineProperty(body, 'card_cvv', {
      enumerable: true,
      get() { cvvReads += 1; return '123'; },
    });

    await Promise.all([
      request('/v1/public/pagos/pixelpay/sale', { method: 'POST', body, sensitiveBody: true }),
      request('/v1/public/pagos/pixelpay/sale', { method: 'POST', body, sensitiveBody: true }),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(panReads).toBe(2);
    expect(cvvReads).toBe(2);
  });

  it('envia la consulta publica de estado sin correo en URL ni preflight CSRF', async () => {
    const body = {
      id_grupo_cita: '11111111-2222-4333-8444-555555555555',
      id_intent: '99999999-9999-4999-8999-999999999999',
      titular_email: 'cliente@example.com',
    };

    await request('/v1/public/pagos/estado', {
      method: 'POST',
      body,
      sensitiveBody: true,
      cache: false,
      dedupe: false,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('/v1/public/pagos/estado');
    expect(url).not.toContain('titular_email');
    expect(url).not.toContain(body.titular_email);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual(body);
  });
});
