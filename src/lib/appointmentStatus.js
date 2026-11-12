const APPOINTMENT_LABELS = Object.freeze({
  en_espera: 'En espera',
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  en_salon: 'En salón',
  en_atencion: 'En atención',
  completada: 'Completada',
  cancelada: 'Cancelada',
  cancelada_por_cliente: 'Cancelada por el cliente',
  expirada: 'Expirada',
  no_show: 'No asistió',
  anulada: 'Anulada',
});

// AM: Solo presentación; conservar el código original en filtros, peticiones y operaciones.
export function getAppointmentStatusLabel(code, { metric = false } = {}) {
  const normalized = String(code || '').trim().toLowerCase();
  if (metric && normalized === 'no_show') return 'Inasistencias';
  return Object.hasOwn(APPOINTMENT_LABELS, normalized) ? APPOINTMENT_LABELS[normalized] : 'Sin registrar';
}
