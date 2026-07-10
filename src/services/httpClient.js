// src/services/httpClient.js
// Cliente HTTP (fetch) para consumir la API de Master Fade.
// - Usa VITE_API_URL como base.
// - Usa cookies HttpOnly de sesion con credentials: 'include'.
// - Adjunta X-CSRF-Token en metodos mutables desde cookie no-httpOnly.

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || "").trim();
  const p = String(path || "").trim();

  if (!base) return p;
  if (!p) return base;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;

  const baseClean = base.replace(/\/+$/, "");
  const pathClean = p.startsWith("/") ? p : `/${p}`;
  return `${baseClean}${pathClean}`;
}

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function isUnsafeMethod(method) {
  const normalized = String(method || "GET").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(normalized);
}

function isSafeMethod(method) {
  return String(method || "GET").toUpperCase() === "GET";
}

function stableSerialize(value) {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function buildRequestKey(method, url, body) {
  return [
    String(method || "GET").toUpperCase(),
    String(url || ""),
    stableSerialize(body ?? null),
  ].join(" ");
}

function toPathname(path, baseUrl) {
  const candidate = String(path || "").trim();
  if (!candidate) return "";
  try {
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      return new URL(candidate).pathname || "";
    }
    const base = String(baseUrl || "").trim() || window.location.origin;
    return new URL(joinUrl(base, candidate)).pathname || "";
  } catch {
    return candidate;
  }
}

function shouldInvalidateSessionOn401(path, baseUrl) {
  const pathname = toPathname(path, baseUrl);
  if (!pathname) return false;
  if (pathname.startsWith("/v1/auth/")) return false;
  if (pathname.startsWith("/v1/public/")) return false;
  return pathname.startsWith("/v1/");
}

function isExpectedPublicAuthMe401(path, baseUrl) {
  const apiPathname = toPathname(path, baseUrl);
  const pagePathname = typeof window !== "undefined" ? String(window.location?.pathname || "") : "";
  return apiPathname === "/v1/auth/me"
    && (pagePathname === "/agendar" || pagePathname.startsWith("/agendar/"));
}

function shouldSkipCsrfPrefetch(path, baseUrl) {
  const pathname = toPathname(path, baseUrl);
  if (!pathname) return false;

  const PUBLIC_MUTABLE_PATHS = new Set([
    "/v1/auth/login",
    "/v1/auth/register",
    "/v1/auth/forgot-password",
    "/v1/auth/exchange",
    "/v1/auth/social/confirm",
    "/v1/auth/csrf",
    "/v1/public/citas/hold",
    "/v1/public/citas/validar-contactos",
    "/v1/public/citas/validar-titular",
    "/v1/public/pagos/crear-intent",
    "/v1/public/pagos/mock-completar",
    "/v1/public/pagos/simulator/event",
  ]);

  return (
    PUBLIC_MUTABLE_PATHS.has(pathname) ||
    pathname.startsWith("/v1/public/citas/hold/")
  );
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

const inFlightControllers = new Set();
const inFlightRequests = new Map();
const safeResponseCache = new Map();
const SAFE_RESPONSE_CACHE_TTL_MS = 10000;
const NETWORK_UNAVAILABLE_MESSAGE =
  "No fue posible conectar con el servicio. Verifica tu conexión a internet e intenta nuevamente.";
let sessionInvalidated = false;
let sessionInvalidationHandler = null;
const CSRF_SESSION_KEY = "mf_cached_csrf_token";
let inMemoryCsrfToken = "";
let csrfFetchInFlight = null;

function readStoredCsrfToken() {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  if (typeof window === "undefined") return "";
  try {
    const cached = String(window.sessionStorage.getItem(CSRF_SESSION_KEY) || "").trim();
    if (cached) {
      inMemoryCsrfToken = cached;
      return cached;
    }
  } catch {
    // no-op
  }
  return "";
}

function cacheCsrfToken(token) {
  const normalized = String(token || "").trim();
  inMemoryCsrfToken = normalized;
  if (typeof window === "undefined") return;
  try {
    if (normalized) {
      window.sessionStorage.setItem(CSRF_SESSION_KEY, normalized);
    } else {
      window.sessionStorage.removeItem(CSRF_SESSION_KEY);
    }
  } catch {
    // no-op
  }
}

async function fetchCsrfTokenFromApi(baseUrl) {
  if (csrfFetchInFlight) return csrfFetchInFlight;

  const csrfUrl = joinUrl(baseUrl, "/v1/auth/csrf");
  csrfFetchInFlight = (async () => {
    const response = await fetch(csrfUrl, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return "";
    const data = await parseResponse(response);
    const payload = data?.data || data;
    const token = String(payload?.csrf_token || "").trim();
    if (token) cacheCsrfToken(token);
    return token;
  })();

  try {
    return await csrfFetchInFlight;
  } catch {
    return "";
  } finally {
    csrfFetchInFlight = null;
  }
}

export function isAbortError(err) {
  return (
    err?.name === "AbortError" ||
    err?.code === "ABORT_ERR" ||
    String(err?.message || "").toLowerCase().includes("aborted")
  );
}

function isNetworkFetchError(err) {
  if (!err || isAbortError(err)) return false;
  const message = String(err.message || "").toLowerCase();
  return (
    err instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
}

function createNetworkUnavailableError(cause) {
  const error = new Error(NETWORK_UNAVAILABLE_MESSAGE);
  error.status = 0;
  error.code = "NETWORK_UNAVAILABLE";
  error.cause = cause;
  error.data = {
    error: {
      code: "NETWORK_UNAVAILABLE",
      message: NETWORK_UNAVAILABLE_MESSAGE,
    },
  };
  return error;
}

function getResponseErrorCode(data) {
  return String(data?.error?.code || data?.code || "").trim().toUpperCase();
}

export function abortInFlightRequests(reason = "request_aborted") {
  inFlightControllers.forEach((controller) => controller.abort(reason));
  inFlightControllers.clear();
  inFlightRequests.clear();
}

function notifySessionInvalidation(reason, details = {}) {
  if (sessionInvalidated) return;
  sessionInvalidated = true;
  abortInFlightRequests(reason);
  if (typeof sessionInvalidationHandler === "function") {
    sessionInvalidationHandler({ reason, ...details });
  }
}

export function resetSessionInvalidation() {
  sessionInvalidated = false;
  cacheCsrfToken("");
}

export function registerSessionInvalidationHandler(handler) {
  sessionInvalidationHandler = typeof handler === "function" ? handler : null;
  return () => {
    if (sessionInvalidationHandler === handler) {
      sessionInvalidationHandler = null;
    }
  };
}

export function request(path, options = {}) {
  const {
    method = "GET",
    body,
    headers = {},
    signal,
    skipAuthInvalidation = false,
    skipCsrf = false,
    dedupe = true,
    cache = isSafeMethod(method),
    cacheTtlMs = SAFE_RESPONSE_CACHE_TTL_MS,
  } = options;

  const baseUrl = import.meta.env.VITE_API_URL;
  const url = joinUrl(baseUrl, path);
  const requestKey = buildRequestKey(method, url, body);
  const canDedupe = Boolean(dedupe && !signal);
  if (cache) {
    const cached = safeResponseCache.get(requestKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (cached) safeResponseCache.delete(requestKey);
  }
  if (canDedupe && inFlightRequests.has(requestKey)) {
    return inFlightRequests.get(requestKey);
  }

  const requestPromise = (async () => {
  const finalHeaders = { ...headers };
  const controller = new AbortController();

  const hasBody = body !== undefined && body !== null;
  if (hasBody && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }

  if (!skipCsrf && isUnsafeMethod(method) && !finalHeaders["X-CSRF-Token"]) {
    let csrfToken = readCookie("mf_csrf") || readStoredCsrfToken();
    if (!csrfToken) {
      if (!shouldSkipCsrfPrefetch(path, baseUrl)) {
        csrfToken = await fetchCsrfTokenFromApi(baseUrl);
      }
    }
    if (csrfToken) finalHeaders["X-CSRF-Token"] = csrfToken;
  }

  if (signal?.aborted) {
    controller.abort(signal.reason);
  }

  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal && typeof signal.addEventListener === "function") {
    signal.addEventListener("abort", forwardAbort, { once: true });
  }
  inFlightControllers.add(controller);

  try {
    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: "include",
    });

    const data = await parseResponse(response);
    if (data && typeof data === "object") {
      Object.defineProperty(data, "__meta", {
        value: {
          status: response.status,
          headers: response.headers,
          url: response.url,
        },
        enumerable: false,
        configurable: true,
      });
    }

    if (!response.ok) {
      const message =
        data && typeof data === "object" && (data.error?.message || data.message)
          ? data.error?.message || data.message
          : `HTTP ${response.status}`;

      const err = new Error(message);
      err.status = response.status;
      err.data = data;
      err.headers = response.headers;
      err.code = getResponseErrorCode(data);
      if (response.status === 401 && isExpectedPublicAuthMe401(path, baseUrl)) {
        err.expectedUnauthenticated = true;
      }
      if (
        response.status === 401 &&
        !skipAuthInvalidation &&
        shouldInvalidateSessionOn401(path, baseUrl)
      ) {
        const reason = err.code === "AUTH_SESSION_IDLE_EXPIRED"
          ? "AUTH_SESSION_IDLE_EXPIRED"
          : "private_endpoint_401";
        notifySessionInvalidation(reason, { code: err.code || null });
      }
      throw err;
    }

    if (cache) {
      safeResponseCache.set(requestKey, {
        data,
        expiresAt: Date.now() + Math.max(0, Number(cacheTtlMs || 0)),
      });
    }
    return data;
  } catch (err) {
    if (isNetworkFetchError(err)) {
      throw createNetworkUnavailableError(err);
    }
    throw err;
  } finally {
    inFlightControllers.delete(controller);
    if (signal && typeof signal.removeEventListener === "function") {
      signal.removeEventListener("abort", forwardAbort);
    }
  }
  })();

  if (canDedupe) {
    inFlightRequests.set(requestKey, requestPromise);
    const clearRequest = () => {
      if (inFlightRequests.get(requestKey) === requestPromise) {
        inFlightRequests.delete(requestKey);
      }
    };
    requestPromise.then(clearRequest, clearRequest);
  }

  return requestPromise;
}

export const http = {
  get: (path, opts = {}) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts = {}) =>
    request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts = {}) =>
    request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts = {}) =>
    request(path, { ...opts, method: "PATCH", body }),
  del: (path, opts = {}) => request(path, { ...opts, method: "DELETE" }),
};
