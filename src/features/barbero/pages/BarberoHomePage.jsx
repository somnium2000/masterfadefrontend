import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, RefreshCw, TimerReset } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import {
  getAdminCitasOperativasContexto,
  getAdminCitasOperativasCompletadasHoy,
  listAdminCitasOperativas,
} from '../../admin/lib/adminCitasApi.js';

const STATUS_META = {
  confirmada: {
    label: 'Confirmado',
    className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
  },
  en_salon: {
    label: 'En salón',
    className: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
  },
  en_atencion: {
    label: 'En atención',
    className: 'border-indigo-400/25 bg-indigo-500/10 text-indigo-300',
  },
  en_espera: {
    label: 'En espera',
    className: 'border-sky-400/25 bg-sky-500/10 text-sky-300',
  },
  pendiente_pago: {
    label: 'Pendiente',
    className: 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]',
  },
};
const FINISH_ALERT_THRESHOLD_MIN = 7;

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function getDateInHonduras(isoValue = null) {
  const date = isoValue ? new Date(isoValue) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tegucigalpa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
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
  return STATUS_META[normalized] || {
    label: 'Programada',
    className: 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)]',
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

function addMinutes(isoValue, minutes) {
  const base = new Date(isoValue || '');
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + Math.max(0, Number(minutes || 0)) * 60000);
}

function formatRelativeFinish(isoValue, nowMs) {
  const finish = toTimestamp(isoValue);
  if (!finish) return 'Sin estimacion';
  const diff = Math.round((finish - nowMs) / 60000);
  if (diff <= 0) return 'Tiempo cumplido';
  if (diff === 1) return 'Falta 1 minuto';
  return `Faltan ${diff} minutos`;
}

function getFinishAlertMeta(isoValue, nowMs) {
  const finish = toTimestamp(isoValue);
  if (!finish) return null;
  const diff = Math.round((finish - nowMs) / 60000);
  if (diff <= 0) {
    return {
      toneClass: 'border-red-500/40 bg-red-500/10 text-red-300',
      message: 'La cita actual ya debio finalizar. Revisa estado y cierre de atencion.',
    };
  }
  if (diff <= FINISH_ALERT_THRESHOLD_MIN) {
    return {
      toneClass: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
      message: `Alerta operativa: faltan ${diff} minuto${diff === 1 ? '' : 's'} para finalizar la atencion actual.`,
    };
  }
  return null;
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
    </article>
  );
}

export default function BarberoHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const displayName = getUserDisplayName(user);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [contextLoading, setContextLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [listError, setListError] = useState('');
  const [context, setContext] = useState({ sucursales: [], barberos: [] });
  const [dashboardData, setDashboardData] = useState({ operativas: [], completadas: [], fetchedAt: null });

  const todayHn = useMemo(() => getDateInHonduras(new Date(nowMs).toISOString()), [nowMs]);
  const barberProfile = useMemo(
    () => (Array.isArray(context?.barberos) ? context.barberos[0] || null : null),
    [context?.barberos]
  );
  const branchName = useMemo(() => {
    const branches = Array.isArray(context?.sucursales) ? context.sucursales : [];
    if (barberProfile?.id_sucursal) {
      return branches.find((branch) => branch.id_sucursal === barberProfile.id_sucursal)?.nombre_sucursal || 'Sucursal asignada';
    }
    return branches[0]?.nombre_sucursal || 'Sucursal asignada';
  }, [barberProfile?.id_sucursal, context?.sucursales]);

  const todayAppointments = useMemo(
    () => [...(Array.isArray(dashboardData.operativas) ? dashboardData.operativas : [])]
      .sort((a, b) => toTimestamp(a?.inicio_at) - toTimestamp(b?.inicio_at)),
    [dashboardData.operativas]
  );
  const completedToday = useMemo(
    () => Array.isArray(dashboardData.completadas) ? dashboardData.completadas : [],
    [dashboardData.completadas]
  );
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
  const currentAppointment = useMemo(
    () => {
      const source = Array.isArray(todayAppointments) ? todayAppointments : [];
      const inAttention = source.find((item) => String(item?.estado_cita_codigo || '').trim().toLowerCase() === 'en_atencion');
      if (inAttention) return inAttention;
      return source.find(
        (item) =>
          String(item?.estado_cita_codigo || '').trim().toLowerCase() === 'en_salon'
          && Boolean(item?.atencion_iniciada_at)
      ) || null;
    },
    [todayAppointments]
  );
  const currentEstimatedEnd = useMemo(
    () => (currentAppointment?.atencion_iniciada_at
      ? addMinutes(currentAppointment.atencion_iniciada_at, Number(currentAppointment.duracion_total_min || 0))
      : null),
    [currentAppointment]
  );
  const currentFinishAlert = useMemo(
    () => (currentEstimatedEnd ? getFinishAlertMeta(currentEstimatedEnd.toISOString(), nowMs) : null),
    [currentEstimatedEnd, nowMs]
  );
  const nextAdjustedAppointment = useMemo(() => {
    if (!currentAppointment) return upcomingAppointments[0] || null;
    const currentStart = toTimestamp(currentAppointment?.inicio_at);
    if (!currentStart) return upcomingAppointments[0] || null;
    const source = Array.isArray(todayAppointments) ? todayAppointments : [];
    return source.find((item) => toTimestamp(item?.inicio_at) > currentStart) || null;
  }, [currentAppointment, todayAppointments, upcomingAppointments]);

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

  const fetchDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setContextLoading(true);
      setLoading(true);
    }
    setContextError('');
    setListError('');

    try {
      const [contextResponse, operativasResponse, completadasResponse] = await Promise.all([
        getAdminCitasOperativasContexto(),
        listAdminCitasOperativas({ fecha_desde: todayHn, fecha_hasta: todayHn, limit: 240 }),
        getAdminCitasOperativasCompletadasHoy({ fecha_desde: todayHn, fecha_hasta: todayHn, limit: 240 }),
      ]);

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
      });
    } catch (err) {
      if (handleAuthError(err)) return;
      const message = extractMessage(err);
      setContextError(message);
      setListError(message);
    } finally {
      if (!silent) {
        setContextLoading(false);
        setLoading(false);
      }
    }
  }, [handleAuthError, todayHn]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const clockId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    // AM: Polling cada 30s es intencional — dashboard operativo en vivo.
    // El guard de in-flight en fetchDashboard evita ráfagas si la red es lenta.
    const refreshId = window.setInterval(() => {
      void fetchDashboard({ silent: true });
    }, 30000);

    return () => {
      window.clearInterval(clockId);
      window.clearInterval(refreshId);
    };
  }, [fetchDashboard]);

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Personas - Barbero</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Resumen del dia</h1>
            <p className="text-sm text-[var(--mf-text-2)]">
              {displayName} - {branchName}. Vista operativa de tus citas registradas en la base de datos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
              Actualizado {formatUpdatedAt(dashboardData.fetchedAt)}
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => fetchDashboard()}>
              <RefreshCw size={15} />
              Actualizar
            </Button>
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
            <div className="mt-4 rounded-[16px] border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--mf-text)]">Atencion Actual</h3>
              {currentAppointment ? (
                <div className="mt-2 space-y-1 text-sm text-[var(--mf-text-2)]">
                  <p><strong className="text-[var(--mf-text)]">Cliente:</strong> {currentAppointment.nombre_cliente || 'Cliente'}</p>
                  <p><strong className="text-[var(--mf-text)]">Hora programada:</strong> {formatHour(currentAppointment.inicio_at)}</p>
                  <p><strong className="text-[var(--mf-text)]">Inicio real:</strong> {currentAppointment.atencion_iniciada_at ? formatHour(currentAppointment.atencion_iniciada_at) : 'No registrado'}</p>
                  <p><strong className="text-[var(--mf-text)]">Fin estimado real:</strong> {currentEstimatedEnd ? formatHour(currentEstimatedEnd.toISOString()) : 'N/D'}</p>
                  <p><strong className="text-[var(--mf-text)]">Retraso acumulado:</strong> {Number(currentAppointment.retraso_inicio_min || 0)} min</p>
                  {currentEstimatedEnd ? (
                    <p className="text-amber-300">{formatRelativeFinish(currentEstimatedEnd.toISOString(), nowMs)}</p>
                  ) : null}
                  {currentFinishAlert ? (
                    <div className={`mt-2 rounded-[12px] border px-3 py-2 text-xs font-medium ${currentFinishAlert.toneClass}`}>
                      {currentFinishAlert.message}
                    </div>
                  ) : null}
                  {nextAdjustedAppointment ? (
                    <p><strong className="text-[var(--mf-text)]">Proxima cita ajustada:</strong> {nextAdjustedAppointment.nombre_cliente || 'Cliente'} - {formatHour(nextAdjustedAppointment.inicio_at)}</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--mf-text-2)]">No hay cita en atención en este momento.</p>
              )}
              <div className="mt-3 text-xs text-[var(--mf-text-2)]">
                Retrasos propagados hoy: {Number(context?.retraso_operativo?.citas_reagendadas_hoy || 0)}.
                Correos pendientes: {Number(context?.retraso_operativo?.notificaciones_pendientes_hoy || 0)}.
              </div>
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
