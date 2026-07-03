import {
  normalizeBookingCreationRequest,
  normalizeBookingCreationResult,
} from './bookingModels.js';

export function toCanonicalBookingCreationRequest(request = {}) {
  return normalizeBookingCreationRequest(request);
}

export function fromCanonicalBookingCreationResult(result = {}) {
  return normalizeBookingCreationResult(result);
}
