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

export async function searchAdminClientesActivos(query, { limit = 10 } = {}) {
  const safeQuery = String(query || '').trim();
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Math.trunc(Number(limit)))) : 10;
  if (safeQuery.length < 2) {
    return { ok: true, data: { clientes: [] } };
  }
  const params = new URLSearchParams({
    q: safeQuery,
    limit: String(safeLimit),
  });
  return http.get(`${BASE}/clientes/buscar?${params.toString()}`);
}

export async function getAdminMasterPuntosRegalias() {
  return http.get(`${BASE}/regalias`);
}

export async function updateAdminMasterPuntosRegalias(payload) {
  return http.patch(`${BASE}/regalias`, payload);
}
