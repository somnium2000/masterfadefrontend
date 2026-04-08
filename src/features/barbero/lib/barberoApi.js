import { http } from '../../../services/httpClient.js';

function normalizePayload(response) {
  return response?.data || response;
}

export async function getBarberoPerfil() {
  const response = await http.get('/v1/barbero/perfil');
  return normalizePayload(response);
}

export async function updateBarberoPerfil(payload) {
  const response = await http.patch('/v1/barbero/perfil', payload);
  return normalizePayload(response);
}
