// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../BarberoProfilePage.jsx';
const auth = vi.hoisted(() => ({ user: { id_usuario: 'synthetic-A' } }));
const api = vi.hoisted(() => ({ getBarberoPerfil: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth, getUserDisplayName: user => user?.id_usuario || '' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../lib/barberoApi.js', () => api);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const payload = id => ({ perfil: { nombre_completo: `BARBER-${id}`, correo_principal: `${id}@example.test`, es_barbero: true, salario_base: 1234, observaciones: 'synthetic-note', foto_perfil_url: `https://synthetic.invalid/${id}.jpg`, certificaciones_titulos: ['Certificado sintético'] } });
beforeEach(() => { Object.assign(auth, { user: { id_usuario: 'synthetic-A' }, empleadoId: 'employee-A', isAuthenticated: true, isHydrated: true, isHydrating: false }); api.getBarberoPerfil.mockReset().mockResolvedValue(payload('A')); navigate.mockReset(); });
afterEach(cleanup);
test('cambiar identidad limpia inmediatamente perfil y foto A', async () => {
  const view = render(<Page />); await screen.findByRole('heading', { name: 'BARBER-A' });
  api.getBarberoPerfil.mockResolvedValue(payload('B')); auth.user = { id_usuario: 'synthetic-B' }; view.rerender(<Page />);
  expect(screen.queryByRole('heading', { name: 'BARBER-A' })).not.toBeInTheDocument(); expect(api.getBarberoPerfil).toHaveBeenCalledTimes(2);
  expect(screen.queryByAltText('BARBER-A')).not.toBeInTheDocument(); await screen.findByRole('heading', { name: 'BARBER-B' });
});
test('solicitud A pendiente no reemplaza B aunque termine última', async () => {
  const p = deferred(); api.getBarberoPerfil.mockReturnValueOnce(p.promise).mockResolvedValue(payload('B')); const view = render(<Page />);
  auth.user = { id_usuario: 'synthetic-B' }; view.rerender(<Page />); await screen.findByRole('heading', { name: 'BARBER-B' }); await act(async () => p.resolve(payload('A')));
  expect(screen.queryByRole('heading', { name: 'BARBER-A' })).not.toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'BARBER-B' })).toBeInTheDocument();
});
test.each([401, 403, 500])('error %s obsoleto no navega ni altera B', async status => {
  const p = deferred(); api.getBarberoPerfil.mockReturnValueOnce(p.promise).mockResolvedValue(payload('B')); const view = render(<Page />);
  auth.user = { id_usuario: 'synthetic-B' }; view.rerender(<Page />); await screen.findByRole('heading', { name: 'BARBER-B' }); await act(async () => p.reject({ status }));
  expect(navigate).not.toHaveBeenCalled(); expect(screen.getByRole('heading', { name: 'BARBER-B' })).toBeInTheDocument();
});
test.each(['success', 401, 403])('desmontaje descarta resultado %s', async outcome => {
  const p = deferred(); api.getBarberoPerfil.mockReturnValue(p.promise); const view = render(<Page />); view.unmount();
  await act(async () => outcome === 'success' ? p.resolve(payload('A')) : p.reject({ status: outcome })); expect(navigate).not.toHaveBeenCalled();
});
test('vista oculta salario y notas pero conserva certificaciones públicas', async () => {
  render(<Page />); await screen.findByText('Certificado sintético'); expect(screen.queryByText('1234')).not.toBeInTheDocument(); expect(screen.queryByText('synthetic-note')).not.toBeInTheDocument();
  expect(api.getBarberoPerfil).toHaveBeenCalledTimes(1);
});

test.each([401, 403])('error vigente B %s conserva navegación', async status => {
  const view = render(<Page />); await screen.findByRole('heading', { name: 'BARBER-A' }); api.getBarberoPerfil.mockRejectedValueOnce({ status });
  auth.user = { id_usuario: 'synthetic-B' }; view.rerender(<Page />);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true }));
});
test('logout elimina datos y no consulta', async () => {
  const view = render(<Page />); await screen.findByRole('heading', { name: 'BARBER-A' }); auth.isAuthenticated = false; auth.user = null; view.rerender(<Page />);
  expect(screen.queryByText('BARBER-A')).not.toBeInTheDocument(); expect(api.getBarberoPerfil).toHaveBeenCalledTimes(1);
});
test('hidratación espera identidad confirmada y oculta perfil anterior', async () => {
  auth.isHydrated = false; auth.isHydrating = true; const view = render(<Page />); expect(api.getBarberoPerfil).not.toHaveBeenCalled();
  auth.isHydrated = true; auth.isHydrating = false; view.rerender(<Page />); await screen.findByRole('heading', { name: 'BARBER-A' });
  auth.isHydrating = true; view.rerender(<Page />); expect(screen.queryByText('BARBER-A')).not.toBeInTheDocument();
});
test('cambio de empleado de la misma cuenta invalida datos', async () => {
  const view = render(<Page />); await screen.findByRole('heading', { name: 'BARBER-A' }); api.getBarberoPerfil.mockResolvedValueOnce(payload('B'));
  auth.empleadoId = 'employee-B'; view.rerender(<Page />); expect(screen.queryByText('BARBER-A')).not.toBeInTheDocument(); await screen.findByRole('heading', { name: 'BARBER-B' });
});
test('error de foto A no oculta foto B aunque compartan URL', async () => {
  const view = render(<Page />); await screen.findByAltText('BARBER-A'); fireEvent.error(screen.getByAltText('BARBER-A')); expect(screen.queryByAltText('BARBER-A')).not.toBeInTheDocument();
  api.getBarberoPerfil.mockResolvedValueOnce({ perfil: { ...payload('B').perfil, foto_perfil_url: payload('A').perfil.foto_perfil_url } }); auth.user = { id_usuario: 'synthetic-B' }; view.rerender(<Page />);
  expect(await screen.findByAltText('BARBER-B')).toHaveAttribute('src', 'https://synthetic.invalid/A.jpg');
});
test('error de red permite reintento manual', async () => {
  api.getBarberoPerfil.mockRejectedValueOnce({}); render(<Page />); await screen.findByText('No se pudo cargar el perfil del barbero.');
  fireEvent.click(screen.getByRole('button', { name: /reintentar/i })); await screen.findByRole('heading', { name: 'BARBER-A' }); expect(api.getBarberoPerfil).toHaveBeenCalledTimes(2);
});
test('carga vacía conserva mensaje', async () => {
  api.getBarberoPerfil.mockResolvedValueOnce({}); render(<Page />); await screen.findByText('No se encontro informacion de perfil para mostrar.');
});
test('StrictMode descarta solicitud invalidada', async () => {
  const p = deferred(); api.getBarberoPerfil.mockReturnValueOnce(p.promise).mockResolvedValue(payload('B')); render(<StrictMode><Page /></StrictMode>); await screen.findByRole('heading', { name: 'BARBER-B' });
  await act(async () => p.reject({ status: 401 })); expect(navigate).not.toHaveBeenCalled(); expect(api.getBarberoPerfil).toHaveBeenCalledTimes(2);
});
test('logout y regreso a la misma cuenta no recuperan una solicitud anterior', async () => {
  const a = deferred(); api.getBarberoPerfil.mockReturnValueOnce(a.promise).mockResolvedValue(payload('B')); const view = render(<Page />);
  auth.isAuthenticated = false; view.rerender(<Page />); auth.isAuthenticated = true; view.rerender(<Page />); await screen.findByRole('heading', { name: 'BARBER-B' });
  await act(async () => a.resolve(payload('A'))); expect(screen.queryByText('BARBER-A')).not.toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'BARBER-B' })).toBeInTheDocument();
});
test('A antigua no elimina loading ni introduce error mientras B sigue pendiente', async () => {
  const a = deferred(), b = deferred(); api.getBarberoPerfil.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); const view = render(<Page />);
  auth.user = { id_usuario: 'synthetic-B' }; view.rerender(<Page />); const loadingMarkup = view.container.innerHTML;
  await act(async () => a.reject({ status: 500 })); expect(view.container.innerHTML).toBe(loadingMarkup);
  await act(async () => b.resolve(payload('B'))); await screen.findByRole('heading', { name: 'BARBER-B' });
});
test('sin identificador autenticado no se consulta', () => {
  auth.user = {}; render(<Page />); expect(api.getBarberoPerfil).not.toHaveBeenCalled(); expect(screen.getByRole('status', { name: 'Esperando sesión de barbero' })).toBeInTheDocument();
});
