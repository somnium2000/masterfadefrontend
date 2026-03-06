// src/features/admin/lib/adminPackagesApi.js
// API calls for admin packages catalog CRUD.
// Uses the existing httpClient wrapper.

import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/catalog/paquetes';

/** GET /v1/admin/catalog/paquetes */
export async function listAdminPaquetes() {
    return http.get(BASE);
}

/** POST /v1/admin/catalog/paquetes */
export async function createAdminPaquete(body) {
    return http.post(BASE, body);
}

/** PATCH /v1/admin/catalog/paquetes/:id */
export async function updateAdminPaquete(id, body) {
    return http.patch(`${BASE}/${id}`, body);
}

/** DELETE /v1/admin/catalog/paquetes/:id */
export async function deleteAdminPaquete(id) {
    return http.delete(`${BASE}/${id}`);
}
