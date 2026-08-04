import { http } from "../../../services/httpClient.js";
import {
  buildApprovalPayload,
  buildRejectPayload,
  normalizeAdminAccountDeletionDetail,
  normalizeAdminAccountDeletionList,
  normalizeAdminExecutionResponse,
} from "./adminAccountDeletionFlow.js";

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "all") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listAdminAccountDeletionRequests(params = {}) {
  const response = await http.get(`/v1/admin/account-deletion/requests${toQuery(params)}`, { cache: false });
  return normalizeAdminAccountDeletionList(response);
}

export async function getAdminAccountDeletionRequestDetail(requestId) {
  const response = await http.get(`/v1/admin/account-deletion/requests/${encodeURIComponent(String(requestId || ""))}`, { cache: false });
  return normalizeAdminAccountDeletionDetail(response);
}

export async function approveAdminAccountDeletionRequest(requestId, payload) {
  const response = await http.post(
    `/v1/admin/account-deletion/requests/${encodeURIComponent(String(requestId || ""))}/approve`,
    buildApprovalPayload(payload),
    { cache: false, dedupe: false }
  );
  return normalizeAdminExecutionResponse(response);
}

export async function rejectAdminAccountDeletionRequest(requestId, comment) {
  const response = await http.post(
    `/v1/admin/account-deletion/requests/${encodeURIComponent(String(requestId || ""))}/reject`,
    buildRejectPayload(comment),
    { cache: false, dedupe: false }
  );
  return response?.data || response;
}

export async function retryAdminAccountDeletionRequest(requestId) {
  const response = await http.post(
    `/v1/admin/account-deletion/requests/${encodeURIComponent(String(requestId || ""))}/retry`,
    {},
    { cache: false, dedupe: false }
  );
  return normalizeAdminExecutionResponse(response);
}
