import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader2, Phone, Trash2, UserRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  ALLOWED_PROFILE_IMAGE_TYPES,
  MAX_PROFILE_IMAGE_BYTES,
  getClienteProfileImageReadUrl,
  prepareClienteProfileImageUpload,
  updateClienteMe,
} from '../lib/clienteApi.js';

const GENERO_OPTIONS = [
  { code: 'M', label: 'Masculino' },
  { code: 'F', label: 'Femenino' },
  { code: 'O', label: 'Otro' },
  { code: 'N', label: 'Prefiero no decir' },
  { code: 'NB', label: 'No binario' },
];

function extractSafeText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const normalized = value.normalize('NFC').trim();
    if (!normalized) return '';

    if (
      (normalized.startsWith('{') && normalized.endsWith('}'))
      || (normalized.startsWith('[') && normalized.endsWith(']'))
      || (normalized.startsWith('"') && normalized.endsWith('"'))
    ) {
      try {
        return extractSafeText(JSON.parse(normalized));
      } catch {
        return normalized;
      }
    }
    return normalized;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const list = value
      .map((item) => extractSafeText(item))
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    return list.join(', ');
  }
  if (typeof value === 'object') {
    const candidateKeys = ['value', 'text', 'texto', 'preferencias', 'content', 'descripcion', 'description'];
    for (const key of candidateKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const resolved = extractSafeText(value[key]);
        if (resolved) return resolved;
      }
    }
    const firstStringValue = Object.values(value)
      .map((item) => extractSafeText(item))
      .map((item) => String(item || '').trim())
      .find(Boolean);
    return firstStringValue || '';
  }
  return '';
}

function normalizeGeneroCode(value) {
  const raw = extractSafeText(value).toUpperCase();
  if (!raw) return '';
  const validCodes = new Set(GENERO_OPTIONS.map((item) => item.code));
  if (validCodes.has(raw)) return raw;

  const aliases = {
    MASCULINO: 'M',
    FEMENINO: 'F',
    OTRO: 'O',
    PREFIERO_NO_DECIR: 'N',
    'PREFIERE NO DECIR': 'N',
    NO_BINARIO: 'NB',
    'NO BINARIO': 'NB',
  };
  return aliases[raw] || '';
}

function normalizeInitialForm(profile) {
  return {
    telefono_principal: extractSafeText(profile?.telefono_principal),
    fecha_nacimiento: profile?.fecha_nacimiento ? String(profile.fecha_nacimiento).slice(0, 10) : '',
    genero_codigo: normalizeGeneroCode(profile?.genero_codigo),
    direccion_texto: extractSafeText(profile?.direccion_texto),
    preferencias_corte: extractSafeText(profile?.preferencias_corte),
    observaciones: extractSafeText(profile?.observaciones),
  };
}

function formatAllowedMimeTypes() {
  return ALLOWED_PROFILE_IMAGE_TYPES.map((type) => type.replace('image/', '').toUpperCase()).join(', ');
}

export default function ClienteProfileEditModal({
  open,
  onOpenChange,
  profile,
  onSaved,
}) {
  const notifications = useNotifications();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState(() => normalizeInitialForm(profile));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(profile?.foto_perfil_signed_url || '');
  const [uploadedAssetId, setUploadedAssetId] = useState(profile?.foto_perfil_asset_id || null);
  const [photoChanged, setPhotoChanged] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextForm = normalizeInitialForm(profile);
    setForm(nextForm);
    setPreviewUrl(profile?.foto_perfil_signed_url || '');
    setUploadedAssetId(profile?.foto_perfil_asset_id || null);
    setPhotoChanged(false);
  }, [open, profile]);

  const fullName = useMemo(() => {
    const nombres = String(profile?.nombres || '').trim();
    const apellidos = String(profile?.apellidos || '').trim();
    return `${nombres} ${apellidos}`.trim();
  }, [profile]);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleUploadPhoto(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const prepared = await prepareClienteProfileImageUpload(file, {
        label: fullName || 'cliente',
      });
      const read = await getClienteProfileImageReadUrl(prepared.asset_id, { expiresIn: 300 });

      setUploadedAssetId(prepared.asset_id);
      setPreviewUrl(read?.url || prepared?.signed_read_url || '');
      setPhotoChanged(true);
      notifications.success('Imagen de perfil cargada. Guarda para confirmar cambios.');
    } catch (error) {
      notifications.error(error?.message || 'No se pudo cargar la imagen de perfil.');
    } finally {
      setUploading(false);
      if (event.target) event.target.value = '';
    }
  }

  function handleRemovePhoto() {
    setUploadedAssetId(null);
    setPreviewUrl('');
    setPhotoChanged(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        telefono_principal: extractSafeText(form.telefono_principal) || null,
        fecha_nacimiento: String(form.fecha_nacimiento || '').trim() || null,
        genero_codigo: normalizeGeneroCode(form.genero_codigo) || null,
        direccion_texto: extractSafeText(form.direccion_texto) || null,
        preferencias_corte: extractSafeText(form.preferencias_corte) || null,
        observaciones: extractSafeText(form.observaciones) || null,
      };

      if (photoChanged) {
        payload.foto_perfil_asset_id = uploadedAssetId || null;
      }

      const response = await updateClienteMe(payload);
      notifications.success('Perfil actualizado correctamente.');
      onSaved?.(response);
      onOpenChange(false);
    } catch (error) {
      notifications.error(error?.data?.error?.message || error?.message || 'No se pudo actualizar tu perfil.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!left-1/2 !top-1/2 !bottom-auto !right-auto !w-[calc(100vw-1rem)] !max-w-[680px] !-translate-x-1/2 !-translate-y-1/2 !rounded-[22px] max-h-[88vh] overflow-y-auto p-0">
        <DialogHeader className="border-b border-[var(--mf-nav-border)] px-5 pb-4 pt-5 sm:px-6">
          <DialogTitle>Perfil privado del cliente</DialogTitle>
          <DialogDescription id="cliente-profile-edit-description">
            Actualiza solo lo necesario. Tus datos sensibles se muestran con enfoque de privacidad.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4 px-5 pb-5 pt-4 sm:px-6" onSubmit={handleSubmit}>
          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Foto de perfil</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="h-24 w-24 overflow-hidden rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-card)]">
                {previewUrl ? (
                  <img src={previewUrl} alt="Foto de perfil" className="h-full w-full object-cover object-center" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--mf-text-2)]">
                    <Camera size={20} />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={uploading || saving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  {uploadedAssetId ? 'Reemplazar' : 'Subir foto'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={uploading || saving || !uploadedAssetId}
                  onClick={handleRemovePhoto}
                >
                  <Trash2 size={14} />
                  Quitar
                </Button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_PROFILE_IMAGE_TYPES.join(',')}
              className="hidden"
              onChange={(event) => void handleUploadPhoto(event)}
            />
            <p className="mt-2 text-xs leading-5 text-[var(--mf-text-2)]">
              Formatos permitidos: {formatAllowedMimeTypes()}. Peso máximo: {(MAX_PROFILE_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB.
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--mf-text-2)]">
              Esta imagen es privada y se usa para facilitar tu identificación en recepción y por el barbero.
            </p>
          </section>

          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Identidad y contacto</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mf-label">Teléfono principal</label>
                <div className="relative">
                  <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                  <input
                    className="mf-input pl-9"
                    value={form.telefono_principal}
                    onChange={(event) => setField('telefono_principal', event.target.value)}
                    maxLength={40}
                    placeholder="Ej. +504 9999-9999"
                  />
                </div>
              </div>
              <div>
                <label className="mf-label">Fecha de nacimiento</label>
                <input
                  type="date"
                  className="mf-input"
                  value={form.fecha_nacimiento}
                  onChange={(event) => setField('fecha_nacimiento', event.target.value)}
                />
              </div>
              <div>
                <label className="mf-label">Género (opcional)</label>
                <select
                  className="mf-select"
                  value={form.genero_codigo}
                  onChange={(event) => setField('genero_codigo', event.target.value)}
                >
                  <option value="">Selecciona género</option>
                  {GENERO_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mf-label">Dirección (opcional)</label>
                <input
                  className="mf-input"
                  value={form.direccion_texto}
                  onChange={(event) => setField('direccion_texto', event.target.value)}
                  maxLength={300}
                  placeholder="Ciudad, colonia o referencia"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Preferencias y notas</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mf-label">Preferencias para tu barbero</label>
                <textarea
                  className="mf-input min-h-[96px] resize-y px-3 py-2"
                  value={form.preferencias_corte}
                  onChange={(event) => setField('preferencias_corte', event.target.value)}
                  maxLength={1000}
                  placeholder="Describe estilo, cuidados o detalles importantes para tu corte."
                />
              </div>
              <div>
                <label className="mf-label">Notas adicionales (opcional)</label>
                <textarea
                  className="mf-input min-h-[88px] resize-y px-3 py-2"
                  value={form.observaciones}
                  onChange={(event) => setField('observaciones', event.target.value)}
                  maxLength={1000}
                  placeholder="Información adicional que quieras registrar."
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_90%,transparent)] p-4">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">
              <UserRound size={13} />
              Privacidad
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--mf-text-2)]">
              Solo se enviarán al sistema los campos que este formulario soporta actualmente. Los datos no incluidos aquí permanecen sin cambios.
            </p>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || uploading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || uploading}>
              {saving ? 'Guardando...' : 'Guardar perfil'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
