// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../config/supabaseClient.js', () => ({ supabase: null }));
let client, api, actor, fetchMock;
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function response(data, status = 200) { return { ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => data }; }
beforeEach(async () => {
  vi.resetModules(); actor = 'synthetic-A';
  fetchMock = vi.fn(async () => response({ data: { owner: actor } })); vi.stubGlobal('fetch', fetchMock);
  client = await import('./httpClient.js'); api = await import('../features/cliente/lib/clienteApi.js');
});
afterEach(() => { client.registerSessionInvalidationHandler(null); client.abortInFlightRequests(); vi.unstubAllGlobals(); });

test('getClienteMe no reutiliza perfil A bajo B dentro del TTL', async () => {
  expect(await api.getClienteMe()).toEqual({ owner: 'synthetic-A' }); actor = 'synthetic-B';
  expect(await api.getClienteMe()).toEqual({ owner: 'synthetic-B' }); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test('peticiones privadas no comparten promesa ni respuestas entre generaciones', async () => {
  const pending = deferred(); fetchMock.mockReturnValueOnce(pending.promise);
  const a = client.http.get('/v1/cliente/me'); const discarded = expect(a).rejects.toMatchObject({ name: 'AbortError' });
  client.resetSessionInvalidation(); actor = 'synthetic-B'; const b = client.http.get('/v1/cliente/me');
  expect(a).not.toBe(b); pending.resolve(response({ data: { owner: 'synthetic-A' } })); await discarded; expect((await b).data.owner).toBe('synthetic-B'); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test('logout/reset seguido de B no entrega respuestas anteriores', async () => {
  await api.getClienteMe(); client.abortInFlightRequests('logout'); client.resetSessionInvalidation(); actor = 'synthetic-B';
  expect(await api.getClienteMe()).toEqual({ owner: 'synthetic-B' }); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test('401 A durante parseo no invalida B y llega como descarte al consumidor', async () => {
  const body = deferred(), events = []; client.registerSessionInvalidationHandler(() => events.push('invalidate-B'));
  fetchMock.mockResolvedValueOnce({ ...response({}, 401), json: () => body.promise });
  const old = client.http.get('/v1/cliente/me').catch(() => events.push('consumer-catch')); await Promise.resolve();
  client.abortInFlightRequests('logout'); client.resetSessionInvalidation(); actor = 'synthetic-B';
  expect((await client.http.get('/v1/cliente/me', { cache: false, dedupe: false })).data.owner).toBe('synthetic-B');
  body.resolve({ error: { code: 'SYNTHETIC_UNAUTHORIZED' } }); await old;
  expect(events).toEqual(['consumer-catch']);
});
test('tras invalidación vigente y reset B recibe únicamente su respuesta', async () => {
  await api.getClienteMe(); fetchMock.mockResolvedValueOnce(response({ error: { code: 'SYNTHETIC_UNAUTHORIZED' } }, 401));
  await expect(client.http.get('/v1/cliente/other', { cache: false })).rejects.toMatchObject({ status: 401 });
  client.resetSessionInvalidation(); actor = 'synthetic-B'; expect(await api.getClienteMe()).toEqual({ owner: 'synthetic-B' });
});
test('resumen de puntos no reutiliza respuesta de otra identidad', async () => {
  expect(await api.getClientePuntosResumen()).toEqual({ owner: 'synthetic-A' }); actor = 'synthetic-B';
  expect(await api.getClientePuntosResumen()).toEqual({ owner: 'synthetic-B' }); expect(fetchMock).toHaveBeenCalledTimes(2);
});
