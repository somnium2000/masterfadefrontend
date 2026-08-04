import { supabase } from '../../../config/supabaseClient.js';
import { http } from '../../../services/httpClient.js';

const BASE = '/v1/cliente';
const CITA_BASE = '/v1/citas';
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROFILE_PATCH_FIELDS = new Set([
  'telefono_principal',
  'fecha_nacimiento',
  'genero_codigo',
  'direccion_texto',
  'preferencias_corte',
  'foto_perfil_asset_id',
]);

function normalizeResponsePayload(response) {
  return response?.data || response;
}

function readEnvFlag(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function shouldUseMembershipPaymentSimulator() {
  const provider = String(
    import.meta.env.VITE_PAYMENT_PROVIDER
    || import.meta.env.VITE_PAYMENT_PROVIDER_CODE
    || ''
  ).trim().toLowerCase();
  if (provider !== 'todopago' && provider !== 'simulator') return false;
  return readEnvFlag(import.meta.env.VITE_ENABLE_PAYMENT_SIMULATOR, false)
    && readEnvFlag(import.meta.env.VITE_ENABLE_QA_PAYMENT_SIMULATION, false);
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  return search.toString();
}

function assertProfileImageFile(file) {
  if (!file) {
    throw new Error('Debes seleccionar una imagen.');
  }
  if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Formato no válido. Usa JPG, PNG o WEBP.');
  }
  if (Number(file.size || 0) > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('La imagen supera el máximo permitido de 5MB.');
  }
}

function extractTextValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const normalized = value.normalize('NFC').trim();
    if (!normalized) return '';
    if (
      (normalized.startsWith('{') && normalized.endsWith('}'))
      || (normalized.startsWith('[') && normalized.endsWith(']'))
      || (normalized.startsWith('"') && normalized.endsWith('"'))
    ) {
      try {
        return extractTextValue(JSON.parse(normalized));
      } catch {
        return normalized;
      }
    }
    return normalized;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const list = value.map((item) => extractTextValue(item)).filter(Boolean);
    return list.join(', ');
  }
  if (typeof value === 'object') {
    const candidateKeys = ['value', 'text', 'texto', 'preferencias', 'content', 'descripcion', 'description'];
    for (const key of candidateKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const resolved = extractTextValue(value[key]);
        if (resolved) return resolved;
      }
    }
    return '';
  }
  return '';
}

function buildClienteProfilePatchPayload(rawPayload = {}) {
  const payload = {};
  for (const [key, value] of Object.entries(rawPayload || {})) {
    if (!PROFILE_PATCH_FIELDS.has(key)) continue;

    if (key === 'fecha_nacimiento') {
      const normalizedDate = extractTextValue(value);
      payload[key] = normalizedDate || null;
      continue;
    }

    if (key === 'foto_perfil_asset_id') {
      const normalizedAssetId = extractTextValue(value);
      payload[key] = normalizedAssetId || null;
      continue;
    }

    const normalizedValue = extractTextValue(value);
    payload[key] = normalizedValue || null;
  }
  return payload;
}

async function uploadPreparedFile(prepared, file) {
  if (!supabase) {
    throw new Error('Supabase no está configurado en frontend.');
  }

  const { error } = await supabase.storage
    .from(prepared.bucket)
    .uploadToSignedUrl(prepared.path, prepared.token, file, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || 'No se pudo subir la imagen a Storage.');
  }
}

export async function getClienteMe() {
  const response = await http.get(`${BASE}/me`);
  return normalizeResponsePayload(response);
}

export async function getClientePuntosResumen() {
  const response = await http.get(`${BASE}/puntos/resumen`);
  return normalizeResponsePayload(response);
}

export async function redeemClientePuntosReward(payload) {
  const response = await http.post(`${BASE}/puntos/canjear`, payload);
  return normalizeResponsePayload(response);
}

export async function updateClienteMe(payload) {
  const response = await http.patch(`${BASE}/me`, buildClienteProfilePatchPayload(payload));
  return normalizeResponsePayload(response);
}

export async function listClienteCitas(filters = {}) {
  const query = buildQuery(filters);
  const response = await http.get(query ? `${CITA_BASE}?${query}` : CITA_BASE);
  const payload = normalizeResponsePayload(response);
  return {
    citas: Array.isArray(payload?.citas) ? payload.citas : [],
  };
}

export async function getClientePlanEstado() {
  const response = await http.get(`${BASE}/planes/estado`);
  return normalizeResponsePayload(response);
}

export async function acquireClientePlan(payload) {
  const response = await http.post(`${BASE}/planes/adquirir`, payload);
  return normalizeResponsePayload(response);
}

export async function createMembershipOrder(id_plan_sucursal) {
  const response = await http.post(`${BASE}/planes/orden`, { id_plan_sucursal });
  return normalizeResponsePayload(response);
}

export async function createMembershipPaymentIntent(id_order) {
  const response = await http.post(`${BASE}/planes/pago-intent`, { id_order });
  return normalizeResponsePayload(response);
}

export async function confirmMembershipPayment(id_payment_intent, options = {}) {
  const endpoint = shouldUseMembershipPaymentSimulator()
    ? `${BASE}/planes/simulator/event`
    : `${BASE}/planes/confirmar-pago`;
  const testAmount = Number(options?.monto_prueba_hnl);
  const response = await http.post(endpoint, {
    id_payment_intent,
    ...(shouldUseMembershipPaymentSimulator() && Number.isFinite(testAmount) && testAmount > 0
      ? { monto_prueba_hnl: testAmount }
      : {}),
  });
  const payload = normalizeResponsePayload(response);
  const normalizedStatus = String(payload?.normalized_status || '').trim().toUpperCase();
  if (normalizedStatus && normalizedStatus !== 'PAID') {
    throw new Error(String(payload?.message || 'El pago del plan no fue aprobado.'));
  }
  return payload;
}

export async function cancelClientePlan(payload = {}) {
  const response = await http.post(`${BASE}/planes/cancelar`, payload);
  return normalizeResponsePayload(response);
}

export async function cancelClientePlanBySubscription(id_suscripcion) {
  const safeSubscriptionId = String(id_suscripcion || "").trim();
  if (!safeSubscriptionId) {
    throw new Error("Debes indicar la suscripcion que deseas cancelar.");
  }
  const response = await http.patch(`${BASE}/planes/${safeSubscriptionId}/cancelar`);
  return normalizeResponsePayload(response);
}

export async function createClienteCitaHold(payload) {
  const response = await http.post(`${CITA_BASE}/hold`, payload);
  return normalizeResponsePayload(response);
}

export async function getClienteCitaDetalle(idCita) {
  const response = await http.get(`${CITA_BASE}/${idCita}`);
  return normalizeResponsePayload(response);
}

export async function getClienteCitaPendiente() {
  const response = await http.get(`${CITA_BASE}/pendiente`);
  const payload = normalizeResponsePayload(response);
  return {
    pendiente: payload?.pendiente ?? null,
  };
}

export async function retomarClienteCitaPendiente(idGrupoCita) {
  const safeGroupId = String(idGrupoCita || '').trim();
  if (!safeGroupId) {
    throw new Error('No se pudo identificar la reserva pendiente.');
  }
  const response = await http.post(`${CITA_BASE}/pendiente/${encodeURIComponent(safeGroupId)}/retomar`, {});
  return normalizeResponsePayload(response);
}

export async function descartarClienteCitaPendiente(idGrupoCita) {
  const safeGroupId = String(idGrupoCita || '').trim();
  if (!safeGroupId) {
    throw new Error('No se pudo identificar la reserva pendiente.');
  }
  const response = await http.post(`${CITA_BASE}/pendiente/${encodeURIComponent(safeGroupId)}/descartar`, {});
  return normalizeResponsePayload(response);
}

export async function prepareClienteProfileImageUpload(file, { label = 'perfil-cliente' } = {}) {
  assertProfileImageFile(file);
  const response = await http.post(`${BASE}/me/profile-image/prepare`, {
    file_name: file.name,
    content_type: file.type,
    size_bytes: file.size,
    label,
  });
  const prepared = normalizeResponsePayload(response);

  if (!prepared?.asset_id || !prepared?.bucket || !prepared?.path || !prepared?.token) {
    throw new Error('El backend no devolvió datos válidos para upload firmado.');
  }

  await uploadPreparedFile(prepared, file);
  return prepared;
}

export async function getClienteProfileImageReadUrl(assetId, { expiresIn = 300 } = {}) {
  const response = await http.post(`${BASE}/me/profile-image/read-url`, {
    asset_id: assetId || null,
    expires_in: expiresIn,
  });
  return normalizeResponsePayload(response);
}

export async function deleteClienteProfileImage() {
  const response = await http.del(`${BASE}/me/profile-image`);
  return normalizeResponsePayload(response);
}

export async function getClienteAccountDeletionPreview() {
  const response = await http.get(`${BASE}/me/account-deletion/preview`, { cache: false });
  return normalizeResponsePayload(response);
}

export async function createClienteAccountDeletionRequest({ idempotencyKey } = {}) {
  const response = await http.post(`${BASE}/me/account-deletion/requests`, {
    idempotency_key: String(idempotencyKey || "").trim(),
  }, { dedupe: false });
  return normalizeResponsePayload(response);
}

export async function confirmClienteAccountDeletionRequest(requestId, payload = {}) {
  const safeRequestId = String(requestId || "").trim();
  if (!safeRequestId) {
    throw new Error("No se pudo identificar la solicitud de eliminacion.");
  }
  const response = await http.post(`${BASE}/me/account-deletion/requests/${encodeURIComponent(safeRequestId)}/confirm`, {
    reauth_token: payload.reauth_token,
    confirmacion_texto: payload.confirmacion_texto,
    acepta_perder_masterpuntos: payload.acepta_perder_masterpuntos === true,
    acepta_cancelar_membresia: payload.acepta_cancelar_membresia === true,
    acepta_historial_anonimizado: payload.acepta_historial_anonimizado === true,
    acepta_irreversibilidad: payload.acepta_irreversibilidad === true,
  }, { dedupe: false });
  return normalizeResponsePayload(response);
}

export async function executePublicAccountDeletion(reference, executionToken) {
  const safeReference = String(reference || "").trim();
  const safeToken = String(executionToken || "").trim();
  if (!safeReference || !safeToken) {
    throw new Error("No se pudo validar la continuacion de eliminacion.");
  }
  const response = await http.post(
    `/v1/public/account-deletion/requests/${encodeURIComponent(safeReference)}/execute`,
    { execution_token: safeToken },
    { token: "", dedupe: false }
  );
  return normalizeResponsePayload(response);
}

export { ALLOWED_PROFILE_IMAGE_TYPES, MAX_PROFILE_IMAGE_BYTES };
