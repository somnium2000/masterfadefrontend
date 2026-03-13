import { http } from '../../../services/httpClient.js';

function toQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function getAdminCitasContexto() {
  return http.get('/v1/admin/citas/contexto');
}

export async function getAdminCitasHorarios(idEmpleado) {
  return http.get(`/v1/admin/citas/horarios/${encodeURIComponent(idEmpleado)}`);
}

export async function putAdminCitasHorarios(idEmpleado, payload) {
  return http.put(`/v1/admin/citas/horarios/${encodeURIComponent(idEmpleado)}`, payload);
}

export async function listAdminCitasBloqueos(params = {}) {
  return http.get(`/v1/admin/citas/bloqueos${toQueryString(params)}`);
}

export async function createAdminCitasBloqueo(payload) {
  return http.post('/v1/admin/citas/bloqueos', payload);
}

export async function deleteAdminCitasBloqueo(idBloqueo) {
  return http.del(`/v1/admin/citas/bloqueos${toQueryString({ id_bloqueo: idBloqueo })}`);
}

export async function listAdminCitasDiasInhabilitados(params = {}) {
  return http.get(`/v1/admin/citas/dias-inhabilitados${toQueryString(params)}`);
}

export async function createAdminCitasDiaInhabilitado(payload) {
  return http.post('/v1/admin/citas/dias-inhabilitados', payload);
}

export async function deleteAdminCitasDiaInhabilitado(idBloqueo, params = {}) {
  return http.del(`/v1/admin/citas/dias-inhabilitados${toQueryString({ id_bloqueo: idBloqueo, ...params })}`);
}

export async function getAdminCitasParametros() {
  return http.get('/v1/admin/citas/parametros');
}

export async function patchAdminCitasParametros(payload) {
  return http.patch('/v1/admin/citas/parametros', payload);
}

export async function listPublicAgendaDisponibilidad(params = {}, options = {}) {
  return http.get(`/v1/public/agenda/disponibilidad${toQueryString(params)}`, options);
}

export async function listPublicAgendaHorarios(params = {}, options = {}) {
  return http.get(`/v1/public/agenda/horarios${toQueryString(params)}`, options);
}
