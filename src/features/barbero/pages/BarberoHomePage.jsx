import { getAppointmentStatusLabel } from '../../../lib/appointmentStatus.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { operationalDay } from '../../admin/lib/adminAppointmentOrdering.js';
import { CalendarClock, CheckCircle2, TimerReset } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { isAbortError } from '../../../services/httpClient.js';
import {
  getAdminCitasOperativasContexto,
  getAdminCitasOperativasCompletadasHoy,
  listAdminCitasOperativas,
} from '../../admin/lib/adminCitasApi.js';

const STATUS_META = {
  confirmada: {
    className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
  },
  en_salon: {
    className: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
  },
  en_atencion: {
    className: 'border-indigo-400/25 bg-indigo-500/10 text-indigo-300',
  },
  en_espera: {
    className: 'border-sky-400/25 bg-sky-500/10 text-sky-300',
  },
  pendiente_pago: {
    className: 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]',
  },
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function toTimestamp(value) {
  const parsed = new Date(value || '');
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatHour(isoValue) {
  const parsed = new Date(isoValue || '');
  if (Number.isNaN(parsed.getTime())) return '--:--';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Tegucigalpa',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed).toUpperCase();
}

function formatUpdatedAt(isoValue) {
  const parsed = new Date(isoValue || '');
  if (Number.isNaN(parsed.getTime())) return 'Sin actualizar';
  return new Intl.DateTimeFormat('es-HN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function getInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!words.length) return 'MF';
  return words.map((word) => word[0]).join('').toUpperCase();
}

function getStatusMeta(state) {
  const normalized = String(state || '').trim().toLowerCase();
  return {
    label: getAppointmentStatusLabel(state),
    className: STATUS_META[normalized]?.className || 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)]',
  };
}

function getServiceSummary(appointment) {
  const details = Array.isArray(appointment?.servicios_detalle) ? appointment.servicios_detalle : [];
  const names = details
    .map((item) => String(item?.nombre_servicio || '').trim())
    .filter(Boolean);

  if (names.length === 0) {
    const count = Array.isArray(appointment?.servicios) ? appointment.servicios.length : 0;
    return count > 1 ? `${count} servicios agendados` : 'Servicio agendado';
  }

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names[1]} +${names.length - 2}`;
}

function ClientPreferencesDisclosure({ appointment }) {
  const preferences = String(appointment?.preferencias_corte || '').trim();
  if (!preferences) return null;
  return (
    <details className="mt-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-[var(--mf-accent)]">Preferencias del cliente</summary>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--mf-text-2)]">{preferences}</p>
    </details>
  );
}

function formatRelativeStart(isoValue, nowMs) {
  const diffMinutes = Math.round((toTimestamp(isoValue) - nowMs) / 60000);
  if (diffMinutes <= 0) return 'En curso';
  if (diffMinutes === 1) return 'Comienza en 1 minuto';
  if (diffMinutes < 60) return `Comienza en ${diffMinutes} minutos`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (!minutes) return `Comienza en ${hours} h`;
  return `Comienza en ${hours} h ${minutes} min`;
}

function InlineEmptyState({ title, description }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_42%,transparent)] px-4 py-6 text-center">
      <p className="text-sm font-semibold text-[var(--mf-text)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--mf-text-2)]">{description}</p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-[18px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] px-4 py-4 shadow-[var(--mf-shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
          <Icon size={18} strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-xs text-[var(--mf-text-2)]">{label}</p>
          <p className="text-3xl font-semibold leading-none text-[var(--mf-text)]">{value}</p>
        </div>
      </div>
    </div>
  );
}

function AppointmentCard({ appointment, nowMs }) {
  const status = getStatusMeta(appointment?.estado_cita_codigo);

  return (
    <article className="rounded-[18px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-[2rem] leading-none text-[var(--mf-accent)]">{formatHour(appointment?.inicio_at)}</p>
          <p className="mt-2 text-xs text-[var(--mf-text-2)]">{formatRelativeStart(appointment?.inicio_at, nowMs)}</p>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-sm font-semibold text-[var(--mf-text)]">
          {getInitials(appointment?.nombre_cliente)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--mf-text)]">{appointment?.nombre_cliente || 'Cliente'}</p>
          <p className="text-sm text-[var(--mf-text-2)]">{getServiceSummary(appointment)}</p>
          {appointment?.alias_integrante ? (
            <p className="mt-1 text-xs text-[var(--mf-text-2)]">Grupo: {appointment.alias_integrante}</p>
          ) : null}
        </div>
      </div>
      <ClientPreferencesDisclosure appointment={appointment} />
    </article>
  );
}

function UpcomingAppointmentCard({ appointment, nowMs }) {
  return (
    <article className="rounded-[18px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] p-3 shadow-[var(--mf-shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-sm font-semibold text-[var(--mf-text)]">
          {getInitials(appointment?.nombre_cliente)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--mf-text)]">{appointment?.nombre_cliente || 'Cliente'}</p>
              <p className="truncate text-sm text-[var(--mf-text-2)]">{getServiceSummary(appointment)}</p>
            </div>
            <p className="whitespace-nowrap text-sm font-semibold text-[var(--mf-text)]">{formatHour(appointment?.inicio_at)}</p>
          </div>
          <p className="mt-2 text-xs text-[var(--mf-text-2)]">{formatRelativeStart(appointment?.inicio_at, nowMs)}</p>
        </div>
      </div>
      <ClientPreferencesDisclosure appointment={appointment} />
    </article>
  );
}

export default function BarberoHomePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, invalidateSession } = useAuth();
  const displayName = getUserDisplayName(user);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [contextLoading, setContextLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [listError, setListError] = useState('');
  const [context, setContext] = useState({ sucursales: [], barberos: [] });
  const [dashboardData, setDashboardData] = useState({ operativas: [], completadas: [], fetchedAt: null });
  const requestSequence = useRef(0);
  const barberId = user?.empleado_id || '';

  const todayHn = operationalDay(nowMs);
  const barberProfile = useMemo(
    () => (Array.isArray(context?.barberos) ? context.barberos.find(barber => barber.id_empleado === barberId) || null : null),
    [barberId, context?.barberos]
  );
  const branchName = useMemo(() => {
    const branches = Array.isArray(context?.sucursales) ? context.sucursales : [];
    if (barberProfile?.id_sucursal) {
      return branches.find((branch) => branch.id_sucursal === barberProfile.id_sucursal)?.nombre_sucursal || 'Sucursal asignada';
    }
    return branches[0]?.nombre_sucursal || 'Sucursal asignada';
  }, [barberProfile?.id_sucursal, context?.sucursales]);

  const dayRows = useMemo(() => {
    if (dashboardData.operationalDate !== todayHn || dashboardData.barberId !== barberId) return [];
    const unique = new Map();
    const source = [
      ...(Array.isArray(dashboardData.operativas) ? dashboardData.operativas : []),
      ...(Array.isArray(dashboardData.completadas) ? dashboardData.completadas : []),
    ];
    for (const item of source) {
      if (!barberId || !item?.id_cita || item.id_empleado_barbero !== barberId || operationalDay(item.inicio_at) !== todayHn) continue;
      const state = String(item.estado_cita_codigo || '').toLowerCase();
      if (!['en_espera', 'pendiente_pago', 'confirmada', 'en_salon', 'en_atencion', 'completada'].includes(state)) continue;
      // AM: Una lectura completada prevalece si los dos endpoints coinciden durante una transición.
      if (unique.get(item.id_cita)?.estado_cita_codigo === 'completada' && state !== 'completada') continue;
      unique.set(item.id_cita, { ...item, estado_cita_codigo: state });
    }
    return [...unique.values()].sort((a, b) => toTimestamp(a.inicio_at) - toTimestamp(b.inicio_at));
  }, [barberId, dashboardData, todayHn]);
  const todayAppointments = useMemo(() => dayRows.filter(item => item.estado_cita_codigo !== 'completada'), [dayRows]);
  const completedToday = useMemo(() => dayRows.filter(item => item.estado_cita_codigo === 'completada'), [dayRows]);
  const totalToday = todayAppointments.length + completedToday.length;
  const remainingCount = todayAppointments.length;
  const completedCount = completedToday.length;
  const upcomingAppointments = useMemo(() => {
    const source = Array.isArray(todayAppointments) ? todayAppointments : [];
    const future = source.filter((item) => toTimestamp(item?.inicio_at) >= nowMs);
    if (future.length > 0) return future.slice(0, 4);
    return source
      .filter((item) => ['en_salon', 'en_atencion'].includes(String(item?.estado_cita_codigo || '').trim().toLowerCase()))
      .slice(0, 4);
  }, [nowMs, todayAppointments]);
  const handleAuthError = useCallback((err) => {
    if (err?.status === 401) {
      invalidateSession('barbero_home_401');
      return true;
    }
    if (err?.status === 403) {
      navigate('/unauthorized');
      return true;
    }
    return false;
  }, [invalidateSession, navigate]);

  const fetchDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated || !barberId) return;
    const sequence = ++requestSequence.current;
    if (!silent) {
      setContextLoading(true);
      setLoading(true);
    }
    setContextError('');
    setListError('');

    try {
      const [contextResponse, operativasResponse, completadasResponse] = await Promise.all([
        getAdminCitasOperativasContexto(),
        listAdminCitasOperativas({ fecha_desde: todayHn, fecha_hasta: todayHn, zona_horaria: 'America/Tegucigalpa', id_empleado_barbero: barberId, limit: 240 }),
        getAdminCitasOperativasCompletadasHoy({ fecha_desde: todayHn, fecha_hasta: todayHn, zona_horaria: 'America/Tegucigalpa', id_empleado_barbero: barberId, limit: 240 }),
      ]);
      if (sequence !== requestSequence.current) return;

      const contextPayload = contextResponse?.data ?? contextResponse;
      const operativasPayload = operativasResponse?.data ?? operativasResponse;
      const completadasPayload = completadasResponse?.data ?? completadasResponse;

      setContext({
        sucursales: Array.isArray(contextPayload?.sucursales) ? contextPayload.sucursales : [],
        barberos: Array.isArray(contextPayload?.barberos) ? contextPayload.barberos : [],
        retraso_operativo: contextPayload?.retraso_operativo || null,
      });
      setDashboardData({
        operativas: Array.isArray(operativasPayload?.citas) ? operativasPayload.citas : [],
        completadas: Array.isArray(completadasPayload?.citas) ? completadasPayload.citas : [],
        fetchedAt: new Date().toISOString(),
        operationalDate: todayHn,
        barberId,
      });
    } catch (err) {
      if (sequence !== requestSequence.current) return;
      if (isAbortError(err)) return;
      if (handleAuthError(err)) return;
      const message = extractMessage(err);
      setContextError(message);
      setListError(message);
    } finally {
      if (sequence === requestSequence.current) {
        setContextLoading(false);
        setLoading(false);
      }
    }
  }, [barberId, handleAuthError, isAuthenticated, todayHn]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchDashboard();
    return () => { requestSequence.current += 1; };
  }, [fetchDashboard, isAuthenticated]);
  useEffect(() => {
    const nextDay = new Date(todayHn + 'T00:00:00-06:00').getTime() + 86400000;
    const update = () => setNowMs(Date.now());
    const timer = window.setTimeout(update, Math.max(1, nextDay - Date.now()));
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [todayHn]);

  useEffect(() => {
    const clockId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    // AM: Polling cada 30s es intencional — dashboard operativo en vivo.
    // El guard de in-flight en fetchDashboard evita ráfagas si la red es lenta.
    const refreshId = window.setInterval(() => {
      if (isAuthenticated && user) {
        void fetchDashboard({ silent: true });
      }
    }, 30000);

    return () => {
      window.clearInterval(clockId);
      window.clearInterval(refreshId);
    };
  }, [fetchDashboard, isAuthenticated, user]);

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Personas - Barbero</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Resumen del dia</h1>
            <p className="text-sm text-[var(--mf-text-2)]">
              {displayName} - {branchName}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
              Actualizado {formatUpdatedAt(dashboardData.operationalDate === todayHn && dashboardData.barberId === barberId ? dashboardData.fetchedAt : null)}
            </div>
          </div>
        </div>
      </header>

      {contextError ? <ErrorBanner message={contextError} onRetry={fetchDashboard} /> : null}
      {listError && !contextError ? <ErrorBanner message={listError} onRetry={fetchDashboard} /> : null}
      {(contextLoading || loading) && !contextError && !listError ? <LoadingSpinner /> : null}

      {!loading && !contextLoading && !contextError && !listError ? (
        <>
          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_90%,transparent)] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--mf-text)]">Resumen del Dia</h2>
                <p className="text-sm text-[var(--mf-text-2)]">Seguimiento rapido de la jornada actual.</p>
              </div>
              <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
                Fecha {todayHn}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <StatCard icon={CalendarClock} label="Citas Totales" value={totalToday} />
              <StatCard icon={CheckCircle2} label="Citas Completadas" value={completedCount} />
              <StatCard icon={TimerReset} label="Citas Restantes" value={remainingCount} />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.95fr)]">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--mf-text)]">Citas de Hoy</h2>
                  <p className="text-sm text-[var(--mf-text-2)]">Agenda activa del barbero para la jornada actual.</p>
                </div>
                <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
                  {todayAppointments.length} activa(s)
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {todayAppointments.length > 0 ? (
                  todayAppointments.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id_cita}
                      appointment={appointment}
                      nowMs={nowMs}
                    />
                  ))
                ) : (
                  <div className="lg:col-span-2">
                    <InlineEmptyState
                      title="No tienes citas pendientes hoy"
                      description="Cuando entren nuevas citas operativas para esta fecha se mostraran aqui."
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--mf-text)]">Proxima Cita</h2>
                  <p className="text-sm text-[var(--mf-text-2)]">Tus siguientes turnos para prepararte con tiempo.</p>
                </div>
                <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
                  {upcomingAppointments.length} siguiente(s)
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {upcomingAppointments.length > 0 ? (
                  upcomingAppointments.map((appointment) => (
                    <UpcomingAppointmentCard
                      key={`next-${appointment.id_cita}`}
                      appointment={appointment}
                      nowMs={nowMs}
                    />
                  ))
                ) : (
                  <InlineEmptyState
                    title="Agenda despejada"
                    description="No hay proximas citas programadas despues del horario actual."
                  />
                )}
              </div>
            </div>
          </section>

        </>
      ) : null}
    </div>
  );
}

