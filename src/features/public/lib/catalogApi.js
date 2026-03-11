import { http } from '../../../services/httpClient.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBranchId(value) {
  const raw = String(value ?? '').trim();
  return UUID_REGEX.test(raw) ? raw : '';
}

export async function listPublicCatalogBranches() {
  const response = await http.get('/v1/public/catalog/sucursales');
  return {
    branches: response?.data?.sucursales || [],
  };
}

export async function listPublicCatalogPlans({ id_sucursal } = {}) {
  // AM: Reutiliza el mismo scope de sucursal para planes en catalogo publico.
  const branchId = normalizeBranchId(id_sucursal);
  const query = branchId ? `?id_sucursal=${encodeURIComponent(branchId)}` : '';
  const response = await http.get(`/v1/public/catalog/planes${query}`);
  return {
    plans: response?.data?.planes || [],
  };
}

export async function getPublicCatalog({ id_sucursal } = {}) {
  // AM: Mantiene servicios y paquetes sincronizados bajo el mismo scope de sucursal.
  const branchId = normalizeBranchId(id_sucursal);
  const query = branchId ? `?id_sucursal=${encodeURIComponent(branchId)}` : '';
  const [servicesResult, packagesResult] = await Promise.allSettled([
    http.get(`/v1/public/catalog/servicios${query}`),
    http.get(`/v1/public/catalog/paquetes${query}`),
  ]);

  const allRejected = [servicesResult, packagesResult].every((result) => result?.status === 'rejected');
  if (allRejected) {
    throw servicesResult.reason || packagesResult.reason;
  }

  return {
    services: servicesResult.status === 'fulfilled' ? servicesResult.value?.data?.servicios || [] : [],
    packages: packagesResult.status === 'fulfilled' ? packagesResult.value?.data?.paquetes || [] : [],
  };
}
