// @vitest-environment jsdom
// AM: React montado y promesas controladas; ningún HTTP ni canje real.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

test.each(['success', 401, 403, 'network'])('QA-18C: B opera mientras A está pendiente; A termina con %s', async outcome => {
  const view = await ready(); await open(); const a = deferred(), b = deferred();
  api.redeemClientePuntosReward.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' }));
  api.getClientePuntosResumen.mockResolvedValue(summary(17, 'B')); switchTo(view); await screen.findByText('MOV-B');
  expect(within(balance()).getByText('17')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Canjear mi recompensa' })).toBeEnabled();
  await open(); const submit = screen.getByRole('button', { name: 'Confirmar canje' });
  act(() => { fireEvent.click(submit); fireEvent.click(submit); });
  expect(api.redeemClientePuntosReward).toHaveBeenCalledTimes(2);
  await act(async () => outcome === 'success' ? a.resolve(redemption) : a.reject({ status: outcome }));
  expect(submit).toBeDisabled(); expect(notices.success).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('mf_reward_redeem_context_v1')).toBeNull();
  fireEvent.click(submit); expect(api.redeemClientePuntosReward).toHaveBeenCalledTimes(2);
  await act(async () => b.resolve({ data: { ...redemption.data, canje_context_token: 'synthetic-B' } }));
  expect(navigate).toHaveBeenCalledExactlyOnceWith('/agendar?modo=canje'); expect(notices.success).toHaveBeenCalledTimes(1);
  expect(JSON.parse(sessionStorage.getItem('mf_reward_redeem_context_v1')).canje_context_token).toBe('synthetic-B');
});
test('QA-18C: A → B → A no duplica canje pendiente de la misma identidad', async () => {
  const view = await ready(); await open(); const a = deferred(); api.redeemClientePuntosReward.mockReturnValueOnce(a.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' }));
  api.getClientePuntosResumen.mockResolvedValue(summary(17, 'B')); switchTo(view); await screen.findByText('MOV-B');
  api.getClientePuntosResumen.mockResolvedValue(summary(12, 'A')); switchTo(view, 'A'); await screen.findByText('MOV-A');
  expect(screen.getByRole('button', { name: 'Canjear mi recompensa' })).toBeDisabled();
  expect(api.redeemClientePuntosReward).toHaveBeenCalledTimes(1);
  await act(async () => a.resolve(redemption)); expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Canjear mi recompensa' })).toBeEnabled();
  await open(); expect(screen.getByRole('button', { name: 'Confirmar canje' })).toBeEnabled();
});
test('QA-18C: rehidratación de A mantiene su bloqueo hasta terminar y luego lo libera', async () => {
  const view = await ready(); await open(); const a = deferred(); api.redeemClientePuntosReward.mockReturnValueOnce(a.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar canje' }));
  auth.isHydrated = false; auth.isHydrating = true; view.rerender(<Points />);
  auth.isHydrated = true; auth.isHydrating = false; view.rerender(<Points />); await screen.findByText('MOV-A');
  expect(screen.getByRole('button', { name: 'Canjear mi recompensa' })).toBeDisabled();
  await act(async () => a.reject({ status: 401 })); expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Canjear mi recompensa' })).toBeEnabled();
});
