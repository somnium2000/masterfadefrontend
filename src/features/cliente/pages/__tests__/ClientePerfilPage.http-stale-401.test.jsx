// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const h = vi.hoisted(() => ({ auth: {}, navigate: vi.fn(), notify: vi.fn(), refresh: vi.fn() }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => h.auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => ({ error: h.notify }) }));
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate, useOutletContext: () => ({ refreshClienteProfile: h.refresh }) }));
vi.mock('../../components/ClienteProfileEditModal.jsx', () => ({ default: () => null }));
vi.mock('../../components/ClienteAccountDeletionDialog.jsx', () => ({ default: () => null }));
let Page, client, requests, invalidation;
function response(status = 200, name = 'CURRENT') {
  return { ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => status === 401 ? { error: { code: 'SYNTHETIC_401' } } : { data: { cliente: { nombre_completo: name, masterpuntos: 0 }, profile_completion: { completion_percent: 0 } } } };
}
beforeEach(async () => {
  vi.resetModules(); requests = []; invalidation = vi.fn(); h.navigate.mockReset(); h.notify.mockReset(); h.refresh.mockReset();
  Object.assign(h.auth, { user: { id_usuario: 'synthetic-A' }, clienteId: 'client-A', isAuthenticated: true, isHydrated: true, isHydrating: false, logout: vi.fn() });
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    if (!String(url).endsWith('/v1/cliente/me')) throw new Error('Unexpected synthetic request');
    let resolve; const promise = new Promise(done => { resolve = done; }); requests.push({ signal: options.signal, resolve }); return promise;
  }));
  client = await import('../../../../services/httpClient.js'); client.registerSessionInvalidationHandler(invalidation);
  Page = (await import('../ClientePerfilPage.jsx')).default;
});
afterEach(() => { cleanup(); client.registerSessionInvalidationHandler(null); client.abortInFlightRequests(); vi.unstubAllGlobals(); });
async function ready(element) { const view = render(element || <Page />); await waitFor(() => expect(requests.length).toBeGreaterThan(0)); return view; }
test.each([200, 401, 503])('desmontaje descarta respuesta %s aunque fetch ignore abort', async status => {
  const view = await ready(); view.unmount(); expect(requests[0].signal.aborted).toBe(true);
  await act(async () => requests[0].resolve(response(status, 'OBSOLETE')));
  expect(invalidation).not.toHaveBeenCalled(); expect(h.auth.logout).not.toHaveBeenCalled(); expect(h.navigate).not.toHaveBeenCalled(); expect(h.notify).not.toHaveBeenCalled(); expect(screen.queryAllByText('OBSOLETE')).toHaveLength(0);
});
test('401 vigente mantiene invalidación HTTP', async () => {
  await ready(); await act(async () => requests[0].resolve(response(401))); expect(invalidation).toHaveBeenCalledTimes(1);
});
test('200 vigente carga y refresca Shell', async () => {
  await ready(); await act(async () => requests[0].resolve(response())); expect(screen.getAllByText('CURRENT').length).toBeGreaterThan(0); expect(h.refresh).toHaveBeenCalledTimes(1);
});
test('carga sustituida y su finally no cancelan la nueva', async () => {
  const view = await ready(); h.refresh = vi.fn(); view.rerender(<Page />); await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0].signal.aborted).toBe(true); await act(async () => requests[0].resolve(response(401))); expect(requests[1].signal.aborted).toBe(false);
  view.unmount(); expect(requests[1].signal.aborted).toBe(true); await act(async () => requests[1].resolve(response())); expect(invalidation).not.toHaveBeenCalled();
});
test('cambio de identidad cancela solo instancia anterior', async () => {
  const view = await ready(); h.auth.user = { id_usuario: 'synthetic-B' }; h.auth.clienteId = 'client-B'; view.rerender(<Page />); await waitFor(() => expect(requests).toHaveLength(2));
  await act(async () => requests[0].resolve(response(401))); expect(requests[1].signal.aborted).toBe(false); await act(async () => requests[1].resolve(response(200, 'OWNER-B'))); expect(screen.getAllByText('OWNER-B').length).toBeGreaterThan(0); expect(invalidation).not.toHaveBeenCalled();
});
test('StrictMode conserva carga nueva tras cleanup anterior', async () => {
  await ready(<StrictMode><Page /></StrictMode>); await waitFor(() => expect(requests).toHaveLength(2)); expect(requests[0].signal.aborted).toBe(true); expect(requests[1].signal.aborted).toBe(false);
  await act(async () => { requests[0].resolve(response(401)); requests[1].resolve(response()); }); expect(invalidation).not.toHaveBeenCalled(); expect(screen.getAllByText('CURRENT').length).toBeGreaterThan(0);
});
test('desmontar Perfil no aborta solicitud independiente del Shell', async () => {
  const view = await ready(); const controller = new AbortController(); const shell = client.http.get('/v1/cliente/me', { signal: controller.signal, skipAuthInvalidation: true });
  view.unmount(); expect(requests[0].signal.aborted).toBe(true); expect(requests[1].signal.aborted).toBe(false);
  await act(async () => { requests[0].resolve(response(401)); requests[1].resolve(response()); await shell; }); expect(invalidation).not.toHaveBeenCalled();
});
