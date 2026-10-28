// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Sessions from '../AdminSeguridadSesionesPage.jsx';
import Logs from '../AdminSeguridadLoginLogsPage.jsx';
import Users from '../AdminSeguridadUsuariosPage.jsx';
import Alerts from '../AdminSeguridadAlertasPage.jsx';
import Profile from '../../../cliente/pages/ClientePerfilPage.jsx';
import ProfileEdit from '../../../cliente/components/ClienteProfileEditModal.jsx';

const auth = vi.hoisted(() => ({ roles: ['root'], user: { id_usuario: 'actor' } }));
const navigate = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => Object.fromEntries(['listAdminSecuritySessions', 'listAdminSecurityLoginLogs', 'listAdminSecurityUsers', 'listAdminSecurityAlerts', 'getAdminSecuritySessionDetail', 'getAdminSecurityLoginLogDetail', 'getAdminSecurityAlertDetail', 'revokeAllAdminSecuritySessions', 'revokeAdminSecuritySession', 'updateAdminSecurityUserAccessState', 'updateAdminSecurityAlertState'].map(name => [name, vi.fn()])));
const realtime = vi.hoisted(() => ({ signal: null }));
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const profileApi = vi.hoisted(() => ({ getClienteMe: vi.fn(), updateClienteMe: vi.fn(), prepareClienteProfileImageUpload: vi.fn(), getClienteProfileImageReadUrl: vi.fn() }));
vi.mock('../../../cliente/lib/clienteApi.js', () => ({ ...profileApi, ALLOWED_PROFILE_IMAGE_TYPES: ['image/jpeg'], MAX_PROFILE_IMAGE_BYTES: 5242880 }));
vi.mock('../../../cliente/components/ClienteAccountDeletionDialog.jsx', () => ({ default: () => null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate, useOutletContext: () => ({}) }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('../../lib/adminSeguridadApi.js', () => api);
vi.mock('../../lib/useSecurityRealtime.js', () => ({ default: options => { realtime.signal = options.onSignal; return { status: 'connected' }; } }));
vi.mock('../../../../components/data/LoadingSpinner.jsx', () => ({ default: ({ label }) => <p role="status">{label}</p> }));

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function result(label) { return { data: { items: [{ id_usuario: 'synthetic', id_sesion: 'session', id_login_log: 'log', id_alerta: 'alert', nombres: label, device_summary: label, email_masked: label, resumen: label, roles: ['cliente'], estado: 'activa', estado_acceso: 'activo' }], pagination: { page: 1, limit: 20, total: 40, total_pages: 2 } } }; }
const cases = [
  ['sesiones', Sessions, 'listAdminSecuritySessions', 'cerrada', 'expirada'],
  ['logs', Logs, 'listAdminSecurityLoginLogs', 'failed', 'blocked'],
  ['usuarios', Users, 'listAdminSecurityUsers', 'bloqueado', 'inactivo'],
  ['alertas', Alerts, 'listAdminSecurityAlerts', 'resuelta', 'descartada'],
];
beforeEach(() => { auth.roles = ['root']; auth.user = { id_usuario: 'actor' }; navigate.mockReset(); for (const mock of Object.values(api)) mock.mockReset().mockResolvedValue({ data: { items: [], pagination: { total: 0, total_pages: 1 } } }); });
afterEach(() => cleanup());
for (const [name, Page, method, first, second] of cases) describe(name, () => {
  async function ready(strict = false) { api[method].mockResolvedValue(result('INITIAL')); const view = render(strict ? <StrictMode><Page /></StrictMode> : <Page />); await screen.findAllByText('INITIAL'); return view; }
  function select(value) { fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value } }); if (name !== 'usuarios') fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' })); }
  test.each(['success', 500, 401, 403])('A tardía %s no altera B ni navega', async outcome => {
    await ready(); const a = deferred(); api[method].mockReturnValueOnce(a.promise).mockResolvedValue(result('CURRENT'));
    select(first); await waitFor(() => expect(api[method].mock.calls.at(-1)[0]).toMatchObject(name === 'usuarios' ? { estadoAcceso: first } : name === 'logs' ? { resultado: first } : { estado: first }));
    select(second); await screen.findAllByText('CURRENT');
    await act(async () => outcome === 'success' ? a.resolve(result('OBSOLETE')) : a.reject({ status: outcome }));
    expect(screen.getAllByText('CURRENT').length).toBeGreaterThan(0); expect(screen.queryAllByText('OBSOLETE')).toHaveLength(0); expect(navigate).not.toHaveBeenCalled();
  });
  test('A no libera loading de B', async () => {
    await ready(); const a = deferred(), b = deferred(); api[method].mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    select(first); select(second); await act(async () => a.resolve(result('OBSOLETE')));
    expect(screen.getByRole('status')).toBeInTheDocument(); await act(async () => b.resolve(result('CURRENT'))); expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  test.each(['success', 401])('desmontaje descarta %s', async outcome => {
    const view = await ready(); const a = deferred(); api[method].mockReturnValueOnce(a.promise); select(first); view.unmount();
    await act(async () => outcome === 'success' ? a.resolve(result('OBSOLETE')) : a.reject({ status: outcome })); expect(navigate).not.toHaveBeenCalled();
  });
  test('perder permisos elimina datos e invalida la respuesta pendiente', async () => {
    const view = await ready(); const a = deferred(); api[method].mockReturnValueOnce(a.promise); select(first);
    auth.roles = ['cliente']; view.rerender(<Page />); await act(async () => a.resolve(result('OBSOLETE')));
    expect(screen.queryAllByText('OBSOLETE')).toHaveLength(0); expect(screen.queryAllByText('INITIAL')).toHaveLength(0);
    expect(api[method]).toHaveBeenCalledTimes(2);
  });
  test.each([401, 403])('error vigente %s conserva redirección', async status => {
    await ready(); api[method].mockRejectedValueOnce({ status }); select(first);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true }));
  });
  test('StrictMode conserva consulta y paginación', async () => {
    await ready(true); api[method].mockResolvedValue(result('PAGE2')); fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findAllByText('PAGE2'); expect(api[method].mock.calls.at(-1)[0].page).toBe(2);
  });
  if (name === 'sesiones' || name === 'alertas') test('realtime vuelve a consultar sin perder alcance', async () => {
    await ready(); api[method].mockResolvedValue(result('REALTIME')); act(() => realtime.signal()); await screen.findAllByText('REALTIME');
  });
  if (name === 'usuarios') test('búsqueda conserva debounce y descarta resultados previos', async () => {
    await ready(); const a = deferred(); api[method].mockReturnValueOnce(a.promise).mockResolvedValue(result('LATEST'));
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o correo...'), { target: { value: 'A' } });
    await waitFor(() => expect(api[method]).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o correo...'), { target: { value: 'B' } });
    await screen.findAllByText('LATEST'); await act(async () => a.resolve(result('OBSOLETE'))); expect(screen.queryAllByText('OBSOLETE')).toHaveLength(0);
  });
});

describe('Perfil: regresiones de aislamiento corregidas en QA-13', () => {
  const profileA = { id_cliente: 'client-A', nombres: 'CLIENTE-A', nombre_completo: 'CLIENTE-A', telefono_principal: '99999999' };
  const profileB = { id_cliente: 'client-B', nombres: 'CLIENTE-B', nombre_completo: 'CLIENTE-B', telefono_principal: '88888888' };
  test('cambiar identidad limpia el perfil anterior y carga el titular vigente', async () => {
    auth.isAuthenticated = true; auth.isHydrated = true; auth.isHydrating = false; auth.logout = vi.fn();
    profileApi.getClienteMe.mockReset().mockResolvedValueOnce({ cliente: profileA }).mockResolvedValue({ cliente: profileB });
    const view = render(<Profile />); await screen.findAllByText('CLIENTE-A');
    auth.user = { id_usuario: 'account-B' }; view.rerender(<Profile />);
    expect(screen.queryAllByText('CLIENTE-A')).toHaveLength(0);
    await screen.findAllByText('CLIENTE-B');
    expect(screen.queryAllByText('CLIENTE-A')).toHaveLength(0);
    expect(profileApi.getClienteMe).toHaveBeenCalledTimes(2);
  });
  test('guardado A tardío no modifica ni cierra el editor B', async () => {
    const pending = deferred(); profileApi.updateClienteMe.mockReset().mockReturnValue(pending.promise);
    const saved = vi.fn(), close = vi.fn();
    const view = render(<ProfileEdit open profile={profileA} onSaved={saved} onOpenChange={close} />);
    expect(screen.getByLabelText('Fecha de nacimiento')).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
    expect(profileApi.updateClienteMe).toHaveBeenCalledTimes(1);
    view.rerender(<ProfileEdit open profile={profileB} onSaved={saved} onOpenChange={close} />);
    await act(async () => pending.resolve({ cliente: profileA }));
    expect(saved).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue('88888888')).toBeInTheDocument();
  });
});
