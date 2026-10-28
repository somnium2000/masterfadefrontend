export const PENDING_PAYMENT_CONTEXT_STORAGE_KEY = 'mf_pending_payment_context_v1';
export const BOOKING_PAYMENT_CONTEXT_STORAGE_KEY = 'masterfade.publicBookingPayment.v1';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeText(value) {
  return String(value || '').trim();
}

function normalizeContext(value, { includePaymentIntent = false } = {}) {
  if (!value || typeof value !== 'object') return null;
  const groupId = safeText(value.id_grupo_cita);
  const intentId = safeText(value.id_intent || value.payment_intent?.id_intent);
  if (!UUID_PATTERN.test(groupId) || !UUID_PATTERN.test(intentId)) return null;
  return {
    id_grupo_cita: groupId,
    id_intent: intentId,
    titular_email: safeText(value.titular_email).toLowerCase(),
    ...(includePaymentIntent
      ? {
          paymentIntent: value.paymentIntent && typeof value.paymentIntent === 'object'
            ? value.paymentIntent
            : null,
        }
      : {}),
  };
}

function readSessionContext(storageKey, options) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return normalizeContext(JSON.parse(raw), options);
  } catch {
    return null;
  }
}

export function readPendingPaymentResumeContext() {
  return readSessionContext(PENDING_PAYMENT_CONTEXT_STORAGE_KEY);
}

export function readBookingPaymentContext({ groupId = '', intentId = '' } = {}) {
  const context = readSessionContext(BOOKING_PAYMENT_CONTEXT_STORAGE_KEY, {
    includePaymentIntent: true,
  });
  const expectedGroupId = safeText(groupId);
  const expectedIntentId = safeText(intentId);
  if (expectedGroupId && context?.id_grupo_cita !== expectedGroupId) return null;
  if (expectedIntentId && context?.id_intent !== expectedIntentId) return null;
  return context;
}

export function resolvePaymentResumeContext({
  search = '',
  pendingContext = readPendingPaymentResumeContext(),
  bookingPaymentContext = readBookingPaymentContext(),
} = {}) {
  const searchParams = new URLSearchParams(search || '');
  const queryContext = normalizeContext({
    id_grupo_cita: searchParams.get('id_grupo_cita'),
    id_intent: searchParams.get('id_intent'),
    titular_email: searchParams.get('titular_email'),
  });
  const candidates = [
    queryContext,
    normalizeContext(pendingContext),
    normalizeContext(bookingPaymentContext),
  ].filter(Boolean);
  const selected = candidates[0];
  if (!selected) return null;
  const matchingEmail = candidates.find((candidate) => (
    candidate.id_grupo_cita === selected.id_grupo_cita
    && candidate.titular_email
  ))?.titular_email || '';
  return {
    id_grupo_cita: selected.id_grupo_cita,
    id_intent: selected.id_intent,
    titular_email: selected.titular_email || matchingEmail,
  };
}
