import guestBookingAdapter from './guestBookingAdapter.js';
import createCustomerBookingAdapter from './customerBookingAdapter.js';
import previewBookingAdapter from './previewBookingAdapter.js';
import createAdminBookingAdapter from './adminBookingAdapter.js';

export function resolveBookingAdapter({ mode, actor } = {}) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (normalizedMode === 'authenticated' || normalizedMode === 'customer') {
    return createCustomerBookingAdapter(actor);
  }
  if (normalizedMode === 'preview') {
    return previewBookingAdapter;
  }
  if (normalizedMode === 'admin' || normalizedMode === 'assisted_admin') {
    return createAdminBookingAdapter(actor);
  }
  return guestBookingAdapter;
}

export default resolveBookingAdapter;
