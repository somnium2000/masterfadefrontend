import {
  buildPublicHoldPayload,
  buildReleaseHoldPayload,
} from '../../public/booking/bookingPayloadBuilders.js';
import {
  createPublicCitaHold,
  releasePublicCitaHold,
} from '../../public/booking/publicBookingApi.js';
import { normalizeBookingActor } from '../core/bookingModels.js';

export const guestBookingAdapter = Object.freeze({
  actor: normalizeBookingActor({ type: 'guest' }),
  createHold: createPublicCitaHold,
  releaseHold(groupId, releaseToken) {
    return releasePublicCitaHold(groupId, releaseToken);
  },
  buildHoldPayload: buildPublicHoldPayload,
  buildReleasePayload: buildReleaseHoldPayload,
  requiresContact: true,
  supportsMembership: false,
  supportsRewards: false,
  writesBackend: true,
});

export default guestBookingAdapter;
