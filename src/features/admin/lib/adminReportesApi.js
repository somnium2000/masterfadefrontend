import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/reportes';
const CONTEXT_CACHE_TTL_MS = 60_000;
const DASHBOARD_CACHE_TTL_MS = 60_000;
const contextCache = new Map();
const dashboardCache = new Map();
const contextInflight = new Map();
const dashboardInflight = new Map();

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  // JK: Orden estable de query params para maximizar hits de cache entre montajes.
  const sortedEntries = Object.entries(params).sort(([left], [right]) => String(left).localeCompare(String(right), 'es'));
  for (const [key, value] of sortedEntries) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    query.set(key, String(value).trim());
  }
  return query.toString();
}

function getValidCacheEntry(cache, key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

async function resolveCachedRequest({
  key,
  ttlMs,
  cache,
  inflight,
  fetcher,
  forceRefresh = false,
}) {
  if (!forceRefresh) {
    const cachedValue = getValidCacheEntry(cache, key);
    if (cachedValue) return cachedValue;
  } else {
    cache.delete(key);
  }

  const currentInflight = inflight.get(key);
  if (currentInflight) return currentInflight;

  const requestPromise = (async () => {
    const response = await fetcher();
    cache.set(key, {
      value: response,
      expiresAt: Date.now() + Math.max(1, Number(ttlMs) || 1),
    });
    return response;
  })();

  inflight.set(key, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inflight.delete(key);
  }
}

// JK: Contexto de filtros para reportes (sucursales y barberos en alcance).
export async function getAdminReportesContext(params = {}, options = {}) {
  const qs = buildQuery(params);
  const path = qs ? `${BASE}/contexto?${qs}` : `${BASE}/contexto`;
  const cacheKey = `context:${path}`;
  return resolveCachedRequest({
    key: cacheKey,
    ttlMs: CONTEXT_CACHE_TTL_MS,
    cache: contextCache,
    inflight: contextInflight,
    fetcher: () => http.get(path),
    forceRefresh: Boolean(options?.forceRefresh),
  });
}

// JK: Snapshot completo de BI para KPIs, graficos y tablas.
export async function getAdminReportesDashboard(params = {}, options = {}) {
  const qs = buildQuery(params);
  const path = qs ? `${BASE}/dashboard?${qs}` : `${BASE}/dashboard`;
  const cacheKey = `dashboard:${path}`;
  return resolveCachedRequest({
    key: cacheKey,
    ttlMs: DASHBOARD_CACHE_TTL_MS,
    cache: dashboardCache,
    inflight: dashboardInflight,
    fetcher: () => http.get(path),
    forceRefresh: Boolean(options?.forceRefresh),
  });
}

// JK: Helpers de URL para exportaciones descargables.
export function buildReportesExportCsvPath(params = {}) {
  const qs = buildQuery(params);
  return qs ? `${BASE}/export/csv?${qs}` : `${BASE}/export/csv`;
}

export function buildReportesExportExcelPath(params = {}) {
  const qs = buildQuery(params);
  return qs ? `${BASE}/export/excel?${qs}` : `${BASE}/export/excel`;
}

// JK: Utilidad opcional para invalidar cache local de reportes cuando se requiera.
export function clearAdminReportesApiCache() {
  contextCache.clear();
  dashboardCache.clear();
  contextInflight.clear();
  dashboardInflight.clear();
}
