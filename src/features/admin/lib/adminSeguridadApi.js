import { http } from '../../../services/httpClient.js';

const PAGE_DEFAULT = 1;
const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 100;

const LOGIN_LOG_RESULT_SET = new Set(['success', 'failed', 'blocked', 'session_limit', 'error']);
const LOGIN_LOG_SORT_SET = new Set(['created_at', 'resultado', 'provider']);
const LOGIN_PROVIDER_SET = new Set(['supabase_password', 'google', 'facebook', 'apple']);

const SESSION_STATE_SET = new Set(['activa', 'cerrada', 'revocada', 'expirada']);
const SESSION_SORT_SET = new Set(['inicio_at', 'ultimo_uso_at', 'expira_at', 'estado']);

const USER_STATE_SET = new Set(['pendiente_password', 'activo', 'bloqueado', 'inactivo']);
const USER_SORT_SET = new Set(['updated_at', 'failed_login_count', 'last_login_at']);

const ALERT_STATE_SET = new Set(['abierta', 'en_revision', 'resuelta', 'descartada']);
const ALERT_UPDATE_STATE_SET = new Set(['resuelta', 'descartada']);
const ALERT_SEVERITY_SET = new Set(['baja', 'media', 'alta', 'critica']);
const ALERT_TYPE_SET = new Set([
  'muchos_fallos_misma_ip',
  'muchos_fallos_mismo_usuario',
  'usuario_bloqueado',
  'intentos_contra_super_admin',
  'cliente_intenta_nueva_sesion',
]);
const ALERT_SORT_SET = new Set(['detectada_at', 'severidad', 'estado']);

function toSafePage(value, fallback = PAGE_DEFAULT) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function toSafeLimit(value, fallback = LIMIT_DEFAULT) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, LIMIT_MAX);
}

function normalizeSortDirection(value) {
  return String(value || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
}

function normalizeIsoDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function normalizeText(value, maxLength) {
  const normalized = String(value || '').normalize('NFC').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
}

function toQueryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function sanitizeLoginLogsParams(params = {}) {
  const query = {
    page: toSafePage(params.page, PAGE_DEFAULT),
    limit: toSafeLimit(params.limit, LIMIT_DEFAULT),
    sort_dir: normalizeSortDirection(params.sortDir),
  };

  if (LOGIN_LOG_RESULT_SET.has(params.resultado)) query.resultado = params.resultado;
  if (LOGIN_LOG_SORT_SET.has(params.sortBy)) query.sort_by = params.sortBy;
  if (LOGIN_PROVIDER_SET.has(params.provider)) query.provider = params.provider;

  const fromAt = normalizeIsoDateTime(params.fromAt);
  const toAt = normalizeIsoDateTime(params.toAt);
  if (fromAt) query.from_at = fromAt;
  if (toAt) query.to_at = toAt;
  return query;
}

function sanitizeSessionParams(params = {}) {
  const query = {
    page: toSafePage(params.page, PAGE_DEFAULT),
    limit: toSafeLimit(params.limit, LIMIT_DEFAULT),
    sort_dir: normalizeSortDirection(params.sortDir),
  };

  if (SESSION_STATE_SET.has(params.estado)) query.estado = params.estado;
  if (SESSION_SORT_SET.has(params.sortBy)) query.sort_by = params.sortBy;

  const fromAt = normalizeIsoDateTime(params.fromAt);
  const toAt = normalizeIsoDateTime(params.toAt);
  if (fromAt) query.from_at = fromAt;
  if (toAt) query.to_at = toAt;
  return query;
}

function sanitizeUserParams(params = {}) {
  const query = {
    page: toSafePage(params.page, PAGE_DEFAULT),
    limit: toSafeLimit(params.limit, LIMIT_DEFAULT),
    sort_dir: normalizeSortDirection(params.sortDir),
  };

  if (USER_STATE_SET.has(params.estadoAcceso)) query.estado_acceso = params.estadoAcceso;
  if (USER_SORT_SET.has(params.sortBy)) query.sort_by = params.sortBy;

  const q = normalizeText(params.q, 120);
  if (q) query.q = q;
  return query;
}

function sanitizeAlertParams(params = {}) {
  const query = {
    page: toSafePage(params.page, PAGE_DEFAULT),
    limit: toSafeLimit(params.limit, LIMIT_DEFAULT),
    sort_dir: normalizeSortDirection(params.sortDir),
  };

  if (ALERT_STATE_SET.has(params.estado)) query.estado = params.estado;
  if (ALERT_SEVERITY_SET.has(params.severidad)) query.severidad = params.severidad;
  if (ALERT_TYPE_SET.has(params.tipo)) query.tipo = params.tipo;
  if (ALERT_SORT_SET.has(params.sortBy)) query.sort_by = params.sortBy;

  const fromAt = normalizeIsoDateTime(params.fromAt);
  const toAt = normalizeIsoDateTime(params.toAt);
  if (fromAt) query.from_at = fromAt;
  if (toAt) query.to_at = toAt;
  return query;
}

export async function listAdminSecurityLoginLogs(params = {}) {
  const query = sanitizeLoginLogsParams(params);
  return http.get(`/v1/admin/seguridad/login-logs${toQueryString(query)}`);
}

export async function getAdminSecurityLoginLogDetail(idLoginLog) {
  return http.get(`/v1/admin/seguridad/login-logs/${encodeURIComponent(String(idLoginLog || ''))}`);
}

export async function listAdminSecuritySessions(params = {}) {
  const query = sanitizeSessionParams(params);
  return http.get(`/v1/admin/seguridad/sesiones${toQueryString(query)}`);
}

export async function getAdminSecuritySessionDetail(idSesion) {
  return http.get(`/v1/admin/seguridad/sesiones/${encodeURIComponent(String(idSesion || ''))}`);
}

export async function revokeAdminSecuritySession(idSesion) {
  return http.post(`/v1/admin/seguridad/sesiones/${encodeURIComponent(String(idSesion || ''))}/revocar`, {});
}

export async function listAdminSecurityUsers(params = {}) {
  const query = sanitizeUserParams(params);
  return http.get(`/v1/admin/seguridad/usuarios${toQueryString(query)}`);
}

export async function updateAdminSecurityUserAccessState(idUsuario, estadoAcceso) {
  const payload = {
    estado_acceso: USER_STATE_SET.has(estadoAcceso) ? estadoAcceso : 'activo',
  };
  return http.patch(`/v1/admin/seguridad/usuarios/${encodeURIComponent(String(idUsuario || ''))}/estado-acceso`, payload);
}

export async function listAdminSecurityAlerts(params = {}) {
  const query = sanitizeAlertParams(params);
  return http.get(`/v1/admin/seguridad/alertas${toQueryString(query)}`);
}

export async function getAdminSecurityAlertDetail(idAlerta) {
  return http.get(`/v1/admin/seguridad/alertas/${encodeURIComponent(String(idAlerta || ''))}`);
}

export async function updateAdminSecurityAlertState(idAlerta, estado, comentario = '') {
  if (!ALERT_UPDATE_STATE_SET.has(estado)) {
    throw new Error('ALERT_STATE_NOT_ALLOWED');
  }
  const payload = {
    estado,
    comentario: normalizeText(comentario, 700),
  };
  return http.patch(`/v1/admin/seguridad/alertas/${encodeURIComponent(String(idAlerta || ''))}/estado`, payload);
}
