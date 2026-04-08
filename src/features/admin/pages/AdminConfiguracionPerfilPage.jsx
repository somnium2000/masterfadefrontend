import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, MapPin, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { getAdminConfigPerfil, updateAdminConfigPerfil } from '../lib/adminConfiguracionApi.js';

function extractMessage(error) {
  return error?.data?.error?.message || error?.message || 'Error desconocido.';
}

function formatDateTime(value) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin registro';
  return date.toLocaleString();
}

function normalizeUnicodeText(value) {
  return String(value || '').normalize('NFC').trim();
}

const FORM_DEFAULTS = {
  nombres: '',
  apellidos: '',
  telefono_principal: '',
  direccion_texto: '',
  observaciones: '',
};

export default function AdminConfiguracionPerfilPage() {
  const notifications = useNotifications();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState('');
  const [perfil, setPerfil] = useState(null);
  const [form, setForm] = useState(FORM_DEFAULTS);

  const fetchPerfil = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const response = await getAdminConfigPerfil();
      const payload = response?.data || response;
      setPerfil(payload?.perfil || null);
      setForm({
        nombres: payload?.perfil?.nombres || '',
        apellidos: payload?.perfil?.apellidos || '',
        telefono_principal: payload?.perfil?.telefono_principal || '',
        direccion_texto: payload?.perfil?.direccion_texto || '',
        observaciones: payload?.perfil?.observaciones || '',
      });
    } catch (error) {
      setListError(extractMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPerfil();
  }, [fetchPerfil]);

  function patchForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    const nombres = normalizeUnicodeText(form.nombres);
    const apellidos = normalizeUnicodeText(form.apellidos);

    if (!nombres) {
      notifications.warning('El nombre es requerido.', { dedupeKey: 'config-perfil-nombre-required' });
      return;
    }
    if (!apellidos) {
      notifications.warning('El apellido es requerido.', { dedupeKey: 'config-perfil-apellido-required' });
      return;
    }

    setSaving(true);
    try {
      const response = await updateAdminConfigPerfil({
        nombres,
        apellidos,
        telefono_principal: normalizeUnicodeText(form.telefono_principal) || null,
        direccion_texto: normalizeUnicodeText(form.direccion_texto) || null,
        observaciones: normalizeUnicodeText(form.observaciones) || null,
      });
      const payload = response?.data || response;
      setPerfil(payload?.perfil || null);
      notifications.success('Perfil actualizado correctamente.', { dedupeKey: 'config-perfil-save-ok' });
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'config-perfil-save-error' });
    } finally {
      setSaving(false);
    }
  }

  const subtitle = useMemo(() => {
    if (!perfil) return 'Administra tu informacion personal de forma segura.';
    return `Cuenta activa con estado de acceso: ${perfil.estado_acceso || 'sin estado'}.`;
  }, [perfil]);

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      {/* AM: Header alineado al patron visual de Servicios/Personas para consistencia transversal. */}
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Configuracion - Perfil</p>
          <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Perfil</h1>
          <p className="text-sm text-[var(--mf-text-2)]">{subtitle}</p>
        </div>
      </header>

      {listError ? <ErrorBanner message={listError} onRetry={fetchPerfil} /> : null}
      {loading && !listError ? <LoadingSpinner /> : null}

      {!loading && !listError && perfil ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Correo de cuenta</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-[var(--mf-text)]">
                <Mail size={14} className="text-[var(--mf-accent)]" />
                <span className="truncate">{perfil.email || 'Sin correo'}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Estado de acceso</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-[var(--mf-text)]">
                <ShieldCheck size={14} className="text-[var(--mf-accent)]" />
                <span className="capitalize">{perfil.estado_acceso || 'Sin estado'}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Ultimo login</p>
              <p className="mt-1 text-sm font-medium text-[var(--mf-text)]">{formatDateTime(perfil.ultimo_login_at)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="mf-label flex items-center gap-1.5"><UserRound size={12} /> Nombre *</Label>
                <Input
                  value={form.nombres}
                  onChange={(event) => patchForm('nombres', event.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="mf-label flex items-center gap-1.5"><UserRound size={12} /> Apellido *</Label>
                <Input
                  value={form.apellidos}
                  onChange={(event) => patchForm('apellidos', event.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="mf-label flex items-center gap-1.5"><Mail size={12} /> Correo (login)</Label>
                <Input value={perfil.email || ''} readOnly disabled />
                <p className="text-xs text-[var(--mf-text-2)]">El correo es usado por Auth para inicio de sesion y no se cambia aqui.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="mf-label flex items-center gap-1.5"><Phone size={12} /> Telefono principal</Label>
                <Input
                  value={form.telefono_principal}
                  onChange={(event) => patchForm('telefono_principal', event.target.value)}
                  maxLength={30}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <div className="space-y-1.5">
                <Label className="mf-label flex items-center gap-1.5"><MapPin size={12} /> Direccion</Label>
                <Input
                  value={form.direccion_texto}
                  onChange={(event) => patchForm('direccion_texto', event.target.value)}
                  maxLength={300}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="mf-label">Observaciones de perfil</Label>
                <textarea
                  value={form.observaciones}
                  onChange={(event) => patchForm('observaciones', event.target.value)}
                  maxLength={500}
                  rows={4}
                  className="w-full rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm text-[var(--mf-text)] outline-none transition-colors focus:border-[var(--mf-accent)]"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={fetchPerfil} disabled={saving}>
                Recargar
              </Button>
              <Button type="button" className="gap-2" onClick={handleSave} disabled={saving}>
                <Save size={14} />
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
