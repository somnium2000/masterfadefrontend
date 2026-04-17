import { http } from "../../../services/httpClient.js";

const BASE = "/v1/admin/catalog/cortesias";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBranchId(value) {
  const raw = String(value ?? "").trim();
  return UUID_REGEX.test(raw) ? raw : "";
}

export async function listAdminCortesias({ id_sucursal, buscar } = {}) {
  const params = new URLSearchParams();
  const branchId = normalizeBranchId(id_sucursal);
  const searchValue = String(buscar ?? "").trim();

  if (branchId) params.set("id_sucursal", branchId);
  if (searchValue) params.set("buscar", searchValue);

  const query = params.toString();
  return http.get(query ? `${BASE}?${query}` : BASE);
}

export async function createAdminCortesia(body) {
  return http.post(BASE, body);
}

export async function updateAdminCortesia(id, body) {
  return http.patch(`${BASE}/${id}`, body);
}

export async function setAdminCortesiaEstado(id, body) {
  return http.patch(`${BASE}/${id}/estado`, body);
}

