import { useCallback, useEffect, useState } from 'react';
import { Camera, Coins, MapPin, Phone, UserRound } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ClienteProfileCompletionBanner from '../components/ClienteProfileCompletionBanner.jsx';
import ClienteProfileEditModal from '../components/ClienteProfileEditModal.jsx';
import { getClienteMe } from '../lib/clienteApi.js';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium' }).format(date);
}

function toSafeText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const list = value
      .map((item) => toSafeText(item, ''))
      .map((item) => String(item).trim())
      .filter(Boolean);
    return list.length ? list.join(', ') : fallback;
  }
  if (typeof value === 'object') {
    const list = Object.values(value)
      .map((item) => toSafeText(item, ''))
      .map((item) => String(item).trim())
      .filter(Boolean);
    return list.length ? list.join(', ') : fallback;
  }
  return fallback;
}

export default function ClientePerfilPage() {
  const navigate = useNavigate();
  const { error: notifyError } = useNotifications();
  const { isAuthenticated, isHydrated, isHydrating, token, logout } = useAuth();
  const outletContext = useOutletContext() || {};
  const { refreshClienteProfile } = outletContext;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const canLoadProfile = Boolean(isAuthenticated && isHydrated && !isHydrating && token);

  const loadProfile = useCallback(async ({ silent = false } = {}) => {
    if (!canLoadProfile) return;
    if (!silent) setLoading(true);
    try {
      const payload = await getClienteMe();
      setData(payload);
      if (refreshClienteProfile) {
        void refreshClienteProfile({ silent: true });
      }
    } catch (error) {
      if (Number(error?.status) === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo cargar tu perfil.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canLoadProfile, logout, navigate, notifyError, refreshClienteProfile]);

  useEffect(() => {
    if (!canLoadProfile) return;
    void loadProfile();
  }, [canLoadProfile, loadProfile]);

  const profile = data?.cliente || null;
  const completion = data?.profile_completion || null;

  function handleProfileSaved(payload) {
    setData(payload);
    if (refreshClienteProfile) {
      void refreshClienteProfile({ silent: true });
    }
  }

  if ((!canLoadProfile && isHydrating) || loading) {
    return <div className="mf-skeleton h-56 rounded-3xl" />;
  }

  return (
    <div className="space-y-5">
      <ClienteProfileCompletionBanner
        profileCompletion={completion}
        onEditProfile={() => setModalOpen(true)}
      />

      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)]">
              {profile?.foto_perfil_signed_url ? (
                <img src={profile.foto_perfil_signed_url} alt="Foto de perfil" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--mf-text-2)]">
                  <Camera size={20} />
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Perfil cliente</p>
              <h1 className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">{toSafeText(profile?.nombre_completo, 'Cliente')}</h1>
              <p className="mt-1 text-sm text-[var(--mf-text-2)]">{toSafeText(profile?.correo_principal)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mf-accent-gradient inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold"
          >
            Editar perfil
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Masterpuntos</p>
            <p className="mt-2 inline-flex items-center gap-2 text-2xl font-semibold text-[var(--mf-text)]">
              <Coins size={18} className="text-[var(--mf-accent)]" />
              {Number(profile?.masterpuntos || 0)}
            </p>
          </article>

          <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Completitud de perfil</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">{Number(completion?.completion_percent || 0)}%</p>
          </article>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
          <h2 className="text-sm font-semibold text-[var(--mf-text)]">Datos personales</h2>
          <dl className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)]">
            <div className="flex items-center gap-2"><Phone size={14} /><span>{toSafeText(profile?.telefono_principal)}</span></div>
            <div className="flex items-center gap-2"><UserRound size={14} /><span>{toSafeText(profile?.genero_descripcion || profile?.genero_codigo)}</span></div>
            <div className="flex items-center gap-2"><MapPin size={14} /><span>{toSafeText(profile?.direccion_texto)}</span></div>
            <div className="flex items-center gap-2"><span className="text-[var(--mf-text)]">Nacimiento:</span><span>{formatDate(profile?.fecha_nacimiento)}</span></div>
          </dl>
        </article>

        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
          <h2 className="text-sm font-semibold text-[var(--mf-text)]">Preferencias para barbero</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
            {toSafeText(profile?.preferencias_corte, 'Aun no has registrado preferencias de corte.')}
          </p>
        </article>
      </section>

      <ClienteProfileEditModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        profile={profile}
        onSaved={handleProfileSaved}
      />
    </div>
  );
}


