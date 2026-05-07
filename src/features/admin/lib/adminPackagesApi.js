// src/features/admin/lib/adminPackagesApi.js
// API calls for admin packages catalog CRUD.
// Uses the existing httpClient wrapper.

import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/catalog/paquetes';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBranchId(value) {
    const raw = String(value ?? '').trim();
    return UUID_REGEX.test(raw) ? raw : '';
}

/** GET /v1/admin/catalog/paquetes */
export async function listAdminPaquetes({ id_sucursal } = {}) {
    // AM: Sanitiza id_sucursal para evitar enviar textos no validos al backend.
    const branchId = normalizeBranchId(id_sucursal);
    const query = branchId ? `?id_sucursal=${encodeURIComponent(branchId)}` : '';
    return http.get(`${BASE}${query}`);
}

/** POST /v1/admin/catalog/paquetes */
export async function createAdminPaquete(body) {
    return http.post(BASE, body);
}

/** PATCH /v1/admin/catalog/paquetes/:id */
export async function updateAdminPaquete(id, body) {
    return http.patch(`${BASE}/${id}`, body);
}

/** PATCH /v1/admin/catalog/paquetes/:id/estado */
export async function setAdminPaqueteEstado(id, body) {
    return http.patch(`${BASE}/${id}/estado`, body);
}

/** DELETE /v1/admin/catalog/paquetes/:id */
export async function deleteAdminPaquete(id) {
    // AM: El cliente HTTP expone `del` para DELETE; usarlo evita fallo en runtime.
    return http.del(`${BASE}/${id}`);
}
