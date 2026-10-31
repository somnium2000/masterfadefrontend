// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const auth = vi.hoisted(() => ({ logout: vi.fn() }));
const nav = vi.hoisted(() => vi.fn());
const notices = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
const outlet = vi.hoisted(() => ({ current: {} }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth, getUserDisplayName: user => user?.id_usuario || '' }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => nav, useLocation: () => ({ pathname: '/home/cliente' }), Outlet: ({ context }) => { outlet.current = context; return null; } }));
vi.mock('../../../../components/branding/MasterfadeLogo.jsx', () => ({ default: ({ variant, className }) => <div data-logo-variant={variant} className={className} /> }));
vi.mock('../../../../components/navigation/PremiumBottomNav.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({ default: () => null }));
let Page, httpClient, clienteApi, fetchMock, invalidation;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function response(owner, status = 200) { return { ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => status < 400 ? { data: { owner } } : { error: { code: 'SYNTHETIC_ERROR' } } }; }
beforeEach(async () => {
  vi.resetModules(); Object.assign(auth, { user: { id_usuario: 'synthetic-A' }, isAuthenticated: true, isHydrated: true, isHydrating: false });
  auth.logout.mockReset().mockResolvedValue({ ok: true, logged_out: true }); nav.mockReset(); notices.error.mockReset(); notices.info.mockReset(); invalidation = vi.fn();
  fetchMock = vi.fn(async url => { if (!String(url).endsWith('/v1/cliente/me')) throw new Error('Unexpected synthetic request'); return response(auth.user?.id_usuario); }); vi.stubGlobal('fetch', fetchMock);
  httpClient = await import('../../../../services/httpClient.js'); clienteApi = await import('../../lib/clienteApi.js'); httpClient.registerSessionInvalidationHandler(invalidation);
  Page = (await import('../../layouts/ClienteAppShell.jsx')).default;
});
afterEach(() => { cleanup(); httpClient.registerSessionInvalidationHandler(null); httpClient.abortInFlightRequests(); vi.unstubAllGlobals(); });
async function ready() { const view = render(<Page />); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); return view; }
function changeB(view) { auth.user = { id_usuario: 'synthetic-B' }; view.rerender(<Page />); }

test('sidebar Cliente mantiene el logo centrado y su navegación intacta', async () => {
  await ready();
  const logo = document.querySelector('[data-logo-variant="sidebar"]');
  expect(logo).toHaveClass('mx-auto');
  expect(logo.closest('button')).toHaveClass('w-full', 'justify-center', 'mb-4');
  for (const label of ['Inicio', 'Citas', 'Catálogo', 'Planes', 'Perfil']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  }
});

test.each([200, 401, 403, 500])('respuesta antigua A %s no afecta B ni invalida globalmente', async status => {
  const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const view = await ready(); const signalA = fetchMock.mock.calls[0][1].signal;
  changeB(view); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); expect(signalA.aborted).toBe(true);
  await act(async () => a.resolve(response('synthetic-A', status)));
  expect(invalidation).not.toHaveBeenCalled(); expect(auth.logout).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled(); expect(notices.error).not.toHaveBeenCalled(); expect(screen.getByText('synthetic-B')).toBeInTheDocument();
});
test('éxito de refresh silencioso A pendiente devuelve null después de B', async () => {
  const view = await ready(); const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const pending = outlet.current.refreshClienteProfile({ silent: true });
  changeB(view); await act(async () => a.resolve(response('synthetic-A'))); expect(await pending).toBeNull(); expect(invalidation).not.toHaveBeenCalled();
});
test('401 vigente se maneja explícitamente y conserva navegación tras logout confirmado', async () => {
  fetchMock.mockResolvedValueOnce(response(null, 401)); await ready(); await waitFor(() => expect(nav).toHaveBeenCalledWith('/login', { replace: true })); expect(auth.logout).toHaveBeenCalledTimes(1); expect(invalidation).not.toHaveBeenCalled();
});
test.each(['logout', 'unmount', 'hydration'])('transición %s invalida 401 pendiente', async transition => {
  const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const view = await ready();
  if (transition === 'unmount') view.unmount(); else { if (transition === 'logout') { auth.isAuthenticated = false; auth.user = null; } else auth.isHydrating = true; view.rerender(<Page />); }
  await act(async () => a.resolve(response(null, 401))); expect(auth.logout).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled(); expect(invalidation).not.toHaveBeenCalled();
});
test('red no silenciosa presenta mensaje seguro; silenciosa no notifica', async () => {
  await ready(); fetchMock.mockRejectedValueOnce(new TypeError('synthetic-network-details')); await act(async () => outlet.current.refreshClienteProfile());
  expect(notices.error).toHaveBeenCalledWith('No se pudo cargar tu estado de perfil. Intenta nuevamente.'); notices.error.mockClear();
  fetchMock.mockRejectedValueOnce(new TypeError('synthetic-network-details')); await act(async () => outlet.current.refreshClienteProfile({ silent: true })); expect(notices.error).not.toHaveBeenCalled();
});
test('Shell y getClienteMe predeterminado no reutilizan respuestas privadas de A', async () => {
  expect(await clienteApi.getClienteMe()).toEqual({ owner: 'synthetic-A' }); auth.user = { id_usuario: 'synthetic-B' }; render(<Page />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); expect(await outlet.current.refreshClienteProfile()).toEqual({ owner: 'synthetic-B' });
  expect(await clienteApi.getClienteMe()).toEqual({ owner: 'synthetic-B' });
});
test('Shell no comparte promesa con GET legado A pendiente', async () => {
  const a = deferred(); fetchMock.mockReturnValueOnce(a.promise); const legacy = clienteApi.getClienteMe(); auth.user = { id_usuario: 'synthetic-B' }; render(<Page />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); expect(await outlet.current.refreshClienteProfile()).toEqual({ owner: 'synthetic-B' });
  a.resolve(response('synthetic-A')); expect(await legacy).toEqual({ owner: 'synthetic-A' });
});
test('401 A con body pendiente no activa invalidación global antes del guard', async () => {
  const body = deferred(); fetchMock.mockResolvedValueOnce({ ...response(null, 401), json: () => body.promise }); const view = await ready(); changeB(view);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); await act(async () => body.resolve({ error: { code: 'SYNTHETIC_ERROR' } }));
  expect(invalidation).not.toHaveBeenCalled(); expect(auth.logout).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled();
});
test('logout manual espera confirmación y no duplica solicitudes', async () => {
  await ready(); const close = deferred(); auth.logout.mockReturnValueOnce(close.promise); fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' })); fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(nav).not.toHaveBeenCalled(); expect(auth.logout).toHaveBeenCalledTimes(1); await act(async () => close.resolve({ ok: true, logged_out: true })); expect(nav).toHaveBeenCalledWith('/login', { replace: true });
});
test.each([{ ok: false, logged_out: false }, { ok: true, logged_out: false }])('logout manual no confirmado %j no navega', async result => {
  await ready(); auth.logout.mockResolvedValueOnce(result); fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' })); await act(async () => {}); expect(nav).not.toHaveBeenCalled(); expect(screen.getByText('synthetic-A')).toBeInTheDocument();
});
test('logout manual no navega sobre B si terminó tarde', async () => {
  const view = await ready(); const close = deferred(); auth.logout.mockReturnValueOnce(close.promise); fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' })); changeB(view);
  await act(async () => close.resolve({ ok: true, logged_out: true })); expect(nav).not.toHaveBeenCalled();
});
test('logout confirmado puede navegar cuando AuthContext ya limpió la identidad', async () => {
  const view = await ready(); const close = deferred(); auth.logout.mockReturnValueOnce(close.promise); fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' })); auth.user = null; auth.isAuthenticated = false; view.rerender(<Page />);
  await act(async () => close.resolve({ ok: true, logged_out: true })); expect(nav).toHaveBeenCalledWith('/login', { replace: true });
});
test('hidratación inicial no consulta; StrictMode no duplica timer de carga', async () => {
  auth.isHydrating = true; const view = render(<StrictMode><Page /></StrictMode>); await act(async () => new Promise(resolve => setTimeout(resolve, 10))); expect(fetchMock).not.toHaveBeenCalled();
  auth.isHydrating = false; view.rerender(<StrictMode><Page /></StrictMode>); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
});
test('navegación lateral conserva enlaces y separación vertical explícita', async () => {
  await ready();
  const navElement = screen.getByRole('navigation');
  expect(navElement).toHaveClass('flex', 'flex-col', 'gap-3');
  expect(navElement).not.toHaveClass('space-y-2');
  for (const label of ['Inicio', 'Citas', 'Catálogo', 'Planes', 'Perfil']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  }
});
