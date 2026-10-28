import { http } from "../../../services/httpClient.js";
import {
  buildInternalAccountDeletionCreatePayload,
  normalizeInternalAccountDeletionPreview,
  normalizeInternalAccountDeletionRequest,
} from "./internalAccountDeletionFlow.js";

function normalizePayload(response) {
  return response?.data || response || {};
}

export async function getInternalAccountDeletionPreview() {
  const response = await http.get("/v1/account-deletion/me/preview", { cache: false });
  return normalizeInternalAccountDeletionPreview(normalizePayload(response));
}

export async function getCurrentInternalAccountDeletionRequest() {
  const response = await http.get("/v1/account-deletion/me/requests/current", { cache: false });
  const payload = normalizePayload(response);
  return {
    request: normalizeInternalAccountDeletionRequest(payload.request),
  };
}

export async function createInternalAccountDeletionRequest(payload) {
  const response = await http.post(
    "/v1/account-deletion/me/requests",
    buildInternalAccountDeletionCreatePayload(payload),
    { cache: false, dedupe: false }
  );
  const normalized = normalizePayload(response);
  return {
    request: normalizeInternalAccountDeletionRequest(normalized.request),
    created: normalized.created === true,
    idempotent_replay: normalized.idempotent_replay === true,
    message: String(normalized.message || "").trim(),
  };
}

export async function cancelInternalAccountDeletionRequest(requestId) {
  const safeRequestId = encodeURIComponent(String(requestId || "").trim());
  const response = await http.post(
    `/v1/account-deletion/me/requests/${safeRequestId}/cancel`,
    {},
    { cache: false, dedupe: false }
  );
  const normalized = normalizePayload(response);
  return {
    request: normalizeInternalAccountDeletionRequest(normalized.request),
    cancelled: normalized.cancelled === true,
    idempotent_replay: normalized.idempotent_replay === true,
    message: String(normalized.message || "").trim(),
  };
}
