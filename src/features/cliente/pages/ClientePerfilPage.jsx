import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Camera, Coins, LockKeyhole, MapPin, Phone, Scissors, ShieldCheck, UserRound } from 'lucide-react';
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

function InfoRow({ icon: Icon, label, value, highlight = false }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">{label}</p>
        <p className={highlight ? 'mt-1 text-sm font-semibold text-[var(--mf-text)]' : 'mt-1 text-sm text-[var(--mf-text)]'}>
          {value}
        </p>
      </div>
    </div>
  );
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

  const profileCompletionPercent = useMemo(
    () => Math.max(0, Number(completion?.completion_percent || 0)),
    [completion?.completion_percent]
  );
  const profileIsComplete = Boolean(completion?.is_complete || profileCompletionPercent >= 100);

  function handleProfileSaved(payload) {
    setData(payload);
    if (refreshClienteProfile) {
      void refreshClienteProfile({ silent: true });
    }
  }

  if ((!canLoadProfile && isHydrating) || loading) {
    return <div className="mf-skeleton h-72 rounded-3xl" />;
  }

  return (
    <div className="space-y-5">
      <section className="mf-glass-surface rounded-[26px] border border-[var(--mf-nav-border)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 overflow-hidden rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)]">
              {profile?.foto_perfil_signed_url ? (
                <img src={profile.foto_perfil_signed_url} alt="Foto de perfil" className="h-full w-full object-cover object-center" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--mf-text-2)]">
                  <Camera size={20} />
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Perfil privado</p>
              <h1 className="mf-font-display mt-2 text-3xl leading-none text-[var(--mf-text)]">{toSafeText(profile?.nombre_completo, 'Cliente')}</h1>
              <p className="mt-1 text-sm text-[var(--mf-text-2)]">{toSafeText(profile?.correo_principal)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs text-[var(--mf-text-2)]">
              <Coins size={13} className="text-[var(--mf-accent)]" />
              Masterpuntos: {Number(profile?.masterpuntos || 0)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mf-nav-border)] px-3 py-1 text-xs text-[var(--mf-text-2)]">
              <ShieldCheck size={13} className={profileIsComplete ? 'text-emerald-300' : 'text-[var(--mf-accent)]'} />
              {profileIsComplete ? 'Perfil completo' : `Perfil ${profileCompletionPercent}%`}
            </span>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mf-accent-gradient inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold"
            >
              Editar perfil
            </button>
          </div>
        </div>
      </section>

      <ClienteProfileCompletionBanner
        profileCompletion={completion}
        onEditProfile={() => setModalOpen(true)}
      />

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--mf-accent)]">Identidad</h2>
          <div className="mt-4 space-y-3">
            <InfoRow icon={UserRound} label="Nombre" value={toSafeText(profile?.nombre_completo)} highlight />
            <InfoRow icon={Calendar} label="Fecha de nacimiento" value={formatDate(profile?.fecha_nacimiento)} highlight />
            <InfoRow icon={Phone} label="Celular principal" value={toSafeText(profile?.telefono_principal)} highlight />
            <InfoRow icon={UserRound} label="Género" value={toSafeText(profile?.genero_descripcion || profile?.genero_codigo)} />
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--mf-accent)]">Contacto</h2>
          <div className="mt-4 space-y-3">
            <InfoRow icon={MapPin} label="Dirección" value={toSafeText(profile?.direccion_texto)} />
            <InfoRow icon={UserRound} label="Correo de acceso" value={toSafeText(profile?.correo_principal)} />
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--mf-accent)]">Preferencias</h2>
          <div className="mt-4 space-y-3">
            <InfoRow
              icon={Scissors}
              label="Preferencias para barbero"
              value={toSafeText(profile?.preferencias_corte, 'Aún no has registrado preferencias de corte.')}
            />
            <p className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] px-3 py-2 text-xs leading-5 text-[var(--mf-text-2)]">
              Puedes actualizar este bloque desde editar perfil para mejorar recomendaciones en tus próximas citas.
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--mf-accent)]">Privacidad y seguridad</h2>
          <div className="mt-4 space-y-3">
            <InfoRow icon={ShieldCheck} label="Estado de sesión" value="Protegida y activa" />
            <InfoRow icon={LockKeyhole} label="Contraseña" value="Gestionada mediante flujo seguro existente" />
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-card)] px-4 text-sm font-semibold text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
            >
              Cambiar o crear contraseña
            </button>
            <p className="text-xs leading-5 text-[var(--mf-text-2)]">
              Si iniciaste con Google, este acceso te lleva al flujo seguro de recuperación para definir una contraseña propia.
            </p>
          </div>
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
