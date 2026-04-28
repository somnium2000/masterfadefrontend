import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/puntos';

export async function getAdminClientePuntosResumen(idCliente) {
  const safeId = String(idCliente || '').trim();
  if (!safeId) {
    throw new Error('Debes seleccionar un cliente.');
  }
  return http.get(`${BASE}/clientes/${safeId}/resumen`);
}

export async function createAdminClientePuntosAjuste(idCliente, payload) {
  const safeId = String(idCliente || '').trim();
  if (!safeId) {
    throw new Error('Debes seleccionar un cliente.');
  }
  return http.post(`${BASE}/clientes/${safeId}/ajuste`, payload);
}

