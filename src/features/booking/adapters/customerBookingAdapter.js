import {
  buildAuthenticatedHoldPayload,
  buildConfirmWithoutPaymentPayload,
} from '../../public/booking/bookingPayloadBuilders.js';
import {
  confirmClienteCitaHoldWithoutPayment,
  createClienteCitaHold,
  releaseClienteCitaHold,
} from '../../public/booking/publicBookingApi.js';
import { normalizeBookingActor } from '../core/bookingModels.js';

export function createCustomerBookingAdapter(actor = {}) {
  return Object.freeze({
    actor: normalizeBookingActor({ ...actor, type: 'customer', isAuthenticated: true }),
    createHold: createClienteCitaHold,
    releaseHold: releaseClienteCitaHold,
    confirmWithoutPayment: confirmClienteCitaHoldWithoutPayment,
    buildHoldPayload: buildAuthenticatedHoldPayload,
    buildConfirmWithoutPaymentPayload,
    requiresContact: false,
    supportsMembership: true,
    supportsRewards: true,
    writesBackend: true,
  });
}

export default createCustomerBookingAdapter;
