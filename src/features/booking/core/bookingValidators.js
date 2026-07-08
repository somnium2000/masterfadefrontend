export function validateBookingCreationRequest(request = {}) {
  const errors = [];
  if (!request?.branchId) errors.push({ code: 'BOOKING_BRANCH_REQUIRED', field: 'branchId' });
  if (!Array.isArray(request?.participants) || request.participants.length === 0) {
    errors.push({ code: 'BOOKING_PARTICIPANTS_REQUIRED', field: 'participants' });
  }
  (Array.isArray(request?.participants) ? request.participants : []).forEach((participant, index) => {
    if (!participant?.selectionType) errors.push({ code: 'BOOKING_SELECTION_REQUIRED', field: `participants[${index}].selectionType` });
    if (!participant?.selectedDate) errors.push({ code: 'BOOKING_DATE_REQUIRED', field: `participants[${index}].selectedDate` });
    if (!participant?.selectedTime) errors.push({ code: 'BOOKING_TIME_REQUIRED', field: `participants[${index}].selectedTime` });
    if (!participant?.barberId) errors.push({ code: 'BOOKING_BARBER_REQUIRED', field: `participants[${index}].barberId` });
  });
  return Object.freeze({
    ok: errors.length === 0,
    errors,
  });
}

export function hasParticipantScheduleConflict(participants = []) {
  const seen = new Set();
  for (const participant of Array.isArray(participants) ? participants : []) {
    const key = [participant?.barberId, participant?.selectedDate, participant?.selectedTime].join('|');
    if (!participant?.barberId || !participant?.selectedDate || !participant?.selectedTime) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
