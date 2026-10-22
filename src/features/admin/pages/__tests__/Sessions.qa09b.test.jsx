// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Sessions from '../AdminSeguridadSesionesPage.jsx';
const auth = vi.hoisted(() => ({ roles: ['root'], user: { id_usuario: 'actor-a' } }));
const navigate = vi.hoisted(() => vi.fn());
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
const api = vi.hoisted(() => Object.fromEntries(['listAdminSecuritySessions','getAdminSecuritySessionDetail','listAdminSecurityUsers','revokeAdminSecuritySession','revokeAllAdminSecuritySessions'].map(name => [name, vi.fn()])));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('../../lib/adminSeguridadApi.js', () => api);
vi.mock('../../lib/useSecurityRealtime.js', () => ({ default: () => ({ status: 'connected' }) }));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const response = { data: { items: [{ id_sesion: 'A', estado: 'activa', device_summary: 'DEVICE-A' }], pagination: { page: 1, total: 1, total_pages: 1 } } };
beforeEach(() => {
  auth.roles = ['root']; auth.user = { id_usuario: 'actor-a' }; navigate.mockReset(); Object.values(notices).forEach(mock => mock.mockReset());
  Object.values(api).forEach(mock => mock.mockReset()); api.listAdminSecuritySessions.mockResolvedValue(response); api.listAdminSecurityUsers.mockResolvedValue({ data: { items: [] } });
});
afterEach(cleanup);
async function ready() { const view = render(<Sessions />); await screen.findAllByText('DEVICE-A'); return view; }
function start(kind) {
  fireEvent.click(screen.getAllByRole('button', { name: kind === 'bulk' ? 'Cerrar todas las sesiones' : 'Cerrar sesion' })[0]);
  return within(screen.getByRole('dialog')).getByRole('button', { name: kind === 'bulk' ? 'Cerrar todas' : 'Cerrar sesion' });
}
test.each(['single','bulk'])('dos confirmaciones %s envían una sola revocación', async kind => {
  const pending = deferred(); const method = kind === 'bulk' ? api.revokeAllAdminSecuritySessions : api.revokeAdminSecuritySession;
  method.mockReturnValue(pending.promise); await ready(); const button = start(kind);
  act(() => { button.click(); button.click(); }); expect(method).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ data: { revocadas: 1 } }));
});
test.each(['single','bulk'])('revocación %s desmontada descarta 401', async kind => {
  const pending = deferred(); const method = kind === 'bulk' ? api.revokeAllAdminSecuritySessions : api.revokeAdminSecuritySession;
  method.mockReturnValue(pending.promise); const view = await ready(); fireEvent.click(start(kind)); view.unmount();
  await act(async () => pending.reject({ status: 401 })); expect(navigate).not.toHaveBeenCalled(); expect(notices.error).not.toHaveBeenCalled();
});
test('cambiar identidad cierra detalle e invalida su 401', async () => {
  const pending = deferred(); api.getAdminSecuritySessionDetail.mockReturnValue(pending.promise);
  const view = await ready(); fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[0]);
  auth.user = { id_usuario: 'actor-b' }; view.rerender(<Sessions />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => pending.reject({ status: 401 })); expect(navigate).not.toHaveBeenCalled();
});
test('auditor no puede revocar', async () => {
  auth.roles = ['security_auditor']; await ready();
  expect(screen.queryByRole('button', { name: 'Cerrar todas las sesiones' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cerrar sesion' })).not.toBeInTheDocument();
});

test.each(['single','bulk'])('respuesta vieja %s no altera operación nueva de otra identidad', async kind => {
  const a = deferred(), b = deferred(); const method = kind === 'bulk' ? api.revokeAllAdminSecuritySessions : api.revokeAdminSecuritySession;
  method.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const view = await ready(); fireEvent.click(start(kind)); auth.user = { id_usuario: 'actor-b' }; view.rerender(<Sessions />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); await screen.findAllByText('DEVICE-A');
  const button = start(kind); fireEvent.click(button); expect(method).toHaveBeenCalledTimes(2);
  await act(async () => a.reject({ status: 401 }));
  expect(button).toBeDisabled(); expect(navigate).not.toHaveBeenCalled(); expect(notices.success).not.toHaveBeenCalled();
  await act(async () => b.resolve({ data: { revocadas: 1 } })); expect(notices.success).toHaveBeenCalledTimes(1);
});

test.each([401,403])('revocación vigente conserva tratamiento de %s', async status => {
  api.revokeAdminSecuritySession.mockRejectedValue({ status }); await ready(); fireEvent.click(start('single'));
  await act(async () => {}); expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true });
});

test.each(['single','bulk'])('fallo %s permite reintento sin exponer detalles técnicos', async kind => {
  const method = kind === 'bulk' ? api.revokeAllAdminSecuritySessions : api.revokeAdminSecuritySession;
  method.mockRejectedValueOnce({ status: 503, message: 'SQL_INTERNAL_SYNTHETIC' }).mockResolvedValueOnce({ data: { revocadas: 1 } });
  await ready(); const button = start(kind); fireEvent.click(button); await act(async () => {});
  expect(notices.error).toHaveBeenCalledTimes(1); expect(JSON.stringify(notices.error.mock.calls)).not.toContain('SQL_INTERNAL_SYNTHETIC');
  expect(button).toBeEnabled(); fireEvent.click(button); await act(async () => {}); expect(notices.success).toHaveBeenCalledTimes(1);
});

test.each(['success',401,403,503])('detalle cerrado descarta resultado anterior %s y conserva loading vigente', async outcome => {
  const a = deferred(), b = deferred(); api.getAdminSecuritySessionDetail.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await ready(); fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[0]);
  const signal = api.getAdminSecuritySessionDetail.mock.calls[0][1].signal;
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' })); expect(signal.aborted).toBe(true);
  fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[0]);
  await act(async () => outcome === 'success' ? a.resolve({ data: { device_summary: 'OLD' } }) : a.reject({ status: outcome }));
  expect(screen.getByText('Cargando detalle...')).toBeInTheDocument(); expect(navigate).not.toHaveBeenCalled();
  await act(async () => b.resolve({ data: { device_summary: 'CURRENT' } })); expect(screen.getByText('CURRENT')).toBeInTheDocument();
});
