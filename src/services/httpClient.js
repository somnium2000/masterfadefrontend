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
    "/v1/public/citas/validar-titular",
    "/v1/public/pagos/crear-intent",
    "/v1/public/pagos/mock-completar",
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

export function abortInFlightRequests(reason = "request_aborted") {
  inFlightControllers.forEach((controller) => controller.abort(reason));
  inFlightControllers.clear();
}

function notifySessionInvalidation(reason) {
  if (sessionInvalidated) return;
  sessionInvalidated = true;
  abortInFlightRequests(reason);
  if (typeof sessionInvalidationHandler === "function") {
    sessionInvalidationHandler({ reason });
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

export async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    headers = {},
    signal,
    skipAuthInvalidation = false,
    skipCsrf = false,
  } = options;

  const baseUrl = import.meta.env.VITE_API_URL;
  const url = joinUrl(baseUrl, path);
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

    if (!response.ok) {
      const message =
        data && typeof data === "object" && (data.error?.message || data.message)
          ? data.error?.message || data.message
          : `HTTP ${response.status}`;

      const err = new Error(message);
      err.status = response.status;
      err.data = data;
      if (
        response.status === 401 &&
        !skipAuthInvalidation &&
        shouldInvalidateSessionOn401(path, baseUrl)
      ) {
        notifySessionInvalidation("private_endpoint_401");
      }
      throw err;
    }

    return data;
  } finally {
    inFlightControllers.delete(controller);
    if (signal && typeof signal.removeEventListener === "function") {
      signal.removeEventListener("abort", forwardAbort);
    }
  }
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
