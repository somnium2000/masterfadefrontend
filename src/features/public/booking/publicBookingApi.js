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

export async function listPublicCatalogPaquetes(params = {}) {
  return http.get(`/v1/public/catalog/paquetes${toQueryString(params)}`);
}

// JK: Consulta promociones vigentes para el flujo de agendamiento sin afectar pagos/factura.
export async function listPublicAgendaPromociones(params = {}) {
  return http.get(`/v1/public/agenda/promociones${toQueryString(params)}`);
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

export async function createClienteCitaHold(payload) {
  return http.post('/v1/citas/hold', payload);
}

export async function createPublicPaymentIntent(payload) {
  return http.post('/v1/public/pagos/crear-intent', payload);
}

export async function getPublicPaymentStatus(params = {}) {
  return http.get(`/v1/public/pagos/estado${toQueryString(params)}`);
}

export async function completePublicMockPayment(payload) {
  return http.post('/v1/public/pagos/mock-completar', payload);
}

// AM: Consulta de estado de membresía para propuesta automática de servicios cubiertos en booking autenticado.
export async function getClienteMembershipEstado() {
  return http.get('/v1/cliente/planes/estado');
}
