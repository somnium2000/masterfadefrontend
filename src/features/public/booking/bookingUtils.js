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

export function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
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

export function getServiceDurationLabel(service) {
  const duration = Number(service?.duracion_min || 0) + Number(service?.buffer_min || 0);
  return `${duration} min`;
}

export function toLocalDateTimeWithOffset(dateValue, timeValue) {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();
  if (!date || !time) return null;
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const parsed = new Date(`${date}T${normalizedTime}`);
  if (Number.isNaN(parsed.getTime())) return null;

  const offsetMinutes = -parsed.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offsetMins = String(absOffset % 60).padStart(2, '0');

  return `${date}T${normalizedTime}${sign}${offsetHours}:${offsetMins}`;
}

export function normalizePhone(rawValue) {
  return String(rawValue || '').replace(/[^\d+]/g, '').slice(0, 20);
}

