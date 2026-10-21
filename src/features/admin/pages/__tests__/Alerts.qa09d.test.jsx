// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Alerts from '../AdminSeguridadAlertasPage.jsx';
const auth = vi.hoisted(() => ({ roles: ['root'], user: { id_usuario: 'actor-a' } }));
const navigate = vi.hoisted(() => vi.fn());
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const api = vi.hoisted(() => ({ listAdminSecurityAlerts: vi.fn(), getAdminSecurityAlertDetail: vi.fn(), updateAdminSecurityAlertState: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('../../lib/adminSeguridadApi.js', () => api);
vi.mock('../../lib/useSecurityRealtime.js', () => ({ default: () => ({ status: 'connected' }) }));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const result = (id = 'A') => ({ data: { items: [{ id_alerta: id, resumen: `ALERT-${id}`, estado: 'abierta', severidad: 'alta' }], pagination: { page: 1, total: 1, total_pages: 1 } } });
beforeEach(() => {
  auth.roles = ['root']; auth.user = { id_usuario: 'actor-a' }; navigate.mockReset(); Object.values(notices).forEach(mock => mock.mockReset());
  Object.values(api).forEach(mock => mock.mockReset()); api.listAdminSecurityAlerts.mockResolvedValue(result());
});
afterEach(cleanup);
async function ready() { const view = render(<Alerts />); await screen.findAllByText('ALERT-A'); return view; }
function start(label = 'Resolver') {
  fireEvent.click(screen.getAllByRole('button', { name: label })[0]);
  const dialog = screen.getByRole('dialog'); fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Comentario sintético' } });
  return within(dialog).getByRole('button', { name: label });
}
test('doble confirmación actualiza una sola vez', async () => {
  const pending = deferred(); api.updateAdminSecurityAlertState.mockReturnValue(pending.promise);
  await ready(); const button = start(); act(() => { button.click(); button.click(); }); expect(api.updateAdminSecurityAlertState).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({}));
});
test('desmontaje descarta 401 de actualización pendiente', async () => {
  const pending = deferred(); api.updateAdminSecurityAlertState.mockReturnValue(pending.promise);
  const view = await ready(); fireEvent.click(start()); view.unmount(); await act(async () => pending.reject({ status: 401 })); expect(navigate).not.toHaveBeenCalled();
});
test('cambio de identidad elimina confirmación y comentario anterior', async () => {
  const view = await ready(); start(); auth.user = { id_usuario: 'actor-b' }; view.rerender(<Alerts />); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('detalle cerrado no redirige por un 401 tardío', async () => {
  const pending = deferred(); api.getAdminSecurityAlertDetail.mockReturnValue(pending.promise);
  await ready(); fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[0]);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));
  await act(async () => pending.reject({ status: 401 })); expect(navigate).not.toHaveBeenCalled();
});

test.each(['success',401,403,503])('respuesta antigua %s no modifica la alerta B ni su loading', async outcome => {
  const a = deferred(), b = deferred(); api.updateAdminSecurityAlertState.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const view = await ready(); fireEvent.click(start()); api.listAdminSecurityAlerts.mockResolvedValue(result('B'));
  auth.user = { id_usuario: 'actor-b' }; view.rerender(<Alerts />); await screen.findAllByText('ALERT-B');
  const button = start('Descartar'); fireEvent.click(button);
  expect(api.updateAdminSecurityAlertState).toHaveBeenNthCalledWith(2, 'B', 'descartada', 'Comentario sintético');
  await act(async () => outcome === 'success' ? a.resolve({}) : a.reject({ status: outcome }));
  expect(button).toBeDisabled(); expect(notices.success).not.toHaveBeenCalled(); expect(notices.error).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  await act(async () => b.resolve({})); expect(notices.success).toHaveBeenCalledTimes(1);
});
test.each([401,403])('error vigente %s conserva redirección', async status => {
  api.updateAdminSecurityAlertState.mockRejectedValue({ status }); await ready(); fireEvent.click(start());
  await act(async () => {}); expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true });
});
test('comentario vacío impide envío y un fallo técnico permite reintentar con mensaje seguro', async () => {
  await ready(); fireEvent.click(screen.getAllByRole('button', { name: 'Resolver' })[0]); const dialog = screen.getByRole('dialog');
  const button = within(dialog).getByRole('button', { name: 'Resolver' }); expect(button).toBeDisabled();
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '   ' } }); expect(button).toBeDisabled(); expect(api.updateAdminSecurityAlertState).not.toHaveBeenCalled();
  api.updateAdminSecurityAlertState.mockRejectedValueOnce({ status: 503, message: 'SQL_INTERNAL_SYNTHETIC' }).mockResolvedValueOnce({});
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Comentario sintético' } }); fireEvent.click(button); await act(async () => {});
  expect(notices.error).toHaveBeenCalledWith('No fue posible actualizar el estado de la alerta.', expect.anything()); expect(button).toBeEnabled();
  fireEvent.click(button); await act(async () => {}); expect(notices.success).toHaveBeenCalledTimes(1);
});
test.each(['super_admin','security_admin','security_auditor','cliente'])('rol %s no consulta alertas', async role => {
  auth.roles = [role]; render(<Alerts />); expect(api.listAdminSecurityAlerts).not.toHaveBeenCalled(); expect(api.getAdminSecurityAlertDetail).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith('/unauthorized', { replace: true });
});
test('detalle anterior no reemplaza el nuevo ni libera su loading y se aborta al cerrar', async () => {
  const a = deferred(), b = deferred(); api.getAdminSecurityAlertDetail.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await ready(); fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[0]);
  const signal = api.getAdminSecurityAlertDetail.mock.calls[0][1].signal;
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' })); expect(signal.aborted).toBe(true);
  fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[0]); await act(async () => a.resolve({ data: { resumen: 'OLD-DETAIL' } }));
  expect(screen.queryByText('OLD-DETAIL')).not.toBeInTheDocument(); expect(screen.getByText('Cargando detalle...')).toBeInTheDocument();
  await act(async () => b.resolve({ data: { resumen: 'CURRENT-DETAIL' } })); expect(screen.getByText('CURRENT-DETAIL')).toBeInTheDocument();
});
