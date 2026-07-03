import guestBookingAdapter from './guestBookingAdapter.js';
import createCustomerBookingAdapter from './customerBookingAdapter.js';
import previewBookingAdapter from './previewBookingAdapter.js';

export function resolveBookingAdapter({ mode, actor } = {}) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (normalizedMode === 'authenticated' || normalizedMode === 'customer') {
    return createCustomerBookingAdapter(actor);
  }
  if (normalizedMode === 'preview') {
    return previewBookingAdapter;
  }
  return guestBookingAdapter;
}

export default resolveBookingAdapter;
