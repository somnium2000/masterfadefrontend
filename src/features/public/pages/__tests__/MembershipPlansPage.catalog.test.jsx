// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import MembershipPlansPage from '../MembershipPlansPage.jsx';

const api = vi.hoisted(() => ({ listPublicCatalogBranches: vi.fn(), listPublicPlansByBranch: vi.fn() }));
const sync = vi.hoisted(() => ({ callback: null, unsubscribe: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ isAuthenticated: false, roles: [] }));
const payment = vi.hoisted(() => ({
  getClientePlanEstado: vi.fn(), createMembershipOrder: vi.fn(),
  createMembershipPaymentIntent: vi.fn(), confirmMembershipPayment: vi.fn(),
}));

vi.mock('../../lib/catalogApi.js', () => api);
vi.mock('../../../../lib/catalogSync.js', () => ({
  subscribeCatalogSync: (callback) => { sync.callback = callback; return sync.unsubscribe; },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => ({}) }));
vi.mock('../../../cliente/lib/clienteApi.js', () => payment);
vi.mock('../../lib/vipMembershipFeatureFlags.js', () => ({
  VIP_MEMBERSHIPS_PURCHASE_ENABLED: true,
  VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE: 'Próximamente...',
}));
vi.mock('../../../../components/branding/MasterfadeLogo.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/navigation/PremiumBottomNav.jsx', () => ({ default: () => null }));
vi.mock('../../../plans/components/PlanPurchaseFlowDialog.jsx', () => ({
  default: ({ open, step, orderSummary, paymentIntent, onContinueToPayment }) => open ? (
    <div data-testid="purchase-flow">
      <span>{step}</span><span>{orderSummary?.id_order}</span><span>{paymentIntent?.id_payment_intent}</span>
      <button type="button" onClick={onContinueToPayment}>Continuar pago</button>
    </div>
  ) : null,
}));

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const branches = [
  { id_sucursal: A, nombre_sucursal: 'Centro', estado: true },
  { id_sucursal: B, nombre_sucursal: 'Norte', estado: true },
];
const plan = (name, price = 100) => ({
  id_plan: name, id_plan_sucursal: `${name}-offer`, nombre_plan: name,
  precio_hnl: price, categoria_nivel: 2,
  beneficios: [{ tipo: 'servicio', nombre: 'Corte', cantidad: 2 }],
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const select = async (name) => {
  fireEvent.click(await screen.findByRole('button', { name }));
};

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  navigate.mockReset();
  auth.isAuthenticated = false;
  auth.roles = [];
  Object.values(payment).forEach((mock) => mock.mockReset());
  payment.getClientePlanEstado.mockResolvedValue({});
  payment.createMembershipOrder.mockResolvedValue({ data: { id_order: 'orden-1' } });
  payment.createMembershipPaymentIntent.mockResolvedValue({ data: { id_payment_intent: 'intent-1' } });
  sync.callback = null;
  sync.unsubscribe.mockReset();
  api.listPublicCatalogBranches.mockResolvedValue({ branches });
  api.listPublicPlansByBranch.mockResolvedValue({ plans: [] });
});
afterEach(() => cleanup());

describe('catálogo público de membresías por sucursal', () => {
  test('descarta respuesta antigua de A después de mostrar B', async () => {
    const pending = deferred();
    api.listPublicPlansByBranch.mockImplementation((id) => id === A ? pending.promise : Promise.resolve({ plans: [plan('Plan B', 200)] }));
    render(<MembershipPlansPage />);
    await select('Centro');
    await select('Norte');
    expect(await screen.findByText('Plan B')).toBeInTheDocument();
    await act(async () => pending.resolve({ plans: [plan('Plan A')] }));
    expect(screen.getByText('Plan B')).toBeInTheDocument();
    expect(screen.queryByText('Plan A')).not.toBeInTheDocument();
  });

  test('descarta error tardío de A después de mostrar B', async () => {
    const pending = deferred();
    api.listPublicPlansByBranch.mockImplementation((id) => id === A ? pending.promise : Promise.resolve({ plans: [plan('Plan B')] }));
    render(<MembershipPlansPage />);
    await select('Centro');
    await select('Norte');
    expect(await screen.findByText('Plan B')).toBeInTheDocument();
    await act(async () => pending.reject(new Error('fallo privado A')));
    expect(screen.getByText('Plan B')).toBeInTheDocument();
    expect(screen.queryByText('Error de membresias')).not.toBeInTheDocument();
  });

  test('reintenta sucursales después de error inicial', async () => {
    api.listPublicCatalogBranches.mockRejectedValueOnce(new Error('detalle interno'));
    render(<MembershipPlansPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Centro' })).toBeInTheDocument();
    expect(api.listPublicCatalogBranches).toHaveBeenCalledTimes(2);
    expect(api.listPublicPlansByBranch).not.toHaveBeenCalled();
  });

  test('catalogSync no permite que la consulta anterior sobrescriba la nueva', async () => {
    const pending = deferred();
    api.listPublicPlansByBranch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ plans: [plan('Nuevo')] });
    render(<MembershipPlansPage />);
    await select('Centro');
    await act(async () => sync.callback());
    expect(await screen.findByText('Nuevo')).toBeInTheDocument();
    await act(async () => pending.resolve({ plans: [plan('Antiguo')] }));
    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    expect(screen.queryByText('Antiguo')).not.toBeInTheDocument();
  });

  test('retira la oferta A durante la carga de B', async () => {
    const pending = deferred();
    api.listPublicPlansByBranch.mockImplementation((id) => id === A ? Promise.resolve({ plans: [plan('Plan A')] }) : pending.promise);
    render(<MembershipPlansPage />);
    await select('Centro');
    expect(await screen.findByText('Plan A')).toBeInTheDocument();
    await select('Norte');
    expect(screen.queryByText('Plan A')).not.toBeInTheDocument();
    expect(screen.getByText('Cargando planes')).toBeInTheDocument();
  });

  test('carga inicial manual, sucursales activas y sin consulta global', async () => {
    api.listPublicCatalogBranches.mockResolvedValue({ branches: [...branches, { id_sucursal: 'inactive', nombre_sucursal: 'Cerrada', estado: false }] });
    render(<MembershipPlansPage />);
    expect(await screen.findByRole('button', { name: 'Centro' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrada' })).not.toBeInTheDocument();
    expect(screen.getByText('Sucursal requerida')).toBeInTheDocument();
    expect(api.listPublicPlansByBranch).not.toHaveBeenCalled();
    await select('Centro');
    expect(await screen.findByText('Sin planes publicados')).toBeInTheDocument();
    expect(api.listPublicPlansByBranch).toHaveBeenCalledWith(A);
    expect(api.listPublicPlansByBranch).toHaveBeenCalledTimes(1);
    await select('Centro');
    expect(api.listPublicPlansByBranch).toHaveBeenCalledTimes(1);
  });

  test('sin sucursales activas muestra ausencia real sin consultar planes', async () => {
    api.listPublicCatalogBranches.mockResolvedValue({ branches: [{ id_sucursal: A, nombre_sucursal: 'Cerrada', estado: false }] });
    render(<MembershipPlansPage />);
    expect(await screen.findByText('No hay sucursales disponibles.')).toBeInTheDocument();
    expect(screen.queryByText('Sucursal requerida')).not.toBeInTheDocument();
    expect(api.listPublicPlansByBranch).not.toHaveBeenCalled();
  });

  test('error HTTP de planes no es vacío y reintenta la sucursal vigente', async () => {
    api.listPublicPlansByBranch.mockRejectedValueOnce(new Error('detalle SQL privado')).mockResolvedValueOnce({ plans: [plan('Recuperado')] });
    render(<MembershipPlansPage />);
    await select('Centro');
    expect(await screen.findByText('No se pudo cargar el catalogo de planes.')).toBeInTheDocument();
    expect(screen.queryByText('detalle SQL privado')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin planes publicados')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Recuperado')).toBeInTheDocument();
    expect(api.listPublicPlansByBranch).toHaveBeenNthCalledWith(2, A);
  });

  test('A → B → A aplica únicamente la tercera consulta', async () => {
    const first = deferred();
    const second = deferred();
    api.listPublicPlansByBranch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce({ plans: [plan('A vigente', 315)] });
    render(<MembershipPlansPage />);
    await select('Centro');
    await select('Norte');
    await select('Centro');
    expect(await screen.findByText('A vigente')).toBeInTheDocument();
    await act(async () => { first.resolve({ plans: [plan('A vieja')] }); second.resolve({ plans: [plan('B vieja')] }); });
    expect(screen.getByText('A vigente')).toBeInTheDocument();
    expect(screen.getByText('L 315.00')).toBeInTheDocument();
    expect(screen.queryByText('A vieja')).not.toBeInTheDocument();
    expect(screen.queryByText('B vieja')).not.toBeInTheDocument();
  });

  test('catalogSync usa la sucursal actual y su error tiene reintento', async () => {
    api.listPublicPlansByBranch.mockResolvedValueOnce({ plans: [plan('A')] })
      .mockResolvedValueOnce({ plans: [plan('B')] })
      .mockRejectedValueOnce(new Error('interno'))
      .mockResolvedValueOnce({ plans: [plan('B actualizado')] });
    render(<MembershipPlansPage />);
    await select('Centro');
    expect(await screen.findByText('A')).toBeInTheDocument();
    await select('Norte');
    expect(await screen.findByText('B')).toBeInTheDocument();
    await act(async () => sync.callback());
    expect(await screen.findByText('No se pudo cargar el catalogo de planes.')).toBeInTheDocument();
    expect(api.listPublicPlansByBranch).toHaveBeenNthCalledWith(3, B);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('B actualizado')).toBeInTheDocument();
  });

  test('conserva orden, oferta, precio, categoría, beneficios y filtro positivo', async () => {
    api.listPublicPlansByBranch.mockResolvedValue({ plans: [plan('Primero', 240), plan('Cero', 0), plan('Segundo', 360)] });
    render(<MembershipPlansPage />);
    await select('Centro');
    expect(await screen.findByText('Primero')).toBeInTheDocument();
    expect(screen.getByText('Segundo')).toBeInTheDocument();
    expect(screen.queryByText('Cero')).not.toBeInTheDocument();
    expect(screen.getAllByText('2x Corte')).toHaveLength(2);
    expect(screen.getByText('L 240.00')).toBeInTheDocument();
    expect(screen.getByText('L 360.00')).toBeInTheDocument();
    expect(screen.getAllByText(/Categoria -/)).toHaveLength(2);
    expect(screen.getByText('Primero').closest('[data-plan-card]')).toHaveTextContent('L 240.00');
  });

  test('la carga de catálogo no borra orden ni intent de pago en proceso', async () => {
    auth.isAuthenticated = true;
    auth.roles = ['cliente'];
    api.listPublicPlansByBranch.mockImplementation((id) => Promise.resolve({ plans: [plan(id === A ? 'Plan A' : 'Plan B')] }));
    render(<MembershipPlansPage />);
    await select('Centro');
    expect(await screen.findByText('Plan A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quiero este plan' }));
    expect(await screen.findByText('orden-1')).toBeInTheDocument();
    expect(payment.createMembershipOrder).toHaveBeenCalledWith('Plan A-offer');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar pago' }));
    expect(await screen.findByText('intent-1')).toBeInTheDocument();
    await select('Norte');
    expect(await screen.findByText('Plan B')).toBeInTheDocument();
    expect(screen.getByText('orden-1')).toBeInTheDocument();
    expect(screen.getByText('intent-1')).toBeInTheDocument();
    expect(screen.getByTestId('purchase-flow')).toHaveTextContent('payment');
    expect(payment.confirmMembershipPayment).not.toHaveBeenCalled();
  });

  test('desmontaje descarta resultados y StrictMode evita carga inicial duplicada', async () => {
    const pending = deferred();
    api.listPublicPlansByBranch.mockReturnValue(pending.promise);
    const view = render(<StrictMode><MembershipPlansPage /></StrictMode>);
    await select('Centro');
    expect(api.listPublicCatalogBranches).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => pending.resolve({ plans: [plan('Tardío')] }));
    expect(sync.unsubscribe).toHaveBeenCalledTimes(2);
  });

  test('navegación pública se conserva', async () => {
    render(<MembershipPlansPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
