const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function operationalDay(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function compareAppointmentStart(left, right) {
  const difference = new Date(left.inicio_at).getTime() - new Date(right.inicio_at).getTime();
  if (difference) return difference;
  const a = String(left.id_cita || ''), b = String(right.id_cita || '');
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareAppointmentHistory(left, right) {
  return compareAppointmentStart(right, left);
}
