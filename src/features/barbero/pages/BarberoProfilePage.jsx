import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, BriefcaseBusiness, Mail, MapPin, Phone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { getBarberoPerfil } from '../lib/barberoApi.js';
import { withImageVersion } from '../../../lib/imageCache.js';

function extractMessage(error) {
  return error?.data?.error?.message || error?.message || 'No se pudo cargar el perfil del barbero.';
}

function toSafeText(value, fallback = 'No registrado') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function formatDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium' }).format(parsed);
}

function formatDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('es-HN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'MF';
  return parts.map((part) => part[0]).join('').toUpperCase();
}

function formatAccessState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'activo') return 'Activo';
  if (normalized === 'pendiente_password') return 'Pendiente de contrasena';
  if (normalized === 'bloqueado') return 'Bloqueado';
  if (normalized === 'inactivo') return 'Inactivo';
  return normalized ? normalized : null;
}

function prettifyLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\bid\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

const EXCLUDED_KEYS = new Set([
  'documento',
  'dni',
  'rtn',
  'foto_perfil_signed_url',
  'foto_perfil_asset_id',
  'foto_perfil_url',
  'foto_url',
  'roles',
  'role',
  'permisos',
  'scope',
  'observaciones',
  'notas',
  'nota',
  'alias_publico',
  'resumen_publico',
  'certificaciones_titulos',
  'visible_en_landing',
]);

function isTechnicalKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return true;

  return (
    EXCLUDED_KEYS.has(normalized)
    || normalized === 'id'
    || normalized.startsWith('id_')
    || normalized.endsWith('_id')
    || normalized.includes('usuario_id')
    || normalized.includes('persona_id')
    || normalized.includes('empleado_id')
    || normalized.includes('created_at')
    || normalized.includes('updated_at')
    || normalized.includes('deleted_at')
    || normalized.includes('deleted')
    || normalized.includes('audit')
    || normalized.includes('auditoria')
    || normalized.includes('ultimo_login')
    || normalized.includes('credenciales')
    || normalized.includes('password')
    || normalized.includes('token')
    || normalized.includes('hash')
    || normalized.includes('saldo')
    || normalized.includes('monto')
    || normalized.includes('precio')
    || normalized.includes('salario')
    || normalized.includes('comision')
  );
}

function normalizeFieldValue(key, value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return null;

    if (key.includes('fecha') || key.endsWith('_at')) {
      return formatDateTime(normalized) || formatDate(normalized) || normalized;
    }

    return normalized;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Si' : 'No';
  }

  if (Array.isArray(value)) {
    const flat = value
      .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
      .filter(Boolean);
    return flat.length > 0 ? flat.join(', ') : null;
  }

  return null;
}

function categorizeField(key) {
  const normalized = String(key || '').toLowerCase();

  const personalHints = ['nombre', 'correo', 'email', 'telefono', 'movil', 'celular', 'direccion', 'genero', 'nacimiento'];
  const laborHints = ['sucursal', 'cargo', 'puesto', 'area', 'departamento', 'estado_laboral', 'estado_acceso', 'fecha_ingreso'];

  if (personalHints.some((hint) => normalized.includes(hint))) return 'personal';
  if (laborHints.some((hint) => normalized.includes(hint))) return 'laboral';
  return 'adicional';
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] text-[var(--mf-accent)]">
          <Icon size={16} strokeWidth={1.9} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">{label}</p>
          <p className="mt-1 text-sm text-[var(--mf-text)] break-words">{value}</p>
        </div>
      </div>
    </article>
  );
}

function InfoSection({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <section className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)] sm:p-5">
      <h2 className="text-lg font-semibold text-[var(--mf-text)]">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <InfoRow key={item.key} icon={item.icon} label={item.label} value={item.value} />
        ))}
      </div>
    </section>
  );
}

export default function BarberoProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState('');

  const profile = data?.perfil || null;

  const handleAuthError = useCallback((err) => {
    if (err?.status === 401) {
      navigate('/login', { replace: true });
      return true;
    }
    if (err?.status === 403) {
      navigate('/unauthorized', { replace: true });
      return true;
    }
    return false;
  }, [navigate]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await getBarberoPerfil();
      setData(payload);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(extractMessage(err));
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const displayName = profile?.nombre_completo || getUserDisplayName(user);
  const roleLabel = toSafeText(
    profile?.cargo || profile?.puesto || profile?.rol_nombre || (profile?.es_barbero ? 'Barbero' : null),
    'Barbero'
  );
  const statusLabel = formatAccessState(profile?.estado_acceso)
    || (typeof profile?.estado_laboral === 'boolean' ? (profile.estado_laboral ? 'Activo' : 'Inactivo') : null);

  const photoUrl = useMemo(
    () => withImageVersion(
      profile?.foto_perfil_url || profile?.foto_perfil_signed_url || profile?.foto_url || '',
      profile?.foto_perfil_updated_at
    ),
    [profile?.foto_perfil_url, profile?.foto_perfil_signed_url, profile?.foto_url, profile?.foto_perfil_updated_at]
  );

  const groupedFields = useMemo(() => {
    if (!profile || typeof profile !== 'object') {
      return { personal: [], laboral: [], adicional: [] };
    }

    const personal = [];
    const laboral = [];
    const adicional = [];

    Object.entries(profile).forEach(([rawKey, rawValue]) => {
      const key = String(rawKey || '').trim();
      const normalizedKey = key.toLowerCase();
      if (!key || isTechnicalKey(normalizedKey)) return;

      const value = normalizeFieldValue(normalizedKey, rawValue);
      if (!value) return;

      let icon = BadgeCheck;
      if (normalizedKey.includes('correo') || normalizedKey.includes('email')) icon = Mail;
      if (normalizedKey.includes('telefono') || normalizedKey.includes('celular') || normalizedKey.includes('movil')) icon = Phone;
      if (normalizedKey.includes('direccion')) icon = MapPin;
      if (normalizedKey.includes('cargo') || normalizedKey.includes('puesto') || normalizedKey.includes('sucursal') || normalizedKey.includes('estado')) icon = BriefcaseBusiness;

      const item = {
        key,
        label: prettifyLabel(key),
        value,
        icon,
      };

      const category = categorizeField(normalizedKey);
      if (category === 'personal') personal.push(item);
      else if (category === 'laboral') laboral.push(item);
      else adicional.push(item);
    });

    const sortByLabel = (left, right) => left.label.localeCompare(right.label, 'es-HN');
    personal.sort(sortByLabel);
    laboral.sort(sortByLabel);
    adicional.sort(sortByLabel);

    return { personal, laboral, adicional };
  }, [profile]);

  const publicCertifications = useMemo(
    () => (Array.isArray(profile?.certificaciones_titulos) ? profile.certificaciones_titulos : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
    [profile?.certificaciones_titulos]
  );

  const aliasPublico = toSafeText(profile?.alias_publico, '');
  const resumenPublico = toSafeText(profile?.resumen_publico, '');
  const hasPublicProfileData = Boolean(aliasPublico || resumenPublico || publicCertifications.length);

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Personas - Barbero</p>
          <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Perfil Barbero</h1>
          <p className="max-w-2xl text-sm text-[var(--mf-text-2)]">Vista informativa de tu expediente laboral.</p>
        </div>
      </header>

      {error ? <ErrorBanner message={error} onRetry={loadProfile} /> : null}
      {loading && !error ? <LoadingSpinner /> : null}

      {!loading && !error && profile ? (
        <>
          <section className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)] sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-2xl font-semibold text-[var(--mf-text)]">
                {photoUrl && failedPhotoUrl !== photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={displayName}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => setFailedPhotoUrl(photoUrl)}
                  />
                ) : (
                  getInitials(displayName)
                )}
              </div>

              <div className="min-w-0">
                <h2 className="text-2xl font-semibold text-[var(--mf-text)] sm:text-3xl">{displayName}</h2>
                <p className="mt-1 text-sm text-[var(--mf-text-2)]">{roleLabel}</p>
                {statusLabel ? (
                  <span className="mt-3 inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    {statusLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <InfoSection title="Informacion personal" items={groupedFields.personal} />
          {hasPublicProfileData ? (
            <section className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)] sm:p-5">
              <h2 className="text-lg font-semibold text-[var(--mf-text)]">Perfil publico</h2>
              <div className="mt-3 space-y-3">
                {aliasPublico ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Alias publico</p>
                    <p className="mt-1 text-sm text-[var(--mf-text)]">{aliasPublico}</p>
                  </div>
                ) : null}
                {resumenPublico ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Resumen publico</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--mf-text)]">{resumenPublico}</p>
                  </div>
                ) : null}
                {publicCertifications.length ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Certificaciones</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {publicCertifications.map((item) => (
                        <span
                          key={item}
                          className="inline-flex rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs text-[var(--mf-text)]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
          <InfoSection title="Informacion laboral" items={groupedFields.laboral} />
          <InfoSection title="Informacion adicional" items={groupedFields.adicional} />
        </>
      ) : null}

      {!loading && !error && !profile ? (
        <section className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-8 text-center text-sm text-[var(--mf-text-2)]">
          No se encontro informacion de perfil para mostrar.
        </section>
      ) : null}
    </div>
  );
}
