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
  } = options;

  const baseUrl = import.meta.env.VITE_API_URL;
  const url = joinUrl(baseUrl, path);
  const finalHeaders = { ...headers };
  const controller = new AbortController();

  const hasBody = body !== undefined && body !== null;
  if (hasBody && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }

  if (isUnsafeMethod(method) && !finalHeaders["X-CSRF-Token"]) {
    const csrfToken = readCookie("mf_csrf");
    if (csrfToken) {
      finalHeaders["X-CSRF-Token"] = csrfToken;
    }
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
