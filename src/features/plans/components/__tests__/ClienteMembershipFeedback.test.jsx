// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClientePlanesPage from '../../../cliente/pages/ClientePlanesPage.jsx';

const mocks = vi.hoisted(() => ({
  dialog: null, poll: null,
  notifications: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  api: { getClientePlanEstado: vi.fn(), createMembershipOrder: vi.fn(), createMembershipPaymentIntent: vi.fn(), confirmMembershipPayment: vi.fn(), queryMembershipPaymentStatus: vi.fn(), cancelClientePlanBySubscription: vi.fn() },
}));
const BRANCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id_usuario: 'user-a', cliente_id: 'client-a' }, clienteId: 'client-a' }) }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => mocks.notifications }));
vi.mock('../../../cliente/lib/clientFeatureFlags.js', () => ({ CLIENT_PLAN_PURCHASE_ENABLED: true, CLIENT_LOCK_MESSAGE: '' }));
vi.mock('../../../public/lib/catalogApi.js', () => ({
  listPublicCatalogBranches: async () => ({ branches: [{ id_sucursal: BRANCH, nombre_sucursal: 'Centro' }] }),
  listPublicPlansByBranch: async () => ({ plans: [{ id_plan: 'plan-a', id_plan_sucursal: 'offer-a', nombre_plan: 'VIP prueba', precio_hnl: 300, beneficios: [] }] }),
}));
vi.mock('../../../cliente/lib/clienteApi.js', () => mocks.api);
vi.mock('../../hooks/useMembershipPaymentPolling.js', () => ({ default: (props) => { mocks.poll = props; } }));
vi.mock('../PlanPurchaseFlowDialog.jsx', () => ({ default: (props) => { mocks.dialog = props; return null; } }));

beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks(); vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay');
  mocks.api.getClientePlanEstado.mockResolvedValue({});
  mocks.api.createMembershipOrder.mockResolvedValue({ id_order: 'order-a', plan: { nombre_plan: 'VIP prueba', sucursal_nombre: 'Centro' }, totales: { total_hnl: 300 } });
  mocks.api.createMembershipPaymentIntent.mockResolvedValue({ id_payment_intent: 'intent-a' });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

async function purchase() {
  render(<ClientePlanesPage />);
  await screen.findByRole('option', { name: 'Centro' });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: BRANCH } });
  fireEvent.click(await screen.findByRole('button', { name: 'Quiero este plan' }));
  await act(async () => {});
  await act(async () => mocks.dialog.onContinueToPayment());
}

it('el cliente conserva el recibo aprobado sin duplicar la confirmación', async () => {
  const receipt = { estado_intent_codigo: 'confirmado', confirmation: { estado: 'activa' } };
  mocks.api.confirmMembershipPayment.mockResolvedValue(receipt);
  await purchase();
  await act(async () => mocks.dialog.onConfirmPayment({}));
  expect(mocks.dialog.step).toBe('success');
  expect(mocks.dialog.paymentConfirmation).toBe(receipt);
  expect(mocks.notifications.success).not.toHaveBeenCalled();
});

it.each(['PAGADO', 'RECHAZADO'])('el cliente presenta polling %s sin otra Sale', async (normalized_status) => {
  mocks.api.confirmMembershipPayment.mockResolvedValue({ pending_confirmation: true });
  await purchase();
  await act(async () => mocks.dialog.onConfirmPayment({}));
  expect(mocks.dialog.pendingConfirmation).toBe(true);
  await act(async () => mocks.dialog.onConfirmPayment({}));
  expect(mocks.api.confirmMembershipPayment).toHaveBeenCalledOnce();
  const result = { normalized_status, id_suscripcion: 'subscription-a' };
  act(() => mocks.poll.onResult(result));
  expect(mocks.notifications.success).not.toHaveBeenCalled();
  expect(mocks.dialog.step).toBe(normalized_status === 'PAGADO' ? 'success' : 'payment');
  if (normalized_status === 'PAGADO') expect(mocks.dialog.paymentConfirmation).toBe(result);
  else expect(mocks.dialog.errorMessage).toMatch(/rechazado/);
});
