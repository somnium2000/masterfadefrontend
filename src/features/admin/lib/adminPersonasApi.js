import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/personas';

// AM: Cliente API central del modulo Personas (permisos segun cada ruta).
export async function listAdminPersonas() {
  return http.get(BASE);
}

export async function listAdminPersonasUsuarios() {
  return http.get(`${BASE}/usuarios`);
}

export async function sendAdminPersonaUserPasswordSetup(idUsuario, payload = {}) {
  return http.post(`${BASE}/usuarios/${idUsuario}/enviar-configuracion-password`, payload);
}

export async function listAdminPersonasEmpleados() {
  return http.get(`${BASE}/empleados`);
}

export async function getAdminPersonaEmpleado(idEmpleado) {
  return http.get(`${BASE}/empleados/${idEmpleado}`);
}

export async function createAdminPersonaEmpleado(payload) {
  return http.post(`${BASE}/empleados`, payload);
}

export async function updateAdminPersonaEmpleado(idEmpleado, payload) {
  return http.patch(`${BASE}/empleados/${idEmpleado}`, payload);
}

export async function inactivateAdminPersonaEmpleado(idEmpleado) {
  return http.patch(`${BASE}/empleados/${idEmpleado}/inactivar`);
}

export async function activateAdminPersonaEmpleado(idEmpleado) {
  return http.patch(`${BASE}/empleados/${idEmpleado}/activar`);
}

export async function listAdminPersonasClientes() {
  return http.get(`${BASE}/clientes`);
}

export async function getAdminPersonaCliente(idCliente) {
  return http.get(`${BASE}/clientes/${idCliente}`);
}

export async function createAdminPersonaCliente(payload) {
  return http.post(`${BASE}/clientes`, payload);
}

export async function updateAdminPersonaCliente(idCliente, payload) {
  return http.patch(`${BASE}/clientes/${idCliente}`, payload);
}

export async function inactivateAdminPersonaCliente(idCliente) {
  return http.patch(`${BASE}/clientes/${idCliente}/inactivar`);
}

export async function activateAdminPersonaCliente(idCliente) {
  return http.patch(`${BASE}/clientes/${idCliente}/activar`);
}

export async function updateAdminPersonaUsuario(idUsuario, payload) {
  return http.patch(`${BASE}/usuarios/${idUsuario}`, payload);
}

export async function blockAdminPersonaUsuario(idUsuario) {
  return http.patch(`${BASE}/usuarios/${idUsuario}/bloquear`);
}

export async function activateAdminPersonaUsuario(idUsuario) {
  return http.patch(`${BASE}/usuarios/${idUsuario}/activar`);
}

export async function listAdminPersonasCatalogos() {
  return http.get(`${BASE}/catalogos`);
}

export async function listAdminPersonasRoles() {
  return http.get(`${BASE}/roles`);
}

export async function createAdminPersonaRol(payload) {
  return http.post(`${BASE}/roles`, payload);
}

export async function createAdminUsuarioInterno(payload) {
  return http.post(`${BASE}/usuarios-internos`, payload);
}
