export const INTERNAL_ACCOUNT_DELETION_ALLOWED_ROLES = [
  "admin",
  "barbero",
  "super_admin",
  "root",
  "security_admin",
  "security_auditor",
];

export const INTERNAL_ACCOUNT_DELETION_PHRASE = "SOLICITAR ELIMINACION DE MI CUENTA";

export const INTERNAL_ACCOUNT_DELETION_ACTIVE_MESSAGE =
  "Tu cuenta continuara activa mientras se toma una decision.";

export const INTERNAL_ACCOUNT_DELETION_SUCCESS_MESSAGE =
  "Tu solicitud fue enviada para revision. Tu cuenta continuara activa mientras se toma una decision.";

export const INTERNAL_ACCOUNT_DELETION_ACKNOWLEDGEMENTS = [
  {
    key: "acknowledge_account_remains_active",
    label: "Entiendo que mi cuenta continuara activa hasta que un administrador tome una decision.",
  },
  {
    key: "acknowledge_operational_dependencies",
    label: "Entiendo que las citas, horarios y responsabilidades operativas deberan resolverse antes de una aprobacion.",
  },
  {
    key: "acknowledge_access_revocation",
    label: "Entiendo que, si se aprueba, perdere el acceso y mis roles internos seran desactivados.",
  },
  {
    key: "acknowledge_history_retention",
    label: "Entiendo que ciertos registros historicos se conservaran anonimizados o protegidos.",
  },
];

const DEPENDENCY_LABELS = {
  future_operational_appointments: "Citas futuras operativas",
  active_weekly_schedules: "Horarios activos",
  future_agenda_blocks: "Bloqueos de agenda",
  public_barber_profiles: "Perfil publico de barbero",
  employee_service_rates: "Tarifas especificas",
  promotion_references: "Referencias promocionales",
};

const INTERNAL_TERMINAL_STATES = new Set(["cancelada", "rechazada", "completada", "fallida"]);
const CANCELABLE_STATES = new Set(["pendiente_aprobacion"]);

function toPayload(response) {
  return response?.data || response || {};
}

function toInteger(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.trunc(number);
}

function normalizeBlockingReasons(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      code: String(item?.code || "").trim(),
      message: String(item?.message || "").trim(),
    }))
    .filter((item) => item.code || item.message);
}

export function normalizeInternalAccountDeletionRequest(value) {
  if (!value || typeof value !== "object") return null;
  const state = String(value.estado_codigo || "").trim();
  const hasDecision = Boolean(value.decision_codigo || value.decision_at);
  return {
    id_solicitud: String(value.id_solicitud || "").trim(),
    referencia_publica: String(value.referencia_publica || "").trim(),
    estado_codigo: state,
    solicitado_at: value.solicitado_at || null,
    requiere_aprobacion: value.requiere_aprobacion === true,
    can_cancel: value.can_cancel === true || (!hasDecision && CANCELABLE_STATES.has(state)),
  };
}

export function normalizeInternalAccountDeletionPreview(response) {
  const payload = toPayload(response);
  const dependencies = payload.dependencies && typeof payload.dependencies === "object"
    ? payload.dependencies
    : {};
  const consequences = payload.consequences && typeof payload.consequences === "object"
    ? payload.consequences
    : {};

  return {
    can_request: payload.can_request === true,
    account_mode: String(payload.account_mode || "requires_approval"),
    requires_approval: payload.requires_approval !== false,
    blocking_reasons: normalizeBlockingReasons(payload.blocking_reasons),
    dependencies: {
      active_roles: Array.isArray(dependencies.active_roles) ? dependencies.active_roles.filter(Boolean) : [],
      active_employee_records: toInteger(dependencies.active_employee_records),
      branches_assigned: toInteger(dependencies.branches_assigned),
      is_barber: dependencies.is_barber === true,
      future_operational_appointments: toInteger(dependencies.future_operational_appointments),
      active_weekly_schedules: toInteger(dependencies.active_weekly_schedules),
      future_agenda_blocks: toInteger(dependencies.future_agenda_blocks),
      public_barber_profiles: toInteger(dependencies.public_barber_profiles),
      employee_service_rates: toInteger(dependencies.employee_service_rates),
      promotion_references: toInteger(dependencies.promotion_references),
    },
    consequences: {
      account_remains_active_until_decision: consequences.account_remains_active_until_decision !== false,
      requires_administrative_review: consequences.requires_administrative_review !== false,
      future_appointments_must_be_reassigned: consequences.future_appointments_must_be_reassigned === true,
      access_will_be_revoked_if_approved: consequences.access_will_be_revoked_if_approved !== false,
      roles_will_be_disabled_if_approved: consequences.roles_will_be_disabled_if_approved !== false,
      employment_records_will_be_closed_if_approved: consequences.employment_records_will_be_closed_if_approved !== false,
      history_retained_anonymized: consequences.history_retained_anonymized !== false,
    },
    current_request: normalizeInternalAccountDeletionRequest(payload.current_request),
    evaluated_at: payload.evaluated_at || null,
  };
}

export function isInternalAccountProtected(preview) {
  const normalized = normalizeInternalAccountDeletionPreview(preview);
  return normalized.blocking_reasons.some((reason) => reason.code === "INTERNAL_ACCOUNT_DELETION_PROTECTED");
}

export function getVisibleInternalDependencies(preview) {
  const dependencies = normalizeInternalAccountDeletionPreview(preview).dependencies;
  return Object.entries(DEPENDENCY_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      count: toInteger(dependencies[key]),
    }))
    .filter((item) => item.count > 0);
}

export function isInternalPhraseValid(value) {
  return String(value || "") === INTERNAL_ACCOUNT_DELETION_PHRASE;
}

export function areInternalAcknowledgementsComplete(acknowledgements = {}) {
  return INTERNAL_ACCOUNT_DELETION_ACKNOWLEDGEMENTS.every((item) => acknowledgements[item.key] === true);
}

export function buildInternalAccountDeletionCreatePayload({
  idempotencyKey,
  reauthToken,
  confirmationPhrase,
  acknowledgements,
}) {
  const ackValues = acknowledgements && typeof acknowledgements === "object" ? acknowledgements : {};
  return {
    idempotency_key: String(idempotencyKey || "").trim(),
    reauth_token: String(reauthToken || "").trim(),
    confirmation_phrase: String(confirmationPhrase || ""),
    acknowledge_account_remains_active: ackValues.acknowledge_account_remains_active === true,
    acknowledge_operational_dependencies: ackValues.acknowledge_operational_dependencies === true,
    acknowledge_access_revocation: ackValues.acknowledge_access_revocation === true,
    acknowledge_history_retention: ackValues.acknowledge_history_retention === true,
  };
}

export function sanitizeInternalAccountDeletionError(error, fallback = "No fue posible completar la operacion. Intenta nuevamente.") {
  const raw = String(error?.data?.error?.message || error?.message || "").trim();
  if (!raw) return fallback;
  const lowered = raw.toLowerCase();
  if (
    lowered.includes("postgres") ||
    lowered.includes("supabase") ||
    lowered.includes("sql") ||
    lowered.includes("stack") ||
    lowered.includes("jwt") ||
    lowered.includes("token")
  ) {
    return fallback;
  }
  return raw;
}

export function isInternalCancellationAllowed(request) {
  const normalized = normalizeInternalAccountDeletionRequest(request);
  if (!normalized) return false;
  return normalized.can_cancel === true
    && CANCELABLE_STATES.has(normalized.estado_codigo)
    && !INTERNAL_TERMINAL_STATES.has(normalized.estado_codigo);
}

export function mapInternalRequestState(request) {
  const normalized = normalizeInternalAccountDeletionRequest(request);
  if (!normalized) {
    return {
      title: "Sin solicitud activa",
      description: "No tienes una solicitud interna pendiente.",
      accountActiveMessage: INTERNAL_ACCOUNT_DELETION_ACTIVE_MESSAGE,
    };
  }
  if (normalized.estado_codigo === "pendiente_aprobacion") {
    return {
      title: "Solicitud pendiente de revision",
      description: "La solicitud sera revisada por administracion antes de cualquier cambio.",
      accountActiveMessage: INTERNAL_ACCOUNT_DELETION_ACTIVE_MESSAGE,
    };
  }
  return {
    title: "Solicitud en revision",
    description: "La solicitud ya no se encuentra en una etapa cancelable.",
    accountActiveMessage: INTERNAL_ACCOUNT_DELETION_ACTIVE_MESSAGE,
  };
}

export function canSubmitInternalAccountDeletion({ preview, phrase, acknowledgements, submitting }) {
  const normalized = normalizeInternalAccountDeletionPreview(preview);
  return normalized.can_request === true
    && isInternalPhraseValid(phrase)
    && areInternalAcknowledgementsComplete(acknowledgements)
    && submitting !== true;
}

export function createInternalAccountDeletionIdempotencyKey(randomId) {
  const suffix = typeof randomId === "function" ? randomId() : randomId;
  return `internal-account-deletion-${String(suffix || "").trim()}`;
}
