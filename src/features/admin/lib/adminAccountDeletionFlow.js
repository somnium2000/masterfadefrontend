export const ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE = "APROBAR ELIMINACION DE CUENTA";

export const ADMIN_ACCOUNT_DELETION_STATUS_LABELS = {
  pendiente_aprobacion: "Pendiente de aprobacion",
  aprobada: "Aprobada",
  procesando: "Procesando",
  storage_pendiente: "Storage pendiente",
  auth_pendiente: "Auth pendiente",
  completada: "Completada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  fallida: "Fallida",
  evaluada: "Evaluada",
  bloqueada: "Bloqueada",
  pendiente_confirmacion: "Pendiente de confirmacion",
};

const TECHNICAL_RETRY_STATES = new Set(["procesando", "storage_pendiente", "auth_pendiente"]);

const DEPENDENCY_ROUTE_MAP = {
  INTERNAL_ACCOUNT_DELETION_FUTURE_APPOINTMENTS_PENDING: "citas",
  INTERNAL_ACCOUNT_DELETION_ACTIVE_SERVICE_RATES: "servicios",
  INTERNAL_ACCOUNT_DELETION_ACTIVE_PROMOTION_REFERENCES: "promociones",
};

export function normalizeAdminAccountDeletionRequest(item = {}) {
  const completed = String(item.estado_codigo || "") === "completada";
  const subject = String(item.tipo_sujeto || "");
  return {
    id_solicitud: String(item.id_solicitud || "").trim(),
    referencia_publica: String(item.referencia_publica || "").trim(),
    tipo_sujeto: subject,
    estado_codigo: String(item.estado_codigo || "").trim(),
    requiere_aprobacion: item.requiere_aprobacion === true,
    display_name: completed && subject === "cliente"
      ? "Cliente eliminado"
      : completed && subject === "personal"
        ? "Empleado eliminado"
        : String(item.display_name || "").trim(),
    role_labels: Array.isArray(item.role_labels) ? item.role_labels.filter(Boolean) : [],
    branch_labels: Array.isArray(item.branch_labels) ? item.branch_labels.filter(Boolean) : [],
    solicitado_at: item.solicitado_at || null,
    decision_at: item.decision_at || null,
    completado_at: item.completado_at || null,
    dependency_summary: {
      future_operational_appointments: Number(item.dependency_summary?.future_operational_appointments || 0),
      active_employee_service_rates: Number(item.dependency_summary?.active_employee_service_rates || 0),
      active_promotion_references: Number(item.dependency_summary?.active_promotion_references || 0),
    },
    technical_pending: item.technical_pending === true || TECHNICAL_RETRY_STATES.has(String(item.estado_codigo || "")),
  };
}

export function normalizeAdminAccountDeletionList(response = {}) {
  const payload = response?.data || response || {};
  return {
    items: Array.isArray(payload.items) ? payload.items.map(normalizeAdminAccountDeletionRequest) : [],
    pagination: {
      page: Number(payload.pagination?.page || 1),
      limit: Number(payload.pagination?.limit || 20),
      total: Number(payload.pagination?.total || 0),
      total_pages: Number(payload.pagination?.total_pages || 1),
    },
    summary: {
      personal_pending_approval: Number(payload.summary?.personal_pending_approval || 0),
      technical_pending: Number(payload.summary?.technical_pending || 0),
      completed: Number(payload.summary?.completed || 0),
      rejected: Number(payload.summary?.rejected || 0),
    },
  };
}

export function normalizeAdminAccountDeletionDetail(response = {}) {
  const payload = response?.data || response || {};
  const request = normalizeAdminAccountDeletionRequest(payload.request || {});
  return {
    request,
    subject: {
      display_name: request.estado_codigo === "completada"
        ? request.display_name
        : String(payload.subject?.display_name || "").trim(),
      active_roles: Array.isArray(payload.subject?.active_roles) ? payload.subject.active_roles.filter(Boolean) : [],
      branches: Array.isArray(payload.subject?.branches) ? payload.subject.branches.filter(Boolean) : [],
      account_active: payload.subject?.account_active === true,
      employee_active: payload.subject?.employee_active === true,
    },
    dependencies: {
      future_operational_appointments: Number(payload.dependencies?.future_operational_appointments || 0),
      active_weekly_schedules: Number(payload.dependencies?.active_weekly_schedules || 0),
      future_agenda_blocks: Number(payload.dependencies?.future_agenda_blocks || 0),
      public_barber_profiles: Number(payload.dependencies?.public_barber_profiles || 0),
      active_employee_service_rates: Number(payload.dependencies?.active_employee_service_rates || 0),
      active_promotion_references: Number(payload.dependencies?.active_promotion_references || 0),
    },
    blocking_reasons: Array.isArray(payload.blocking_reasons)
      ? payload.blocking_reasons.map((item) => ({
        code: String(item.code || "").trim(),
        message: String(item.message || "").trim(),
      })).filter((item) => item.code || item.message)
      : [],
    technical: {
      retryable: payload.technical?.retryable === true,
      error_code: payload.technical?.error_code || null,
      last_attempt_at: payload.technical?.last_attempt_at || null,
    },
    permissions: {
      can_approve: payload.permissions?.can_approve === true,
      can_reject: payload.permissions?.can_reject === true,
      can_retry: payload.permissions?.can_retry === true,
      reason_code: payload.permissions?.reason_code || null,
    },
  };
}

export function getAdminAccountDeletionStatusLabel(status) {
  return ADMIN_ACCOUNT_DELETION_STATUS_LABELS[status] || "Estado desconocido";
}

export function getDependencyResolutionRoute(reasonCode, basePath = "/home/admin") {
  const target = DEPENDENCY_ROUTE_MAP[reasonCode];
  if (target === "citas") return `${basePath}/citas`;
  if (target === "servicios") return `${basePath}/catalog/servicios`;
  if (target === "promociones") return `${basePath}/configuracion/promociones`;
  return null;
}

export function isApprovalPhraseValid(value) {
  return String(value || "") === ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE;
}

export function canSubmitApproval({ permissions, phrase, acknowledged, submitting }) {
  return permissions?.can_approve === true
    && isApprovalPhraseValid(phrase)
    && acknowledged === true
    && submitting !== true;
}

export function isRejectCommentValid(value) {
  const length = String(value || "").trim().length;
  return length >= 10 && length <= 500;
}

export function normalizeAdminExecutionResponse(response = {}) {
  const payload = response?.data || response || {};
  return {
    completed: payload.completed === true || payload.execution?.completed === true,
    retryable: payload.retryable === true || payload.execution?.retryable === true,
    request: normalizeAdminAccountDeletionRequest(payload.request || payload.execution?.request || {}),
  };
}

export function sanitizeAdminAccountDeletionError(error, fallback = "No fue posible completar la operacion. Intenta nuevamente.") {
  const raw = String(error?.data?.error?.message || error?.message || "").trim();
  if (!raw) return fallback;
  const lowered = raw.toLowerCase();
  if (
    lowered.includes("postgres") ||
    lowered.includes("sql") ||
    lowered.includes("stack") ||
    lowered.includes("token") ||
    lowered.includes("hash") ||
    lowered.includes("storage")
  ) {
    return fallback;
  }
  return raw;
}

export function buildApprovalPayload({ reauthToken, phrase, acknowledged, comment }) {
  return {
    reauth_token: String(reauthToken || "").trim(),
    confirmation_phrase: String(phrase || ""),
    acknowledge_irreversible_action: acknowledged === true,
    ...(String(comment || "").trim() ? { comment: String(comment).trim() } : {}),
  };
}

export function buildRejectPayload(comment) {
  return {
    comment: String(comment || "").trim(),
  };
}

export function countActiveAdminDeletionFilters(filters = {}) {
  return ["search", "subject", "status"].reduce((count, key) => {
    const value = String(filters[key] || "").trim();
    if (!value || value === "all") return count;
    return count + 1;
  }, 0);
}
