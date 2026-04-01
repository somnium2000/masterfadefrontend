import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Sparkles } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ClienteProfileCompletionBanner from '../components/ClienteProfileCompletionBanner.jsx';
import ClienteProfileEditModal from '../components/ClienteProfileEditModal.jsx';
import ClienteSummaryCards from '../components/ClienteSummaryCards.jsx';
import { getClienteMe, listClienteCitas } from '../lib/clienteApi.js';

function isUpcomingAppointment(cita) {
  const date = new Date(cita?.inicio_at || 0);
  return Number.isFinite(date.getTime()) && date.getTime() >= Date.now();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-HN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function ClienteDashboardPage() {
  const navigate = useNavigate();
  const { error: notifyError } = useNotifications();
  const { isAuthenticated, isHydrated, isHydrating, token, logout } = useAuth();
  const outletContext = useOutletContext() || {};
  const { refreshClienteProfile } = outletContext;

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [citas, setCitas] = useState([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const canLoadDashboard = Boolean(isAuthenticated && isHydrated && !isHydrating && token);

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!canLoadDashboard) return;
    if (!silent) setLoading(true);

    try {
      const [mePayload, citasPayload] = await Promise.all([
        getClienteMe(),
        listClienteCitas(),
      ]);

      setProfileData(mePayload);
      setCitas(Array.isArray(citasPayload?.citas) ? citasPayload.citas : []);
      if (refreshClienteProfile) {
        void refreshClienteProfile({ silent: true });
      }
    } catch (error) {
      if (Number(error?.status) === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo cargar tu dashboard de cliente.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canLoadDashboard, logout, navigate, notifyError, refreshClienteProfile]);

  useEffect(() => {
    if (!canLoadDashboard) return;
    void loadDashboard();
  }, [canLoadDashboard, loadDashboard]);

  const profile = profileData?.cliente || null;
  const completion = profileData?.profile_completion || null;

  const upcomingAppointments = useMemo(
    () => citas.filter((item) => isUpcomingAppointment(item)),
    [citas]
  );

  const nextAppointments = useMemo(() => upcomingAppointments.slice(0, 3), [upcomingAppointments]);

  function handleProfileSaved(payload) {
    setProfileData(payload);
    if (refreshClienteProfile) {
      void refreshClienteProfile({ silent: true });
    }
  }

  if ((!canLoadDashboard && isHydrating) || loading) {
    return (
      <div className="space-y-4">
        <div className="mf-skeleton h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="mf-skeleton h-36 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-btn-border)] p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">
          Cliente autenticado
        </p>
        <h1 className="mf-font-display mt-2 text-3xl leading-[0.95] text-[var(--mf-text)] sm:text-4xl">
          Tu espacio premium en MasterFade
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--mf-text-2)]">
          Administra tus citas, actualiza tu perfil y mantén tus preferencias listas para cada visita.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/agendar')}
            className="mf-accent-gradient inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
          >
            <CalendarDays size={16} />
            Nueva cita
          </button>
          <button
            type="button"
            onClick={() => setProfileModalOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 text-sm font-semibold text-[var(--mf-text)]"
          >
            <Sparkles size={16} />
            Editar perfil
          </button>
          <button
            type="button"
            onClick={() => navigate('/home/cliente/citas')}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-transparent px-4 text-sm font-semibold text-[var(--mf-text-2)]"
          >
            <Clock3 size={16} />
            Ver historial
          </button>
        </div>
      </section>

      <ClienteProfileCompletionBanner
        profileCompletion={completion}
        onEditProfile={() => setProfileModalOpen(true)}
      />

      <ClienteSummaryCards
        masterpuntos={profile?.masterpuntos || 0}
        upcomingAppointments={upcomingAppointments.length}
        completionPercent={completion?.completion_percent || 0}
        onNewAppointment={() => navigate('/agendar')}
        onOpenProfile={() => setProfileModalOpen(true)}
      />

      <section className="mf-glass-surface rounded-[22px] border border-[var(--mf-nav-border)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Proximas citas</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--mf-text)]">Agenda inmediata</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/home/cliente/citas')}
            className="text-xs font-semibold text-[var(--mf-accent)]"
          >
            Ver todas
          </button>
        </div>

        {nextAppointments.length ? (
          <div className="mt-4 space-y-3">
            {nextAppointments.map((cita) => (
              <article
                key={cita.id_cita}
                className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--mf-text)]">{cita.nombre_sucursal || 'Sucursal'}</p>
                  <span className="mf-badge mf-badge-gold">{cita.estado_cita_codigo}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--mf-text-2)]">Barbero: {cita.nombre_barbero || 'Por definir'}</p>
                <p className="mt-1 text-xs text-[var(--mf-text-2)]">{formatDateTime(cita.inicio_at)}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--mf-text-2)]">
            Aun no tienes citas futuras. Agenda tu proxima visita en segundos.
          </p>
        )}
      </section>

      <ClienteProfileEditModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        profile={profile}
        onSaved={handleProfileSaved}
      />
    </div>
  );
}
