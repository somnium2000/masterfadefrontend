import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ClienteProfileCompletionBanner from '../components/ClienteProfileCompletionBanner.jsx';
import ClienteProfileEditModal from '../components/ClienteProfileEditModal.jsx';
import ClienteSummaryCards from '../components/ClienteSummaryCards.jsx';
import { getClienteCitaDetalle, getClienteMe, listClienteCitas } from '../lib/clienteApi.js';

function isUpcomingAppointment(cita) {
  const date = new Date(cita?.inicio_at || 0);
  return Number.isFinite(date.getTime()) && date.getTime() >= Date.now();
}

async function resolveFavoriteServices(citas = []) {
  const source = Array.isArray(citas) ? citas.slice(0, 8) : [];
  if (!source.length) return [];

  const detailsResults = await Promise.allSettled(
    source
      .map((cita) => cita?.id_cita)
      .filter(Boolean)
      .map((idCita) => getClienteCitaDetalle(idCita))
  );

  const frequencyMap = new Map();

  detailsResults.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const detalles = Array.isArray(result.value?.detalles) ? result.value.detalles : [];
    const citaDate = source[index]?.inicio_at || null;

    detalles.forEach((detail) => {
      const name = String(detail?.nombre_servicio || '').trim();
      if (!name) return;

      const key = String(detail?.id_servicio || name);
      const current = frequencyMap.get(key) || {
        id_servicio: detail?.id_servicio || null,
        nombre_servicio: name,
        total: 0,
        ultima_fecha: citaDate,
      };

      current.total += Number(detail?.cantidad || 1);
      if (citaDate && (!current.ultima_fecha || new Date(citaDate).getTime() > new Date(current.ultima_fecha).getTime())) {
        current.ultima_fecha = citaDate;
      }
      frequencyMap.set(key, current);
    });
  });

  return [...frequencyMap.values()]
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return new Date(b.ultima_fecha || 0).getTime() - new Date(a.ultima_fecha || 0).getTime();
    })
    .slice(0, 4);
}

export default function ClienteDashboardPage() {
  const navigate = useNavigate();
  const { error: notifyError } = useNotifications();
  const { isAuthenticated, isHydrated, isHydrating, logout } = useAuth();
  const outletContext = useOutletContext() || {};
  const { refreshClienteProfile } = outletContext;

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [citas, setCitas] = useState([]);
  const [favoriteServices, setFavoriteServices] = useState([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const canLoadDashboard = Boolean(isAuthenticated && isHydrated && !isHydrating  );

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!canLoadDashboard) return;
    if (!silent) setLoading(true);

    try {
      const [mePayload, citasPayload] = await Promise.all([
        getClienteMe(),
        listClienteCitas(),
      ]);

      const nextCitas = Array.isArray(citasPayload?.citas) ? citasPayload.citas : [];
      setProfileData(mePayload);
      setCitas(nextCitas);

      try {
        const favorites = await resolveFavoriteServices(nextCitas);
        setFavoriteServices(favorites);
      } catch {
        setFavoriteServices([]);
      }

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

  const frequentBarbers = useMemo(() => {
    const map = new Map();
    citas.forEach((item) => {
      const barberName = String(item?.nombre_barbero || '').trim();
      if (!barberName) return;
      map.set(barberName, Number(map.get(barberName) || 0) + 1);
    });
    return [...map.entries()]
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [citas]);

  function handleProfileSaved(payload) {
    setProfileData(payload);
    if (refreshClienteProfile) {
      void refreshClienteProfile({ silent: true });
    }
  }

  if ((!canLoadDashboard && isHydrating) || loading) {
    return (
      <div className="space-y-4">
        <div className="mf-skeleton h-28 w-full rounded-2xl" />
        <div className="mf-skeleton h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="mf-skeleton h-44 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ClienteSummaryCards
        masterpuntos={profile?.masterpuntos || 0}
        upcomingAppointments={upcomingAppointments.length}
        totalAppointments={citas.length}
        completionPercent={completion?.completion_percent || 0}
        onNewAppointment={() => navigate('/agendar')}
        onOpenProfile={() => setProfileModalOpen(true)}
      />

      <ClienteProfileCompletionBanner
        profileCompletion={completion}
        compact
        onEditProfile={() => setProfileModalOpen(true)}
      />

      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Servicios favoritos</p>
            <h2 className="mf-font-display mt-1 text-xl text-[var(--mf-text)]">Reserva más rápido</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/agendar')}
            className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mf-accent)]"
          >
            Agendar
          </button>
        </div>

        {favoriteServices.length ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {favoriteServices.map((item) => (
              <article
                key={String(item.id_servicio || item.nombre_servicio)}
                className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4"
              >
                <p className="text-sm font-semibold text-[var(--mf-text)]">{item.nombre_servicio}</p>
                <p className="mt-2 text-xs text-[var(--mf-text-2)]">{item.total} reserva(s) histórica(s)</p>
                <button
                  type="button"
                  onClick={() => navigate('/agendar')}
                  className="mt-3 inline-flex h-8 items-center justify-center rounded-lg border border-[var(--mf-btn-border)] bg-[var(--mf-card)] px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
                >
                  Reservar
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
            {frequentBarbers.length ? (
              <div>
                <p className="font-semibold text-[var(--mf-text)]">Aún no hay suficiente detalle para favoritos por servicio.</p>
                <p className="mt-1">
                  Basado en actividad reciente, tus barberos más frecuentes son: {frequentBarbers.map((item) => `${item.nombre} (${item.total})`).join(', ')}.
                </p>
              </div>
            ) : (
              <p>Aún no hay historial suficiente para identificar favoritos. Cuando registres más citas, aparecerán aquí.</p>
            )}
          </div>
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

