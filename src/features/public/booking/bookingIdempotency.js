const STORAGE_PREFIX = 'mf_booking_hold_idempotency:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stableSerialize(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const segment = (length) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${segment(8)}-${segment(4)}-4${segment(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${segment(3)}-${segment(12)}`;
}

function normalizeFingerprint(value) {
  return String(value || '').trim();
}

function storageKey(fingerprint) {
  return `${STORAGE_PREFIX}${fingerprint}`;
}

function readSessionValue(key) {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.sessionStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function writeSessionValue(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage is best-effort for private browsing and strict browser modes.
  }
}

export function buildBookingHoldFingerprint({
  mode = '',
  isAuthenticatedBooking = false,
  selectionFingerprint = '',
  payload = null,
} = {}) {
  const explicit = normalizeFingerprint(selectionFingerprint);
  if (explicit) {
    return stableSerialize({
      mode,
      auth: Boolean(isAuthenticatedBooking),
      selection: explicit,
    });
  }
  return stableSerialize({
    mode,
    auth: Boolean(isAuthenticatedBooking),
    payload,
  });
}

export function resolveBookingHoldIdempotencyKey(fingerprint) {
  const normalized = normalizeFingerprint(fingerprint);
  if (!normalized) return generateUuid();

  const key = storageKey(normalized);
  const stored = readSessionValue(key);
  if (UUID_PATTERN.test(stored)) return stored;

  const generated = generateUuid();
  writeSessionValue(key, generated);
  return generated;
}

export function syncBookingHoldIdempotencyKey(fingerprint, keyValue) {
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  const normalizedKey = String(keyValue || '').trim();
  if (!normalizedFingerprint || !UUID_PATTERN.test(normalizedKey)) return '';
  writeSessionValue(storageKey(normalizedFingerprint), normalizedKey);
  return normalizedKey;
}
