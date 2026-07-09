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

export async function getAdminCitasOperativasContexto() {
  return http.get('/v1/admin/citas/operativas/contexto');
}

export async function listAdminCitasOperativas(params = {}) {
  return http.get(`/v1/admin/citas/operativas${toQueryString(params)}`);
}

export async function getAdminCitasOperativasCompletadasHoy(params = {}) {
  return http.get(`/v1/admin/citas/operativas/completadas-hoy${toQueryString(params)}`);
}

export async function listAdminCitasHistorial(params = {}) {
  return http.get(`/v1/admin/citas/historial${toQueryString(params)}`);
}

export async function patchAdminCitaEstado(idCita, payload) {
  return http.patch(`/v1/admin/citas/${encodeURIComponent(idCita)}/estado`, payload);
}

export async function postAdminCitasHold(payload, options = {}) {
  return http.post('/v1/admin/citas/hold', payload, options);
}

export async function deleteAdminCitasHold(idGrupoCita, options = {}) {
  return http.del(`/v1/admin/citas/hold/${encodeURIComponent(idGrupoCita)}`, options);
}

export async function postAdminCitasHoldConfirmar(idGrupoCita, payload = {}, options = {}) {
  return http.post(`/v1/admin/citas/hold/${encodeURIComponent(idGrupoCita)}/confirmar`, payload, options);
}

export async function postAdminCitasHoldPaymentLink(idGrupoCita, payload = {}, options = {}) {
  return http.post(`/v1/admin/citas/hold/${encodeURIComponent(idGrupoCita)}/payment-link`, payload, options);
}

export async function postAdminCitaIniciarAtencion(idCita) {
  return http.post(`/v1/admin/citas/${encodeURIComponent(idCita)}/iniciar-atencion`, {});
}

export async function postAdminCitaRegistrarLlegada(idCita) {
  return http.post(`/v1/admin/citas/${encodeURIComponent(idCita)}/registrar-llegada`, {});
}

export async function postAdminCitaFinalizarAtencion(idCita) {
  return http.post(`/v1/admin/citas/${encodeURIComponent(idCita)}/finalizar-atencion`, {});
}

export async function listAdminCitasAfectadasReagendacion(params = {}) {
  return http.get(`/v1/admin/citas/reagendacion/afectadas${toQueryString(params)}`);
}

export async function postAdminCitaReagendarEmergencia(idCita, payload) {
  return http.post(`/v1/admin/citas/${encodeURIComponent(idCita)}/reagendar-emergencia`, payload);
}

export async function postAdminCitasReagendarEmergenciaLote(payload) {
  return http.post('/v1/admin/citas/reagendar-emergencia/lote', payload);
}

export async function getAdminCitasHorarios(idEmpleado) {
  return http.get(`/v1/admin/citas/horarios/${encodeURIComponent(idEmpleado)}`);
}

export async function putAdminCitasHorarios(idEmpleado, payload) {
  return http.put(`/v1/admin/citas/horarios/${encodeURIComponent(idEmpleado)}`, payload);
}

export async function getAdminCitasSucursalHorarios(idSucursal) {
  return http.get(`/v1/admin/citas/sucursales/${encodeURIComponent(idSucursal)}/horarios`);
}

export async function putAdminCitasSucursalHorarios(idSucursal, payload) {
  return http.put(`/v1/admin/citas/sucursales/${encodeURIComponent(idSucursal)}/horarios`, payload);
}

export async function listAdminCitasBloqueos(params = {}) {
  return http.get(`/v1/admin/citas/bloqueos${toQueryString(params)}`);
}

export async function listAdminCitasBloqueosEmpleado(params = {}) {
  return listAdminCitasBloqueos(params);
}

export async function createAdminCitasBloqueo(payload) {
  return http.post('/v1/admin/citas/bloqueos', payload);
}

export async function createAdminCitasBloqueoEmpleado(payload) {
  return createAdminCitasBloqueo(payload);
}

export async function deleteAdminCitasBloqueo(idBloqueo) {
  return http.del(`/v1/admin/citas/bloqueos${toQueryString({ id_bloqueo: idBloqueo })}`);
}

export async function deleteAdminCitasBloqueoEmpleado(idBloqueo) {
  return deleteAdminCitasBloqueo(idBloqueo);
}

export async function listAdminCitasDiasInhabilitados(params = {}) {
  return http.get(`/v1/admin/citas/dias-inhabilitados${toQueryString(params)}`);
}

export async function listAdminCitasExcepcionesSucursal(params = {}) {
  return listAdminCitasDiasInhabilitados({ ...params, scope: 'sucursal' });
}

export async function createAdminCitasDiaInhabilitado(payload) {
  return http.post('/v1/admin/citas/dias-inhabilitados', payload);
}

export async function createAdminCitasExcepcionSucursal(payload) {
  return createAdminCitasDiaInhabilitado({
    modo_excepcion_codigo: 'cierre_total',
    ...payload,
  });
}

export async function deleteAdminCitasDiaInhabilitado(idBloqueo, params = {}) {
  return http.del(`/v1/admin/citas/dias-inhabilitados${toQueryString({ id_bloqueo: idBloqueo, ...params })}`);
}

export async function deleteAdminCitasExcepcionSucursal(idExcepcionSucursal, params = {}) {
  return deleteAdminCitasDiaInhabilitado(idExcepcionSucursal, {
    scope: 'sucursal',
    id_excepcion_sucursal: idExcepcionSucursal,
    ...params,
  });
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
