import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, MapPin, Scissors, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { listClienteCitas } from '../lib/clienteApi.js';

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

function CitaCard({ cita }) {
  return (
    <article className="mf-glass-surface rounded-[20px] border border-[var(--mf-nav-border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--mf-text)]">{cita.nombre_sucursal || 'Sucursal'}</p>
        <span className="mf-badge mf-badge-gold">{cita.estado_cita_codigo}</span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-[var(--mf-text-2)] sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} />
          <span>{formatDateTime(cita.inicio_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock3 size={14} />
          <span>Duracion: {Number(cita.duracion_total_min || 0)} min</span>
        </div>
        <div className="flex items-center gap-2">
          <Scissors size={14} />
          <span>{cita.nombre_barbero || 'Barbero por definir'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Wallet size={14} />
          <span>L {Number(cita.total_pagar_hnl || 0).toFixed(2)}</span>
        </div>
        {cita.notas ? (
          <div className="flex items-center gap-2 sm:col-span-2">
            <MapPin size={14} />
            <span>{cita.notas}</span>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

export default function ClienteHistorialCitasPage() {
  const navigate = useNavigate();
  const { error: notifyError } = useNotifications();
  const { isAuthenticated, isHydrated, isHydrating, token, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [citas, setCitas] = useState([]);

  const canLoad = Boolean(isAuthenticated && isHydrated && !isHydrating && token);

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
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo cargar tu historial de citas.');
    } finally {
      setLoading(false);
    }
  }, [canLoad, logout, navigate, notifyError]);

  useEffect(() => {
    if (!canLoad) return;
    void loadCitas();
  }, [canLoad, loadCitas]);

  const upcoming = useMemo(() => citas.filter((item) => isUpcoming(item)), [citas]);
  const past = useMemo(() => citas.filter((item) => !isUpcoming(item)), [citas]);

  return (
    <div className="space-y-5">
      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Historial de citas</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">Tus reservas</h1>
            <p className="mt-1 text-sm text-[var(--mf-text-2)]">Consulta tus citas proximas y el historial completo.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/agendar')}
            className="mf-accent-gradient inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold"
          >
            Nueva cita
          </button>
        </div>
      </section>

      {loading || (!canLoad && isHydrating) ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => <div key={idx} className="mf-skeleton h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--mf-text)]">Proximas ({upcoming.length})</h2>
            {upcoming.length ? upcoming.map((cita) => <CitaCard key={cita.id_cita} cita={cita} />) : (
              <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
                No tienes citas proximas.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--mf-text)]">Historial ({past.length})</h2>
            {past.length ? past.map((cita) => <CitaCard key={cita.id_cita} cita={cita} />) : (
              <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
                Aun no hay citas pasadas en tu historial.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}


