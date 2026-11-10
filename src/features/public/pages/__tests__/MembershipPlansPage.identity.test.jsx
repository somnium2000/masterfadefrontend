// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import MembershipPlansPage from '../MembershipPlansPage.jsx';

const state = vi.hoisted(() => ({ auth: {}, dialog: null }));
const api = vi.hoisted(() => ({ listPublicCatalogBranches: vi.fn(), listPublicPlansByBranch: vi.fn() }));
const payment = vi.hoisted(() => ({ getClientePlanEstado: vi.fn(), createMembershipOrder: vi.fn(),
  createMembershipPaymentIntent: vi.fn(), confirmMembershipPayment: vi.fn(),
  queryMembershipPaymentStatus: vi.fn() }));
vi.mock('../../lib/catalogApi.js', () => api);
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => state.auth }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }) }));
vi.mock('../../../cliente/lib/clienteApi.js', () => payment);
vi.mock('../../../../lib/catalogSync.js', () => ({ subscribeCatalogSync: () => () => {} }));
vi.mock('../../lib/vipMembershipFeatureFlags.js', () => ({ VIP_MEMBERSHIPS_PURCHASE_ENABLED: true, VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE: 'Proximamente' }));
vi.mock('../../../../components/branding/MasterfadeLogo.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/navigation/PremiumBottomNav.jsx', () => ({ default: () => null }));
vi.mock('../../../plans/components/PlanPurchaseFlowDialog.jsx', () => ({ default: (props) => { state.dialog = props; return null; } }));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function login(id = A) {
  state.auth = { isAuthenticated: true, roles: ['cliente'], user: { id_usuario: id }, clienteId: id, isHydrated: true, isHydrating: false };
}
function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); login();
  api.listPublicCatalogBranches.mockResolvedValue({ branches: [{ id_sucursal: A, nombre_sucursal: 'Centro' }] });
  api.listPublicPlansByBranch.mockResolvedValue({ plans: [{ id_plan: A, id_plan_sucursal: B, nombre_plan: 'VIP', precio_hnl: 100, categoria_nivel: 1, beneficios: [] }] });
  payment.getClientePlanEstado.mockResolvedValue({});
  payment.queryMembershipPaymentStatus.mockResolvedValue({ normalized_status: 'PENDIENTE' });
  payment.createMembershipOrder.mockResolvedValue({ id_order: 'orden-A' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function ready() {
  const view = render(<MembershipPlansPage />);
  await screen.findByRole('button', { name: 'Quiero este plan' });
  return view;
}
function logoutAndLogin(view) {
  state.auth = { isAuthenticated: false, roles: [], isHydrated: true };
  view.rerender(<MembershipPlansPage />);
  login(); view.rerender(<MembershipPlansPage />);
}
test('resumen y respuesta de intent anteriores al logout no regresan para la misma cuenta', async () => {
  const pending = deferred();
  payment.createMembershipPaymentIntent.mockReturnValue(pending.promise);
  const view = await ready();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Quiero este plan' })));
  expect(state.dialog.open).toBe(true);
  act(() => { void state.dialog.onContinueToPayment(); });
  logoutAndLogin(view);
  expect(state.dialog.open).toBe(false);
  await act(async () => pending.resolve({ id_payment_intent: 'anterior' }));
  expect(state.dialog.paymentIntent).toBeNull();
  expect(state.dialog.orderSummary).toBeNull();
  expect(payment.confirmMembershipPayment).not.toHaveBeenCalled();
});
test('estado de membresia A tardio no sustituye el de B', async () => {
  const pending = deferred();
  payment.getClientePlanEstado.mockReturnValueOnce(pending.promise).mockResolvedValue({ estado_plan: 'inactiva' });
  const view = await ready();
  login(B); view.rerender(<MembershipPlansPage />);
  await screen.findByText('Sin plan activo');
  await act(async () => pending.resolve({ estado_plan: 'activa' }));
  expect(screen.queryByText('Tienes un plan activo')).not.toBeInTheDocument();
  expect(payment.getClientePlanEstado).toHaveBeenCalledTimes(2);
});
test('finalizacion obsoleta de A no libera el bloqueo de una orden pendiente de B', async () => {
  const old = deferred(); const current = deferred();
  payment.createMembershipOrder.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Quiero este plan' }));
  login(B); view.rerender(<MembershipPlansPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Quiero este plan' }));
  await act(async () => old.resolve({ id_order: 'anterior' }));
  expect(screen.getByRole('button', { name: 'Procesando...' })).toBeDisabled();
  expect(state.dialog.open).toBe(false);
  await act(async () => current.resolve({ id_order: 'actual' }));
  expect(state.dialog.orderSummary.id_order).toBe('actual');
  const keys = payment.createMembershipOrder.mock.calls.map((call) => call[1].idempotencyKey);
  expect(keys[0]).not.toBe(keys[1]);
});
