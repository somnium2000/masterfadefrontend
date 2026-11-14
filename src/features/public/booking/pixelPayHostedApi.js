import { http } from '../../../services/httpClient.js';

async function hostedRequest(action, payload, { authenticated = false, ...options } = {}) {
  const base = authenticated ? '/v1/pagos/reservas' : '/v1/public/pagos';
  const response = await http.post(`${base}/pixelpay/hosted/${action}`, payload, {
    ...options,
    sensitiveBody: true,
    dedupe: false,
    cache: false,
  });
  return response?.data ?? response;
}

export function startPixelPayHostedPayment(payload, options) {
  return hostedRequest('start', payload, options);
}

export function getPixelPayHostedPaymentStatus(payload, options) {
  return hostedRequest('status', payload, options);
}
