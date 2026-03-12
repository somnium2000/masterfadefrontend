// src/features/admin/lib/adminSucursalesApi.js
import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/sucursales';

/** GET /v1/admin/sucursales */
export async function listAdminSucursales() {
  return http.get(BASE);
}

/** GET /v1/admin/sucursales/empresas */
export async function listAdminEmpresas() {
  return http.get(`${BASE}/empresas`);
}

/** GET /v1/admin/sucursales/:id */
export async function getAdminSucursal(id) {
  return http.get(`${BASE}/${id}`);
}

/** POST /v1/admin/sucursales */
export async function createAdminSucursal(payload) {
  return http.post(BASE, payload);
}

/** PATCH /v1/admin/sucursales/:id */
export async function updateAdminSucursal(id, payload) {
  return http.patch(`${BASE}/${id}`, payload);
}

/** PATCH /v1/admin/sucursales/:id/inactivar */
export async function inactivateAdminSucursal(id) {
  return http.patch(`${BASE}/${id}/inactivar`);
}

/** PATCH /v1/admin/sucursales/:id/activar */
export async function activateAdminSucursal(id) {
  return http.patch(`${BASE}/${id}/activar`);
}

// JK: Alias de compatibilidad; el backend transforma DELETE en inactivacion (sin borrado fisico).
/** DELETE /v1/admin/sucursales/:id */
export async function deleteAdminSucursal(id) {
  return http.del(`${BASE}/${id}`);
}
