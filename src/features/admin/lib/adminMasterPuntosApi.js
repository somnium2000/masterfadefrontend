import { http } from "../../../services/httpClient.js";

const BASE = "/v1/admin/masterpuntos";

export async function getAdminMasterPuntosContexto() {
  return http.get(`${BASE}/contexto`);
}

export async function listAdminMasterPuntosClientes(params = {}) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", String(params.search).trim());
  if (params?.id_sucursal) searchParams.set("id_sucursal", String(params.id_sucursal).trim());
  if (params?.solo_premio) searchParams.set("solo_premio", "true");
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const suffix = searchParams.toString();
  return http.get(`${BASE}/clientes${suffix ? `?${suffix}` : ""}`);
}

export async function getAdminMasterPuntosClienteMovimientos(idCliente, params = {}) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const suffix = searchParams.toString();
  return http.get(`${BASE}/clientes/${idCliente}/movimientos${suffix ? `?${suffix}` : ""}`);
}

export async function updateAdminMasterPuntosRegla(payload) {
  return http.patch(`${BASE}/reglas`, payload);
}

export async function createAdminMasterPuntosCanje(payload) {
  return http.post(`${BASE}/canjes`, payload);
}

export async function createAdminMasterPuntosLegacyMigracion(payload) {
  return http.post(`${BASE}/legacy-migracion`, payload);
}
