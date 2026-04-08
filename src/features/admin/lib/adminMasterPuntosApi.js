import { http } from "../../../services/httpClient.js";

const BASE = "/v1/admin/masterpuntos";

export async function getAdminMasterPuntosContexto() {
  return http.get(`${BASE}/contexto`);
}

export async function listAdminMasterPuntosClientes(params = {}) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", String(params.search).trim());
  if (params?.id_sucursal) searchParams.set("id_sucursal", String(params.id_sucursal).trim());
  const suffix = searchParams.toString();
  return http.get(`${BASE}/clientes${suffix ? `?${suffix}` : ""}`);
}

export async function getAdminMasterPuntosClienteMovimientos(idCliente) {
  return http.get(`${BASE}/clientes/${idCliente}/movimientos`);
}

export async function updateAdminMasterPuntosRegla(payload) {
  return http.patch(`${BASE}/reglas`, payload);
}

export async function createAdminMasterPuntosCanje(payload) {
  return http.post(`${BASE}/canjes`, payload);
}
