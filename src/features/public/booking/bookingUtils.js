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
export const HONDURAS_TIME_ZONE = 'America/Tegucigalpa';
export const HONDURAS_UTC_OFFSET = '-06:00';

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

export function normalizePhone(rawValue) {
  return String(rawValue || '').replace(/[^\d+]/g, '').slice(0, 20);
}
