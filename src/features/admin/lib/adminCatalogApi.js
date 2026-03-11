// src/features/admin/lib/adminCatalogApi.js
// A2 — Capa de API para el catálogo de servicios (admin).
// Usa el wrapper http existente (src/services/httpClient.js).

import { http } from '../../../services/httpClient.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBranchId(value) {
    const raw = String(value ?? '').trim();
    return UUID_REGEX.test(raw) ? raw : '';
}

/**
 * Lista servicios del catálogo.
 * @param {{ id_sucursal?: string }} params
 */
export async function listAdminServicios({ id_sucursal } = {}) {
    // AM: Evita enviar placeholders o valores no UUID como id_sucursal.
    const branchId = normalizeBranchId(id_sucursal);
    const query = branchId ? `?id_sucursal=${encodeURIComponent(branchId)}` : '';
    return http.get(`/v1/admin/catalog/servicios${query}`);
}

/**
 * Crea un nuevo servicio.
 * @param {object} payload
 */
export async function createAdminServicio(payload) {
    return http.post('/v1/admin/catalog/servicios', payload);
}

/**
 * Actualiza un servicio existente (PATCH parcial).
 * @param {string} id
 * @param {object} payload
 */
export async function updateAdminServicio(id, payload) {
    return http.patch(`/v1/admin/catalog/servicios/${id}`, payload);
}

/**
 * Elimina (inactiva) un servicio.
 * @param {string} id
 * @param {string} id_sucursal - Requerido por el scope del endpoint.
 */
export async function deleteAdminServicio(id, id_sucursal) {
    const branchId = normalizeBranchId(id_sucursal);
    if (!branchId) {
        // AM: Mensaje claro para evitar inactivaciones ambiguas cuando falta sucursal valida.
        throw new Error('Debes seleccionar una sucursal valida para inactivar el servicio.');
    }
    return http.del(
        `/v1/admin/catalog/servicios/${id}?id_sucursal=${encodeURIComponent(branchId)}`
    );
}

/**
 * AM: Controla estado operativo del servicio (activar/inactivar) por sucursal.
 * @param {string} id
 * @param {{ activo: boolean, id_sucursal?: string, precio_hnl?: number }} payload
 */
export async function setAdminServicioEstado(id, payload) {
    return http.patch(`/v1/admin/catalog/servicios/${id}/estado`, payload);
}
