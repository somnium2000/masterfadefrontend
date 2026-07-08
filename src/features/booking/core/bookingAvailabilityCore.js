import { ALL_TIME_SLOTS, buildTimeSlots } from '../../public/booking/bookingUtils.js';

function safeText(value) {
  return String(value || '').trim();
}

export function hasBookingSelection({ selectionType, packageId, servicesCsv } = {}) {
  const type = safeText(selectionType).toLowerCase();
  const hasPackage = Boolean(safeText(packageId));
  const hasServices = Boolean(safeText(servicesCsv));
  if (type === 'package') return hasPackage;
  if (type === 'mixed') return hasPackage || hasServices;
  return hasServices;
}

export function buildBookingAvailabilityParams({
  branchId,
  barberId,
  selectionType,
  packageId,
  servicesCsv,
  dateFrom,
  dateTo,
  date,
} = {}) {
  const type = safeText(selectionType) || 'services';
  return {
    id_sucursal: safeText(branchId),
    id_barbero: safeText(barberId) || undefined,
    selection_type: type,
    servicios: ['services', 'mixed'].includes(type) ? safeText(servicesCsv) || undefined : undefined,
    id_paquete: ['package', 'mixed'].includes(type) ? safeText(packageId) || undefined : undefined,
    fecha_desde: safeText(dateFrom) || undefined,
    fecha_hasta: safeText(dateTo) || undefined,
    fecha: safeText(date) || undefined,
  };
}

export function normalizeBookingAvailabilityMap(response) {
  const payload = response?.data ?? response;
  const list = Array.isArray(payload?.disponibilidad) ? payload.disponibilidad : [];
  return list.reduce((acc, item) => {
    if (item?.fecha) acc[item.fecha] = item;
    return acc;
  }, {});
}

export function buildPreviewDefaultSlots() {
  return ALL_TIME_SLOTS.map((hora) => ({ hora, disponible: false }));
}

function normalizeHourMinute(value) {
  const normalized = safeText(value);
  const match = normalized.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

export function buildPreviewSlotsFromResponse(response) {
  const payload = response?.data ?? response;
  const list = Array.isArray(payload?.horarios) ? payload.horarios : [];
  const availableTimes = new Set(list.map((slot) => normalizeHourMinute(slot?.hora)).filter(Boolean));
  const start = normalizeHourMinute(payload?.hora_inicio);
  const end = normalizeHourMinute(payload?.hora_fin);
  const rangeSlots = start && end ? buildTimeSlots(start, end) : ALL_TIME_SLOTS;
  return rangeSlots.map((hora) => ({
    hora,
    disponible: availableTimes.has(hora),
  }));
}

export async function loadBookingAvailability({ requestAvailability, params, signal } = {}) {
  if (typeof requestAvailability !== 'function') {
    throw new Error('BOOKING_AVAILABILITY_REQUEST_REQUIRED');
  }
  const response = await requestAvailability(params, signal ? { signal } : {});
  return normalizeBookingAvailabilityMap(response);
}

export async function loadBookingSlots({ requestSlots, params, signal } = {}) {
  if (typeof requestSlots !== 'function') {
    throw new Error('BOOKING_SLOTS_REQUEST_REQUIRED');
  }
  const response = await requestSlots(params, signal ? { signal } : {});
  return buildPreviewSlotsFromResponse(response);
}

export function findBookingBlockCollision({ blocks, barberId, dateKey, timeKey, ignoreIndex } = {}) {
  if (!barberId || !dateKey || !timeKey) return null;
  return (Array.isArray(blocks) ? blocks : []).find((block) =>
    block.index !== ignoreIndex
    && block.idBarbero === barberId
    && block.selectedDate === dateKey
    && block.selectedTime === timeKey) || null;
}

export async function buildBarberSlotSuggestions({
  barbers,
  excludedBarberId,
  timeKey,
  fetchSlotsForBarber,
} = {}) {
  if (!timeKey || typeof fetchSlotsForBarber !== 'function') return [];
  const barberCandidates = (Array.isArray(barbers) ? barbers : [])
    .filter((barber) => barber?.id_empleado && barber.id_empleado !== excludedBarberId);
  const results = await Promise.all(
    barberCandidates.map(async (barber) => {
      try {
        const barberSlots = await fetchSlotsForBarber(barber);
        const isAvailable = barberSlots.some((slot) => slot.hora === timeKey && slot.disponible);
        if (!isAvailable) return null;
        return {
          idBarbero: barber.id_empleado,
          nombreBarbero: barber.nombre_completo || 'Barbero',
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}
