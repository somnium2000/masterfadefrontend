import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/configuracion';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBranchId(value) {
  const raw = String(value ?? '').trim();
  return UUID_REGEX.test(raw) ? raw : '';
}

export async function getAdminConfigPerfil() {
  return http.get(`${BASE}/perfil`);
}

export async function updateAdminConfigPerfil(payload) {
  return http.patch(`${BASE}/perfil`, payload);
}

export async function getAdminConfigNotificaciones({ limit } = {}) {
  const query = Number.isFinite(Number(limit)) ? `?limit=${Math.max(1, Math.min(100, Number(limit)))}` : '';
  return http.get(`${BASE}/notificaciones${query}`);
}

export async function updateAdminConfigNotificaciones(payload) {
  return http.patch(`${BASE}/notificaciones`, payload);
}

export async function getAdminConfigComunicacion({ idSucursal } = {}) {
  const query = idSucursal ? `?id_sucursal=${encodeURIComponent(idSucursal)}` : '';
  return http.get(`${BASE}/comunicacion${query}`);
}

export async function updateAdminConfigComunicacion(payload) {
  return http.patch(`${BASE}/comunicacion`, payload);
}

export async function getAdminConfigParametros({ idSucursal } = {}) {
  const query = idSucursal ? `?id_sucursal=${encodeURIComponent(idSucursal)}` : '';
  return http.get(`${BASE}/parametros${query}`);
}

export async function updateAdminConfigParametros(payload) {
  return http.patch(`${BASE}/parametros`, payload);
}

export async function listAdminConfigPromociones({ id_sucursal } = {}) {
  const branchId = normalizeBranchId(id_sucursal);
  const query = branchId ? `?id_sucursal=${encodeURIComponent(branchId)}` : '';
  return http.get(`${BASE}/promociones${query}`);
}

export async function getAdminConfigPromocion(id, { id_sucursal } = {}) {
  const branchId = normalizeBranchId(id_sucursal);
  if (!branchId) {
    throw new Error('id_sucursal es requerido para consultar detalle de promocion.');
  }
  return http.get(`${BASE}/promociones/${id}?id_sucursal=${encodeURIComponent(branchId)}`);
}

export async function createAdminConfigPromocion(payload) {
  return http.post(`${BASE}/promociones`, payload);
}

export async function updateAdminConfigPromocion(id, payload) {
  return http.patch(`${BASE}/promociones/${id}`, payload);
}
