import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/puntos';

export async function getAdminClientePuntosResumen(idCliente, { signal } = {}) {
  const safeId = String(idCliente || '').trim();
  if (!safeId) {
    throw new Error('Debes seleccionar un cliente.');
  }
  const path = `${BASE}/clientes/${safeId}/resumen`;
  return signal ? http.get(path, { signal }) : http.get(path);
}

export async function createAdminClientePuntosAjuste(idCliente, payload, { idempotencyKey } = {}) {
  const safeId = String(idCliente || '').trim();
  if (!safeId) {
    throw new Error('Debes seleccionar un cliente.');
  }
  const safeIdempotencyKey = String(idempotencyKey || '').trim();
  if (!safeIdempotencyKey) {
    throw new Error('No se pudo preparar el ajuste de forma segura.');
  }
  return http.post(`${BASE}/clientes/${safeId}/ajuste`, payload, {
    headers: { 'x-idempotency-key': safeIdempotencyKey },
  });
}

export async function searchAdminClientesActivos(query, { limit = 10, signal } = {}) {
  const safeQuery = String(query || '').trim();
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Math.trunc(Number(limit)))) : 10;
  if (safeQuery.length < 2) {
    return { ok: true, data: { clientes: [] } };
  }
  const params = new URLSearchParams({
    q: safeQuery,
    limit: String(safeLimit),
  });
  const path = `${BASE}/clientes/buscar?${params.toString()}`;
  return signal ? http.get(path, { signal }) : http.get(path);
}

export async function getAdminMasterPuntosRegalias({ signal } = {}) {
  const path = `${BASE}/regalias`;
  return signal ? http.get(path, { signal }) : http.get(path);
}

export async function updateAdminMasterPuntosRegalias(payload) {
  return http.patch(`${BASE}/regalias`, payload);
}
