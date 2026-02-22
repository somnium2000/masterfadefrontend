// src/services/httpClient.js
// Cliente HTTP simple (fetch) para consumir tu API.
// - Usa VITE_API_URL si existe.
// - Permite inyectar token Bearer.

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').trim();
  const p = String(path || '').trim();

  if (!base) return p;
  if (!p) return base;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;

  const baseClean = base.replace(/\/+$/, '');
  const pathClean = p.startsWith('/') ? p : `/${p}`;
  return `${baseClean}${pathClean}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    token,
    headers = {},
  } = options;

  const baseUrl = import.meta.env.VITE_API_URL;
  const url = joinUrl(baseUrl, path);

  const finalHeaders = {
    ...headers,
  };

  // Si enviamos body, por defecto JSON
  const hasBody = body !== undefined && body !== null;
  if (hasBody && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.message || data.error))
        ? (data.message || data.error)
        : `HTTP ${response.status}`;

    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const http = {
  get: (path, opts = {}) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts = {}) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts = {}) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, opts = {}) => request(path, { ...opts, method: 'DELETE' }),
};