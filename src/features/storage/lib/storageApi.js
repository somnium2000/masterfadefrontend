import { http } from '../../../services/httpClient.js';

const ADMIN_BASE = '/v1/admin/storage';
const BASE = '/v1/storage';

export async function prepareAdminStorageUpload(payload) {
  return http.post(`${ADMIN_BASE}/uploads/prepare`, payload);
}

export async function getAdminStorageAssetReadUrl(idAsset, payload = {}) {
  return http.post(`${ADMIN_BASE}/assets/${idAsset}/read-url`, payload);
}

export async function deleteAdminStorageAsset(idAsset) {
  return http.del(`${ADMIN_BASE}/assets/${idAsset}`);
}

export async function prepareStorageUpload(payload) {
  return http.post(`${BASE}/uploads/prepare`, payload);
}

export async function getStorageAssetReadUrl(idAsset, payload = {}) {
  return http.post(`${BASE}/assets/${idAsset}/read-url`, payload);
}
