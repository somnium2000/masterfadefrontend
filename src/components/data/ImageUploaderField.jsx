import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '../ui/button.jsx';
import { Label } from '../ui/label.jsx';
import { getAdminStorageAssetReadUrl } from '../../features/storage/lib/storageApi.js';
import {
  extractStorageErrorMessage,
  optimizeImageForUpload,
  prepareAndUploadAdminImage,
  validateImageFile,
} from '../../features/storage/lib/storageUpload.js';

const DEFAULT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatMb(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)}MB`;
}

export default function ImageUploaderField({
  label = 'Imagen',
  scopeKey,
  entityType,
  entityId = null,
  idSucursal = null,
  disabled = false,
  required = false,
  helperText = '',
  allowedMimeTypes = DEFAULT_MIME_TYPES,
  maxBytes = 5 * 1024 * 1024,
  initialPreviewUrl = '',
  valueAssetId = null,
  optimizeImageBeforeUpload = false,
  previewAspect = 'wide',
  onChange,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState(initialPreviewUrl || '');
  const [assetId, setAssetId] = useState(valueAssetId || null);

  const accept = useMemo(() => allowedMimeTypes.join(','), [allowedMimeTypes]);
  const previewClasses = previewAspect === 'square'
    ? 'h-40 w-40 object-cover'
    : 'h-40 w-full object-cover';

  useEffect(() => {
    setPreviewUrl(initialPreviewUrl || '');
  }, [initialPreviewUrl]);

  useEffect(() => {
    setAssetId(valueAssetId || null);
  }, [valueAssetId]);

  async function handleFileSelection(event) {
    const sourceFile = event.target?.files?.[0];
    if (!sourceFile) return;
    setErrorMessage('');
    setUploading(true);
    try {
      validateImageFile(sourceFile, { allowedMimeTypes, maxBytes });
      const optimizedFile = optimizeImageBeforeUpload
        ? await optimizeImageForUpload(sourceFile, { maxBytes, preferType: 'image/webp' })
        : sourceFile;
      validateImageFile(optimizedFile, { allowedMimeTypes, maxBytes });

      const prepared = await prepareAndUploadAdminImage({
        scopeKey,
        entityType,
        entityId,
        idSucursal,
        file: optimizedFile,
        label,
      });

      let privateSignedUrl = null;
      if (prepared.visibility === 'private') {
        const readResponse = await getAdminStorageAssetReadUrl(prepared.asset_id, { expires_in: 300 });
        const readPayload = readResponse?.data || readResponse;
        privateSignedUrl = readPayload?.url || null;
      }

      const nextPreview = prepared.public_url || privateSignedUrl || '';
      setPreviewUrl(nextPreview);
      setAssetId(prepared.asset_id);
      onChange?.({
        asset_id: prepared.asset_id,
        bucket: prepared.bucket,
        path: prepared.path,
        visibility: prepared.visibility,
        public_url: prepared.public_url || null,
        signed_read_url: privateSignedUrl,
      });
    } catch (error) {
      setErrorMessage(extractStorageErrorMessage(error));
    } finally {
      setUploading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  }

  function handleOpenPicker() {
    if (disabled || uploading) return;
    inputRef.current?.click();
  }

  function handleClear() {
    if (disabled || uploading) return;
    setPreviewUrl('');
    setAssetId(null);
    setErrorMessage('');
    onChange?.(null);
  }

  return (
    <div className="space-y-2 rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-sm text-[var(--mf-text)]">
            {label}{required ? ' *' : ''}
          </Label>
          <p className="mt-0.5 text-xs text-[var(--mf-text-2)]">
            {helperText || `Formatos permitidos: ${allowedMimeTypes.join(', ')}. Maximo ${formatMb(maxBytes)}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleOpenPicker} disabled={disabled || uploading} className="gap-1.5">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {assetId ? 'Reemplazar' : 'Subir'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={disabled || uploading || !assetId} className="gap-1.5">
            <Trash2 size={14} />
            Limpiar
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => void handleFileSelection(event)}
        disabled={disabled || uploading}
      />

      {previewUrl ? (
        <div className={`overflow-hidden rounded-lg border border-[var(--mf-nav-border)] ${previewAspect === 'square' ? 'w-40' : ''}`}>
          <img src={previewUrl} alt={`${label} preview`} className={previewClasses} loading="lazy" />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--mf-nav-border)] px-3 py-4 text-center text-xs text-[var(--mf-text-2)]">
          Sin imagen cargada.
        </div>
      )}

      {errorMessage ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
