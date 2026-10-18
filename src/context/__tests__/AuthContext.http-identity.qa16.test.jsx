// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useLayoutEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../../config/supabaseClient.js', () => ({ supabase: null }));
vi.mock('../../features/admin/lib/adminReportesApi.js', () => ({ setAdminReportesSessionScope: vi.fn() }));
let AuthProvider, useAuth, client, latest, fetchMock, actor;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function response(data, status = 200) { return { ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => data }; }
function userPayload() { return { ok: true, data: { user: { id_usuario: `synthetic-${actor}`, nombres: `Cuenta ${actor}` }, roles: ['cliente'], cliente_id: `client-${actor}` } }; }
beforeEach(async () => {
  vi.resetModules(); actor = 'A'; latest = null; localStorage.clear(); sessionStorage.clear(); window.history.pushState({}, '', '/');
  localStorage.setItem('mf_session_last_backend_touch_at', String(Date.now())); document.cookie = 'mf_csrf=synthetic-only; path=/';
  fetchMock = vi.fn(async url => {
    const path = String(url);
    if (path.endsWith('/v1/auth/me')) return response(userPayload());
    if (path.endsWith('/v1/auth/login') || path.endsWith('/v1/auth/exchange')) { actor = 'B'; return response({ ok: true, data: { session: { authenticated: true } } }); }
    if (path.endsWith('/v1/auth/logout')) return response({ ok: true, data: { logged_out: true } });
    if (path.endsWith('/v1/auth/csrf')) return response({ data: { csrf_token: 'synthetic-current' } });
    if (path.endsWith('/v1/cliente/me')) return response({ data: { owner: actor } });
    throw new Error('Unexpected synthetic HTTP request');
  }); vi.stubGlobal('fetch', fetchMock);
  client = await import('../../services/httpClient.js'); ({ AuthProvider, useAuth } = await import('../AuthContext.jsx'));
});
afterEach(() => { cleanup(); client.registerSessionInvalidationHandler(null); client.abortInFlightRequests(); vi.unstubAllGlobals(); document.cookie = 'mf_csrf=; Max-Age=0; path=/'; });
function Probe() { const auth = useAuth(); useLayoutEffect(() => { latest = auth; }, [auth]); return <p>{auth.user?.nombres || 'Sin sesión'}</p>; }
async function ready() { render(<MemoryRouter initialEntries={['/home/cliente']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthProvider><Probe /></AuthProvider></MemoryRouter>); await act(async () => { await latest.hydrateSession(); }); expect(screen.getByText('Cuenta A')).toBeInTheDocument(); }

test('login B e hidratación real no pueden ser invalidados por 401 A tardío', async () => {
  await ready(); const body = deferred(); fetchMock.mockResolvedValueOnce({ ...response({}, 401), json: () => body.promise }); const a = client.http.get('/v1/cliente/me'); const discarded = expect(a).rejects.toMatchObject({ name: 'AbortError' }); await Promise.resolve();
  await act(async () => { expect(await latest.login('b@example.test', 'synthetic-password', false)).toMatchObject({ ok: true }); }); expect(screen.getByText('Cuenta B')).toBeInTheDocument();
  await act(async () => body.resolve({ error: { code: 'SYNTHETIC_UNAUTHORIZED' } })); await discarded; expect(latest.user.id_usuario).toBe('synthetic-B');
});
test.each(['success', 'network'])('hidratación B conserva identidad cuando A termina con %s', async outcome => {
  await ready(); const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); let old;
  act(() => { old = latest.hydrateSession(); }); actor = 'B'; await act(async () => { await latest.hydrateSession(); }); expect(latest.user.id_usuario).toBe('synthetic-B');
  await act(async () => { if (outcome === 'network') a.reject(new TypeError('synthetic network')); else a.resolve(response({ ok: true, data: { user: { id_usuario: 'synthetic-A' }, roles: ['cliente'] } })); await old; }); expect(latest.user.id_usuario).toBe('synthetic-B');
});
test('OAuth exchange y completeExchangeLogin aíslan solicitudes previas', async () => {
  await ready(); const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const pending = client.http.get('/v1/cliente/me'); const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => { await client.http.post('/v1/auth/exchange', { synthetic: true }, { skipCsrf: true }); expect(await latest.completeExchangeLogin()).toMatchObject({ ok: true }); });
  a.resolve(response({ data: { owner: 'A' } })); await discarded; expect(latest.user.id_usuario).toBe('synthetic-B');
});
test('logout confirmado y login B no restauran respuestas A', async () => {
  await ready(); const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const pending = client.http.get('/v1/cliente/me'); const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => { expect(await latest.logout()).toMatchObject({ ok: true, logged_out: true }); }); expect(latest.user).toBeNull();
  await act(async () => { await latest.login('b@example.test', 'synthetic-password', false); }); a.resolve(response({ data: { owner: 'A' } })); await discarded; expect(latest.user.id_usuario).toBe('synthetic-B');
});
test('logout no confirmado conserva identidad y advertencia QA-12', async () => {
  await ready(); fetchMock.mockResolvedValueOnce(response({ error: { code: 'AUTH_LOGOUT_UNCONFIRMED' } }, 503));
  await act(async () => { expect(await latest.logout()).toMatchObject({ ok: false, logged_out: false }); }); expect(latest.user.id_usuario).toBe('synthetic-A'); expect(screen.getByRole('alert')).toHaveTextContent('No se confirmó');
});
test('401 vigente mantiene invalidación de AuthContext', async () => {
  await ready(); fetchMock.mockResolvedValueOnce(response({ error: { code: 'SYNTHETIC_UNAUTHORIZED' } }, 401));
  await act(async () => { await expect(client.http.get('/v1/cliente/me')).rejects.toMatchObject({ status: 401 }); }); expect(latest.user).toBeNull();
});
test('logout entre pestañas invalida peticiones A sin enviar logout adicional', async () => {
  await ready(); const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const pending = client.http.get('/v1/cliente/me'); const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'mf_session_manual_logout_at', newValue: String(Date.now()) })));
  expect(latest.user).toBeNull(); a.resolve(response({ data: { owner: 'A' } })); await discarded;
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/v1/auth/logout'))).toBe(false);
});
test('rehidratar misma cuenta también descarta la época anterior y no persiste identidad', async () => {
  await ready(); const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const pending = client.http.get('/v1/cliente/me'); const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => { await latest.hydrateSession(); }); a.resolve(response({ data: { owner: 'A-old' } })); await discarded; expect(latest.user.id_usuario).toBe('synthetic-A');
  expect(Object.values(localStorage).join(' ')).not.toContain('synthetic-A'); expect(Object.keys(localStorage).every(key => key.endsWith('_at'))).toBe(true);
});
