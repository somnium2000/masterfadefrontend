// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Users from '../AdminSeguridadUsuariosPage.jsx';
const auth = vi.hoisted(() => ({ roles: ['root'], user: { id_usuario: 'actor-a' } }));
const navigate = vi.hoisted(() => vi.fn());
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const api = vi.hoisted(() => ({ listAdminSecurityUsers: vi.fn(), updateAdminSecurityUserAccessState: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('../../lib/adminSeguridadApi.js', () => api);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const result = (id = 'A', estado_acceso = 'activo') => ({ data: { items: [{ id_usuario: id, nombres: `SYNTHETIC-${id}`, estado_acceso, roles: ['cliente'] }], pagination: { page: 1, total: 1, total_pages: 1 } } });
beforeEach(() => {
  auth.roles = ['root']; auth.user = { id_usuario: 'actor-a' }; navigate.mockReset(); Object.values(notices).forEach(mock => mock.mockReset());
  api.listAdminSecurityUsers.mockReset().mockResolvedValue(result()); api.updateAdminSecurityUserAccessState.mockReset();
});
afterEach(cleanup);
async function ready() { const view = render(<Users />); await screen.findAllByText('SYNTHETIC-A'); return view; }
function start(label = 'Bloquear') { fireEvent.click(screen.getAllByRole('button', { name: label })[0]); return within(screen.getByRole('dialog')).getByRole('button', { name: label }); }

test('doble confirmación cambia acceso una sola vez', async () => {
  const pending = deferred(); api.updateAdminSecurityUserAccessState.mockReturnValue(pending.promise);
  await ready(); const button = start(); act(() => { button.click(); button.click(); });
  expect(api.updateAdminSecurityUserAccessState).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({}));
});
test.each(['success',401,403,503])('desmontaje descarta finalización %s', async outcome => {
  const pending = deferred(); api.updateAdminSecurityUserAccessState.mockReturnValue(pending.promise);
  const view = await ready(); fireEvent.click(start()); view.unmount();
  await act(async () => outcome === 'success' ? pending.resolve({}) : pending.reject({ status: outcome }));
  expect(navigate).not.toHaveBeenCalled(); expect(notices.success).not.toHaveBeenCalled(); expect(notices.error).not.toHaveBeenCalled();
});
test('cambio de identidad cierra confirmación y no permite actuar sobre el usuario anterior', async () => {
  const view = await ready(); start(); auth.user = { id_usuario: 'actor-b' }; view.rerender(<Users />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(api.updateAdminSecurityUserAccessState).not.toHaveBeenCalled();
});

test.each(['success',401,403,503])('resultado A tardío %s no altera operación ni usuario B', async outcome => {
  const a = deferred(), b = deferred(); api.updateAdminSecurityUserAccessState.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const view = await ready(); fireEvent.click(start()); api.listAdminSecurityUsers.mockResolvedValue(result('B', 'bloqueado'));
  auth.user = { id_usuario: 'actor-b' }; view.rerender(<Users />); await screen.findAllByText('SYNTHETIC-B');
  const button = start('Activar'); fireEvent.click(button);
  expect(api.updateAdminSecurityUserAccessState).toHaveBeenNthCalledWith(1, 'A', 'bloqueado');
  expect(api.updateAdminSecurityUserAccessState).toHaveBeenNthCalledWith(2, 'B', 'activo');
  await act(async () => outcome === 'success' ? a.resolve({}) : a.reject({ status: outcome }));
  expect(button).toBeDisabled(); expect(navigate).not.toHaveBeenCalled(); expect(notices.success).not.toHaveBeenCalled(); expect(notices.error).not.toHaveBeenCalled();
  await act(async () => b.resolve({})); expect(notices.success).toHaveBeenCalledTimes(1);
});
test.each([401,403])('error vigente %s conserva redirección', async status => {
  api.updateAdminSecurityUserAccessState.mockRejectedValue({ status }); await ready(); fireEvent.click(start());
  await act(async () => {}); expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true });
});
test('error técnico usa fallback seguro y permite reintento', async () => {
  api.updateAdminSecurityUserAccessState.mockRejectedValueOnce({ status: 503, message: 'SQL_INTERNAL_SYNTHETIC' }).mockResolvedValueOnce({});
  await ready(); const button = start(); fireEvent.click(button); await act(async () => {});
  expect(notices.error).toHaveBeenCalledWith('No fue posible actualizar el estado de acceso en este momento.', expect.anything());
  expect(button).toBeEnabled(); fireEvent.click(button); await act(async () => {});
  expect(api.updateAdminSecurityUserAccessState).toHaveBeenCalledTimes(2); expect(notices.success).toHaveBeenCalledTimes(1);
});
test('auditor no muestra acciones de acceso', async () => {
  auth.roles = ['security_auditor']; await ready(); expect(screen.queryByRole('button', { name: 'Bloquear' })).not.toBeInTheDocument();
});
test('root protegido no ofrece bloqueo', async () => {
  const data = result(); data.data.items[0].is_protected = true; api.listAdminSecurityUsers.mockResolvedValue(data);
  await ready(); expect(screen.queryByRole('button', { name: 'Bloquear' })).not.toBeInTheDocument();
  expect(api.updateAdminSecurityUserAccessState).not.toHaveBeenCalled();
});
