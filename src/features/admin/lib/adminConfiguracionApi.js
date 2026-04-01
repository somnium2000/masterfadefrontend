import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/configuracion';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBranchId(value) {
  const raw = String(value ?? '').trim();
  return UUID_REGEX.test(raw) ? raw : '';
}

export async function getAdminConfigPerfil() {
  return http.get(`${BASE}/perfil`);
}

export async function updateAdminConfigPerfil(payload) {
  return http.patch(`${BASE}/perfil`, payload);
}

export async function getAdminConfigNotificaciones({ limit } = {}) {
  const query = Number.isFinite(Number(limit)) ? `?limit=${Math.max(1, Math.min(100, Number(limit)))}` : '';
  return http.get(`${BASE}/notificaciones${query}`);
}

export async function updateAdminConfigNotificaciones(payload) {
  return http.patch(`${BASE}/notificaciones`, payload);
}

export async function getAdminConfigComunicacion({ idSucursal } = {}) {
  const query = idSucursal ? `?id_sucursal=${encodeURIComponent(idSucursal)}` : '';
  return http.get(`${BASE}/comunicacion${query}`);
}

export async function updateAdminConfigComunicacion(payload) {
  return http.patch(`${BASE}/comunicacion`, payload);
}

export async function listAdminConfigComunicacionCampanias({
  q,
  tipo_campania,
  estado,
  estado_operativo,
  incluir_canceladas,
  limit,
  offset,
  sort,
} = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', String(q).trim());
  if (tipo_campania) params.set('tipo_campania', String(tipo_campania));
  if (estado) params.set('estado', String(estado));
  if (estado_operativo) params.set('estado_operativo', String(estado_operativo));
  if (incluir_canceladas !== undefined) params.set('incluir_canceladas', incluir_canceladas ? 'true' : 'false');
  if (Number.isFinite(Number(limit))) params.set('limit', String(Math.max(1, Math.min(100, Number(limit)))));
  if (Number.isFinite(Number(offset))) params.set('offset', String(Math.max(0, Math.min(10000, Number(offset)))));
  if (sort) params.set('sort', String(sort));
  const query = params.toString();
  return http.get(`${BASE}/comunicacion/campanias${query ? `?${query}` : ''}`);
}

export async function createAdminConfigComunicacionCampania(payload) {
  return http.post(`${BASE}/comunicacion/campanias`, payload);
}

export async function getAdminConfigComunicacionCampania(idCampania) {
  return http.get(`${BASE}/comunicacion/campanias/${idCampania}`);
}

export async function updateAdminConfigComunicacionCampania(idCampania, payload) {
  return http.patch(`${BASE}/comunicacion/campanias/${idCampania}`, payload);
}

export async function getAdminConfigComunicacionElegibilidad(idCampania, { limit_elegibles, limit_excluidos } = {}) {
  const params = new URLSearchParams();
  if (Number.isFinite(Number(limit_elegibles))) params.set('limit_elegibles', String(Math.max(1, Math.min(100, Number(limit_elegibles)))));
  if (Number.isFinite(Number(limit_excluidos))) params.set('limit_excluidos', String(Math.max(1, Math.min(100, Number(limit_excluidos)))));
  const query = params.toString();
  return http.get(`${BASE}/comunicacion/campanias/${idCampania}/elegibilidad${query ? `?${query}` : ''}`);
}

export async function listAdminConfigComunicacionElegibilidadDestinatarios(idCampania, { estado, motivo, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (estado) params.set('estado', String(estado));
  if (motivo) params.set('motivo', String(motivo));
  if (Number.isFinite(Number(limit))) params.set('limit', String(Math.max(1, Math.min(100, Number(limit)))));
  if (Number.isFinite(Number(offset))) params.set('offset', String(Math.max(0, Math.min(10000, Number(offset)))));
  const query = params.toString();
  return http.get(`${BASE}/comunicacion/campanias/${idCampania}/elegibilidad/destinatarios${query ? `?${query}` : ''}`);
}

export async function programAdminConfigComunicacionCampania(idCampania, payload = {}) {
  return http.post(`${BASE}/comunicacion/campanias/${idCampania}/programar`, payload);
}

export async function listAdminConfigComunicacionCampaniaEnvios(idCampania, { limit, offset } = {}) {
  const params = new URLSearchParams();
  if (Number.isFinite(Number(limit))) params.set('limit', String(Math.max(1, Math.min(100, Number(limit)))));
  if (Number.isFinite(Number(offset))) params.set('offset', String(Math.max(0, Math.min(10000, Number(offset)))));
  const query = params.toString();
  return http.get(`${BASE}/comunicacion/campanias/${idCampania}/envios${query ? `?${query}` : ''}`);
}

export async function sendAdminConfigComunicacionCampania(idCampania) {
  return http.post(`${BASE}/comunicacion/campanias/${idCampania}/enviar`, {});
}

export async function retryFailedAdminConfigComunicacionCampania(idCampania) {
  return http.post(`${BASE}/comunicacion/campanias/${idCampania}/reintentar-fallidos`, {});
}

export async function cancelAdminConfigComunicacionCampania(idCampania) {
  return http.post(`${BASE}/comunicacion/campanias/${idCampania}/cancelar`, {});
}

export async function getAdminConfigParametros({ idSucursal } = {}) {
  const query = idSucursal ? `?id_sucursal=${encodeURIComponent(idSucursal)}` : '';
  return http.get(`${BASE}/parametros${query}`);
}

export async function updateAdminConfigParametros(payload) {
  return http.patch(`${BASE}/parametros`, payload);
}

export async function listAdminConfigPromociones({ id_sucursal } = {}) {
  const branchId = normalizeBranchId(id_sucursal);
  const query = branchId ? `?id_sucursal=${encodeURIComponent(branchId)}` : '';
  return http.get(`${BASE}/promociones${query}`);
}

export async function getAdminConfigPromocion(id, { id_sucursal } = {}) {
  const branchId = normalizeBranchId(id_sucursal);
  if (!branchId) {
    throw new Error('id_sucursal es requerido para consultar detalle de promocion.');
  }
  return http.get(`${BASE}/promociones/${id}?id_sucursal=${encodeURIComponent(branchId)}`);
}

export async function createAdminConfigPromocion(payload) {
  return http.post(`${BASE}/promociones`, payload);
}

export async function updateAdminConfigPromocion(id, payload) {
  return http.patch(`${BASE}/promociones/${id}`, payload);
}
