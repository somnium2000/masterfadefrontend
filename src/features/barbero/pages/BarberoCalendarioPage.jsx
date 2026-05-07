import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { listAdminCitasOperativas } from '../../admin/lib/adminCitasApi.js';

const TIME_ZONE = 'America/Tegucigalpa';
const DAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MAX_MONTH_ITEMS = 400;
const CARDS_PER_SLIDE = 4;
const GENERIC_ERROR = 'No se pudo cargar el calendario. Intenta nuevamente.';

function pad(value) {
  return String(value).padStart(2, '0');
}

function getDateInHonduras(isoValue = null) {
  const date = isoValue ? new Date(isoValue) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

function getMonthKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

function buildMonthRange(monthKey) {
  const [yearRaw, monthRaw] = String(monthKey || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  const firstDay = `${year}-${pad(month)}-01`;
  const lastDayNumber = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay = `${year}-${pad(month)}-${pad(lastDayNumber)}`;

  return { firstDay, lastDay, year, month, lastDayNumber };
}

function getWeekDayIndexMonday(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const weekDayName = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(date);

  const map = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  return map[weekDayName] ?? 0;
}

function buildCalendarCells(monthKey) {
  const range = buildMonthRange(monthKey);
  if (!range) return [];

  const prefixCount = getWeekDayIndexMonday(range.firstDay);
  const cells = [];

  for (let i = 0; i < prefixCount; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= range.lastDayNumber; day += 1) {
    const dateKey = `${range.year}-${pad(range.month)}-${pad(day)}`;
    cells.push({ day, dateKey });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function addMonth(monthKey, delta) {
  const range = buildMonthRange(monthKey);
  if (!range) return monthKey;
  const date = new Date(Date.UTC(range.year, range.month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function clampSelectedDateToMonth(selectedDate, monthKey) {
  const range = buildMonthRange(monthKey);
  if (!range) return selectedDate;
  const selectedDay = Number(String(selectedDate || '').slice(8, 10));
  const safeDay = Number.isFinite(selectedDay) && selectedDay > 0
    ? Math.min(selectedDay, range.lastDayNumber)
    : 1;
  return `${monthKey}-${pad(safeDay)}`;
}

function formatMonthTitle(monthKey) {
  const range = buildMonthRange(monthKey);
  if (!range) return '';
  const date = new Date(Date.UTC(range.year, range.month - 1, 1, 12, 0, 0));
  const text = new Intl.DateTimeFormat('es-HN', {
    timeZone: TIME_ZONE,
    month: 'long',
    year: 'numeric',
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatSelectedDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat('es-HN', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatHour(isoValue) {
  const date = new Date(isoValue || '');
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('es-HN', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getServiceSummary(appointment) {
  const details = Array.isArray(appointment?.servicios_detalle) ? appointment.servicios_detalle : [];
  const names = details
    .map((item) => String(item?.nombre_servicio || '').trim())
    .filter(Boolean);

  if (names.length > 0) return names.join(' • ');

  const count = Array.isArray(appointment?.servicios) ? appointment.servicios.length : 0;
  if (count > 1) return `${count} servicios`;
  return 'Servicio';
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

export default function BarberoCalendarioPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [appointments, setAppointments] = useState([]);

  const todayKey = useMemo(() => getDateInHonduras(), []);
  const currentMonthKey = useMemo(() => getMonthKey(todayKey), [todayKey]);
  const [visibleMonth, setVisibleMonth] = useState(currentMonthKey);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [detailSlideIndex, setDetailSlideIndex] = useState(0);

  const disablePrevMonth = visibleMonth <= currentMonthKey;

  const handleAuthError = useCallback((err) => {
    if (err?.status === 401) {
      navigate('/login');
      return true;
    }
    if (err?.status === 403) {
      navigate('/unauthorized');
      return true;
    }
    return false;
  }, [navigate]);

  const fetchMonthAppointments = useCallback(async () => {
    const range = buildMonthRange(visibleMonth);
    if (!range) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await listAdminCitasOperativas({
        fecha_desde: range.firstDay,
        fecha_hasta: range.lastDay,
        estado: 'confirmada',
        limit: MAX_MONTH_ITEMS,
      });
      const payload = response?.data ?? response;
      const raw = Array.isArray(payload?.citas) ? payload.citas : [];

      const safe = raw
        .filter((item) => normalizeStatus(item?.estado_cita_codigo) === 'confirmada')
        .sort((left, right) => new Date(left?.inicio_at || '').getTime() - new Date(right?.inicio_at || '').getTime());

      setAppointments(safe);
    } catch (err) {
      if (handleAuthError(err)) return;
      setErrorMessage(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, visibleMonth]);

  useEffect(() => {
    void fetchMonthAppointments();
  }, [fetchMonthAppointments]);

  useEffect(() => {
    if (selectedDate < todayKey) {
      setSelectedDate(todayKey);
    }
  }, [selectedDate, todayKey]);

  const daysWithAppointments = useMemo(() => {
    const marked = new Set();
    for (const appointment of appointments) {
      const dateKey = getDateInHonduras(appointment?.inicio_at);
      if (dateKey) marked.add(dateKey);
    }
    return marked;
  }, [appointments]);

  const calendarCells = useMemo(() => buildCalendarCells(visibleMonth), [visibleMonth]);

  const selectedAppointments = useMemo(
    () => appointments.filter((appointment) => getDateInHonduras(appointment?.inicio_at) === selectedDate),
    [appointments, selectedDate]
  );
  const appointmentSlides = useMemo(() => {
    const chunks = [];
    for (let index = 0; index < selectedAppointments.length; index += CARDS_PER_SLIDE) {
      chunks.push(selectedAppointments.slice(index, index + CARDS_PER_SLIDE));
    }
    return chunks;
  }, [selectedAppointments]);
  const totalSlides = appointmentSlides.length;
  const safeSlideIndex = Math.min(detailSlideIndex, Math.max(0, totalSlides - 1));
  const currentSlideAppointments = appointmentSlides[safeSlideIndex] || [];

  const monthTitle = useMemo(() => formatMonthTitle(visibleMonth), [visibleMonth]);

  const moveToNextMonth = useCallback(() => {
    const nextMonth = addMonth(visibleMonth, 1);
    setVisibleMonth(nextMonth);
    setSelectedDate((currentSelected) => clampSelectedDateToMonth(currentSelected, nextMonth));
  }, [visibleMonth]);

  const moveToPrevMonth = useCallback(() => {
    if (disablePrevMonth) return;
    const prevMonth = addMonth(visibleMonth, -1);
    setVisibleMonth(prevMonth);
    setSelectedDate((currentSelected) => clampSelectedDateToMonth(currentSelected, prevMonth));
  }, [disablePrevMonth, visibleMonth]);
  const moveToNextDetailSlide = useCallback(() => {
    setDetailSlideIndex((current) => Math.min(current + 1, Math.max(0, totalSlides - 1)));
  }, [totalSlides]);
  const moveToPrevDetailSlide = useCallback(() => {
    setDetailSlideIndex((current) => Math.max(current - 1, 0));
  }, []);

  useEffect(() => {
    setDetailSlideIndex(0);
  }, [selectedDate]);

  useEffect(() => {
    if (detailSlideIndex > totalSlides - 1) {
      setDetailSlideIndex(Math.max(0, totalSlides - 1));
    }
  }, [detailSlideIndex, totalSlides]);

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--mf-accent)]">Barbero</p>
          <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Calendario</h1>
          <p className="text-sm text-[var(--mf-text-2)]">Vista informativa de tus citas confirmadas.</p>
        </div>
      </header>

      {errorMessage ? <ErrorBanner message={errorMessage} onRetry={fetchMonthAppointments} /> : null}
      {loading && !errorMessage ? <LoadingSpinner /> : null}

      {!loading && !errorMessage ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.95fr)]">
          <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_90%,transparent)] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--mf-text)]">
                <CalendarDays size={16} className="text-[var(--mf-accent)]" />
                {monthTitle}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-9 p-0"
                  onClick={moveToPrevMonth}
                  disabled={disablePrevMonth}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-9 p-0"
                  onClick={moveToNextMonth}
                  aria-label="Mes siguiente"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[var(--mf-text-2)]">
              {DAY_NAMES.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <div key={`blank-${index}`} className="aspect-square rounded-xl" />;
                }

                const hasAppointments = daysWithAppointments.has(cell.dateKey);
                const isPastDate = cell.dateKey < todayKey;
                const isSelected = !isPastDate && selectedDate === cell.dateKey;
                const isToday = todayKey === cell.dateKey;

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={isPastDate ? undefined : () => setSelectedDate(cell.dateKey)}
                    disabled={isPastDate}
                    aria-disabled={isPastDate}
                    className={[
                      'relative aspect-square rounded-xl border text-sm font-medium transition-all duration-150',
                      isPastDate
                        ? 'cursor-not-allowed border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_72%,transparent)] text-[color:color-mix(in_srgb,var(--mf-text-2)_78%,transparent)] opacity-55'
                        : '',
                      !isPastDate && isSelected
                        ? 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]'
                        : '',
                      !isPastDate && !isSelected
                        ? 'border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_80%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-btn-border)]'
                        : '',
                    ].join(' ')}
                  >
                    <span>{cell.day}</span>
                    {isToday ? (
                      <span className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--mf-accent)]" />
                    ) : null}
                    {hasAppointments ? (
                      <span className="absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-400" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </article>

          <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_90%,transparent)] p-4 sm:p-5">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--mf-accent)]">Detalle del dia</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--mf-text)]">{formatSelectedDate(selectedDate)}</h2>
            </div>

            {selectedAppointments.length > 0 ? (
              <div className="space-y-2.5 sm:space-y-3">
                {currentSlideAppointments.map((appointment) => (
                  <article
                    key={appointment.id_cita}
                    className="rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] px-3 py-2.5 sm:px-3.5 sm:py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight text-[var(--mf-text)]">
                        <Clock3 size={14} className="text-[var(--mf-accent)]" />
                        {formatHour(appointment?.inicio_at)}
                      </p>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                        Confirmada
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-tight text-[var(--mf-text)]">{appointment?.nombre_cliente || 'Cliente'}</p>
                    <p className="mt-1 text-sm leading-tight text-[var(--mf-text-2)]">{getServiceSummary(appointment)}</p>
                    <p className="mt-1.5 text-xs leading-none text-[var(--mf-text-2)]">Duracion: {Math.max(0, Number(appointment?.duracion_total_min || 0))} min</p>
                  </article>
                ))}
                {totalSlides > 1 ? (
                  <div className="pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={moveToPrevDetailSlide}
                        disabled={safeSlideIndex === 0}
                        aria-label="Citas anteriores"
                      >
                        <ChevronLeft size={14} />
                      </Button>
                      <div className="flex items-center gap-1.5">
                        {appointmentSlides.map((_, index) => (
                          <span
                            key={`slide-dot-${index + 1}`}
                            className={[
                              'h-1.5 w-1.5 rounded-full',
                              index === safeSlideIndex ? 'bg-[var(--mf-accent)]' : 'bg-[var(--mf-nav-border)]',
                            ].join(' ')}
                          />
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={moveToNextDetailSlide}
                        disabled={safeSlideIndex >= totalSlides - 1}
                        aria-label="Siguientes citas"
                      >
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_42%,transparent)] px-4 py-8 text-center">
                <p className="text-sm text-[var(--mf-text-2)]">No tienes citas confirmadas para este día.</p>
              </div>
            )}
          </article>
        </section>
      ) : null}
    </div>
  );
}
