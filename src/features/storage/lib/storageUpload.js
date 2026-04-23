import { supabase } from '../../../config/supabaseClient.js';
import { prepareAdminStorageUpload } from './storageApi.js';

function normalizeMessage(error, fallback) {
  return error?.data?.error?.message || error?.message || fallback;
}

export function validateImageFile(file, {
  allowedMimeTypes = [],
  maxBytes = 5 * 1024 * 1024,
} = {}) {
  if (!file) {
    throw new Error('Debes seleccionar un archivo.');
  }
  if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.type)) {
    throw new Error('El tipo de archivo no es valido para esta carga.');
  }
  if (Number(file.size || 0) > Number(maxBytes || 0)) {
    throw new Error(`El archivo supera el limite permitido de ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }
}

function replaceExtension(fileName, nextExtension) {
  const base = String(fileName || 'imagen')
    .replace(/\.[^./\\]+$/, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 80) || 'imagen';
  return `${base}.${nextExtension}`;
}

function blobToFile(blob, fileName, type) {
  return new File([blob], fileName, {
    type,
    lastModified: Date.now(),
  });
}

async function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo procesar la imagen seleccionada.'));
    };
    image.src = objectUrl;
  });
}

function drawImageOnCanvas(image, maxSide = 1400) {
  const width = Number(image?.naturalWidth || image?.width || 0);
  const height = Number(image?.naturalHeight || image?.height || 0);
  if (!width || !height) {
    throw new Error('La imagen no tiene dimensiones validas.');
  }

  const ratio = Math.min(1, maxSide / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    throw new Error('No se pudo inicializar el procesador de imagen.');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No se pudo compactar la imagen.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export async function optimizeImageForUpload(file, {
  maxBytes = 5 * 1024 * 1024,
  preferType = 'image/webp',
  maxSide = 1400,
} = {}) {
  if (!(file instanceof File)) return file;

  const image = await loadImageFromFile(file);
  const canvas = drawImageOnCanvas(image, maxSide);
  const outputType = preferType || file.type || 'image/webp';
  const nextExtension = outputType === 'image/png' ? 'png' : outputType === 'image/jpeg' ? 'jpg' : 'webp';
  const nextName = replaceExtension(file.name, nextExtension);

  let quality = 0.9;
  let bestBlob = null;
  while (quality >= 0.55) {
    const blob = await toBlob(canvas, outputType, quality);
    bestBlob = blob;
    if (blob.size <= maxBytes) {
      return blobToFile(blob, nextName, outputType);
    }
    quality -= 0.08;
  }

  if (bestBlob && bestBlob.size <= maxBytes) {
    return blobToFile(bestBlob, nextName, outputType);
  }

  throw new Error(`El archivo supera el limite permitido de ${Math.round(maxBytes / 1024 / 1024)}MB.`);
}

export async function uploadPreparedFileToSupabase({ bucket, path, token, file, cacheControl = '31536000' }) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado en el frontend.');
  }
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type,
      cacheControl,
      upsert: false,
    });
  if (error) {
    throw new Error(error.message || 'No se pudo subir el archivo a Storage.');
  }
}

export async function prepareAndUploadAdminImage({
  scopeKey,
  entityType,
  entityId = null,
  idSucursal = null,
  file,
  label = '',
}) {
  const preparedResponse = await prepareAdminStorageUpload({
    scope_key: scopeKey,
    entity_type: entityType,
    entity_id: entityId || null,
    id_sucursal: idSucursal || null,
    file_name: file.name,
    content_type: file.type,
    size_bytes: file.size,
    label: label || null,
  });
  const prepared = preparedResponse?.data || preparedResponse;

  if (!prepared?.bucket || !prepared?.path || !prepared?.token || !prepared?.asset_id) {
    throw new Error('El backend no devolvio datos validos para upload firmado.');
  }

  await uploadPreparedFileToSupabase({
    bucket: prepared.bucket,
    path: prepared.path,
    token: prepared.token,
    file,
  });

  return prepared;
}

export function extractStorageErrorMessage(error, fallback = 'No se pudo completar la carga de imagen.') {
  return normalizeMessage(error, fallback);
}
