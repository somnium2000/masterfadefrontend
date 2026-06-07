import { http } from '../../../services/httpClient.js';
import { buildReleaseHoldPayload } from './bookingPayloadBuilders.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function getPublicBookingContext(options = {}) {
  return http.get('/v1/public/citas/contexto', options);
}

export async function listPublicAgendaBarberos(params = {}, options = {}) {
  const idSucursal = String(params?.id_sucursal || '').trim();
  if (!UUID_PATTERN.test(idSucursal)) {
    const error = new Error('Selecciona una sucursal valida para consultar barberos.');
    error.status = 400;
    error.data = {
      error: {
        code: 'PUBLIC_BOOKING_BRANCH_INVALID',
        message: error.message,
      },
    };
    throw error;
  }
  return http.get(`/v1/public/agenda/barberos${toQueryString({ ...params, id_sucursal: idSucursal })}`, options);
}

export async function listPublicCatalogServicios(params = {}, options = {}) {
  return http.get(`/v1/public/catalog/servicios${toQueryString(params)}`, options);
}

export async function listPublicCatalogPaquetes(params = {}, options = {}) {
  return http.get(`/v1/public/catalog/paquetes${toQueryString(params)}`, options);
}

// JK: Consulta promociones vigentes para el flujo de agendamiento sin afectar pagos/factura.
export async function listPublicAgendaPromociones(params = {}, options = {}) {
  return http.get(`/v1/public/agenda/promociones${toQueryString(params)}`, options);
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

export async function validatePublicTitularForBooking(payload) {
  return http.post('/v1/public/citas/validar-titular', payload);
}

export async function validatePublicBookingContacts(payload) {
  return http.post('/v1/public/citas/validar-contactos', payload);
}

export async function releasePublicCitaHold(idGrupoCita, releaseToken) {
  const groupId = String(idGrupoCita || '').trim();
  if (!UUID_PATTERN.test(groupId)) {
    const error = new Error('No se pudo identificar la reserva temporal.');
    error.status = 400;
    error.data = {
      error: {
        code: 'PUBLIC_BOOKING_HOLD_GROUP_INVALID',
        message: error.message,
      },
    };
    throw error;
  }
  const token = String(releaseToken || '').trim();
  if (!token) {
    const error = new Error('No se pudo validar la reserva temporal publica.');
    error.status = 400;
    error.data = {
      error: {
        code: 'PUBLIC_BOOKING_HOLD_RELEASE_TOKEN_REQUIRED',
        message: error.message,
      },
    };
    throw error;
  }
  return http.del(`/v1/public/citas/hold/${encodeURIComponent(groupId)}`, {
    body: buildReleaseHoldPayload(token),
  });
}

export async function createClienteCitaHold(payload) {
  return http.post('/v1/citas/hold', payload);
}

export async function releaseClienteCitaHold(idGrupoCita) {
  const groupId = String(idGrupoCita || '').trim();
  if (!UUID_PATTERN.test(groupId)) {
    const error = new Error('No se pudo identificar la reserva temporal.');
    error.status = 400;
    error.data = {
      error: {
        code: 'CLIENT_BOOKING_HOLD_GROUP_INVALID',
        message: error.message,
      },
    };
    throw error;
  }
  return http.del(`/v1/citas/hold/${encodeURIComponent(groupId)}`);
}

export async function confirmClienteCitaHoldWithoutPayment(idGrupoCita, payload = {}, options = {}) {
  return http.post(`/v1/citas/hold/${encodeURIComponent(String(idGrupoCita || '').trim())}/confirmar`, payload, options);
}

export async function createPublicPaymentIntent(payload) {
  return http.post('/v1/public/pagos/crear-intent', payload);
}

export async function getPublicPaymentStatus(params = {}, options = {}) {
  return http.get(`/v1/public/pagos/estado${toQueryString(params)}`, options);
}

export async function completePublicMockPayment(payload) {
  return http.post('/v1/public/pagos/mock-completar', payload);
}

export async function completePublicSimulatorPayment(payload) {
  return http.post('/v1/public/pagos/simulator/event', payload);
}

// AM: Consulta de estado de membresía para propuesta automática de servicios cubiertos en booking autenticado.
export async function getClienteMembershipEstado(options = {}) {
  return http.get('/v1/cliente/planes/estado', options);
}
