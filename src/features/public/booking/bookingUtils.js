const SERVICE_SPECIALTIES = [
  'Fade y Degradado',
  'Diseno y Barba',
  'Corte Clasico y Afeitado',
  'Urban y Street Style',
  'Perfilado Premium',
];

const BARBER_GRADIENTS = [
  'linear-gradient(145deg, #4e3c2a 0%, #8b6a4a 100%)',
  'linear-gradient(145deg, #2f3f4f 0%, #5c7998 100%)',
  'linear-gradient(145deg, #3f3a38 0%, #73655c 100%)',
  'linear-gradient(145deg, #3a4d66 0%, #6d8eb8 100%)',
  'linear-gradient(145deg, #4d3543 0%, #8f5f7d 100%)',
];

export const WEEK_DAYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
export const MAX_COMPANIONS = 4;
export const MAX_PROMOTIONS_PER_BOOKING = 5;
export const HONDURAS_TIME_ZONE = 'America/Tegucigalpa';
export const HONDURAS_UTC_OFFSET = '-06:00';

export function extractMessage(err) {
  if (err?.expectedUnauthenticated) return '';
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

const PUBLIC_BOOKING_ERROR_MESSAGES = {
  EMAIL_BELONGS_TO_ACTIVE_USER: 'Este correo ya pertenece a una cuenta activa. Inicia sesión para continuar.',
  PUBLIC_CITAS_EMAIL_IN_USE: 'Este correo ya pertenece a una cuenta activa. Inicia sesión para continuar.',
  AUTHENTICATED_HOLDER_MISMATCH: 'La información del titular no coincide con la sesión activa.',
  AUTHENTICATED_USER_CANNOT_BE_COMPANION: 'El titular de la sesión no puede agregarse como acompañante.',
  BOOKING_AUTH_CONTEXT_INVALID: 'No fue posible validar la sesión para completar la reserva.',
  MAX_COMPANIONS_EXCEEDED: 'Has superado el máximo de acompañantes permitido.',
  EMPTY_BOOKING_SELECTION: 'Debes seleccionar al menos un servicio o paquete.',
  DUPLICATED_SERVICE_SELECTION: 'Hay servicios seleccionados más de una vez.',
  ONLY_ONE_PACKAGE_ALLOWED: 'Solo se permite un paquete por cita.',
  PACKAGE_NOT_AVAILABLE: 'El paquete seleccionado no está disponible.',
  SERVICE_ALREADY_INCLUDED_IN_PACKAGE: 'Uno de los servicios seleccionados ya está incluido en el paquete.',
  MIXED_SELECTION_NOT_ALLOWED: 'La selección mixta no está disponible en este momento.',
  MAX_PROMOTIONS_EXCEEDED: 'Has seleccionado más promociones de las permitidas.',
  PROMOTION_NOT_APPLICABLE: 'La promoción seleccionada no aplica a esta reserva.',
  PROMOTION_DUPLICATES_SELECTED_ITEM: 'La promoción duplica un servicio o paquete ya incluido.',
  PROMOTION_NOT_STACKABLE: 'Estas promociones no pueden combinarse.',
  PROMOTION_EXPIRED: 'La promoción seleccionada ya no está disponible.',
  PROMOTION_NOT_ACTIVE: 'La promoción seleccionada no está activa actualmente.',
  PROMOTION_BRANCH_NOT_ALLOWED: 'La promoción seleccionada no aplica en esta sucursal.',
  PROMOTION_BARBER_NOT_ALLOWED: 'La promoción seleccionada no aplica para este barbero.',
  PROMOTION_SCHEDULE_NOT_ALLOWED: 'La promoción seleccionada no aplica en este horario.',
  BOOKING_PROMOTION_APPLICATION_FAILED: 'No fue posible aplicar una de las promociones seleccionadas.',
  REDEEM_NOT_APPLICABLE: 'El canje seleccionado no aplica a esta reserva.',
  REDEEM_CONTEXT_INVALID: 'No fue posible validar el canje seleccionado.',
  REDEEM_TRANSACTION_NOT_FOUND: 'No fue posible validar el canje seleccionado.',
  REDEEM_NOT_OWNED_BY_USER: 'El canje seleccionado no pertenece a tu sesión.',
  REDEEM_EXPIRED: 'El canje seleccionado ya no está disponible.',
  REDEEM_TRANSACTION_ALREADY_USED: 'El canje seleccionado ya fue utilizado.',
  REDEEM_AMOUNT_INVALID: 'No fue posible calcular el beneficio del canje.',
  REDEEM_APPLICATION_FAILED: 'No fue posible aplicar el canje seleccionado.',
  BOOKING_REDEEM_CONSISTENCY_FAILED: 'No fue posible completar la reserva con el canje seleccionado.',
  SLOT_NOT_AVAILABLE: 'La hora seleccionada ya no está disponible. Elige otra hora.',
  BOOKING_RECEIPT_CREATION_FAILED: 'No fue posible generar el comprobante de la reserva.',
  BOOKING_CREATION_FAILED: 'No fue posible completar la reserva. Intenta nuevamente.',
};

export function mapPublicBookingErrorMessage(code, fallbackMessage = '') {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (normalizedCode && PUBLIC_BOOKING_ERROR_MESSAGES[normalizedCode]) {
    return PUBLIC_BOOKING_ERROR_MESSAGES[normalizedCode];
  }
  const safeFallback = String(fallbackMessage || '').trim();
  if (safeFallback) return safeFallback;
  return 'No fue posible completar la reserva. Intenta nuevamente.';
}

export function normalizePromotionIds(promotionIds, promotionId = '') {
  const unique = new Set();
  if (Array.isArray(promotionIds)) {
    promotionIds.forEach((value) => {
      const id = String(value || '').trim();
      if (id) unique.add(id);
    });
  }
  const legacy = String(promotionId || '').trim();
  if (legacy) unique.add(legacy);
  return [...unique];
}

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatMonth(date) {
  return new Intl.DateTimeFormat('es-HN', { month: 'long', year: 'numeric' }).format(date).toUpperCase();
}

export function formatFriendlyDate(dateKey) {
  if (!dateKey) return 'Sin fecha';
  const value = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat('es-HN', { weekday: 'short', day: 'numeric', month: 'long' }).format(value);
}

export function formatDateOnly(dateKey) {
  if (!dateKey) return '';
  return new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(`${dateKey}T00:00:00`)
  );
}

function getTimeZoneDateParts(dateValue, timeZone = HONDURAS_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(dateValue);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function getTimeZoneTimeParts(dateValue, timeZone = HONDURAS_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(dateValue);
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  if (!hour || !minute) return null;
  return { hour, minute };
}

export function getTodayDateKeyInTimeZone(timeZone = HONDURAS_TIME_ZONE) {
  const parts = getTimeZoneDateParts(new Date(), timeZone);
  if (!parts) return toDateKey(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getCurrentTimeKeyInTimeZone(timeZone = HONDURAS_TIME_ZONE) {
  const parts = getTimeZoneTimeParts(new Date(), timeZone);
  if (!parts) return '00:00';
  return `${parts.hour}:${parts.minute}`;
}

export function toMonthStartFromDateKey(dateKey) {
  const normalized = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month] = normalized.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return new Date(year, month - 1, 1);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildCalendarCells(monthBase) {
  const year = monthBase.getFullYear();
  const month = monthBase.getMonth();
  const first = new Date(year, month, 1);
  const offset = first.getDay();
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }).map((_, index) => {
    const cellDate = addDays(start, index);
    return {
      key: toDateKey(cellDate),
      label: cellDate.getDate(),
      inMonth: cellDate.getMonth() === month,
    };
  });
}

export function buildTimeSlots(start = '08:00', end = '18:30', stepMin = 30) {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const slots = [];
  const pointer = new Date();
  pointer.setHours(startHour, startMinute, 0, 0);
  const limit = new Date();
  limit.setHours(endHour, endMinute, 0, 0);

  while (pointer.getTime() <= limit.getTime()) {
    const hh = String(pointer.getHours()).padStart(2, '0');
    const mm = String(pointer.getMinutes()).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
    pointer.setMinutes(pointer.getMinutes() + stepMin);
  }

  return slots;
}

export const ALL_TIME_SLOTS = buildTimeSlots();

export function timeKeyToMinutes(timeKey) {
  const normalized = String(timeKey || '').trim();
  const match = normalized.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}

export function minutesToTimeKey(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return null;
  const normalized = ((Math.trunc(totalMinutes) % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function addMinutesToTimeKey(timeKey, minutesToAdd) {
  const baseMinutes = timeKeyToMinutes(timeKey);
  if (baseMinutes == null || !Number.isFinite(Number(minutesToAdd))) return null;
  return minutesToTimeKey(baseMinutes + Number(minutesToAdd));
}

function hashString(value) {
  let hash = 0;
  const source = String(value || '');
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getBarberMeta(barber) {
  const base = `${barber?.id_empleado || ''}${barber?.nombre_completo || ''}`;
  const hash = hashString(base);
  return {
    specialty: SERVICE_SPECIALTIES[hash % SERVICE_SPECIALTIES.length],
    years: 4 + (hash % 7),
    gradient: BARBER_GRADIENTS[hash % BARBER_GRADIENTS.length],
  };
}

export function getInitials(name) {
  const parts = String(name || '')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'MF';
  return parts.map((item) => item[0]?.toUpperCase() || '').join('');
}

export function formatCurrencyHnl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'L. 0.00';
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', minimumFractionDigits: 2 }).format(amount);
}

export function formatTime12Hour(rawTime) {
  const normalized = String(rawTime || '').trim();
  const match = normalized.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return normalized;

  const hour24 = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return normalized;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minute} ${period}`;
}

export function buildBookingShortCode(value, length = 5) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'N/A';
  const safeLength = Math.max(3, Math.min(5, Number(length) || 5));
  const maxValue = 36 ** safeLength;
  const hashed = hashString(normalized) % maxValue;
  return hashed
    .toString(36)
    .toUpperCase()
    .padStart(safeLength, '0')
    .slice(-safeLength);
}

export function formatDurationHuman(totalMinutes) {
  const safeMinutes = Math.max(Number(totalMinutes || 0), 0);
  if (!Number.isFinite(safeMinutes)) return '0 min';
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function getServiceDurationLabel(service) {
  return `${Number(service?.duracion_min || 0)} min`;
}

export function buildAppointmentSelectionSummary({
  selectedPackage = null,
  selectedServices = [],
  packages = [],
  services = [],
} = {}) {
  const servicesList = Array.isArray(services) ? services : [];
  const packagesList = Array.isArray(packages) ? packages : [];

  const servicesById = new Map();
  servicesList.forEach((service) => {
    const id = String(service?.id_servicio || '').trim();
    if (!id) return;
    servicesById.set(id, service);
  });

  const packagesById = new Map();
  packagesList.forEach((pkg) => {
    const id = String(pkg?.id_paquete || '').trim();
    if (!id) return;
    packagesById.set(id, pkg);
  });

  const conflicts = [];
  const packageCandidates = Array.isArray(selectedPackage)
    ? selectedPackage
    : [selectedPackage];
  const normalizedPackageCandidates = Array.from(
    new Set(
      packageCandidates
        .map((entry) => {
          if (!entry) return '';
          if (typeof entry === 'string') return String(entry).trim();
          return String(entry?.id_paquete || '').trim();
        })
        .filter(Boolean)
    )
  );

  if (normalizedPackageCandidates.length > 1) {
    conflicts.push({
      code: 'ONLY_ONE_PACKAGE_ALLOWED',
      message: 'Solo puedes seleccionar un paquete por cita',
      packageIds: normalizedPackageCandidates,
    });
  }

  const selectedPackageId = normalizedPackageCandidates[0] || '';
  const selectedPackageEntity = selectedPackageId
    ? packagesById.get(selectedPackageId) || null
    : null;

  const packageItems = Array.isArray(selectedPackageEntity?.items)
    ? selectedPackageEntity.items
    : [];
  const includedServiceIdsFromPackage = Array.from(
    new Set(
      packageItems
        .map((item) => String(item?.id_servicio || '').trim())
        .filter(Boolean)
    )
  );
  const blockedServiceIds = includedServiceIdsFromPackage;
  const blockedServiceSet = new Set(blockedServiceIds);

  const selectedServiceIds = Array.from(
    new Set(
      (Array.isArray(selectedServices) ? selectedServices : [])
        .map((entry) => {
          if (!entry) return '';
          if (typeof entry === 'string') return String(entry).trim();
          return String(entry?.id_servicio || '').trim();
        })
        .filter(Boolean)
    )
  );

  const selectedServicesResolved = selectedServiceIds
    .map((serviceId) => servicesById.get(serviceId))
    .filter(Boolean);
  const selectedServicesEffective = selectedServicesResolved.filter(
    (service) => !blockedServiceSet.has(String(service?.id_servicio || '').trim())
  );
  const selectedServiceIdsEffective = selectedServicesEffective
    .map((service) => String(service?.id_servicio || '').trim())
    .filter(Boolean);

  const includedServiceConflicts = selectedServiceIds.filter((serviceId) => blockedServiceSet.has(serviceId));
  if (includedServiceConflicts.length > 0) {
    conflicts.push({
      code: 'SERVICE_ALREADY_INCLUDED_IN_PACKAGE',
      message: 'Ese servicio ya lo incluye el paquete seleccionado',
      serviceIds: includedServiceConflicts,
    });
  }

  const packageDurationMin = packageItems.reduce((total, item) => {
    const serviceId = String(item?.id_servicio || '').trim();
    const service = servicesById.get(serviceId);
    const qty = Math.max(1, Number(item?.cantidad || 1));
    return total + (Number(service?.duracion_min || 0) * qty);
  }, 0);
  const packagePriceFallback = packageItems.reduce((total, item) => {
    const serviceId = String(item?.id_servicio || '').trim();
    const service = servicesById.get(serviceId);
    const qty = Math.max(1, Number(item?.cantidad || 1));
    return total + (Number(service?.precio_hnl || 0) * qty);
  }, 0);
  const packagePrice = Number.isFinite(Number(selectedPackageEntity?.precio_hnl))
    ? Number(selectedPackageEntity?.precio_hnl || 0)
    : packagePriceFallback;

  const servicesPrice = selectedServicesEffective.reduce(
    (total, service) => total + Number(service?.precio_hnl || 0),
    0
  );
  const servicesDurationMin = selectedServicesEffective.reduce(
    (total, service) => total + Number(service?.duracion_min || 0),
    0
  );

  return {
    selectedPackage: selectedPackageEntity,
    selectedServicesEffective,
    selectedServiceIdsEffective,
    blockedServiceIds,
    totalPrice: packagePrice + servicesPrice,
    totalDurationMin: packageDurationMin + servicesDurationMin,
    includedServiceIdsFromPackage,
    conflicts,
  };
}

export function toLocalDateTimeWithOffset(dateValue, timeValue) {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();
  if (!date || !time) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;

  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const [hour, minute, second] = normalizedTime.split(':').map(Number);
  const [year, month, day] = date.split('-').map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  const isSameDate = parsedDate.getUTCFullYear() === year
    && parsedDate.getUTCMonth() === month - 1
    && parsedDate.getUTCDate() === day;
  if (!isSameDate) return null;

  return `${date}T${normalizedTime}${HONDURAS_UTC_OFFSET}`;
}

export function sanitizePhoneInput(rawValue) {
  const cleaned = String(rawValue || '').replace(/[^\d+\s-]/g, '').slice(0, 24);
  let hasPlus = false;
  return cleaned
    .split('')
    .filter((char, index) => {
      if (char !== '+') return true;
      if (index === 0 && !hasPlus) {
        hasPlus = true;
        return true;
      }
      return false;
    })
    .join('');
}

export function countPhoneDigits(rawValue) {
  return String(rawValue || '').replace(/\D/g, '').length;
}

export function normalizePhone(rawValue) {
  const sanitized = sanitizePhoneInput(rawValue);
  const hasLeadingPlus = sanitized.startsWith('+');
  const digits = sanitized.replace(/\D/g, '').slice(0, hasLeadingPlus ? 19 : 20);
  return `${hasLeadingPlus ? '+' : ''}${digits}`;
}

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripUnsupportedPersonNameChars(value) {
  return String(value || '').replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, '');
}

function toTitleCaseToken(token) {
  return token
    .split(/([-'])/)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      if (!part) return '';
      const lower = part.toLocaleLowerCase('es-HN');
      return `${lower.charAt(0).toLocaleUpperCase('es-HN')}${lower.slice(1)}`;
    })
    .join('');
}

export function sanitizePersonNameInput(value) {
  return stripUnsupportedPersonNameChars(value)
    .replace(/\s{2,}/g, ' ')
    .slice(0, 20);
}

export function normalizePersonNameForValidation(value) {
  const normalized = collapseWhitespace(sanitizePersonNameInput(value));
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((token) => toTitleCaseToken(token))
    .join(' ');
}

export function normalizePersonName(value) {
  const normalized = collapseWhitespace(stripUnsupportedPersonNameChars(value));
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((token) => toTitleCaseToken(token))
    .join(' ');
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function buildFullName(firstName, lastName) {
  return [normalizePersonName(firstName), normalizePersonName(lastName)]
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function splitFullName(fullName) {
  const normalized = normalizePersonName(fullName);
  if (!normalized) {
    return {
      firstName: '',
      lastName: '',
    };
  }

  const parts = normalized.split(' ');
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: '',
    };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export function getTitularState(user) {
  const isAuthenticated = Boolean(String(user?.id_usuario || '').trim());
  const nombres = normalizePersonNameForValidation(user?.nombres || '');
  const apellidos = normalizePersonNameForValidation(user?.apellidos || '');
  const telefonoPrincipal = normalizePhone(user?.telefono_principal || '');
  const telefonoPrincipalDigits = countPhoneDigits(telefonoPrincipal);

  const missingFields = [];
  if (isAuthenticated) {
    if (!nombres) missingFields.push('nombres');
    if (!apellidos) missingFields.push('apellidos');
    if (telefonoPrincipalDigits < 8) missingFields.push('telefono_principal');
  }

  const hasFullProfile = isAuthenticated && missingFields.length === 0;

  return {
    isAuthenticated,
    hasFullProfile,
    missingFields,
    shouldRenderForm: !isAuthenticated || !hasFullProfile,
    shouldBlockAdvance: !isAuthenticated || missingFields.length > 0,
    profile: {
      nombres,
      apellidos,
      email: normalizeEmail(user?.email || ''),
      telefono_principal: telefonoPrincipalDigits >= 8 ? telefonoPrincipal : '',
    },
  };
}

function firstUsableAmount(values) {
  let fallback = 0;
  for (const value of values) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) continue;
    if (amount > 0) return amount;
    fallback = amount;
  }
  return fallback;
}

export function normalizeBookingPaymentUiState({
  paymentIntent = null,
  paymentResult = null,
  bookingSuccessResult = null,
  holdTotalToPay = null,
  totalToPay = null,
} = {}) {
  const effectivePaymentResult = (
    bookingSuccessResult?.paymentResult
    && typeof bookingSuccessResult.paymentResult === 'object'
  )
    ? bookingSuccessResult.paymentResult
    : paymentResult;
  const noPaymentSuccess = ['membership_no_payment', 'reward_no_payment'].includes(
    String(bookingSuccessResult?.source || '').trim().toLowerCase()
  );
  const bookingConfirmed = noPaymentSuccess
    || bookingSuccessResult?.booking_confirmed === true
    || bookingSuccessResult?.paymentResult?.booking_confirmed === true
    || paymentResult?.booking_confirmed === true;
  const rawState = String(
    effectivePaymentResult?.estado_intent_codigo
    || effectivePaymentResult?.status
    || paymentIntent?.estado_intent_codigo
    || ''
  ).trim().toLowerCase();
  const amount = firstUsableAmount([
    effectivePaymentResult?.total_pagado_hnl,
    bookingSuccessResult?.total_pagado_hnl,
    effectivePaymentResult?.total_hnl,
    bookingSuccessResult?.total_hnl,
    effectivePaymentResult?.monto_hnl,
    bookingSuccessResult?.monto_hnl,
    paymentIntent?.monto_hnl,
    holdTotalToPay,
    totalToPay,
    0,
  ]);

  if (bookingConfirmed) {
    const confirmedAmount = noPaymentSuccess
      ? firstUsableAmount([
        effectivePaymentResult?.total_pagado_hnl,
        bookingSuccessResult?.total_pagado_hnl,
        0,
      ])
      : amount;
    return {
      status: 'confirmed',
      text: 'Reserva confirmada',
      paymentLabel: noPaymentSuccess
        ? (bookingSuccessResult?.estado_pago || 'Cubierto por plan')
        : 'pagado',
      totalPagadoHnl: confirmedAmount,
      bookingConfirmed: true,
    };
  }
  if (['confirmado', 'pagado', 'paid', 'capturado', 'capturada'].includes(rawState)) {
    return {
      status: 'paid',
      text: 'Pago confirmado',
      paymentLabel: 'pagado',
      totalPagadoHnl: amount,
      bookingConfirmed: false,
    };
  }
  if (['pendiente_confirmacion', 'processing', 'procesando', 'confirmando'].includes(rawState)) {
    return {
      status: 'processing',
      text: 'Estamos confirmando tu pago',
      paymentLabel: 'procesando',
      totalPagadoHnl: amount,
      bookingConfirmed: false,
    };
  }
  if (['fallido', 'failed', 'rechazado'].includes(rawState)) {
    return {
      status: 'failed',
      text: 'El pago no pudo completarse',
      paymentLabel: 'fallido',
      totalPagadoHnl: amount,
      bookingConfirmed: false,
    };
  }
  if (['expirado', 'expired'].includes(rawState)) {
    return {
      status: 'expired',
      text: 'La reserva temporal vencio',
      paymentLabel: 'expirado',
      totalPagadoHnl: amount,
      bookingConfirmed: false,
    };
  }
  return {
    status: 'pending',
    text: 'Tu pago aun esta pendiente',
    paymentLabel: rawState || 'pendiente',
    totalPagadoHnl: amount,
    bookingConfirmed: false,
  };
}
