// @vitest-environment jsdom
// AM: React montado y promesas controladas; ningún HTTP ni canje real.
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Points from '../../components/ClienteCourtesyRouteSection.jsx';
const auth = vi.hoisted(() => ({}));
const api = vi.hoisted(() => ({ getClientePuntosResumen: vi.fn(), getClienteMe: vi.fn(), redeemClientePuntosReward: vi.fn() }));
const branches = vi.hoisted(() => vi.fn());
const notices = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
const flags = vi.hoisted(() => ({ CLIENT_BOOKING_ENABLED: true, CLIENT_LOCK_MESSAGE: 'Proximamente...' }));
vi.mock('../../lib/clienteApi.js', () => api);
vi.mock('../../lib/clientFeatureFlags.js', () => flags);
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('../../../public/lib/catalogApi.js', () => ({ listPublicCatalogBranches: branches }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ search: '', pathname: '/home/cliente' }), useNavigate: () => navigate }));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const summary = (balance = 12, owner = 'A') => ({ saldo_total: balance, puntos_titular: balance - 2, puntos_integrante: 2, puntos_para_premio: 10, progreso_actual: balance % 10, recompensas_disponibles: Math.floor(balance / 10), puede_canjear: balance >= 10, servicios_redimibles: [{ id_servicio: 'S', nombre_servicio: 'Servicio QA' }], historial: [{ id_points_tx: owner, motivo: `MOV-${owner}`, puntos: 2 }] });
const branchData = { branches: [{ id_sucursal: 'A', nombre_sucursal: 'Suyapa' }, { id_sucursal: 'B', nombre_sucursal: 'City Mall' }] };
const redemption = { data: { canje_context_token: 'synthetic-context-only', id_servicio_canje: 'S', id_sucursal: 'A', servicio_nombre: 'Servicio QA' } };
beforeEach(() => {
  Object.assign(auth, { user: { id_usuario: 'user-A', cliente_id: 'client-A' }, isAuthenticated: true, isHydrated: true, isHydrating: false });
  Object.values(api).forEach(mock => mock.mockReset()); Object.values(notices).forEach(mock => mock.mockReset()); navigate.mockReset();
  api.getClientePuntosResumen.mockResolvedValue(summary()); api.getClienteMe.mockResolvedValue({ cliente: { id_sucursal_preferida: 'A' } }); api.redeemClientePuntosReward.mockResolvedValue(redemption);
  branches.mockReset().mockResolvedValue(branchData); flags.CLIENT_BOOKING_ENABLED = true; sessionStorage.clear();
});
afterEach(cleanup);
async function ready() { const view = render(<Points />); await screen.findByText('MOV-A'); return view; }
async function open() { fireEvent.click(screen.getByRole('button', { name: 'Canjear mi recompensa' })); await screen.findByRole('button', { name: /Servicio QA\s*Seleccionado/ }); }
function switchTo(view, id = 'B') { auth.user = id ? { id_usuario: `user-${id}`, cliente_id: `client-${id}` } : null; auth.isAuthenticated = Boolean(id); view.rerender(<Points />); }
function balance() { return screen.getByText('Saldo total').closest('article'); }

test.each([500, 0, 409])('mensaje técnico %s no se presenta', async status => {
  api.getClientePuntosResumen.mockRejectedValue({ status, message: 'SQL PRIVATE DETAIL', data: { error: { message: 'SQL PRIVATE DETAIL' } } }); render(<Points />);
  await screen.findByText(status === 409 ? 'No fue posible completar la operación por un conflicto. Actualiza tus puntos e intenta nuevamente.' : 'No se pudo cargar tu resumen de superpuntos.');
  expect(screen.queryByText('SQL PRIVATE DETAIL')).not.toBeInTheDocument();
});
test.each([401, 403])('error vigente %s conserva mensaje y reintento', async status => {
  api.getClientePuntosResumen.mockRejectedValueOnce({ status }); render(<Points />);
  await screen.findByText(status === 401 ? 'Tu sesión expiró. Inicia sesión nuevamente.' : 'No tienes permisos para realizar esta acción.');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await screen.findByText('MOV-A');
});
test('StrictMode descarta la respuesta inicial antigua', async () => {
  const old = deferred(); api.getClientePuntosResumen.mockReturnValueOnce(old.promise).mockResolvedValue(summary(17, 'NEW')); render(<StrictMode><Points /></StrictMode>); await screen.findByText('MOV-NEW');
  await act(async () => old.resolve(summary(12, 'OLD'))); expect(screen.queryByText('MOV-OLD')).not.toBeInTheDocument(); expect(within(balance()).getByText('17')).toBeInTheDocument();
});
test.each(['success', 401, 403, 'network'])('cambio de identidad descarta respuesta A %s', async outcome => {
  const old = deferred(); api.getClientePuntosResumen.mockReturnValueOnce(old.promise).mockResolvedValue(summary(7, 'B'));
  const view = render(<Points />); await waitFor(() => expect(api.getClientePuntosResumen).toHaveBeenCalledTimes(1)); switchTo(view);
  await screen.findByText('MOV-B'); await act(async () => outcome === 'success' ? old.resolve(summary(99, 'OLD')) : old.reject({ status: outcome, message: 'SQL PRIVATE DETAIL' }));
  expect(screen.queryByText('MOV-OLD')).not.toBeInTheDocument(); expect(within(balance()).getByText('7')).toBeInTheDocument(); expect(navigate).not.toHaveBeenCalled();
});
test('cambio de identidad oculta inmediatamente saldo e historial anteriores', async () => {
  const view = await ready(); const next = deferred(); api.getClientePuntosResumen.mockReturnValueOnce(next.promise); switchTo(view);
  expect(screen.queryByText('MOV-A')).not.toBeInTheDocument(); expect(screen.queryByText('Saldo total')).not.toBeInTheDocument();
  await act(async () => next.resolve(summary(0, 'B'))); expect(within(balance()).getByText('0')).toBeInTheDocument();
});
test('logout y regreso a A no reactivan una operación anterior', async () => {
  const view = await ready(); const old = deferred(); api.getClientePuntosResumen.mockReturnValueOnce(old.promise); fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
  switchTo(view, null); expect(screen.queryByText('MOV-A')).not.toBeInTheDocument(); api.getClientePuntosResumen.mockResolvedValue(summary(7, 'NEW')); switchTo(view, 'A'); await screen.findByText('MOV-NEW');
  await act(async () => old.resolve(summary(99, 'OLD'))); expect(screen.queryByText('MOV-OLD')).not.toBeInTheDocument();
});
test('hidratación sin identidad no consulta puntos', async () => {
  auth.user = null; auth.isAuthenticated = false; auth.isHydrated = false; auth.isHydrating = true; render(<Points />); await act(async () => {}); expect(api.getClientePuntosResumen).not.toHaveBeenCalled();
});
test.each(['success', 401, 403])('desmontaje descarta resumen %s', async outcome => {
  const old = deferred(); api.getClientePuntosResumen.mockReturnValueOnce(old.promise); const view = render(<Points />); view.unmount();
  await act(async () => outcome === 'success' ? old.resolve(summary()) : old.reject({ status: outcome })); expect(navigate).not.toHaveBeenCalled(); expect(notices.error).not.toHaveBeenCalled();
});
test('cerrar y reabrir diálogo descarta las opciones antiguas', async () => {
  await ready(); const old = deferred(); branches.mockReturnValueOnce(old.promise).mockResolvedValue(branchData);
  fireEvent.click(screen.getByRole('button', { name: 'Canjear mi recompensa' })); fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0]); await open();
  await act(async () => old.resolve({ branches: [{ id_sucursal: 'OLD', nombre_sucursal: 'SUCURSAL OBSOLETA' }] }));
  expect(screen.queryByRole('option', { name: 'SUCURSAL OBSOLETA' })).not.toBeInTheDocument(); expect(screen.getByRole('combobox')).toHaveValue('A');
});
test('cambio de sucursal conserva la selección vigente y el payload', async () => {
  await ready(); await open(); fireEvent.change(screen.getByRole('combobox'), { target: { value: 'B' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar canje' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' }));
  await waitFor(() => expect(api.redeemClientePuntosReward).toHaveBeenCalledExactlyOnceWith({ id_servicio: 'S', id_sucursal: 'B' }));
});
test('doble clic antes de render no duplica el canje', async () => {
  await ready(); await open(); const pending = deferred(); api.redeemClientePuntosReward.mockReturnValue(pending.promise);
  const button = screen.getByRole('button', { name: 'Confirmar canje' }); act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(api.redeemClientePuntosReward).toHaveBeenCalledTimes(1); await act(async () => pending.resolve(redemption));
});
test.each(['identity', 'unmount', 'close'])('canje pendiente tras %s no persiste ni navega', async transition => {
  const view = await ready(); await open(); const pending = deferred(); api.redeemClientePuntosReward.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' }));
  if (transition === 'identity') { api.getClientePuntosResumen.mockResolvedValue(summary(7, 'B')); switchTo(view); }
  if (transition === 'unmount') view.unmount();
  if (transition === 'close') fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await act(async () => pending.resolve(redemption)); expect(sessionStorage.getItem('mf_reward_redeem_context_v1')).toBeNull(); expect(navigate).not.toHaveBeenCalled(); expect(notices.success).not.toHaveBeenCalled();
});
test('canje vigente conserva almacenamiento, avisos y destino sin descontar localmente', async () => {
  await ready(); await open(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/agendar?modo=canje'));
  expect(JSON.parse(sessionStorage.getItem('mf_reward_redeem_context_v1'))).toMatchObject({ canje_context_token: 'synthetic-context-only', id_points_tx_canje: 'synthetic-context-only', id_servicio_canje: 'S', id_sucursal: 'A' });
  expect(notices.info).toHaveBeenCalledWith('Tus puntos se descontaran cuando confirmes la cita.', expect.anything()); expect(within(balance()).getByText('12')).toBeInTheDocument();
});
test('identidad cambia durante refresco posterior al canje: no navega ni conserva contexto A', async () => {
  const view = await ready(); await open(); const refresh = deferred(); api.getClientePuntosResumen.mockReturnValueOnce(refresh.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' })); await waitFor(() => expect(api.getClientePuntosResumen).toHaveBeenCalledTimes(2));
  api.getClientePuntosResumen.mockResolvedValue(summary(7, 'B')); switchTo(view); await act(async () => refresh.resolve(summary()));
  expect(navigate).not.toHaveBeenCalled(); expect(sessionStorage.getItem('mf_reward_redeem_context_v1')).toBeNull();
});
test.each([['POINTS_REDEEM_INSUFFICIENT_BALANCE', 'No tienes puntos suficientes para canjear esta recompensa.'], ['POINTS_REDEEM_SERVICE_FORBIDDEN', 'El servicio no está permitido para tu tipo de cliente.'], ['POINTS_REDEEM_SERVICE_BRANCH_UNAVAILABLE', 'El servicio no está disponible para canje en esta sucursal.']])('error comercial %s mantiene indicación segura', async (code, message) => {
  await ready(); await open(); api.redeemClientePuntosReward.mockRejectedValueOnce({ status: 409, data: { error: { code, message: 'SQL PRIVATE DETAIL' } } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' })); await screen.findByText(message); expect(screen.queryByText('SQL PRIVATE DETAIL')).not.toBeInTheDocument();
});
test('flag de agendamiento deshabilitado conserva bloqueo sin canje', async () => {
  flags.CLIENT_BOOKING_ENABLED = false; await ready(); await open(); expect(screen.getByRole('button', { name: 'Proximamente...' })).toBeDisabled(); expect(api.redeemClientePuntosReward).not.toHaveBeenCalled();
});

test.each([401, 403])('opciones de canje vigentes %s no se silencian', async status => {
  await ready(); api.getClienteMe.mockRejectedValueOnce({ status }); fireEvent.click(screen.getByRole('button', { name: 'Canjear mi recompensa' }));
  await screen.findByText(status === 401 ? 'Tu sesión expiró. Inicia sesión nuevamente.' : 'No tienes permisos para realizar esta acción.');
  expect(screen.getByRole('button', { name: 'Confirmar canje' })).toBeDisabled();
});
test.each([401, 403])('canje vigente %s conserva error funcional', async status => {
  await ready(); await open(); api.redeemClientePuntosReward.mockRejectedValueOnce({ status }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' }));
  await screen.findByText(status === 401 ? 'Tu sesión expiró. Inicia sesión nuevamente.' : 'No tienes permisos para realizar esta acción.'); expect(navigate).not.toHaveBeenCalled();
});
test.each([401, 403])('error tardío de opciones %s tras cerrar no contamina reapertura', async status => {
  await ready(); const old = deferred(); branches.mockReturnValueOnce(old.promise).mockResolvedValue(branchData);
  fireEvent.click(screen.getByRole('button', { name: 'Canjear mi recompensa' })); fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); await open();
  await act(async () => old.reject({ status, message: 'SQL private' })); expect(screen.queryByText(/Tu sesión expiró|No tienes permisos/)).not.toBeInTheDocument(); expect(screen.getByRole('combobox')).toHaveValue('A');
});
test('doble apertura antes de render no duplica cargas', async () => {
  await ready(); const pending = deferred(); branches.mockReturnValueOnce(pending.promise); const button = screen.getByRole('button', { name: 'Canjear mi recompensa' });
  act(() => { fireEvent.click(button); fireEvent.click(button); }); expect(branches).toHaveBeenCalledTimes(1); await act(async () => pending.resolve(branchData));
});
test('sucursal preferida ausente no habilita canje con un valor invisible', async () => {
  await ready(); branches.mockResolvedValue({ branches: [{ id_sucursal: 'B', nombre_sucursal: 'City Mall' }] }); await open();
  expect(screen.getByRole('combobox')).toHaveValue('B'); fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' }));
  expect(api.redeemClientePuntosReward).toHaveBeenCalledWith({ id_servicio: 'S', id_sucursal: 'B' });
});
test('sucursales vacías no habilitan canje', async () => {
  await ready(); branches.mockResolvedValue({ branches: [] }); await open(); expect(screen.getByRole('button', { name: 'Confirmar canje' })).toBeDisabled();
});
test('sucursales fallidas muestran error seguro, sin confirmar opciones parciales', async () => {
  await ready(); branches.mockRejectedValueOnce(new Error('SQL PRIVATE DETAIL')); fireEvent.click(screen.getByRole('button', { name: 'Canjear mi recompensa' }));
  await screen.findByText('No se pudo cargar la configuracion de canje.'); expect(screen.getByRole('button', { name: 'Confirmar canje' })).toBeDisabled();
});
test('cambio de sucursal rápido mantiene la última opción', async () => {
  await ready(); await open(); const select = screen.getByRole('combobox'); act(() => { fireEvent.change(select, { target: { value: 'B' } }); fireEvent.change(select, { target: { value: 'A' } }); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar canje' })).toBeEnabled()); expect(select).toHaveValue('A');
});
test('storage no disponible produce error funcional, sin navegación', async () => {
  await ready(); await open(); const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage internal'); });
  try { fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' })); await screen.findByText('No fue posible registrar tu canje.'); expect(navigate).not.toHaveBeenCalled(); }
  finally { set.mockRestore(); }
});
test('contexto preparado se conserva tras desmontaje por navegación válida', async () => {
  const view = await ready(); await open(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' })); await waitFor(() => expect(navigate).toHaveBeenCalled()); view.unmount();
  expect(sessionStorage.getItem('mf_reward_redeem_context_v1')).not.toBeNull();
});
test('logout sin borrar todavía user invalida el contexto preparado propio', async () => {
  const view = await ready(); await open(); const refresh = deferred(); api.getClientePuntosResumen.mockReturnValueOnce(refresh.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' })); await waitFor(() => expect(api.getClientePuntosResumen).toHaveBeenCalledTimes(2));
  auth.isAuthenticated = false; view.rerender(<Points />); expect(sessionStorage.getItem('mf_reward_redeem_context_v1')).toBeNull();
  await act(async () => refresh.resolve(summary())); expect(navigate).not.toHaveBeenCalled();
});

test.each([401, 403])('canje A rechazado %s después de pasar a B no contamina B', async status => {
  const view = await ready(); await open(); const old = deferred(); api.redeemClientePuntosReward.mockReturnValueOnce(old.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' })); api.getClientePuntosResumen.mockResolvedValue(summary(7, 'B')); switchTo(view);
  await screen.findByText('MOV-B'); await act(async () => old.reject({ status }));
  expect(screen.queryByText(/Tu sesión expiró|No tienes permisos/)).not.toBeInTheDocument(); expect(navigate).not.toHaveBeenCalled();
});
test('opciones de A tras cambio de identidad no reabren diálogo ni rellenan B', async () => {
  const view = await ready(); const old = deferred(); branches.mockReturnValueOnce(old.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Canjear mi recompensa' })); api.getClientePuntosResumen.mockResolvedValue(summary(17, 'B')); switchTo(view); await screen.findByText('MOV-B');
  await act(async () => old.resolve({ branches: [{ id_sucursal: 'OLD', nombre_sucursal: 'OPCIONES-A' }] })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await open(); expect(screen.queryByRole('option', { name: 'OPCIONES-A' })).not.toBeInTheDocument();
});
test('hidratar de nuevo limpia el contexto anterior y permite reintentar con la identidad válida', async () => {
  const view = await ready(); auth.isHydrated = false; auth.isHydrating = true; view.rerender(<Points />); expect(screen.queryByText('MOV-A')).not.toBeInTheDocument();
  api.getClientePuntosResumen.mockResolvedValue(summary(7, 'NEW')); auth.isHydrated = true; auth.isHydrating = false; view.rerender(<Points />); await screen.findByText('MOV-NEW');
});
test('un error previo desaparece al cambiar identidad y el reintento pertenece a B', async () => {
  api.getClientePuntosResumen.mockRejectedValueOnce({ status: 403 }); const view = render(<Points />); await screen.findByText('No tienes permisos para realizar esta acción.');
  api.getClientePuntosResumen.mockRejectedValueOnce(new Error('Network')); switchTo(view); await screen.findByText('No se pudo cargar tu resumen de superpuntos.');
  expect(screen.queryByText('No tienes permisos para realizar esta acción.')).not.toBeInTheDocument(); api.getClientePuntosResumen.mockResolvedValue(summary(7, 'B'));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await screen.findByText('MOV-B');
});
test('saldo, titular, acompañantes y progreso conservan el contrato informativo', async () => {
  await ready(); expect(within(balance()).getByText('12')).toBeInTheDocument(); expect(screen.getAllByText('2/10')).toHaveLength(2);
  expect(screen.getByText(/Tus visitas:/)).toHaveTextContent('10'); expect(screen.getByText(/Puntos por acompañantes:/)).toHaveTextContent('2'); expect(screen.getByText('Recompensas disponibles').closest('article')).toHaveTextContent('1');
});
test('respuesta de error inesperada no se imprime como texto interno', async () => {
  api.getClientePuntosResumen.mockRejectedValue('SQL unexpected payload'); render(<Points />); await screen.findByText('No se pudo cargar tu resumen de superpuntos.'); expect(screen.queryByText('SQL unexpected payload')).not.toBeInTheDocument();
});
