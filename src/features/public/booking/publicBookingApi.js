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

export async function getPublicBookingContext() {
  return http.get('/v1/public/citas/contexto');
}

export async function listPublicAgendaBarberos(params = {}) {
  return http.get(`/v1/public/agenda/barberos${toQueryString(params)}`);
}

export async function listPublicCatalogServicios(params = {}) {
  return http.get(`/v1/public/catalog/servicios${toQueryString(params)}`);
}

export async function listPublicAgendaDisponibilidad(params = {}, options = {}) {
  return http.get(`/v1/public/agenda/disponibilidad${toQueryString(params)}`, options);
}

export async function listPublicAgendaHorarios(params = {}, options = {}) {
  return http.get(`/v1/public/agenda/horarios${toQueryString(params)}`, options);
}

export async function createPublicCitaHold(payload) {
  return http.post('/v1/public/citas/hold', payload);
}
