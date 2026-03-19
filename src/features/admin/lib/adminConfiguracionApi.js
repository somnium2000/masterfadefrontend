import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/configuracion';

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
