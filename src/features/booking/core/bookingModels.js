const ACTOR_TYPES = new Set(['guest', 'customer', 'preview', 'admin']);
const SELECTION_TYPES = new Set(['services', 'package', 'mixed']);

function safeText(value) {
  return String(value || '').trim();
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMoney(value) {
  return Number(Math.max(0, safeNumber(value)).toFixed(2));
}

function uniqueStrings(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => safeText(value))
      .filter(Boolean)
  ));
}

function resolvePackageIncludedServiceIds(pkg = null) {
  if (!pkg || typeof pkg !== 'object') return [];
  const sources = [
    pkg.items,
    pkg.servicios,
    pkg.packageServices,
  ];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    return uniqueStrings(source.map((item) => item?.id_servicio || item?.id || item));
  }
  return [];
}

export function normalizeBookingActor(actor = {}) {
  const type = ACTOR_TYPES.has(safeText(actor.type)) ? safeText(actor.type) : 'guest';
  const isAuthenticated = type === 'customer' ? true : actor.isAuthenticated === true;
  return Object.freeze({
    type,
    isAuthenticated: type === 'guest' || type === 'preview' ? false : isAuthenticated,
    customerId: safeText(actor.customerId || actor.id_cliente) || null,
    personId: safeText(actor.personId || actor.id_persona) || null,
    userId: safeText(actor.userId || actor.id_usuario) || null,
  });
}

export function normalizeBookingSelection({
  selectionType = '',
  packageId = '',
  serviceIds = [],
  selectedPackage = null,
} = {}) {
  const normalizedPackageId = safeText(packageId || selectedPackage?.id_paquete);
  const includedServiceIds = new Set(resolvePackageIncludedServiceIds(selectedPackage));
  const normalizedServiceIds = uniqueStrings(serviceIds).filter((serviceId) => !includedServiceIds.has(serviceId));
  const requestedType = safeText(selectionType).toLowerCase();
  let type = SELECTION_TYPES.has(requestedType) ? requestedType : 'services';
  if (normalizedPackageId && normalizedServiceIds.length > 0) type = 'mixed';
  else if (normalizedPackageId) type = 'package';
  else type = 'services';
  return Object.freeze({
    selectionType: type,
    packageId: type === 'services' ? null : normalizedPackageId || null,
    serviceIds: type === 'package' ? [] : normalizedServiceIds,
    includedServiceIds: Array.from(includedServiceIds),
    isComplete: type === 'package' ? Boolean(normalizedPackageId) : normalizedServiceIds.length > 0,
  });
}

export function normalizeBookingParticipant(participant = {}, index = 0) {
  const order = Math.max(1, Math.trunc(safeNumber(participant.order ?? participant.orden_integrante ?? index + 1, index + 1)));
  const contact = participant.contact || {};
  const firstName = safeText(contact.firstName || contact.nombres || participant.contactFirstName);
  const lastName = safeText(contact.lastName || contact.apellidos || participant.contactLastName);
  const fullName = safeText(contact.fullName || contact.nombre || participant.contactName || [firstName, lastName].filter(Boolean).join(' '));
  const selection = normalizeBookingSelection({
    selectionType: participant.selectionType || participant.selection_type,
    packageId: participant.packageId || participant.id_paquete,
    serviceIds: participant.serviceIds || participant.selectedServiceIdsEffective || [],
    selectedPackage: participant.selectedPackage,
  });
  return Object.freeze({
    id: safeText(participant.id) || `participant-${order}`,
    order,
    role: safeText(participant.role || participant.rol_integrante_codigo) || (order === 1 ? 'titular' : 'acompanante'),
    alias: safeText(participant.alias) || (fullName || (order === 1 ? 'Titular' : `Acompanante ${order - 1}`)),
    barberId: safeText(participant.barberId || participant.idBarbero || participant.id_barbero) || null,
    selectionType: selection.selectionType,
    packageId: selection.packageId,
    serviceIds: selection.serviceIds,
    selectedDate: safeText(participant.selectedDate || participant.fecha),
    selectedTime: safeText(participant.selectedTime || participant.hora),
    contact: Object.freeze({
      firstName,
      lastName,
      fullName,
      email: safeText(contact.email || participant.contactEmail).toLowerCase(),
      phone: safeText(contact.phone || participant.contactPhone),
    }),
  });
}

export function normalizeBookingAvailabilityQuery(query = {}) {
  const selection = normalizeBookingSelection({
    selectionType: query.selectionType || query.selection_type,
    packageId: query.packageId || query.id_paquete,
    serviceIds: query.serviceIds || query.servicios || [],
  });
  return Object.freeze({
    branchId: safeText(query.branchId || query.id_sucursal),
    barberId: safeText(query.barberId || query.id_barbero) || null,
    selectionType: selection.selectionType,
    packageId: selection.packageId,
    serviceIds: selection.serviceIds,
    dateFrom: safeText(query.dateFrom || query.fecha_desde),
    dateTo: safeText(query.dateTo || query.fecha_hasta),
    date: safeText(query.date || query.fecha),
  });
}

export function normalizeBookingCreationRequest(request = {}) {
  const participants = (Array.isArray(request.participants) ? request.participants : [])
    .map((participant, index) => normalizeBookingParticipant(participant, index));
  return Object.freeze({
    actor: normalizeBookingActor(request.actor),
    branchId: safeText(request.branchId || request.id_sucursal),
    participants,
    notes: safeText(request.notes || request.notas) || null,
    rewardContextToken: safeText(request.rewardContextToken || request.canje_context_token) || null,
  });
}

export function normalizeBookingCreationResult(result = {}) {
  return Object.freeze({
    requestId: safeText(result.requestId || result.request_id) || null,
    groupId: safeText(result.groupId || result.id_grupo_cita) || null,
    groupStatus: safeText(result.groupStatus || result.estado_grupo_codigo) || null,
    expiresAt: safeText(result.expiresAt || result.expires_at) || null,
    subtotalHnl: normalizeMoney(result.subtotalHnl ?? result.subtotal_hnl ?? result.monto_total_hnl),
    discountTotalHnl: normalizeMoney(result.discountTotalHnl ?? result.descuento_total_hnl),
    totalPayableHnl: normalizeMoney(result.totalPayableHnl ?? result.total_pagar_hnl ?? result.total_hnl),
    extrasPayableHnl: normalizeMoney(result.extrasPayableHnl ?? result.extras_a_pagar_hnl ?? result.total_pagar_hnl),
    releaseToken: safeText(result.releaseToken || result.release_token) || null,
    blocks: Array.isArray(result.blocks || result.bloques) ? (result.blocks || result.bloques) : [],
  });
}

export function applyBookingSelectionChange(participant = {}, change = {}) {
  const current = normalizeBookingParticipant(participant);
  const nextSelection = normalizeBookingSelection({
    selectionType: change.selectionType ?? current.selectionType,
    packageId: change.packageId ?? current.packageId,
    serviceIds: change.serviceIds ?? current.serviceIds,
    selectedPackage: change.selectedPackage || null,
  });
  const availabilityStillValid = change.availabilityStillValid === true;
  return Object.freeze({
    ...current,
    selectionType: nextSelection.selectionType,
    packageId: nextSelection.packageId,
    serviceIds: nextSelection.serviceIds,
    selectedDate: current.selectedDate,
    selectedTime: availabilityStillValid ? current.selectedTime : '',
  });
}

export const BOOKING_ACTOR_TYPES = Object.freeze([...ACTOR_TYPES]);
export const BOOKING_SELECTION_TYPES = Object.freeze([...SELECTION_TYPES]);
