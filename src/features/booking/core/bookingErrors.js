export const BOOKING_ERROR_CODES = Object.freeze({
  branchRequired: 'BOOKING_BRANCH_REQUIRED',
  participantsRequired: 'BOOKING_PARTICIPANTS_REQUIRED',
  selectionRequired: 'BOOKING_SELECTION_REQUIRED',
  dateRequired: 'BOOKING_DATE_REQUIRED',
  timeRequired: 'BOOKING_TIME_REQUIRED',
  barberRequired: 'BOOKING_BARBER_REQUIRED',
  scheduleConflict: 'BOOKING_SCHEDULE_CONFLICT',
});

export function createBookingError(code, message, details = {}) {
  const error = new Error(message || code);
  error.code = code;
  error.details = details;
  return error;
}
