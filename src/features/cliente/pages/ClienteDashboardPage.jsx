import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ClienteProfileCompletionBanner from '../components/ClienteProfileCompletionBanner.jsx';
import ClienteProfileEditModal from '../components/ClienteProfileEditModal.jsx';
import ClienteCourtesyRouteSection from '../components/ClienteCourtesyRouteSection.jsx';
import ClienteSummaryCards from '../components/ClienteSummaryCards.jsx';
import CardsCarousel from '../../../components/data/CardsCarousel.jsx';
import { getClienteCitaDetalle, getClienteMe, listClienteCitas } from '../lib/clienteApi.js';
import { listPublicCatalogServices } from '../../public/lib/catalogApi.js';

const UPCOMING_ALLOWED_STATUS = new Set(['confirmada']);
const COMPLETED_APPOINTMENT_STATUS = new Set(['completada']);

function getDateTimePartsInHonduras(isoValue = null) {
  const date = isoValue ? new Date(isoValue) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tegucigalpa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 0);
  const day = Number(parts.find((part) => part.type === 'day')?.value || 0);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  const second = Number(parts.find((part) => part.type === 'second')?.value || 0);
  if (!year || !month || !day) return null;
  return { year, month, day, hour, minute, second };
}

function compareDateTimeParts(left, right) {
  if (!left || !right) return 0;
  const leftKey = [left.year, left.month, left.day, left.hour, left.minute, left.second];
  const rightKey = [right.year, right.month, right.day, right.hour, right.minute, right.second];
  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] > rightKey[index]) return 1;
    if (leftKey[index] < rightKey[index]) return -1;
  }
  return 0;
}

function isUpcomingConfirmedAppointment(cita, nowMs) {
  const status = String(cita?.estado_cita_codigo || '').trim().toLowerCase();
  if (!UPCOMING_ALLOWED_STATUS.has(status)) return false;
  const citaParts = getDateTimePartsInHonduras(cita?.inicio_at);
  const nowParts = getDateTimePartsInHonduras(new Date(nowMs).toISOString());
  if (!citaParts || !nowParts) return false;
  return compareDateTimeParts(citaParts, nowParts) >= 0;
}

function normalizeRecommendedService(record = {}) {
  const id = String(record?.id_servicio || '').trim();
  const name = String(record?.nombre_servicio || '').trim();
  if (!id || !name) return null;
  return {
    id_servicio: id,
    nombre_servicio: name,
    total: null,
  };
}

async function resolveFavoriteServicesFromCompletedAppointments(citas = []) {
  const completedAppointments = (Array.isArray(citas) ? citas : [])
    .filter((cita) => COMPLETED_APPOINTMENT_STATUS.has(String(cita?.estado_cita_codigo || '').trim().toLowerCase()))
    .sort((left, right) => new Date(right?.inicio_at || 0).getTime() - new Date(left?.inicio_at || 0).getTime());

  if (completedAppointments.length < 2) {
    return {
      useRecommended: true,
      favorites: [],
    };
  }

  // AM: Top 3 se calcula sobre historial completado reciente para evitar llamadas excesivas.
  const source = completedAppointments.slice(0, 20);
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

  const favorites = [...frequencyMap.values()]
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return new Date(b.ultima_fecha || 0).getTime() - new Date(a.ultima_fecha || 0).getTime();
    })
    .slice(0, 3);

  if (!favorites.length) {
    return {
      useRecommended: true,
      favorites: [],
    };
  }

  return {
    useRecommended: false,
    favorites,
  };
}

async function resolveRecommendedServices(idSucursal = '') {
  const payload = await listPublicCatalogServices({ id_sucursal: idSucursal || undefined });
  const services = Array.isArray(payload?.services) ? payload.services : [];
  return services
    .filter((service) => service?.activo !== false && service?.agendable !== false && service?.servicio_informativo !== true)
    .map((service) => normalizeRecommendedService(service))
    .filter(Boolean)
    .slice(0, 3);
}

export default function ClienteDashboardPage() {
  const navigate = useNavigate();
  const { error: notifyError } = useNotifications();
  const { isAuthenticated, isHydrated, isHydrating, logout } = useAuth();
  const outletContext = useOutletContext() || {};
  const { refreshClienteProfile } = outletContext;

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [allCitas, setAllCitas] = useState([]);
  const [favoriteServices, setFavoriteServices] = useState([]);
  const [favoriteServicesMode, setFavoriteServicesMode] = useState('recommended');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const canLoadDashboard = Boolean(isAuthenticated && isHydrated && !isHydrating);

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
      setAllCitas(nextCitas);

      try {
        const favoritesResult = await resolveFavoriteServicesFromCompletedAppointments(nextCitas);
        if (favoritesResult.useRecommended) {
          const preferredBranchId = String(mePayload?.cliente?.id_sucursal_preferida || mePayload?.id_sucursal_preferida || '').trim();
          const recommendedServices = await resolveRecommendedServices(preferredBranchId);
          setFavoriteServices(recommendedServices);
          setFavoriteServicesMode('recommended');
        } else {
          setFavoriteServices(favoritesResult.favorites);
          setFavoriteServicesMode('favorites');
        }
      } catch {
        try {
          const preferredBranchId = String(mePayload?.cliente?.id_sucursal_preferida || mePayload?.id_sucursal_preferida || '').trim();
          const recommendedServices = await resolveRecommendedServices(preferredBranchId);
          setFavoriteServices(recommendedServices);
        } catch {
          setFavoriteServices([]);
        }
        setFavoriteServicesMode('recommended');
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

  useEffect(() => {
    const clockId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(clockId);
    };
  }, []);

  const profile = profileData?.cliente || null;
  const completion = profileData?.profile_completion || null;
  const completionPercent = Math.max(0, Number(completion?.completion_percent || 0));
  const isProfileComplete = Boolean(completion?.is_complete || completionPercent >= 100);

  const upcomingAppointments = useMemo(() => {
    return allCitas
      .filter((item) => isUpcomingConfirmedAppointment(item, nowMs))
      .sort((left, right) => new Date(left?.inicio_at || 0).getTime() - new Date(right?.inicio_at || 0).getTime());
  }, [allCitas, nowMs]);
  const nextUpcomingAppointmentAt = upcomingAppointments[0]?.inicio_at || null;

  const shouldUseFavoriteServicesCarousel = favoriteServices.length > 2;

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
      <ClienteCourtesyRouteSection />

      <ClienteSummaryCards
        upcomingAppointments={upcomingAppointments.length}
        totalAppointments={allCitas.length}
        nextUpcomingAppointmentAt={nextUpcomingAppointmentAt}
        completionPercent={completionPercent}
        hideProfileKpi={isProfileComplete}
        onNewAppointment={() => navigate('/agendar')}
        onOpenProfile={() => setProfileModalOpen(true)}
        hideRewardsHero
      />

      <ClienteProfileCompletionBanner
        profileCompletion={completion}
        compact
        onEditProfile={() => setProfileModalOpen(true)}
      />

      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">
              {favoriteServicesMode === 'favorites' ? 'Servicios favoritos' : 'Servicios recomendados'}
            </p>
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
          shouldUseFavoriteServicesCarousel ? (
            <div className="mt-4">
              <CardsCarousel
                items={favoriteServices}
                getItemKey={(item) => String(item.id_servicio || item.nombre_servicio)}
                pageSizeByViewport={{ mobile: 2, tablet: 2, desktop: 2 }}
                gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
                compactControls
                showHeaderTag={false}
                renderItem={(item) => (
                  <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <p className="text-sm font-semibold text-[var(--mf-text)]">{item.nombre_servicio}</p>
                    <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                      {favoriteServicesMode === 'favorites'
                        ? `${item.total} reserva(s) histórica(s)`
                        : 'Servicio recomendado del catálogo.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/agendar')}
                      className="mt-3 inline-flex h-8 items-center justify-center rounded-lg border border-[var(--mf-btn-border)] bg-[var(--mf-card)] px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
                    >
                      Reservar
                    </button>
                  </article>
                )}
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {favoriteServices.map((item) => (
                <article
                  key={String(item.id_servicio || item.nombre_servicio)}
                  className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4"
                >
                  <p className="text-sm font-semibold text-[var(--mf-text)]">{item.nombre_servicio}</p>
                  <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                    {favoriteServicesMode === 'favorites'
                      ? `${item.total} reserva(s) histórica(s)`
                      : 'Servicio recomendado del catálogo.'}
                  </p>
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
          )
        ) : (
          <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
            <p>Aún no hay historial suficiente. Te recomendamos estos servicios populares.</p>
          </div>
        )}
        {favoriteServicesMode === 'recommended' && favoriteServices.length ? (
          <p className="mt-3 text-sm text-[var(--mf-text-2)]">
            Aún no hay historial suficiente. Te recomendamos estos servicios populares.
          </p>
        ) : null}
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
