// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Logs from '../AdminSeguridadLoginLogsPage.jsx';
import { StrictMode } from 'react';

const auth = vi.hoisted(() => ({ roles: ['root'], user: { id_usuario: 'actor-a' } }));
const navigate = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({ listAdminSecurityLoginLogs: vi.fn(), getAdminSecurityLoginLogDetail: vi.fn() }));
const transport = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../lib/adminSeguridadApi.js', () => api);
vi.mock('../../../../services/httpClient.js', () => ({ http: transport }));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const response = { data: { items: ['A', 'B'].map(id => ({ id_login_log: id, email_masked: `MASKED-${id}`, resultado: 'failed' })), pagination: { page: 1, total: 2, total_pages: 1 } } };
beforeEach(() => {
  auth.roles = ['root']; auth.user = { id_usuario: 'actor-a' }; navigate.mockReset();
  api.listAdminSecurityLoginLogs.mockReset().mockResolvedValue(response);
  api.getAdminSecurityLoginLogDetail.mockReset(); transport.get.mockReset().mockResolvedValue({});
});
afterEach(cleanup);
async function ready() { const view = render(<Logs />); await screen.findAllByText('MASKED-A'); return view; }
function open(index = 0) { fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[index]); }
function close() { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' })); }

test.each(['success', 401, 403, 503])('detalle A cerrado no altera B: %s', async outcome => {
  const a = deferred(), b = deferred(); api.getAdminSecurityLoginLogDetail.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await ready(); open(); close(); open(1);
  await act(async () => outcome === 'success' ? a.resolve({ data: { email_masked: 'OLD-DETAIL' } }) : a.reject({ status: outcome }));
  expect(screen.getByText('Cargando detalle...')).toBeInTheDocument();
  expect(screen.queryByText('OLD-DETAIL')).not.toBeInTheDocument(); expect(navigate).not.toHaveBeenCalled();
  await act(async () => b.resolve({ data: { email_masked: 'CURRENT-DETAIL' } }));
  expect(screen.getByText('CURRENT-DETAIL')).toBeInTheDocument();
});

test('cambio de identidad elimina detalle abierto e invalida respuesta pendiente', async () => {
  const a = deferred(); api.getAdminSecurityLoginLogDetail.mockReturnValue(a.promise);
  const view = await ready(); open(); auth.user = { id_usuario: 'actor-b' }; view.rerender(<Logs />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => a.resolve({ data: { email_masked: 'OLD-IDENTITY' } }));
  expect(screen.queryByText('OLD-IDENTITY')).not.toBeInTheDocument();
});

test('desmontaje aborta detalle y descarta un 401 aunque el mock ignore aborto', async () => {
  const a = deferred(); api.getAdminSecurityLoginLogDetail.mockReturnValue(a.promise);
  const view = await ready(); open(); const signal = api.getAdminSecurityLoginLogDetail.mock.calls[0][1]?.signal;
  view.unmount(); expect(signal?.aborted).toBe(true);
  await act(async () => a.reject({ status: 401 })); expect(navigate).not.toHaveBeenCalled();
});

test.each([401, 403])('detalle vigente %s conserva redirección', async status => {
  api.getAdminSecurityLoginLogDetail.mockRejectedValue({ status }); await ready(); open();
  await act(async () => {}); expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true });
});

test('detalle vigente presenta mensaje seguro ante fallo técnico', async () => {
  api.getAdminSecurityLoginLogDetail.mockRejectedValue({ status: 503, message: 'SQL_INTERNAL_SYNTHETIC' }); await ready(); open();
  expect(await screen.findByText('No fue posible cargar el detalle del intento.')).toBeInTheDocument();
  expect(screen.queryByText('SQL_INTERNAL_SYNTHETIC')).not.toBeInTheDocument();
});

test('API de detalle propaga AbortSignal al transporte', async () => {
  const actual = await vi.importActual('../../lib/adminSeguridadApi.js'); const controller = new AbortController();
  await actual.getAdminSecurityLoginLogDetail('A', { signal: controller.signal });
  expect(transport.get).toHaveBeenCalledWith('/v1/admin/seguridad/login-logs/A', { signal: controller.signal });
});

test('StrictMode conserva detalle vigente y pérdida de permisos limpia y aborta', async () => {
  api.getAdminSecurityLoginLogDetail.mockResolvedValueOnce({ data: { email_masked: 'CURRENT-STRICT' } });
  const view = render(<StrictMode><Logs /></StrictMode>); await screen.findAllByText('MASKED-A'); open();
  expect(await screen.findByText('CURRENT-STRICT')).toBeInTheDocument(); close();
  const pending = deferred(); api.getAdminSecurityLoginLogDetail.mockReturnValueOnce(pending.promise); open();
  const signal = api.getAdminSecurityLoginLogDetail.mock.calls.at(-1)[1].signal;
  auth.roles = ['cliente']; view.rerender(<StrictMode><Logs /></StrictMode>);
  expect(signal.aborted).toBe(true); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => pending.reject({ status: 403 })); expect(navigate).not.toHaveBeenCalled();
});
