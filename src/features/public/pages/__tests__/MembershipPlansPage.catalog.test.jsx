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
const flags = vi.hoisted(() => ({ enabled: true }));
const notifications = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn(), success: vi.fn() }));
const dialog = vi.hoisted(() => ({ props: null }));
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
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notifications }));
vi.mock('../../../cliente/lib/clienteApi.js', () => payment);
vi.mock('../../lib/vipMembershipFeatureFlags.js', () => ({
  get VIP_MEMBERSHIPS_PURCHASE_ENABLED() { return flags.enabled; },
  VIP_MEMBERSHIPS_PURCHASE_LOCK_MESSAGE: 'Próximamente...',
}));
vi.mock('../../../../components/branding/MasterfadeLogo.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/navigation/PremiumBottomNav.jsx', () => ({ default: () => null }));
vi.mock('../../../plans/components/PlanPurchaseFlowDialog.jsx', () => ({
  default: (props) => {
    dialog.props = props;
    const { open, step, orderSummary, paymentIntent, onContinueToPayment } = props;
    return open ? (
    <div data-testid="purchase-flow">
      <span>{step}</span><span>{orderSummary?.id_order}</span><span>{paymentIntent?.id_payment_intent}</span>
      <button type="button" onClick={onContinueToPayment}>Continuar pago</button>
    </div>
    ) : null;
  },
}));

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLIENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const KEY1 = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const KEY2 = 'eeeeeeee-eeee-4eee-8eee-000000000002';
const STORAGE_KEY = 'mf_vip_purchase_attempt_v1';
const storedAttempt = () => JSON.parse(sessionStorage.getItem(STORAGE_KEY));
function authenticateCliente(userId = USER) {
  Object.assign(auth, { isAuthenticated: true, roles: ['cliente'],
    user: { id_usuario: userId, cliente_id: CLIENT }, clienteId: CLIENT,
    isHydrated: true, isHydrating: false });
}
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
  Object.assign(auth, { user: null, clienteId: null, isHydrated: true, isHydrating: false });
  sessionStorage.clear();
  let sequence = 0;
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() =>
    `eeeeeeee-eeee-4eee-8eee-${String(++sequence).padStart(12, '0')}`);
  flags.enabled = true;
  Object.values(notifications).forEach((mock) => mock.mockReset());
  dialog.props = null;
  Object.values(payment).forEach((mock) => mock.mockReset());
  payment.getClientePlanEstado.mockResolvedValue({});
  payment.createMembershipOrder.mockResolvedValue({ data: { id_order: 'orden-1' } });
  payment.createMembershipPaymentIntent.mockResolvedValue({ data: { id_payment_intent: 'intent-1' } });
  sync.callback = null;
  sync.unsubscribe.mockReset();
  api.listPublicCatalogBranches.mockResolvedValue({ branches });
  api.listPublicPlansByBranch.mockResolvedValue({ plans: [] });
});

// AM: Captura el callback real del boton para probar invocaciones antes del render
// y el guard del handler independientemente del atributo disabled.
function clickCallback(button) {
  const key = Object.keys(button).find((name) => name.startsWith('__reactProps$'));
  return button[key].onClick;
}
const orderSummary = () => ({
  id_order: 'orden-backend-A', estado_orden_codigo: 'pendiente_pago',
  plan: { id_plan: 'plan-backend', id_plan_sucursal: 'Plan A-offer', id_sucursal: A,
    precio_hnl: 975, beneficios: [{ tipo: 'servicio', nombre: 'Corte backend', cantidad: 4 }] },
  totales: { subtotal_hnl: 975, descuento_hnl: 0, total_hnl: 975, moneda_codigo: 'HNL' },
});
async function renderPurchase({ strict = false } = {}) {
  authenticateCliente();
  api.listPublicPlansByBranch.mockImplementation((id) => Promise.resolve({ plans: id === A
    ? [plan('Plan A', 100), plan('Plan alternativo', 200)] : [plan('Plan B', 300)] }));
  const view = render(strict ? <StrictMode><MembershipPlansPage /></StrictMode> : <MembershipPlansPage />);
  await select('Centro');
  await screen.findByText('Plan A');
  return view;
}

describe('exclusion de seleccion durante creacion de orden VIP', () => {
  test('A no cambia a B mientras crea orden A y conserva exclusivamente el resumen backend', async () => {
    const pending = deferred();
    const summary = orderSummary();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    await renderPurchase();
    fireEvent.click(screen.getAllByRole('button', { name: 'Quiero este plan' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Norte' }));
    await act(async () => pending.resolve({ data: summary }));
    expect(screen.getByRole('heading', { name: 'Planes en Centro' })).toBeInTheDocument();
    expect(api.listPublicPlansByBranch).not.toHaveBeenCalledWith(B);
    expect(payment.createMembershipOrder).toHaveBeenCalledExactlyOnceWith('Plan A-offer', { idempotencyKey: KEY1 });
    expect(dialog.props.open).toBe(true);
    expect(dialog.props.orderSummary).toBe(summary);
    expect(dialog.props.orderSummary.plan.precio_hnl).toBe(975);
    expect(dialog.props.orderSummary.plan.id_sucursal).toBe(A);
    expect(dialog.props.orderSummary.totales.total_hnl).toBe(975);
    expect(dialog.props.orderSummary.plan.beneficios[0].cantidad).toBe(4);
    expect(payment.createMembershipPaymentIntent).not.toHaveBeenCalled();
    expect(payment.confirmMembershipPayment).not.toHaveBeenCalled();
  });

  test('selector disabled y handler directo bloqueados hasta finalizar', async () => {
    const pending = deferred();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    await renderPurchase();
    const changeBranch = clickCallback(screen.getByRole('button', { name: 'Norte' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Quiero este plan' })[0]);
    expect(screen.getByRole('button', { name: 'Norte' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Procesando...' })).toBeDisabled();
    act(() => changeBranch());
    expect(api.listPublicPlansByBranch).not.toHaveBeenCalledWith(B);
    await act(async () => pending.resolve(orderSummary()));
    expect(screen.getByRole('button', { name: 'Norte' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Procesando...' })).not.toBeInTheDocument();
  });

  test.each([false, true])('B doble clic previo al render produce una sola orden; StrictMode=%s', async (strict) => {
    const pending = deferred();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    await renderPurchase({ strict });
    const choose = clickCallback(screen.getAllByRole('button', { name: 'Quiero este plan' })[0]);
    act(() => { choose(); choose(); });
    await act(async () => pending.resolve(orderSummary()));
    expect(payment.createMembershipOrder).toHaveBeenCalledTimes(1);
    expect(dialog.props.orderSummary.id_order).toBe('orden-backend-A');
  });

  test('C otra oferta no inicia una segunda creacion antes del render', async () => {
    const pending = deferred();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    await renderPurchase();
    const choices = screen.getAllByRole('button', { name: 'Quiero este plan' }).map(clickCallback);
    act(() => { choices[0](); choices[1](); });
    await act(async () => pending.resolve(orderSummary()));
    expect(payment.createMembershipOrder).toHaveBeenCalledExactlyOnceWith('Plan A-offer', { idempotencyKey: KEY1 });
  });

  test('D rechazo mantiene el error backend y libera sucursal y ofertas para recuperar', async () => {
    const pending = deferred();
    const recovered = orderSummary();
    recovered.id_order = 'orden-backend-B';
    recovered.plan.id_sucursal = B;
    recovered.plan.id_plan_sucursal = 'Plan B-offer';
    payment.createMembershipOrder.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ data: recovered });
    await renderPurchase();
    fireEvent.click(screen.getAllByRole('button', { name: 'Quiero este plan' })[0]);
    await act(async () => pending.reject({ data: { error: { code: 'MEMBERSHIP_PURCHASE_BRANCH_INACTIVE', message: 'Sucursal no disponible.' } } }));
    expect(notifications.error).toHaveBeenCalledWith('Sucursal no disponible.');
    expect(dialog.props.open).toBe(false);
    expect(screen.getByRole('button', { name: 'Norte' })).toBeEnabled();
    await select('Norte');
    await screen.findByText('Plan B');
    fireEvent.click(screen.getByRole('button', { name: 'Quiero este plan' }));
    await screen.findByText('orden-backend-B');
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan B-offer', { idempotencyKey: KEY2 });
    expect(payment.createMembershipPaymentIntent).not.toHaveBeenCalled();
  });

  test.each(['resolve', 'reject'])('F desmontaje durante creacion: %s no notifica ni solicita cancelacion', async (outcome) => {
    const pending = deferred();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    const view = await renderPurchase();
    fireEvent.click(screen.getAllByRole('button', { name: 'Quiero este plan' })[0]);
    view.unmount();
    await act(async () => outcome === 'resolve' ? pending.resolve(orderSummary()) : pending.reject(new Error('Solicitud fallida')));
    expect(storedAttempt()).toMatchObject({ key: KEY1, status: 'pending' });
    expect(notifications.error).not.toHaveBeenCalled();
    expect(payment.createMembershipOrder).toHaveBeenCalledTimes(1);
    expect(payment.createMembershipPaymentIntent).not.toHaveBeenCalled();
    expect(payment.confirmMembershipPayment).not.toHaveBeenCalled();
  });

  test('feature flag deshabilitado mantiene CTA y no solicita orden incluso mediante callback', async () => {
    flags.enabled = false;
    await renderPurchase();
    const button = screen.getAllByRole('button', { name: 'Próximamente...' })[0];
    expect(button).toBeDisabled();
    await act(async () => { await clickCallback(button)(); });
    expect(payment.createMembershipOrder).not.toHaveBeenCalled();
  });

  test('catalogSync durante la orden conserva bloqueo y resumen backend original', async () => {
    const pending = deferred();
    const summary = orderSummary();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    await renderPurchase();
    fireEvent.click(screen.getAllByRole('button', { name: 'Quiero este plan' })[0]);
    api.listPublicPlansByBranch.mockResolvedValue({ plans: [plan('Oferta recargada', 400)] });
    await act(async () => sync.callback());
    expect(await screen.findByText('Oferta recargada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Norte' })).toBeDisabled();
    await act(async () => { await clickCallback(screen.getByRole('button', { name: 'Quiero este plan' }))(); });
    expect(payment.createMembershipOrder).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: summary }));
    expect(dialog.props.orderSummary).toBe(summary);
  });

  test.each([false, true])('sesion autenticada=%s conserva navegacion y autorizacion previa', async (authenticated) => {
    auth.isAuthenticated = authenticated;
    auth.roles = authenticated ? ['admin'] : [];
    auth.user = authenticated ? { id_usuario: USER } : null;
    api.listPublicPlansByBranch.mockResolvedValue({ plans: [plan('Plan A')] });
    render(<MembershipPlansPage />);
    await select('Centro');
    await screen.findByText('Plan A');
    fireEvent.click(screen.getByRole('button', { name: 'Quiero este plan' }));
    expect(payment.createMembershipOrder).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Norte' })).toBeEnabled();
    if (authenticated) {
      expect(notifications.warning).toHaveBeenCalledWith('Esta compra solo esta disponible para perfiles cliente.');
      expect(navigate).toHaveBeenCalledWith('/home');
    } else {
      expect(navigate).toHaveBeenCalledWith(expect.stringContaining(`/login?next=%2Fmembresias-vip&intent=seleccionar_plan&id_sucursal=${A}&id_plan=Plan+A`));
    }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('persistencia aislada de intentos VIP', () => {
  const buy = () => fireEvent.click(screen.getAllByRole('button', { name: 'Quiero este plan' })[0]);
  const failFirst = async (error) => {
    payment.createMembershipOrder.mockRejectedValueOnce(error);
    const view = await renderPurchase();
    await act(async () => buy());
    return view;
  };

  test('primera compra genera UUID una vez y almacena solo contexto mínimo antes de la respuesta', async () => {
    const pending = deferred();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    await renderPurchase();
    buy();
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(storedAttempt()).toEqual({ version: 1, identity: `${USER}:${CLIENT}`,
      offerId: 'Plan A-offer', branchId: A, key: KEY1, status: 'pending' });
    expect(payment.createMembershipOrder).toHaveBeenCalledExactlyOnceWith('Plan A-offer', { idempotencyKey: KEY1 });
    const summary = orderSummary();
    await act(async () => pending.resolve({ data: summary }));
    expect(dialog.props.orderSummary).toBe(summary);
    expect(storedAttempt().status).toBe('resolved');
    expect(payment.createMembershipPaymentIntent).not.toHaveBeenCalled();
    expect(payment.confirmMembershipPayment).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'TimeoutError', message: 'timeout interno' },
    { status: 0, code: 'NETWORK_UNAVAILABLE', message: 'red interna' },
  ])('timeout/red conserva clave y reintento manual de misma oferta la reutiliza: %j', async (error) => {
    await failFirst(error);
    expect(storedAttempt().status).toBe('pending');
    expect(payment.createMembershipOrder).toHaveBeenCalledTimes(1);
    expect(notifications.error).toHaveBeenCalledWith(expect.stringContaining('Reintenta la misma oferta'));
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY1 });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(storedAttempt().status).toBe('resolved');
  });

  test('reload recupera intento pendiente y respuesta de instancia desmontada no lo sobrescribe', async () => {
    const old = deferred();
    payment.createMembershipOrder.mockReturnValueOnce(old.promise).mockResolvedValueOnce(orderSummary());
    const view = await renderPurchase();
    buy();
    view.unmount();
    expect(storedAttempt().status).toBe('pending');
    await renderPurchase();
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY1 });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    await act(async () => old.resolve(orderSummary()));
    expect(storedAttempt().status).toBe('resolved');
    expect(notifications.error).not.toHaveBeenCalled();
  });

  test('reload público sin hidratación automática ignora intento hasta login y recupera la misma clave', async () => {
    const previous = await failFirst({ status: 0 });
    previous.unmount();
    Object.assign(auth, { isAuthenticated: false, roles: [], user: null, clienteId: null,
      isHydrated: true, isHydrating: false });
    const view = render(<MembershipPlansPage />);
    await select('Centro');
    await screen.findByText('Plan A');
    expect(storedAttempt()).toMatchObject({ key: KEY1, status: 'pending' });
    buy();
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/login?'));
    expect(payment.createMembershipOrder).toHaveBeenCalledTimes(1);
    authenticateCliente();
    view.rerender(<MembershipPlansPage />);
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY1 });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  test('nueva compra explícita después de procesar resumen obtiene otra clave', async () => {
    await renderPurchase();
    await act(async () => buy());
    act(() => dialog.props.onCancel());
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY2 });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
  });

  test('otra oferta crea otro intento y volver a oferta abandonada no reactiva su clave', async () => {
    payment.createMembershipOrder.mockRejectedValue({ status: 0 });
    await renderPurchase();
    await act(async () => buy());
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Quiero este plan' })[1]));
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan alternativo-offer', { idempotencyKey: KEY2 });
    await act(async () => buy());
    expect(payment.createMembershipOrder.mock.calls[2][1].idempotencyKey).not.toBe(KEY1);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(3);
  });

  test.each(['otra identidad', 'logout'])('%s descarta intento anterior', async (mode) => {
    const view = await failFirst({ status: 0 });
    if (mode === 'logout') {
      Object.assign(auth, { isAuthenticated: false, roles: [], user: null, clienteId: null });
      view.rerender(<MembershipPlansPage />);
      expect(storedAttempt()).toBeNull();
    }
    authenticateCliente(mode === 'otra identidad' ? B : USER);
    view.rerender(<MembershipPlansPage />);
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY2 });
    expect(storedAttempt().identity).toBe(`${mode === 'otra identidad' ? B : USER}:${CLIENT}`);
  });

  test('respuesta pendiente de otra identidad no entrega resumen ni notificación', async () => {
    const pending = deferred();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    const view = await renderPurchase();
    buy();
    authenticateCliente(B);
    view.rerender(<MembershipPlansPage />);
    await act(async () => pending.resolve(orderSummary()));
    expect(dialog.props.open).toBe(false);
    expect(storedAttempt()).toBeNull();
    expect(notifications.error).not.toHaveBeenCalled();
  });

  test.each(['resolve', 'reject'])('logout y retorno a la misma cuenta descartan respuesta anterior: %s', async (outcome) => {
    const pending = deferred();
    payment.createMembershipOrder.mockReturnValue(pending.promise);
    const view = await renderPurchase();
    buy();
    Object.assign(auth, { isAuthenticated: false, roles: [], user: null, clienteId: null });
    view.rerender(<MembershipPlansPage />);
    authenticateCliente();
    view.rerender(<MembershipPlansPage />);
    await act(async () => outcome === 'resolve' ? pending.resolve(orderSummary()) : pending.reject({ status: 0 }));
    expect(dialog.props.open).toBe(false);
    expect(storedAttempt()).toBeNull();
    expect(notifications.error).not.toHaveBeenCalled();
  });

  test('hidratación de Auth no descarta registro recuperable y solo compra con identidad real', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, identity: `${USER}:${CLIENT}`,
      offerId: 'Plan A-offer', branchId: A, key: KEY1, status: 'pending' }));
    Object.assign(auth, { isHydrating: true, isHydrated: false });
    api.listPublicPlansByBranch.mockResolvedValue({ plans: [plan('Plan A')] });
    const view = render(<MembershipPlansPage />);
    await select('Centro');
    await screen.findByText('Plan A');
    expect(storedAttempt().key).toBe(KEY1);
    authenticateCliente();
    view.rerender(<MembershipPlansPage />);
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenCalledExactlyOnceWith('Plan A-offer', { idempotencyKey: KEY1 });
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  test('cliente sin identidad válida no puede comprar', async () => {
    const view = await renderPurchase();
    Object.assign(auth, { user: null, clienteId: null });
    view.rerender(<MembershipPlansPage />);
    await act(async () => buy());
    expect(payment.createMembershipOrder).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith(expect.stringContaining('identificar tu perfil'));
  });

  test('sessionStorage inaccesible conserva clave en memoria sin fallback legacy', async () => {
    ['getItem', 'setItem', 'removeItem'].forEach((method) =>
      vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error('SecurityError'); }));
    await failFirst({ status: 0 });
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY1 });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, () => 'invalid'])('crypto.randomUUID inexistente/inválido impide solicitud', async (randomUUID) => {
    vi.stubGlobal('crypto', { randomUUID });
    await renderPurchase();
    await act(async () => buy());
    expect(payment.createMembershipOrder).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith(expect.stringContaining('proteger esta compra'));
    expect(storedAttempt()).toBeNull();
  });

  test.each(['CONFLICT', 'ORDER_UNAVAILABLE'])('409 %s no reintenta y requiere nueva compra explícita', async (suffix) => {
    await failFirst({ status: 409, data: { error: { code: `MEMBERSHIP_PURCHASE_IDEMPOTENCY_${suffix}` } } });
    expect(payment.createMembershipOrder).toHaveBeenCalledTimes(1);
    expect(storedAttempt().status).toBe('terminal');
    expect(notifications.error).toHaveBeenCalledWith(expect.stringContaining('Iniciar nueva compra'));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nueva compra' }));
    await screen.findByText('orden-1');
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY2 });
  });

  test('503 SCHEMA_NOT_READY advierte, conserva clave y nunca hace fallback legacy', async () => {
    await failFirst({ status: 503, data: { error: { code: 'MEMBERSHIP_PURCHASE_IDEMPOTENCY_SCHEMA_NOT_READY' } } });
    expect(notifications.warning).toHaveBeenCalledWith(expect.stringContaining('temporalmente'));
    expect(payment.createMembershipOrder).toHaveBeenCalledTimes(1);
    expect(storedAttempt()).toMatchObject({ key: KEY1, status: 'pending' });
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY1 });
  });

  test('respuesta sin resumen confiable no resuelve intento y conserva clave', async () => {
    payment.createMembershipOrder.mockResolvedValueOnce({});
    await renderPurchase();
    await act(async () => buy());
    expect(dialog.props.open).toBe(false);
    expect(storedAttempt().status).toBe('pending');
    await act(async () => buy());
    expect(payment.createMembershipOrder).toHaveBeenNthCalledWith(2, 'Plan A-offer', { idempotencyKey: KEY1 });
  });

  test('errores desconocidos no exponen detalles técnicos ni cambian la clave pendiente', async () => {
    await failFirst({ data: { error: { code: 'INTERNAL_ERROR', message: 'SQL y datos privados' } } });
    expect(notifications.error).toHaveBeenCalledWith('No se pudo crear la orden de compra. Reintenta la misma oferta.');
    expect(storedAttempt()).toMatchObject({ key: KEY1, status: 'pending' });
  });
});

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
    authenticateCliente();
    api.listPublicPlansByBranch.mockImplementation((id) => Promise.resolve({ plans: [plan(id === A ? 'Plan A' : 'Plan B')] }));
    render(<MembershipPlansPage />);
    await select('Centro');
    expect(await screen.findByText('Plan A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quiero este plan' }));
    expect(await screen.findByText('orden-1')).toBeInTheDocument();
    expect(payment.createMembershipOrder).toHaveBeenCalledWith('Plan A-offer', { idempotencyKey: KEY1 });
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
