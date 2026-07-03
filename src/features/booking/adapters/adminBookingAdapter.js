import {
  deleteAdminCitasHold,
  postAdminCitasHold,
  postAdminCitasHoldConfirmar,
  postAdminCitasHoldPaymentLink,
} from '../../admin/lib/adminCitasApi.js';
import { normalizeBookingActor } from '../core/bookingModels.js';

function unwrapResponseData(response) {
  return response?.data ?? response;
}

function withoutReleaseToken(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { release_token: _releaseToken, releaseToken: _releaseTokenCamel, ...safeValue } = value;
  return safeValue;
}

function withoutReleaseTokenOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return options;
  return {
    ...options,
    body: withoutReleaseToken(options.body),
  };
}

export function createAdminBookingAdapter(actor = {}) {
  const normalizedActor = normalizeBookingActor({ ...actor, type: 'admin', isAuthenticated: true });
  const rawRoles = Array.isArray(actor.roles) ? actor.roles : [actor.role].filter(Boolean);
  const isSuperAdmin = rawRoles.map((role) => String(role || '').toLowerCase()).includes('super_admin');
  return Object.freeze({
    actor: normalizedActor,
    createHold: async (payload, options = {}) => unwrapResponseData(await postAdminCitasHold(withoutReleaseToken(payload), options)),
    releaseHold: async (idGrupoCita, options = {}) => unwrapResponseData(await deleteAdminCitasHold(idGrupoCita, withoutReleaseTokenOptions(options))),
    confirmWithoutPayment: async (idGrupoCita, payload = {}, options = {}) => unwrapResponseData(await postAdminCitasHoldConfirmar(
      idGrupoCita,
      { ...withoutReleaseToken(payload), metodo_pago_codigo: payload?.metodo_pago_codigo || 'sin_pago' },
      options
    )),
    confirmCashPending: async (idGrupoCita, payload = {}, options = {}) => unwrapResponseData(await postAdminCitasHoldConfirmar(
      idGrupoCita,
      { ...withoutReleaseToken(payload), metodo_pago_codigo: 'efectivo' },
      options
    )),
    createPaymentLink: async (idGrupoCita, payload = {}, options = {}) => unwrapResponseData(await postAdminCitasHoldPaymentLink(idGrupoCita, withoutReleaseToken(payload), options)),
    requiresContact: false,
    supportsMembership: true,
    supportsRewards: true,
    supportsAutomaticPromotions: true,
    supportsPromotions: true,
    supportsManualPromotion: isSuperAdmin,
    supportsCourtesy: isSuperAdmin,
    supportsCashPending: true,
    supportsPaymentLink: true,
    writesBackend: true,
  });
}

export default createAdminBookingAdapter;
