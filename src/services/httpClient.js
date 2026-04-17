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

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export async function request(path, options = {}) {
  const { method = "GET", body, headers = {}, signal } = options;

  const baseUrl = import.meta.env.VITE_API_URL;
  const url = joinUrl(baseUrl, path);
  const finalHeaders = { ...headers };

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

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: hasBody ? JSON.stringify(body) : undefined,
    signal,
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
    throw err;
  }

  return data;
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
