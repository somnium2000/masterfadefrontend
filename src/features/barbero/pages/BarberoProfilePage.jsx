import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  RefreshCcw,
  Scissors,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { getBarberoPerfil, updateBarberoPerfil } from '../lib/barberoApi.js';

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
  if (!value) return 'No registrado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No registrado';
  return new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium' }).format(parsed);
}

function formatDateTime(value) {
  if (!value) return 'Sin actividad registrada';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin actividad registrada';
  return new Intl.DateTimeFormat('es-HN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatMoney(value) {
  if (value == null) return 'Tarifa no definida';
  const amount = Number(value || 0);
  return new Intl.NumberFormat('es-HN', {
    style: 'currency',
    currency: 'HNL',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatAccessState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'activo') return 'Activo';
  if (normalized === 'pendiente_password') return 'Pendiente de contraseña';
  if (normalized === 'bloqueado') return 'Bloqueado';
  if (normalized === 'inactivo') return 'Inactivo';
  return normalized ? normalized : 'Sin estado';
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'MF';
  return parts.map((part) => part[0]).join('').toUpperCase();
}

function toInputDate(value) {
  return value ? String(value).slice(0, 10) : '';
}

function buildEditForm(profile) {
  return {
    telefono_principal: profile?.telefono_principal || '',
    fecha_nacimiento: toInputDate(profile?.fecha_nacimiento),
    genero_codigo: profile?.genero_codigo || '',
    dni: profile?.dni || '',
    rtn: profile?.rtn || '',
    direccion_texto: profile?.direccion_texto || '',
    observaciones: profile?.observaciones || '',
  };
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] text-[var(--mf-accent)]">
        <Icon size={16} strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">{label}</p>
        <p className="mt-1 text-sm text-[var(--mf-text)]">{value}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, helper }) {
  return (
    <article className="rounded-[22px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] px-4 py-4 shadow-[var(--mf-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--mf-text-2)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold leading-none text-[var(--mf-text)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--mf-text-2)]">{helper}</p>
    </article>
  );
}

function OfferedServiceCard({ service }) {
  return (
    <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-[var(--mf-text)]">{service.nombre_servicio || 'Servicio'}</p>
          <p className="mt-1 text-xs text-[var(--mf-text-2)]">
            {Number(service.duracion_min || 0)} min
            {Number(service.buffer_min || 0) > 0 ? ` + ${Number(service.buffer_min)} min buffer` : ''}
          </p>
        </div>
        <span className="rounded-full border border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] px-3 py-1 text-xs font-medium text-[var(--mf-accent)]">
          {formatMoney(service.precio_hnl)}
        </span>
      </div>
    </article>
  );
}

export default function BarberoProfilePage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    telefono_principal: '',
    fecha_nacimiento: '',
    genero_codigo: '',
    dni: '',
    rtn: '',
    direccion_texto: '',
    observaciones: '',
  });

  const profile = data?.perfil || null;
  const summary = data?.resumen || null;
  const offeredServices = useMemo(
    () => (Array.isArray(data?.servicios_ofrecidos) ? data.servicios_ofrecidos : []),
    [data?.servicios_ofrecidos]
  );

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
  const roleLabel = Array.isArray(profile?.roles) && profile.roles.length > 0
    ? profile.roles.join(', ')
    : 'Barbero';

  function openEditDialog() {
    if (!profile) return;
    setEditForm(buildEditForm(profile));
    setEditOpen(true);
  }

  async function submitProfileUpdate() {
    setEditSaving(true);
    try {
      const payload = await updateBarberoPerfil({
        telefono_principal: editForm.telefono_principal || null,
        fecha_nacimiento: editForm.fecha_nacimiento || null,
        genero_codigo: editForm.genero_codigo || null,
        dni: editForm.dni || null,
        rtn: editForm.rtn || null,
        direccion_texto: editForm.direccion_texto || null,
        observaciones: editForm.observaciones || null,
      });
      setData(payload);
      setEditOpen(false);
      notifications.success('Perfil actualizado.', { dedupeKey: 'barbero-profile-update-ok' });
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'barbero-profile-update-error' });
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Personas - Barbero</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Perfil Barbero</h1>
            <p className="max-w-2xl text-sm text-[var(--mf-text-2)]">
              Vista personal del expediente operativo respaldado por base de datos.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={openEditDialog}>
              <PencilLine size={16} />
              Actualizar perfil
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={loadProfile}>
              <RefreshCcw size={16} />
              Recargar
            </Button>
          </div>
        </div>
      </header>

      {error ? <ErrorBanner message={error} onRetry={loadProfile} /> : null}
      {loading && !error ? <LoadingSpinner /> : null}

      {!loading && !error && profile ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.38fr)_minmax(320px,0.92fr)]">
            <article className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="flex flex-col items-center gap-3 lg:w-[168px] lg:items-start">
                  <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-3xl font-semibold text-[var(--mf-text)]">
                    {profile?.foto_perfil_signed_url ? (
                      <img
                        src={profile.foto_perfil_signed_url}
                        alt={displayName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      getInitials(displayName)
                    )}
                  </div>
                  <Button type="button" variant="outline" className="w-full lg:w-auto" disabled>
                    Cambio de fotografía pendiente
                  </Button>
                </div>

                <div className="min-w-0 flex-1 space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--mf-accent)]">Perfil activo</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--mf-text)] sm:text-3xl">{displayName}</h2>
                    <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                      {toSafeText(roleLabel)}{profile?.nombre_sucursal ? ` - ${profile.nombre_sucursal}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                      {formatAccessState(profile?.estado_acceso)}
                    </span>
                    {profile?.estado_laboral ? (
                      <span className="inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
                        Empleado activo
                      </span>
                    ) : null}
                    {profile?.es_barbero ? (
                      <span className="inline-flex rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs font-medium text-[var(--mf-text)]">
                        Perfil barbero habilitado
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoRow icon={Mail} label="Correo principal" value={toSafeText(profile?.correo_principal)} />
                    <InfoRow icon={Phone} label="Teléfono" value={toSafeText(profile?.telefono_principal)} />
                    <InfoRow icon={Store} label="Sucursal" value={toSafeText(profile?.nombre_sucursal)} />
                    <InfoRow icon={CalendarDays} label="Ingreso" value={formatDate(profile?.fecha_ingreso)} />
                  </div>
                </div>
              </div>
            </article>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <StatCard
                label="Total completadas"
                value={Number(summary?.citas_completadas_hoy || 0)}
                helper={`Solo cuenta las completadas del día ${toSafeText(summary?.fecha_operativa, '-')}.`}
              />
              <StatCard
                label="Activas hoy"
                value={Number(summary?.citas_activas_hoy || 0)}
                helper="Citas pendientes por atender en la fecha operativa."
              />
              <StatCard
                label="Servicios ofrecidos"
                value={Number(summary?.servicios_ofrecidos_total || 0)}
                helper="Servicios actualmente habilitados para este barbero."
              />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.95fr)]">
            <article className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)] sm:p-5">
              <div className="flex items-center gap-2">
                <Scissors size={18} className="text-[var(--mf-accent)]" />
                <h2 className="text-lg font-semibold text-[var(--mf-text)]">Servicios ofrecidos</h2>
              </div>
              <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                Catálogo real de servicios configurados para este barbero.
              </p>

              {offeredServices.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {offeredServices.map((service) => (
                    <OfferedServiceCard key={service.id_servicio} service={service} />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[20px] border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-6 text-center text-sm text-[var(--mf-text-2)]">
                  Aún no hay servicios ofrecidos configurados para mostrar en este perfil.
                </div>
              )}
            </article>

            <div className="space-y-4">
              <article className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)] sm:p-5">
                <div className="flex items-center gap-2">
                  <UserRound size={18} className="text-[var(--mf-accent)]" />
                  <h2 className="text-lg font-semibold text-[var(--mf-text)]">Expediente</h2>
                </div>
                <div className="mt-4 grid gap-3">
                  <InfoRow icon={BadgeCheck} label="Género" value={toSafeText(profile?.genero_codigo)} />
                  <InfoRow icon={CalendarDays} label="Nacimiento" value={formatDate(profile?.fecha_nacimiento)} />
                  <InfoRow icon={ShieldCheck} label="DNI" value={toSafeText(profile?.dni)} />
                  <InfoRow icon={ShieldCheck} label="RTN" value={toSafeText(profile?.rtn)} />
                  <InfoRow icon={MapPin} label="Dirección" value={toSafeText(profile?.direccion_texto)} />
                </div>
              </article>

              <article className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)] sm:p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[var(--mf-accent)]" />
                  <h2 className="text-lg font-semibold text-[var(--mf-text)]">Seguridad y estado</h2>
                </div>
                <div className="mt-4 grid gap-3">
                  <InfoRow icon={ShieldCheck} label="Acceso" value={formatAccessState(profile?.estado_acceso)} />
                  <InfoRow icon={BadgeCheck} label="Credenciales" value={formatDateTime(profile?.credenciales_completadas_at)} />
                  <InfoRow icon={CalendarDays} label="Último login" value={formatDateTime(profile?.ultimo_login_at)} />
                </div>
              </article>

              {profile?.observaciones ? (
                <article className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)] sm:p-5">
                  <h2 className="text-lg font-semibold text-[var(--mf-text)]">Observaciones</h2>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--mf-text-2)]">{profile.observaciones}</p>
                </article>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Actualizar perfil</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 rounded-2xl border border-dashed border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
              La carga de fotografía a Supabase quedará pendiente para una siguiente validación.
            </div>

            <div>
              <Label className="mf-label">Teléfono</Label>
              <Input
                className="mf-input mt-1"
                value={editForm.telefono_principal}
                onChange={(event) => setEditForm((prev) => ({ ...prev, telefono_principal: event.target.value }))}
                placeholder="Ej. 9999-9999"
              />
            </div>
            <div>
              <Label className="mf-label">Fecha de nacimiento</Label>
              <Input
                type="date"
                className="mf-input mt-1"
                value={editForm.fecha_nacimiento}
                onChange={(event) => setEditForm((prev) => ({ ...prev, fecha_nacimiento: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mf-label">Género</Label>
              <Input
                className="mf-input mt-1"
                value={editForm.genero_codigo}
                onChange={(event) => setEditForm((prev) => ({ ...prev, genero_codigo: event.target.value }))}
                placeholder="Ej. M, F, NB"
              />
            </div>
            <div>
              <Label className="mf-label">DNI</Label>
              <Input
                className="mf-input mt-1"
                value={editForm.dni}
                onChange={(event) => setEditForm((prev) => ({ ...prev, dni: event.target.value }))}
                placeholder="Solo números"
              />
            </div>
            <div>
              <Label className="mf-label">RTN</Label>
              <Input
                className="mf-input mt-1"
                value={editForm.rtn}
                onChange={(event) => setEditForm((prev) => ({ ...prev, rtn: event.target.value }))}
                placeholder="Solo números"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Dirección</Label>
              <textarea
                className="mf-input mt-1 min-h-[92px] w-full resize-y rounded-2xl px-3 py-3"
                value={editForm.direccion_texto}
                onChange={(event) => setEditForm((prev) => ({ ...prev, direccion_texto: event.target.value }))}
                placeholder="Dirección registrada en el expediente"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Observaciones</Label>
              <textarea
                className="mf-input mt-1 min-h-[92px] w-full resize-y rounded-2xl px-3 py-3"
                value={editForm.observaciones}
                onChange={(event) => setEditForm((prev) => ({ ...prev, observaciones: event.target.value }))}
                placeholder="Notas reales del expediente"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancelar
            </Button>
            <Button type="button" onClick={submitProfileUpdate} disabled={editSaving}>
              {editSaving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
