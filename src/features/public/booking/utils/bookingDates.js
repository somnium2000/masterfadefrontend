import {
  addMinutesToTimeKey,
  timeKeyToMinutes,
} from '../bookingUtils.js';

export function buildDefaultSlots() {
  return [];
}

export function normalizeHourMinute(value) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

export function mapDynamicSlot(slot, fallbackVisibleDurationMinutes = 0) {
  const hora = normalizeHourMinute(slot?.hora);
  if (!hora) return null;
  const visibleDurationMinutes = Math.max(
    Number(slot?.duracion_visible_min ?? fallbackVisibleDurationMinutes),
    0
  );
  const horaFinVisible = normalizeHourMinute(slot?.hora_fin_visible)
    || addMinutesToTimeKey(hora, visibleDurationMinutes)
    || hora;
  return {
    hora,
    horaFin: horaFinVisible,
    disponible: Boolean(slot?.disponible ?? true),
    duracionVisibleMin: visibleDurationMinutes,
  };
}

export function buildDynamicSlots({
  horarios,
  duracionTotalMin,
}) {
  const list = Array.isArray(horarios) ? horarios : [];
  const fallbackVisibleDurationMinutes = Math.max(Number(duracionTotalMin || 0), 0);
  return list
    .map((slot) => mapDynamicSlot(slot, fallbackVisibleDurationMinutes))
    .filter(Boolean)
    .sort((left, right) => {
      const leftMin = timeKeyToMinutes(left.hora) ?? 0;
      const rightMin = timeKeyToMinutes(right.hora) ?? 0;
      return leftMin - rightMin;
    });
}

export function createEmptyCuratedSlots() {
  return {
    manana: {
      recommended: null,
      alternatives: [],
      overflow: [],
      has_more: false,
      total: 0,
    },
    tarde: {
      recommended: null,
      alternatives: [],
      overflow: [],
      has_more: false,
      total: 0,
    },
    noche: {
      recommended: null,
      alternatives: [],
      overflow: [],
      has_more: false,
      total: 0,
    },
  };
}

export function mapCuratedPeriod(rawPeriod, fallbackVisibleDurationMinutes) {
  const recommended = mapDynamicSlot(rawPeriod?.recommended, fallbackVisibleDurationMinutes);
  const alternatives = (Array.isArray(rawPeriod?.alternatives) ? rawPeriod.alternatives : [])
    .map((slot) => mapDynamicSlot(slot, fallbackVisibleDurationMinutes))
    .filter(Boolean);
  const overflow = (Array.isArray(rawPeriod?.overflow) ? rawPeriod.overflow : [])
    .map((slot) => mapDynamicSlot(slot, fallbackVisibleDurationMinutes))
    .filter(Boolean);
  const total = Number(rawPeriod?.total ?? (
    (recommended ? 1 : 0) + alternatives.length + overflow.length
  ));
  return {
    recommended,
    alternatives,
    overflow,
    has_more: Boolean(rawPeriod?.has_more ?? overflow.length > 0),
    total: Number.isFinite(total) ? total : 0,
  };
}

export function buildCuratedSlots({
  horariosCurados,
  horarios,
  duracionTotalMin,
}) {
  const fallbackVisibleDurationMinutes = Math.max(Number(duracionTotalMin || 0), 0);
  const safeCurated = horariosCurados && typeof horariosCurados === 'object'
    ? horariosCurados
    : null;

  if (safeCurated) {
    const base = createEmptyCuratedSlots();
    Object.keys(base).forEach((periodKey) => {
      base[periodKey] = mapCuratedPeriod(safeCurated?.[periodKey], fallbackVisibleDurationMinutes);
    });
    return base;
  }

  const mapped = buildDynamicSlots({ horarios, duracionTotalMin });
  const grouped = {
    manana: [],
    tarde: [],
    noche: [],
  };
  mapped.forEach((slot) => {
    const minutes = timeKeyToMinutes(slot?.hora);
    if (minutes == null) return;
    if (minutes >= 6 * 60 && minutes < 12 * 60) {
      grouped.manana.push(slot);
      return;
    }
    if (minutes >= 12 * 60 && minutes < 18 * 60) {
      grouped.tarde.push(slot);
      return;
    }
    grouped.noche.push(slot);
  });

  const fallbackCurated = createEmptyCuratedSlots();
  Object.keys(grouped).forEach((periodKey) => {
    const ordered = grouped[periodKey];
    const recommended = ordered[0] || null;
    const alternatives = ordered.slice(1, 4);
    const overflow = ordered.slice(4);
    fallbackCurated[periodKey] = {
      recommended,
      alternatives,
      overflow,
      has_more: overflow.length > 0,
      total: ordered.length,
    };
  });
  return fallbackCurated;
}

export function rangesOverlap(leftStart, leftDurationMin, rightStart, rightDurationMin) {
  const leftMinutes = timeKeyToMinutes(leftStart);
  const rightMinutes = timeKeyToMinutes(rightStart);
  const safeLeftDuration = Number(leftDurationMin || 0);
  const safeRightDuration = Number(rightDurationMin || 0);
  if (leftMinutes == null || rightMinutes == null || safeLeftDuration <= 0 || safeRightDuration <= 0) {
    return false;
  }
  const leftEnd = leftMinutes + safeLeftDuration;
  const rightEnd = rightMinutes + safeRightDuration;
  return leftMinutes < rightEnd && rightMinutes < leftEnd;
}

export function getBookingBlockOccupiedRange(blockSummary) {
  const startMinutes = timeKeyToMinutes(blockSummary?.selectedTime);
  const visibleDurationMin = Math.max(
    Number(
      blockSummary?.duracion_servicios_min
      ?? blockSummary?.duracion_visible_min
      ?? 0
    ),
    0
  );
  const bufferMin = Math.max(Number(blockSummary?.buffer_total_min || 0), 0);
  const explicitOccupiedDurationMin = Math.max(Number(blockSummary?.duracion_bloque_min || 0), 0);
  const occupiedDurationMin = explicitOccupiedDurationMin > 0
    ? explicitOccupiedDurationMin
    : visibleDurationMin + bufferMin;

  if (startMinutes == null || occupiedDurationMin <= 0) {
    return null;
  }

  return {
    startMinutes,
    endMinutes: startMinutes + occupiedDurationMin,
    visibleEndMinutes: startMinutes + visibleDurationMin,
    bufferMin,
    occupiedDurationMin,
  };
}
