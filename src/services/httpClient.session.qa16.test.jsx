// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
let client, fetchMock;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function response(data = { owner: 'synthetic' }, status = 200) { return { ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => data }; }
beforeEach(async () => { vi.resetModules(); sessionStorage.clear(); document.cookie = 'mf_csrf=; Max-Age=0; path=/'; fetchMock = vi.fn(async () => response()); vi.stubGlobal('fetch', fetchMock); client = await import('./httpClient.js'); });
afterEach(() => { client.registerSessionInvalidationHandler(null); client.abortInFlightRequests(); vi.unstubAllGlobals(); document.cookie = 'mf_csrf=; Max-Age=0; path=/'; });

test.each(['/v1/auth/me', '/v1/cliente/me', '/v1/cliente/puntos/resumen', '/v1/barbero/perfil', '/v1/admin/personas/usuarios'])('GET %s nunca cachea información privada ni con cache:true', async path => {
  fetchMock.mockResolvedValueOnce(response({ owner: 'A' })).mockResolvedValueOnce(response({ owner: 'B' }));
  expect(await client.http.get(path, { cache: true })).toMatchObject({ owner: 'A' }); client.resetSessionInvalidation();
  expect(await client.http.get(path, { cache: true })).toMatchObject({ owner: 'B' }); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test.each(['success', 401, 403, 'network'])('respuesta A %s no altera B ni vuelve a poblar caché', async outcome => {
  const a = deferred(), invalidate = vi.fn(); client.registerSessionInvalidationHandler(invalidate); fetchMock.mockReturnValueOnce(a.promise).mockResolvedValue(response({ owner: 'B' }));
  const old = client.http.get('/v1/cliente/me'); const discarded = expect(old).rejects.toMatchObject({ name: 'AbortError' }); client.resetSessionInvalidation();
  const current = client.http.get('/v1/cliente/me'); expect(current).not.toBe(old); expect(await current).toMatchObject({ owner: 'B' });
  if (outcome === 'network') a.reject(new TypeError('synthetic network')); else a.resolve(response({ owner: 'A' }, outcome === 'success' ? 200 : outcome));
  await discarded; expect(await client.http.get('/v1/cliente/me')).toMatchObject({ owner: 'B' }); expect(invalidate).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(3);
});
test('401 vigente invalida una sola vez y conserva su status original', async () => {
  const invalidate = vi.fn(); client.registerSessionInvalidationHandler(invalidate); fetchMock.mockResolvedValue(response({ error: { code: 'SYNTHETIC_UNAUTHORIZED' } }, 401));
  await expect(client.http.get('/v1/cliente/me')).rejects.toMatchObject({ status: 401 });
  await expect(client.http.get('/v1/cliente/me')).rejects.toMatchObject({ status: 401 }); expect(invalidate).toHaveBeenCalledTimes(1);
});
test('401 antiguo no aborta una petición B que continúa pendiente', async () => {
  const body = deferred(), b = deferred(), invalidate = vi.fn(); client.registerSessionInvalidationHandler(invalidate);
  fetchMock.mockResolvedValueOnce({ ...response({}, 401), json: () => body.promise }).mockReturnValueOnce(b.promise);
  const a = client.http.get('/v1/cliente/me'); const discarded = expect(a).rejects.toMatchObject({ name: 'AbortError' }); await Promise.resolve(); client.resetSessionInvalidation();
  const current = client.http.get('/v1/cliente/me'); const signalB = fetchMock.mock.calls[1][1].signal;
  body.resolve({ error: { code: 'SYNTHETIC_UNAUTHORIZED' } }); await discarded; expect(signalB.aborted).toBe(false); expect(invalidate).not.toHaveBeenCalled();
  b.resolve(response({ owner: 'B' })); expect(await current).toMatchObject({ owner: 'B' });
});
test('GET público conserva TTL y deduplicación entre cambios de contexto', async () => {
  const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const first = client.http.get('/v1/public/catalog/servicios');
  client.resetSessionInvalidation(); const second = client.http.get('/v1/public/catalog/servicios'); expect(second).toBe(first);
  a.resolve(response({ public: true })); await first; await client.http.get('/v1/public/catalog/servicios'); expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('TTL público expira y vuelve a consultar', async () => {
  vi.useFakeTimers(); try { await client.http.get('/v1/public/catalog/servicios'); await vi.advanceTimersByTimeAsync(10001); await client.http.get('/v1/public/catalog/servicios'); expect(fetchMock).toHaveBeenCalledTimes(2); } finally { vi.useRealTimers(); }
});
test('cache:false impide reutilizar GET público', async () => {
  await client.http.get('/v1/public/catalog/servicios', { cache: false }); await client.http.get('/v1/public/catalog/servicios', { cache: false }); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test('dedupe:false conserva solicitudes públicas independientes', async () => {
  const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const first = client.http.get('/v1/public/catalog/servicios', { dedupe: false });
  const second = client.http.get('/v1/public/catalog/servicios', { dedupe: false }); expect(first).not.toBe(second); a.resolve(response()); await Promise.all([first, second]); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test('Authorization explícita impide caché y deduplicación aunque la URL sea pública', async () => {
  await client.http.get('/v1/public/catalog/servicios', { headers: { Authorization: 'synthetic-only' } }); await client.http.get('/v1/public/catalog/servicios', { headers: { Authorization: 'synthetic-only' } }); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test('AbortSignal cancela solo su solicitud y no entrega datos tardíos', async () => {
  const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const controller = new AbortController(); const first = client.http.get('/v1/cliente/me', { signal: controller.signal }); const discarded = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); a.resolve(response({ owner: 'obsolete' })); await discarded; expect(await client.http.get('/v1/cliente/me')).toMatchObject({ owner: 'synthetic' });
});
test('señal ya cancelada no dispara fetch', async () => {
  const controller = new AbortController(); controller.abort(); await expect(client.http.get('/v1/cliente/me', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); expect(fetchMock).not.toHaveBeenCalled();
});
test.each(['/v1/auth/login', '/v1/auth/exchange', '/v1/auth/social/confirm', '/v1/auth/register'])('%s invalida el contexto anterior sin cambiar body ni credentials', async path => {
  const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const previous = client.http.get('/v1/cliente/me'); const discarded = expect(previous).rejects.toMatchObject({ name: 'AbortError' });
  const body = { synthetic: true }; await client.http.post(path, body, { skipCsrf: true }); a.resolve(response({ owner: 'old' })); await discarded;
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify(body) });
});
test.each(['POST', 'PATCH'])('contrato %s conserva body, cabeceras y CSRF', async method => {
  document.cookie = 'mf_csrf=synthetic-csrf-current; path=/'; const body = { synthetic: true };
  await client.request('/v1/cliente/contract-only', { method, body });
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method, credentials: 'include', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'synthetic-csrf-current' } });
});
test('CSRF de A pendiente no se almacena ni se utiliza en B', async () => {
  const oldCsrf = deferred(); fetchMock.mockReturnValueOnce(oldCsrf.promise).mockResolvedValueOnce(response({ data: { csrf_token: 'synthetic-csrf-B' } })).mockResolvedValue(response({ ok: true }));
  const previous = client.http.post('/v1/cliente/contract-only', {}); const discarded = expect(previous).rejects.toMatchObject({ name: 'AbortError' }); client.resetSessionInvalidation();
  await client.http.patch('/v1/cliente/contract-only', {}); oldCsrf.resolve(response({ data: { csrf_token: 'synthetic-csrf-A' } })); await discarded;
  expect(sessionStorage.getItem('mf_cached_csrf_token')).toBe('synthetic-csrf-B'); expect(fetchMock.mock.calls[2][1].headers['X-CSRF-Token']).toBe('synthetic-csrf-B'); expect(fetchMock).toHaveBeenCalledTimes(3);
});
test('respuesta mutable antigua se descarta sin repetir la operación enviada', async () => {
  const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const pending = client.http.patch('/v1/cliente/contract-only', { synthetic: true }, { skipCsrf: true });
  const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' }); client.resetSessionInvalidation(); a.resolve(response({ ok: true })); await discarded; expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('error de red vigente conserva el contrato NETWORK_UNAVAILABLE', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')); await expect(client.http.get('/v1/cliente/me')).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE', status: 0 });
});
test('reintentos explícitos tras fallo no reutilizan promesas fallidas', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')); await expect(client.http.get('/v1/public/catalog/servicios')).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  await expect(client.http.get('/v1/public/catalog/servicios')).resolves.toMatchObject({ owner: 'synthetic' }); expect(fetchMock).toHaveBeenCalledTimes(2);
});
