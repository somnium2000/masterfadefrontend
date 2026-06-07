import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, Scissors, Wallet } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  descartarClienteCitaPendiente,
  getClienteCitaDetalle,
  getClienteCitaPendiente,
  listClienteCitas,
  retomarClienteCitaPendiente,
} from '../lib/clienteApi.js';

const PENDING_PAYMENT_CONTEXT_STORAGE_KEY = 'mf_pending_payment_context_v1';
const BOOKING_PAYMENT_CONTEXT_STORAGE_KEY = 'masterfade.publicBookingPayment.v1';

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isUpcoming(cita) {
  const date = new Date(cita?.inicio_at || 0);
  return Number.isFinite(date.getTime()) && date.getTime() >= Date.now();
}

function normalizeEstado(value) {
  return String(value || '').trim().toLowerCase();
}

function formatMoney(value) {
  return `L ${Number(value || 0).toFixed(2)}`;
}

function extractApiErrorCode(error) {
  return String(error?.data?.error?.code || error?.error?.code || '').trim().toUpperCase();
}

function persistPendingPaymentContext({ groupId, intent, email }) {
  if (typeof window === 'undefined') return;
  const safeGroupId = String(groupId || '').trim();
  const safeIntent = intent && typeof intent === 'object' ? intent : null;
  const safeIntentId = String(safeIntent?.id_intent || '').trim();
  if (!safeGroupId || !safeIntentId) return;

  const legacyContext = {
    id_grupo_cita: safeGroupId,
    id_intent: safeIntentId,
    titular_email: String(email || '').trim().toLowerCase(),
    paymentIntent: {
      ...safeIntent,
      id_grupo_cita: safeGroupId,
    },
  };
  const pendingContext = {
    id_grupo_cita: safeGroupId,
    id_intent: safeIntentId,
    payment_intent: safeIntent,
    titular_email: String(email || '').trim().toLowerCase(),
    stored_at: new Date().toISOString(),
  };
  try {
    window.sessionStorage.setItem(PENDING_PAYMENT_CONTEXT_STORAGE_KEY, JSON.stringify(pendingContext));
    window.sessionStorage.setItem(BOOKING_PAYMENT_CONTEXT_STORAGE_KEY, JSON.stringify(legacyContext));
  } catch {
    // no-op
  }
}

function resolveTipoCitaChip(tipoVisual, tipoLabel) {
  const visual = String(tipoVisual || '').trim().toLowerCase();
  const label = String(tipoLabel || '').trim() || 'Sin clasificar';

  if (visual === 'pendiente_pago') {
    return {
      label,
      className: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
    };
  }
  if (visual === 'membresia') {
    return {
      label,
      className: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
    };
  }
  if (visual === 'cortesia') {
    return {
      label,
      className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    };
  }
  if (visual === 'cortesia_acompanantes') {
    return {
      label,
      className: 'border-teal-400/30 bg-teal-500/10 text-teal-200',
    };
  }
  if (visual === 'pago_normal') {
    return {
      label,
      className: 'border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)]',
    };
  }
  return {
    label,
    className: 'border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)]',
  };
}

function resolveServiceSummary(cita) {
  const source = Array.isArray(cita?.servicios)
    ? cita.servicios
    : (Array.isArray(cita?.detalles) ? cita.detalles : []);
  const names = source
    .map((item) => String(item?.nombre_servicio || item?.servicio || '').trim())
    .filter(Boolean);
  if (!names.length) return null;
  const first = names[0];
  const extras = Math.max(0, names.length - 1);
  return extras > 0 ? `${first} +${extras} más` : first;
}

function CitaCard({ cita, onOpenDetail }) {
  const serviceSummary = resolveServiceSummary(cita);
  const tipoChip = resolveTipoCitaChip(cita?.tipo_cita_visual, cita?.tipo_cita_label);

  return (
    <button
      type="button"
      onClick={() => onOpenDetail(cita)}
      className="mf-glass-surface w-full rounded-[18px] border border-[var(--mf-nav-border)] p-3 text-left transition-colors hover:border-[var(--mf-btn-border)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--mf-text)]">
            <MapPin size={14} className="shrink-0 text-[var(--mf-accent)]" />
            <span className="leading-none">{cita.nombre_sucursal || 'Sucursal'}</span>
          </p>
          <p className="mt-1 text-xs text-[var(--mf-text-2)]">{formatDateTime(cita.inicio_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="mf-badge mf-badge-gold">{cita.estado_cita_codigo}</span>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${tipoChip.className}`}>
            {tipoChip.label}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-[var(--mf-text-2)] sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Scissors size={14} className="shrink-0 text-[var(--mf-accent)]" />
          <span>{cita.nombre_barbero || 'Barbero por definir'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Wallet size={14} className="shrink-0 text-[var(--mf-accent)]" />
          <span>{formatMoney(cita.total_pagar_hnl)}</span>
        </div>
        <div className="sm:col-span-2">
          {serviceSummary ? (
            <p className="text-[var(--mf-text-2)]">{serviceSummary}</p>
          ) : (
            <span className="text-[var(--mf-accent)] underline underline-offset-2">Ver servicios en detalle</span>
          )}
        </div>
      </dl>
    </button>
  );
}

function CitasList({ items, onOpenDetail }) {
  return (
    <>
      <div className="hidden max-h-[34rem] overflow-y-auto pr-1 sm:block">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((cita) => <CitaCard key={cita.id_cita} cita={cita} onOpenDetail={onOpenDetail} />)}
        </div>
      </div>
      <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1 sm:hidden">
        {items.map((cita) => (
          <div key={cita.id_cita} className="w-full">
            <CitaCard cita={cita} onOpenDetail={onOpenDetail} />
          </div>
        ))}
      </div>
    </>
  );
}

export default function ClienteHistorialCitasPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const notifications = useNotifications();
  const { isAuthenticated, isHydrated, isHydrating, logout, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [citas, setCitas] = useState([]);
  const [activeTab, setActiveTab] = useState('proximas');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedCita, setSelectedCita] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailData, setDetailData] = useState(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingSubmitting, setPendingSubmitting] = useState(false);
  const [pendingError, setPendingError] = useState('');
  const [pendingData, setPendingData] = useState(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const canLoad = Boolean(isAuthenticated && isHydrated && !isHydrating);

  const loadCitas = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const payload = await listClienteCitas();
      setCitas(Array.isArray(payload?.citas) ? payload.citas : []);
    } catch (error) {
      if (Number(error?.status) === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      notifications.error(error?.data?.error?.message || error?.message || 'No se pudo cargar tu historial de citas.');
    } finally {
      setLoading(false);
    }
  }, [canLoad, logout, navigate, notifications]);

  useEffect(() => {
    if (!canLoad) return;
    void loadCitas();
  }, [canLoad, loadCitas]);

  const loadPendingReservation = useCallback(async ({ openModal = false } = {}) => {
    setPendingLoading(true);
    setPendingError('');
    try {
      const payload = await getClienteCitaPendiente();
      const pending = payload?.pendiente ?? null;
      setPendingData(pending);
      if (openModal && pending) {
        setPendingOpen(true);
      }
      if (openModal && !pending) {
        notifications.info('No encontramos una reserva pendiente vigente.', {
          dedupeKey: 'cliente-citas-pending-not-found',
        });
      }
      return pending;
    } catch (error) {
      const errorCode = extractApiErrorCode(error);
      if (errorCode === 'PENDING_APPOINTMENT_EXPIRED') {
        setPendingError('Esta reserva ya expiró. Agenda nuevamente.');
      } else {
        setPendingError(error?.data?.error?.message || error?.message || 'No se pudo consultar la reserva pendiente.');
      }
      return null;
    } finally {
      setPendingLoading(false);
    }
  }, [notifications]);

  const handleOpenPending = useCallback(async () => {
    await loadPendingReservation({ openModal: true });
  }, [loadPendingReservation]);

  const handleContinuePendingPayment = useCallback(async () => {
    const groupId = String(pendingData?.id_grupo_cita || '').trim();
    if (!groupId) {
      notifications.warning('No encontramos una reserva pendiente vigente.');
      return;
    }
    setPendingSubmitting(true);
    setPendingError('');
    try {
      const payload = await retomarClienteCitaPendiente(groupId);
      const paymentIntent = payload?.payment_intent && typeof payload.payment_intent === 'object'
        ? payload.payment_intent
        : null;
      if (!paymentIntent?.id_intent) {
        throw new Error('No se pudo retomar el pago pendiente.');
      }
      persistPendingPaymentContext({
        groupId,
        intent: paymentIntent,
        email: user?.email || '',
      });
      setPendingOpen(false);
      navigate(`/agendar/pagar?id_grupo_cita=${encodeURIComponent(groupId)}&id_intent=${encodeURIComponent(String(paymentIntent?.id_intent || ''))}`);
    } catch (error) {
      const errorCode = extractApiErrorCode(error);
      if (errorCode === 'PENDING_APPOINTMENT_EXPIRED') {
        setPendingError('Esta reserva ya expiró. Agenda nuevamente.');
        return;
      }
      if (errorCode === 'PENDING_APPOINTMENT_NOT_FOUND') {
        setPendingError('No encontramos una reserva pendiente vigente.');
        void loadPendingReservation();
        return;
      }
      setPendingError(error?.data?.error?.message || error?.message || 'No se pudo retomar la reserva pendiente.');
    } finally {
      setPendingSubmitting(false);
    }
  }, [loadPendingReservation, navigate, notifications, pendingData?.id_grupo_cita, user?.email]);

  const handleDiscardPendingPayment = useCallback(async () => {
    const groupId = String(pendingData?.id_grupo_cita || '').trim();
    if (!groupId) {
      setShowDiscardConfirm(false);
      return;
    }
    setPendingSubmitting(true);
    setPendingError('');
    try {
      await descartarClienteCitaPendiente(groupId);
      setShowDiscardConfirm(false);
      setPendingOpen(false);
      setPendingData(null);
      notifications.success('Reserva pendiente descartada correctamente.');
      await loadCitas();
      await loadPendingReservation();
    } catch (error) {
      const errorCode = extractApiErrorCode(error);
      if (errorCode === 'PENDING_DISCARD_STATE_UNAVAILABLE') {
        setPendingError('No fue posible descartar la reserva en este momento. Contacta al equipo de MasterFade.');
      } else {
        setPendingError(error?.data?.error?.message || error?.message || 'No se pudo descartar la reserva pendiente.');
      }
    } finally {
      setPendingSubmitting(false);
    }
  }, [loadCitas, loadPendingReservation, notifications, pendingData?.id_grupo_cita]);

  useEffect(() => {
    if (!canLoad) return;
    void loadPendingReservation();
  }, [canLoad, loadPendingReservation]);

  useEffect(() => {
    const shouldOpenFromState = Boolean(location?.state?.openPendingPaymentModal);
    if (!shouldOpenFromState || !canLoad) return;
    void handleOpenPending();
    navigate(location.pathname, { replace: true, state: null });
  }, [canLoad, handleOpenPending, location.pathname, location.state, navigate]);

  const pendingPaymentAnomalies = useMemo(
    () => citas.filter((item) => normalizeEstado(item?.estado_cita_codigo) === 'pendiente_pago'),
    [citas]
  );
  const upcoming = useMemo(
    () => citas.filter((item) => {
      const estado = normalizeEstado(item?.estado_cita_codigo);
      return isUpcoming(item) && ['confirmada', 'en_salon', 'en_atencion'].includes(estado);
    }),
    [citas]
  );
  const history = useMemo(
    () => citas.filter((item) => normalizeEstado(item?.estado_cita_codigo) === 'completada'),
    [citas]
  );

  const handleOpenDetail = useCallback(async (cita) => {
    const citaId = String(cita?.id_cita || '').trim();
    if (!citaId) return;
    setSelectedCita(cita);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailData(null);
    try {
      const payload = await getClienteCitaDetalle(citaId);
      setDetailData(payload || null);
    } catch (error) {
      setDetailError(error?.data?.error?.message || error?.message || 'No se pudo cargar el detalle de la cita.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const detailCita = detailData?.cita || selectedCita;
  const detailServicios = Array.isArray(detailData?.detalles) ? detailData.detalles : [];
  const detailTipoChip = resolveTipoCitaChip(detailCita?.tipo_cita_visual, detailCita?.tipo_cita_label);
  const pendingServices = Array.isArray(pendingData?.citas)
    ? pendingData.citas.flatMap((item) => (Array.isArray(item?.servicios) ? item.servicios : []))
    : [];

  return (
    <>
      <div className="space-y-5">
        <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Historial de citas</p>
              <h1 className="mf-font-display mt-2 text-2xl text-[var(--mf-text)]">Tus reservas</h1>
              <p className="mt-1 text-sm text-[var(--mf-text-2)]">Visualiza próximas citas y tu actividad pasada en un solo lugar.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/agendar')}
              className="mf-accent-gradient inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
            >
              <CalendarDays size={15} />
              Nueva cita
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs text-[var(--mf-text-2)]">
              Próximas: <strong className="ml-1 text-[var(--mf-text)]">{upcoming.length}</strong>
            </span>
            <span className="inline-flex rounded-full border border-[var(--mf-nav-border)] px-3 py-1 text-xs text-[var(--mf-text-2)]">
              Historial: <strong className="ml-1 text-[var(--mf-text)]">{history.length}</strong>
            </span>
            <span className="inline-flex rounded-full border border-[var(--mf-nav-border)] px-3 py-1 text-xs text-[var(--mf-text-2)]">
              Total: <strong className="ml-1 text-[var(--mf-text)]">{citas.length}</strong>
            </span>
          </div>
        </section>

        {loading || (!canLoad && isHydrating) ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => <div key={idx} className="mf-skeleton h-28 rounded-2xl" />)}
          </div>
        ) : (
          <>
            {pendingData ? (
              <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <p className="font-semibold">Detectamos citas pendientes de pago. Si esto no corresponde, contacta al equipo de MasterFade.</p>
                <p className="mt-1 text-amber-100/90">Reserva detectada: {String(pendingData?.id_grupo_cita || '').slice(0, 8).toUpperCase()}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleOpenPending}
                    className="inline-flex rounded-lg border border-amber-200/40 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/20"
                  >
                    Continuar pago
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingOpen(true);
                      setShowDiscardConfirm(true);
                    }}
                    className="inline-flex rounded-lg border border-amber-200/30 px-3 py-1.5 text-xs font-semibold text-amber-100/90 transition hover:bg-amber-300/10"
                  >
                    Descartar reserva pendiente
                  </button>
                </div>
              </section>
            ) : pendingPaymentAnomalies.length ? (
              <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <p className="font-semibold">Detectamos citas pendientes de pago. Si esto no corresponde, contacta al equipo de MasterFade.</p>
                <p className="mt-1 text-amber-100/90">Citas detectadas: {pendingPaymentAnomalies.length}</p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleOpenPending}
                    className="inline-flex rounded-lg border border-amber-200/40 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/20"
                  >
                    Ver reserva pendiente
                  </button>
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="inline-flex rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('proximas')}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                    activeTab === 'proximas'
                      ? 'bg-[var(--mf-accent)] text-black'
                      : 'text-[var(--mf-text-2)] hover:text-[var(--mf-text)]',
                  ].join(' ')}
                >
                  Próximas ({upcoming.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('historial')}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                    activeTab === 'historial'
                      ? 'bg-[var(--mf-accent)] text-black'
                      : 'text-[var(--mf-text-2)] hover:text-[var(--mf-text)]',
                  ].join(' ')}
                >
                  Historial ({history.length})
                </button>
              </div>

              {activeTab === 'proximas' ? (
                upcoming.length ? (
                  <CitasList items={upcoming} onOpenDetail={handleOpenDetail} />
                ) : (
                  <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
                    No tienes citas próximas.
                  </p>
                )
              ) : history.length ? (
                <CitasList items={history} onOpenDetail={handleOpenDetail} />
              ) : (
                <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
                  Aún no hay citas en tu historial.
                </p>
              )}
            </section>
          </>
        )}
      </div>

      <Dialog
        open={pendingOpen}
        onOpenChange={(open) => {
          setPendingOpen(open);
          if (!open) setShowDiscardConfirm(false);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reserva pendiente de pago</DialogTitle>
            <DialogDescription>
              Revisa los detalles antes de continuar con tu pago pendiente.
            </DialogDescription>
          </DialogHeader>

          {pendingLoading ? (
            <div className="space-y-2">
              <div className="mf-skeleton h-16 rounded-xl" />
              <div className="mf-skeleton h-16 rounded-xl" />
            </div>
          ) : pendingData ? (
            <div className="space-y-3">
              {pendingData?.multiple_pending_detected ? (
                <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Detectamos más de una reserva pendiente. Se continuará con la más reciente.
                </p>
              ) : null}

              {pendingError ? (
                <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <p>{pendingError}</p>
                  {pendingError.toLowerCase().includes('expiró') ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingOpen(false);
                        navigate('/agendar');
                      }}
                      className="mt-2 inline-flex rounded-lg border border-red-200/40 px-3 py-1 text-xs font-semibold text-red-100 transition hover:bg-red-500/15"
                    >
                      Agendar nuevamente
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text-2)]">
                <p><span className="font-semibold text-[var(--mf-text)]">Fecha y hora:</span> {formatDateTime(pendingData?.fecha_hora_referencia)}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Sucursal:</span> {pendingData?.sucursal?.nombre_sucursal || '-'}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Barbero:</span> {pendingData?.citas?.[0]?.nombre_barbero || '-'}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Total pendiente:</span> {formatMoney(pendingData?.total_pendiente_hnl)}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Vencimiento:</span> {formatDateTime(pendingData?.expires_at)}</p>
              </div>

              <section className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <h3 className="text-sm font-semibold text-[var(--mf-text)]">Servicios</h3>
                {pendingServices.length ? (
                  <div className="mt-2 space-y-2">
                    {pendingServices.map((item, idx) => (
                      <article key={`${item.id_servicio || 'svc'}-${idx}`} className="rounded-lg border border-[var(--mf-nav-border)] px-3 py-2 text-sm">
                        <p className="font-semibold text-[var(--mf-text)]">{item.nombre_servicio || 'Servicio'}</p>
                        <p className="mt-1 text-[var(--mf-text-2)]">
                          Cantidad: {Number(item.cantidad || 0)} | Precio: {formatMoney(item.precio_unitario_hnl)} | Subtotal: {formatMoney(item.subtotal_hnl)}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--mf-text-2)]">No hay servicios disponibles para esta reserva.</p>
                )}
              </section>

              {showDiscardConfirm ? (
                <section className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
                  <p>
                    Esta acción descartará tu reserva pendiente y liberará el horario. Si deseas agendar, deberás iniciar una nueva reserva.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDiscardPendingPayment()}
                      disabled={pendingSubmitting}
                      className="inline-flex rounded-lg border border-red-300/60 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-50 transition hover:bg-red-500/30 disabled:opacity-70"
                    >
                      {pendingSubmitting ? 'Descartando...' : 'Sí, descartar reserva'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDiscardConfirm(false)}
                      disabled={pendingSubmitting}
                      className="inline-flex rounded-lg border border-red-200/40 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/10"
                    >
                      Volver
                    </button>
                  </div>
                </section>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingOpen(false)}
                    className="inline-flex rounded-lg border border-[var(--mf-nav-border)] px-3 py-1.5 text-xs font-semibold text-[var(--mf-text-2)] transition hover:text-[var(--mf-text)]"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(true)}
                    disabled={pendingSubmitting}
                    className="inline-flex rounded-lg border border-amber-200/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10 disabled:opacity-70"
                  >
                    Descartar reserva pendiente
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleContinuePendingPayment()}
                    disabled={pendingSubmitting}
                    className="inline-flex rounded-lg border border-amber-200/40 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-300/20 disabled:opacity-70"
                  >
                    {pendingSubmitting ? 'Procesando...' : 'Continuar pago'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Esta reserva ya expiró. Agenda nuevamente.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setPendingOpen(false);
                    navigate('/agendar');
                  }}
                  className="inline-flex rounded-lg border border-amber-200/40 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-300/20"
                >
                  Agendar nuevamente
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de cita</DialogTitle>
            <DialogDescription>
              Revisa la información completa de tu cita.
            </DialogDescription>
            <div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${detailTipoChip.className}`}>
                {detailTipoChip.label}
              </span>
            </div>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-2">
              <div className="mf-skeleton h-20 rounded-xl" />
              <div className="mf-skeleton h-20 rounded-xl" />
            </div>
          ) : detailError ? (
            <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{detailError}</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text-2)] sm:grid-cols-2">
                <p><span className="font-semibold text-[var(--mf-text)]">Fecha y hora:</span> {formatDateTime(detailCita?.inicio_at)}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Estado:</span> {detailCita?.estado_cita_codigo || '-'}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Sucursal:</span> {detailCita?.nombre_sucursal || '-'}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Barbero:</span> {detailCita?.nombre_barbero || '-'}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Duración:</span> {Number(detailCita?.duracion_total_min || 0)} min</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Total:</span> {formatMoney(detailCita?.total_pagar_hnl)}</p>
              </div>

              <section className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <h3 className="text-sm font-semibold text-[var(--mf-text)]">Servicios</h3>
                {detailServicios.length ? (
                  <div className="mt-2 space-y-2">
                    {detailServicios.map((item) => (
                      <article key={`${item.id_servicio}-${item.nombre_servicio}`} className="rounded-lg border border-[var(--mf-nav-border)] px-3 py-2 text-sm">
                        <p className="font-semibold text-[var(--mf-text)]">{item.nombre_servicio || 'Servicio'}</p>
                        <p className="mt-1 text-[var(--mf-text-2)]">Cantidad: {Number(item.cantidad || 0)} | Precio: {formatMoney(item.precio_unitario_hnl)} | Subtotal: {formatMoney(item.subtotal_hnl)}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--mf-text-2)]">No hay servicios disponibles para esta cita.</p>
                )}
              </section>

              {detailCita?.notas ? (
                <section className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                  <h3 className="text-sm font-semibold text-[var(--mf-text)]">Notas</h3>
                  <p className="mt-1 text-sm text-[var(--mf-text-2)]">{detailCita.notas}</p>
                </section>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
