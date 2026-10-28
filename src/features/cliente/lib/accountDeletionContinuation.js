const STORAGE_KEY = "mf_account_deletion_continuation_v1";
const CONTINUATION_VERSION = 1;
const REFERENCE_RE = /^DEL-[A-F0-9]{12}$/;
const MIN_TOKEN_LENGTH = 40;
const MAX_TOKEN_LENGTH = 100;

function getDefaultStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function safeString(value) {
  return String(value || "").trim();
}

export function isValidAccountDeletionReference(value) {
  return REFERENCE_RE.test(safeString(value));
}

export function isValidAccountDeletionExecutionToken(value) {
  const token = safeString(value);
  return token.length >= MIN_TOKEN_LENGTH && token.length <= MAX_TOKEN_LENGTH;
}

export function normalizeAccountDeletionResponse(response) {
  return response?.data || response;
}

export function resolveAccountDeletionErrorCode(error) {
  return safeString(error?.data?.error?.code || error?.error?.code || error?.code);
}

export function resolveAccountDeletionErrorMessage(error, fallback = "No fue posible completar la operacion.") {
  const raw = safeString(error?.data?.error?.message || error?.error?.message || error?.message);
  if (!raw) return fallback;
  const lowered = raw.toLowerCase();
  if (
    lowered.includes("postgres")
    || lowered.includes("supabase")
    || lowered.includes("storage")
    || lowered.includes("stack")
    || lowered.includes("sql")
  ) {
    return fallback;
  }
  return raw;
}

export function classifyAccountDeletionExecutionResult(result) {
  const payload = normalizeAccountDeletionResponse(result);
  if (payload?.completed === true) return "completada";
  if (payload?.retryable === true || payload?.request?.status === "storage_pendiente" || payload?.request?.status === "auth_pendiente") {
    return "reintento";
  }
  return "error";
}

export function classifyAccountDeletionExecutionError(error) {
  const code = resolveAccountDeletionErrorCode(error);
  const payload = normalizeAccountDeletionResponse(error?.data);
  if (Number(error?.status) === 503 && (payload?.retryable === true || error?.data?.data?.retryable === true)) return "reintento";
  if (code === "CLIENT_ACCOUNT_DELETION_BLOCKED") return "bloqueada";
  if (code === "CLIENT_ACCOUNT_DELETION_REAUTH_REQUIRED") return "reautenticacion_requerida";
  if (
    code === "CLIENT_ACCOUNT_DELETION_EXECUTION_CREDENTIAL_INVALID"
    || code === "CLIENT_ACCOUNT_DELETION_EXECUTION_TOKEN_EXPIRED"
  ) {
    return "credencial_invalida";
  }
  if (!Number(error?.status)) return "red";
  return "error";
}

export function shouldKeepAccountDeletionContinuationForFailure(error) {
  const classification = classifyAccountDeletionExecutionError(error);
  return classification === "reintento" || classification === "red";
}

function normalizeContinuation(data) {
  const reference = safeString(data?.reference);
  const executionToken = safeString(data?.executionToken);
  const executionExpiresAt = safeString(data?.executionExpiresAt);
  const savedAt = safeString(data?.savedAt) || new Date().toISOString();

  if (!isValidAccountDeletionReference(reference)) return null;
  if (!isValidAccountDeletionExecutionToken(executionToken)) return null;
  if (!executionExpiresAt) return null;

  return {
    version: CONTINUATION_VERSION,
    reference,
    executionToken,
    executionExpiresAt,
    savedAt,
  };
}

export function saveAccountDeletionContinuation(data, storage = getDefaultStorage()) {
  if (!storage) return null;
  const normalized = normalizeContinuation(data);
  if (!normalized) {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function readAccountDeletionContinuation(storage = getDefaultStorage()) {
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Number(parsed?.version) !== CONTINUATION_VERSION) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    const normalized = normalizeContinuation(parsed);
    if (!normalized) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearAccountDeletionContinuation(storage = getDefaultStorage()) {
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY as ACCOUNT_DELETION_CONTINUATION_KEY };
