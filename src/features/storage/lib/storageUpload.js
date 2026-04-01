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
