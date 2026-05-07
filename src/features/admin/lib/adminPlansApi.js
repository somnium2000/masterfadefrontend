import { http } from "../../../services/httpClient.js";

const BASE = "/v1/admin/catalog/planes";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBranchId(value) {
  const raw = String(value ?? "").trim();
  return UUID_REGEX.test(raw) ? raw : "";
}

export async function listAdminPlanes({ id_sucursal } = {}) {
  // AM: Evita enviar placeholders o textos invalidos como id_sucursal.
  const branchId = normalizeBranchId(id_sucursal);
  const query = branchId ? `?id_sucursal=${encodeURIComponent(branchId)}` : "";
  return http.get(`${BASE}${query}`);
}

export async function createAdminPlan(body) {
  return http.post(BASE, body);
}

export async function updateAdminPlan(id, body) {
  return http.patch(`${BASE}/${id}`, body);
}

export async function setAdminPlanEstado(id, body) {
  return http.patch(`${BASE}/${id}/estado`, body);
}
