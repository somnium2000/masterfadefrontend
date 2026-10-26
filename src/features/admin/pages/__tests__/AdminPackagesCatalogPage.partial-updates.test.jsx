// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import AdminPackagesCatalogPage from '../AdminPackagesCatalogPage.jsx';

const BRANCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SERVICE_A = '11111111-1111-4111-8111-111111111111';
const SERVICE_B = '22222222-2222-4222-8222-222222222222';
const PACKAGE = '33333333-3333-4333-8333-333333333333';

const packagesApi = vi.hoisted(() => ({
  listAdminPaquetes: vi.fn(), createAdminPaquete: vi.fn(), updateAdminPaquete: vi.fn(), setAdminPaqueteEstado: vi.fn(),
}));
const catalogApi = vi.hoisted(() => ({ listAdminServicios: vi.fn() }));
const branchesApi = vi.hoisted(() => ({ listAdminSucursales: vi.fn() }));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const authState = vi.hoisted(() => ({ branchIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], roles: ['admin'] }));
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigateMock }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => authState }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notifications }));
vi.mock('../../lib/adminPackagesApi.js', () => packagesApi);
vi.mock('../../lib/adminCatalogApi.js', () => catalogApi);
vi.mock('../../lib/adminSucursalesApi.js', () => branchesApi);
vi.mock('../../../../lib/catalogSync.js', () => ({ emitCatalogSync: vi.fn() }));

const originalPackage = {
  id_paquete: PACKAGE,
  id_sucursal: BRANCH,
  nombre_paquete: 'Paquete base',
  descripcion: 'Descripcion original',
  precio_hnl: 500,
  activo: true,
  visible_publico: true,
  orden_visual: 10,
  items: [
    { id_servicio: SERVICE_A, nombre_servicio: 'Servicio A', cantidad: 1 },
    { id_servicio: SERVICE_B, nombre_servicio: 'Servicio B', cantidad: 1 },
  ],
};

async function openMasterEditor() {
  render(<AdminPackagesCatalogPage />);
  await screen.findByText('Paquete base');
  fireEvent.click(screen.getByRole('button', { name: 'Editar maestro' }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  authState.user = null;
  authState.branchIds = [BRANCH];
  authState.roles = ['admin'];
  navigateMock.mockReset();
  Object.values(packagesApi).forEach((mock) => mock.mockReset());
  Object.values(notifications).forEach((mock) => mock.mockReset());
  catalogApi.listAdminServicios.mockReset();
  branchesApi.listAdminSucursales.mockReset();
  packagesApi.listAdminPaquetes.mockResolvedValue({ data: { paquetes: [originalPackage] } });
  packagesApi.updateAdminPaquete.mockResolvedValue({ data: originalPackage });
  branchesApi.listAdminSucursales.mockImplementation(async () => ({ data: { sucursales: [
    { id_sucursal: BRANCH, nombre_sucursal: 'Centro', estado: true },
    { id_sucursal: BRANCH_B, nombre_sucursal: 'Norte', estado: true },
  ].filter((branch) => authState.roles.includes('super_admin') || authState.branchIds.includes(branch.id_sucursal)) } }));
  catalogApi.listAdminServicios.mockResolvedValue({ data: { servicios: [
    { id_servicio: SERVICE_A, id_sucursal: BRANCH, nombre_servicio: 'Servicio A', activo: true, agendable: true, tarifa_activa: true, servicio_informativo: false, precio_hnl: 200 },
    { id_servicio: SERVICE_B, id_sucursal: BRANCH, nombre_servicio: 'Servicio B', activo: true, agendable: true, tarifa_activa: true, servicio_informativo: false, precio_hnl: 300 },
  ] } });
});

afterEach(() => cleanup());

test('QA06: errores desconocidos no exponen detalles técnicos', async () => {
  packagesApi.updateAdminPaquete.mockRejectedValue({ data: { error: { message: 'SQL INTERNAL_SYNTHETIC password=secret' } } });
  const dialog = await openMasterEditor();
  fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Nuevo nombre' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la operación de paquetes.');
  expect(screen.queryByText(/INTERNAL_SYNTHETIC/)).not.toBeInTheDocument();
});

test('QA06: dos clics en el mismo render guardan una sola vez', async () => {
  const pending = deferred();
  packagesApi.updateAdminPaquete.mockReturnValue(pending.promise);
  const dialog = await openMasterEditor();
  fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Nuevo nombre' } });
  const save = within(dialog).getByRole('button', { name: 'Guardar cambios' });
  act(() => { save.click(); save.click(); });
  expect(packagesApi.updateAdminPaquete).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ data: { ...originalPackage, nombre_paquete: 'Nuevo nombre' } }));
});

test('QA06: dos confirmaciones simultáneas cambian estado una sola vez', async () => {
  const pending = deferred();
  packagesApi.setAdminPaqueteEstado.mockReturnValue(pending.promise);
  render(<AdminPackagesCatalogPage />);
  await screen.findByText('Paquete base');
  fireEvent.click(screen.getByRole('button', { name: 'Inactivar oferta' }));
  const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Inactivar oferta' });
  act(() => { confirm.click(); confirm.click(); });
  expect(packagesApi.setAdminPaqueteEstado).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ data: { ...originalPackage, activo: false } }));
});

test.each(['save', 'state'])('QA06: operación %s de A no libera el bloqueo ni altera B', async (kind) => {
  const a = deferred(); const b = deferred();
  const api = kind === 'save' ? packagesApi.updateAdminPaquete : packagesApi.setAdminPaqueteEstado;
  api.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  authState.user = { id_usuario: 'cliente-a' };
  const view = render(<AdminPackagesCatalogPage />);
  const start = async () => {
    await screen.findByText('Paquete base');
    fireEvent.click(screen.getByRole('button', { name: kind === 'save' ? 'Editar maestro' : 'Inactivar oferta' }));
    const dialog = await screen.findByRole('dialog');
    if (kind === 'save') fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Edición vigente' } });
    fireEvent.click(within(dialog).getByRole('button', { name: kind === 'save' ? 'Guardar cambios' : 'Inactivar oferta' }));
    return dialog;
  };
  await start();
  authState.user = { id_usuario: 'cliente-b' };
  view.rerender(<AdminPackagesCatalogPage />);
  const dialogB = await start();
  expect(api).toHaveBeenCalledTimes(2);
  await act(async () => a.reject({ status: 401 }));
  expect(navigateMock).not.toHaveBeenCalled();
  expect(notifications.success).not.toHaveBeenCalled();
  expect(notifications.error).not.toHaveBeenCalled();
  expect(dialogB).toBeInTheDocument();
  const pendingButton = within(dialogB).getByRole('button', { name: kind === 'save' ? 'Guardar cambios' : 'Inactivar oferta' });
  expect(pendingButton).toBeDisabled();
  await act(async () => b.resolve({ data: { ...originalPackage, activo: false } }));
  expect(notifications.success).toHaveBeenCalledTimes(1);
});

test.each(['save', 'state'])('QA06: 401 vigente en %s conserva redirección', async (kind) => {
  const api = kind === 'save' ? packagesApi.updateAdminPaquete : packagesApi.setAdminPaqueteEstado;
  api.mockRejectedValue({ status: 401 });
  const dialog = kind === 'save' ? await openMasterEditor() : await (async () => {
    render(<AdminPackagesCatalogPage />);
    await screen.findByText('Paquete base');
    fireEvent.click(screen.getByRole('button', { name: 'Inactivar oferta' }));
    return screen.findByRole('dialog');
  })();
  if (kind === 'save') fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Nuevo nombre' } });
  fireEvent.click(within(dialog).getByRole('button', { name: kind === 'save' ? 'Guardar cambios' : 'Inactivar oferta' }));
  await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login'));
});

test.each(['save', 'state'])('QA06: fallo vigente libera %s para reintento sin duplicados', async (kind) => {
  const api = kind === 'save' ? packagesApi.updateAdminPaquete : packagesApi.setAdminPaqueteEstado;
  api.mockRejectedValueOnce({ status: 503, message: 'INTERNAL_SYNTHETIC' }).mockResolvedValueOnce({ data: originalPackage });
  render(<AdminPackagesCatalogPage />);
  await screen.findByText('Paquete base');
  fireEvent.click(screen.getByRole('button', { name: kind === 'save' ? 'Editar maestro' : 'Inactivar oferta' }));
  const dialog = await screen.findByRole('dialog');
  if (kind === 'save') fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Nuevo nombre' } });
  const button = within(dialog).getByRole('button', { name: kind === 'save' ? 'Guardar cambios' : 'Inactivar oferta' });
  fireEvent.click(button);
  await waitFor(() => expect(notifications.error).toHaveBeenCalledWith('No se pudo completar la operación de paquetes.', expect.anything()));
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(notifications.success).toHaveBeenCalledTimes(1));
  expect(api).toHaveBeenCalledTimes(2);
});

test('QA06: confirmación de citas futuras conserva el contrato y permite confirmar', async () => {
  packagesApi.setAdminPaqueteEstado.mockRejectedValueOnce({ data: { error: {
    code: 'CATALOG_PACKAGE_PENDING_APPOINTMENTS_CONFIRMATION_REQUIRED', message: 'INTERNAL_SYNTHETIC',
    details: { total_citas_futuras: 2 },
  } } }).mockResolvedValueOnce({ data: { ...originalPackage, activo: false } });
  render(<AdminPackagesCatalogPage />);
  await screen.findByText('Paquete base');
  fireEvent.click(screen.getByRole('button', { name: 'Inactivar oferta' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Inactivar oferta' }));
  await within(dialog).findByText(/2 cita\(s\) futura\(s\)/);
  expect(notifications.warning).toHaveBeenCalledWith('La oferta tiene citas futuras. Confirma la inactivación para continuar.', expect.anything());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Inactivar oferta' }));
  await waitFor(() => expect(notifications.success).toHaveBeenCalledTimes(1));
  expect(packagesApi.setAdminPaqueteEstado).toHaveBeenLastCalledWith(PACKAGE, {
    activo: false, id_sucursal: BRANCH, confirmar_citas_pendientes: true,
  });
});

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const packageResult = (nombre_paquete, id_sucursal = BRANCH_B) => ({ data: { paquetes: [{ ...originalPackage, nombre_paquete, id_sucursal }] } });
const service = (id_servicio = SERVICE_A, id_sucursal = BRANCH, extra = {}) => ({
  id_servicio, id_sucursal, nombre_servicio: id_servicio === SERVICE_A ? 'Servicio A' : 'Servicio B',
  activo: true, agendable: true, tarifa_activa: true, servicio_informativo: false, precio_hnl: 200, ...extra,
});
const serviceResult = (items) => ({ data: { servicios: items } });
async function renderGlobal() {
  authState.roles = ['super_admin']; authState.branchIds = [];
  const view = render(<AdminPackagesCatalogPage />);
  await screen.findByText('Paquete base');
  await screen.findByRole('option', { name: 'Centro' });
  return view;
}
const changeBranch = (value) => fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value } });

describe('alcance, concurrencia y disponibilidad de paquetes', () => {
  test.each(['resolve', 'reject', '401', '403'])('A tardía no afecta datos ni navegación de B: %s', async (outcome) => {
    await renderGlobal();
    const a = deferred();
    packagesApi.listAdminPaquetes.mockReturnValueOnce(a.promise).mockResolvedValueOnce(packageResult('Paquete B'));
    changeBranch(BRANCH); changeBranch(BRANCH_B);
    await screen.findByText('Paquete B');
    await act(async () => outcome === 'resolve' ? a.resolve(packageResult('Paquete A viejo', BRANCH)) : a.reject({ status: outcome === 'reject' ? 500 : Number(outcome) }));
    expect(screen.getByText('Paquete B')).toBeInTheDocument();
    expect(screen.queryByText('Paquete A viejo')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('respuesta A no libera loading de B', async () => {
    await renderGlobal();
    const a = deferred(); const b = deferred();
    packagesApi.listAdminPaquetes.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    changeBranch(BRANCH); changeBranch(BRANCH_B);
    await act(async () => a.resolve(packageResult('Viejo')));
    expect(screen.getAllByText('Cargando...').length).toBeGreaterThan(0);
    await act(async () => b.resolve(packageResult('Vigente')));
    expect(screen.getByText('Vigente')).toBeInTheDocument();
  });

  test('desmontaje descarta errores tardíos sin navegar', async () => {
    const pending = deferred();
    packagesApi.listAdminPaquetes.mockReturnValueOnce(pending.promise);
    const view = render(<AdminPackagesCatalogPage />);
    await waitFor(() => expect(packagesApi.listAdminPaquetes).toHaveBeenCalled());
    view.unmount();
    await act(async () => pending.reject({ status: 401 }));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test.each([{ ids: [] }, { ids: [BRANCH, BRANCH_B] }])('admin requiere sucursal autorizada, claims=%j', async ({ ids }) => {
    authState.branchIds = ids;
    render(<AdminPackagesCatalogPage />);
    await screen.findByRole('combobox', { name: 'Sucursal' });
    expect(screen.queryByRole('option', { name: 'Todas las sucursales' })).not.toBeInTheDocument();
    if (!ids.length) expect(screen.queryByRole('option', { name: 'Centro' })).not.toBeInTheDocument();
    expect(packagesApi.listAdminPaquetes).not.toHaveBeenCalled();
    expect(catalogApi.listAdminServicios).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nuevo maestro' })).toBeDisabled();
    expect(screen.getByText('Selecciona una sucursal autorizada')).toBeInTheDocument();
  });

  test('cambio de permisos elimina datos y formularios anteriores', async () => {
    const view = render(<AdminPackagesCatalogPage />);
    await screen.findByText('Paquete base');
    fireEvent.click(screen.getByRole('button', { name: 'Editar maestro' }));
    await screen.findByRole('dialog');
    authState.branchIds = [];
    view.rerender(<AdminPackagesCatalogPage />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Paquete base')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo maestro' })).toBeDisabled();
  });

  test.each([
    { activo: false }, { agendable: false }, { tarifa_activa: false }, { servicio_informativo: true },
    { id_sucursal: BRANCH_B }, { precio_hnl: null }, { precio_hnl: '' }, { precio_hnl: -1 },
  ])('excluye servicio no operativo: %j', async (invalid) => {
    catalogApi.listAdminServicios.mockResolvedValue(serviceResult([
      service(), service(SERVICE_B, BRANCH, { ...invalid, nombre_servicio: 'No seleccionable' }),
    ]));
    const dialog = await openMasterEditor();
    await waitFor(() => expect(within(dialog).getAllByRole('option', { name: 'Servicio A' }).length).toBeGreaterThan(0));
    expect(within(dialog).queryByRole('option', { name: 'No seleccionable' })).not.toBeInTheDocument();
  });

  test.each(['resolve', 'reject'])('servicios A tardíos no reemplazan catálogo auxiliar de B: %s', async (outcome) => {
    await renderGlobal();
    const a = deferred();
    catalogApi.listAdminServicios.mockImplementation(({ id_sucursal }) => id_sucursal === BRANCH ? a.promise : Promise.resolve(serviceResult([service(SERVICE_A, BRANCH_B, { nombre_servicio: 'Solo B' })])));
    changeBranch(BRANCH); changeBranch(BRANCH_B);
    await screen.findByText('Paquete base');
    fireEvent.click(screen.getByRole('button', { name: 'Editar maestro' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findAllByRole('option', { name: 'Solo B' });
    await act(async () => outcome === 'resolve' ? a.resolve(serviceResult([service(SERVICE_A, BRANCH, { nombre_servicio: 'Viejo A' })])) : a.reject({ status: 500 }));
    expect(within(dialog).queryByRole('option', { name: 'Viejo A' })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('option', { name: 'Solo B' }).length).toBeGreaterThan(0);
  });

  test('selección rápida A+B conserva ambas ofertas y servicios comunes', async () => {
    await renderGlobal();
    const a = deferred(); const b = deferred();
    catalogApi.listAdminServicios.mockImplementation(({ id_sucursal }) => id_sucursal === BRANCH ? a.promise : b.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo maestro' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Centro'));
    fireEvent.click(within(dialog).getByLabelText('Norte'));
    await act(async () => b.resolve(serviceResult([service(SERVICE_A, BRANCH_B), service(SERVICE_B, BRANCH_B)])));
    await act(async () => a.resolve(serviceResult([service(), service(SERVICE_B)])));
    expect(within(dialog).getByLabelText('Centro')).toBeChecked();
    expect(within(dialog).getByLabelText('Norte')).toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar', exact: true }));
    expect(within(dialog).getByRole('option', { name: 'Servicio A' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'Servicio B' })).toBeInTheDocument();
  });

  test('StrictMode descarta resultados del montaje anterior', async () => {
    authState.roles = ['super_admin']; authState.branchIds = [];
    const old = deferred();
    branchesApi.listAdminSucursales.mockReturnValueOnce(old.promise).mockResolvedValue({ data: { sucursales: [
      { id_sucursal: BRANCH, nombre_sucursal: 'Centro', estado: true }, { id_sucursal: BRANCH_B, nombre_sucursal: 'Norte', estado: true },
    ] } });
    packagesApi.listAdminPaquetes.mockResolvedValue(packageResult('Vigente', BRANCH));
    render(<StrictMode><AdminPackagesCatalogPage /></StrictMode>);
    await screen.findByText('Vigente');
    await act(async () => old.resolve({ data: { sucursales: [] } }));
    expect(screen.queryByText('Viejo')).not.toBeInTheDocument();
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Norte' })).toBeInTheDocument();
  });

  test('retirar una oferta durante su carga no permite que reaparezca', async () => {
    await renderGlobal();
    const pending = deferred();
    catalogApi.listAdminServicios.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo maestro' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Centro'));
    expect(within(dialog).getByLabelText('Centro')).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText('Centro'));
    await act(async () => pending.resolve(serviceResult([service()])));
    expect(within(dialog).getByLabelText('Centro')).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar', exact: true }));
    expect(within(dialog).queryByRole('option', { name: 'Servicio A' })).not.toBeInTheDocument();
  });

  test('cerrar y abrir creación descarta la carga de la sesión de formulario anterior', async () => {
    await renderGlobal();
    const old = deferred();
    catalogApi.listAdminServicios.mockReturnValueOnce(old.promise).mockResolvedValue(serviceResult([service(SERVICE_B, BRANCH_B, { nombre_servicio: 'Nuevo Norte' })]));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo maestro' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Centro'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo maestro' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Norte'));
    await act(async () => {});
    await act(async () => old.resolve(serviceResult([service()])));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar', exact: true }));
    expect(within(dialog).getByLabelText('Centro')).not.toBeChecked();
    expect(within(dialog).getByLabelText('Norte')).toBeChecked();
    expect(within(dialog).getByRole('option', { name: 'Nuevo Norte' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: 'Servicio A' })).not.toBeInTheDocument();
  });

  test('creación conserva servicios comunes, cantidades y precios por sucursal', async () => {
    await renderGlobal();
    catalogApi.listAdminServicios.mockImplementation(({ id_sucursal }) => Promise.resolve(serviceResult([
      service(SERVICE_A, id_sucursal), service(SERVICE_B, id_sucursal),
      service('44444444-4444-4444-8444-444444444444', id_sucursal, { nombre_servicio: 'Exclusivo', activo: id_sucursal === BRANCH }),
    ])));
    packagesApi.createAdminPaquete.mockResolvedValue({ data: originalPackage });
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo maestro' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Centro'));
    fireEvent.click(within(dialog).getByLabelText('Norte'));
    fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Combo común' } });
    const offerPrices = within(dialog).getAllByPlaceholderText('800.00');
    fireEvent.change(offerPrices[0], { target: { value: '450' } });
    fireEvent.change(offerPrices[1], { target: { value: '475' } });
    await act(async () => {});
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar', exact: true }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar', exact: true }));
    const selects = within(dialog).getAllByRole('combobox');
    expect(within(dialog).queryByRole('option', { name: 'Exclusivo' })).not.toBeInTheDocument();
    fireEvent.change(selects[0], { target: { value: SERVICE_A } });
    fireEvent.change(selects[1], { target: { value: SERVICE_B } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear paquete maestro' }));
    await waitFor(() => expect(packagesApi.createAdminPaquete).toHaveBeenCalledExactlyOnceWith({
      nombre_paquete: 'Combo común', descripcion: undefined,
      items: [{ id_servicio: SERVICE_A, cantidad: 1 }, { id_servicio: SERVICE_B, cantidad: 1 }],
      ofertas: [
        { id_sucursal: BRANCH, precio_hnl: 450, visible_publico: true, orden_visual: 100 },
        { id_sucursal: BRANCH_B, precio_hnl: 475, visible_publico: true, orden_visual: 100 },
      ],
    }));
  });

  test('editar oferta conserva precio y alcance sin reenviar composición', async () => {
    render(<AdminPackagesCatalogPage />);
    await screen.findByText('Paquete base');
    fireEvent.click(screen.getByRole('button', { name: 'Editar oferta', exact: true }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Precio HNL de la oferta *'), { target: { value: '550' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(packagesApi.updateAdminPaquete).toHaveBeenCalledExactlyOnceWith(PACKAGE, {
      id_sucursal: BRANCH, precio_hnl: 550, visible_publico: true, orden_visual: 10,
    }));
  });

  test.each([true, false])('estado de oferta activo=%s conserva endpoint y alcance', async (activo) => {
    packagesApi.listAdminPaquetes.mockResolvedValue(packageResult('Paquete base', BRANCH));
    if (!activo) packagesApi.listAdminPaquetes.mockResolvedValue({ data: { paquetes: [{ ...originalPackage, activo: false }] } });
    packagesApi.setAdminPaqueteEstado.mockResolvedValue({ data: { ...originalPackage, activo: !activo } });
    render(<AdminPackagesCatalogPage />);
    await screen.findByText('Paquete base');
    fireEvent.click(screen.getByRole('button', { name: activo ? 'Inactivar oferta' : 'Activar oferta' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: activo ? 'Inactivar oferta' : 'Activar oferta' }));
    await waitFor(() => expect(packagesApi.setAdminPaqueteEstado).toHaveBeenCalledExactlyOnceWith(PACKAGE, {
      activo: !activo, id_sucursal: BRANCH, confirmar_citas_pendientes: false,
    }));
  });

  test('edición solo de nombre sigue permitida sin servicios operativos seleccionables', async () => {
    catalogApi.listAdminServicios.mockResolvedValue(serviceResult([service(SERVICE_A, BRANCH, { agendable: false })]));
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Maestro renombrado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(packagesApi.updateAdminPaquete).toHaveBeenCalledExactlyOnceWith(PACKAGE, {
      nombre_paquete: 'Maestro renombrado', id_sucursal: BRANCH,
    }));
  });

  test('admin múltiple opera únicamente después de seleccionar su sucursal', async () => {
    authState.branchIds = [BRANCH, BRANCH_B];
    packagesApi.listAdminPaquetes.mockResolvedValue(packageResult('Paquete Norte'));
    render(<AdminPackagesCatalogPage />);
    await screen.findByRole('option', { name: 'Norte' });
    changeBranch(BRANCH_B);
    await screen.findByText('Paquete Norte');
    expect(packagesApi.listAdminPaquetes).toHaveBeenCalledExactlyOnceWith({ id_sucursal: BRANCH_B });
    expect(catalogApi.listAdminServicios).toHaveBeenCalledExactlyOnceWith({ id_sucursal: BRANCH_B });
    expect(screen.getByRole('button', { name: 'Nuevo maestro' })).toBeEnabled();
    expect(screen.queryByRole('option', { name: 'Todas las sucursales' })).not.toBeInTheDocument();
  });

  test('cambio de composición sigue bloqueado si no hay servicios operativos', async () => {
    catalogApi.listAdminServicios.mockResolvedValue(serviceResult([]));
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0], { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No hay servicios activos disponibles');
    expect(packagesApi.updateAdminPaquete).not.toHaveBeenCalled();
  });

  test('respuesta de edición pendiente no reinserta datos ni abre formularios al perder alcance', async () => {
    const pending = deferred();
    packagesApi.updateAdminPaquete.mockReturnValueOnce(pending.promise);
    const view = render(<AdminPackagesCatalogPage />);
    await screen.findByText('Paquete base');
    fireEvent.click(screen.getByRole('button', { name: 'Editar maestro' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Edición anterior' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(packagesApi.updateAdminPaquete).toHaveBeenCalledTimes(1));
    authState.branchIds = [];
    view.rerender(<AdminPackagesCatalogPage />);
    await act(async () => pending.resolve({ data: { ...originalPackage, nombre_paquete: 'Edición anterior' } }));
    expect(screen.queryByText('Edición anterior')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(notifications.success).not.toHaveBeenCalled();
  });
});

describe('actualizaciones parciales del paquete maestro', () => {
  test('envia solo nombre e id_sucursal cuando solo cambia el nombre', async () => {
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getByLabelText('Nombre del paquete maestro *'), { target: { value: 'Paquete renombrado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(packagesApi.updateAdminPaquete).toHaveBeenCalledWith(PACKAGE, {
      nombre_paquete: 'Paquete renombrado', id_sucursal: BRANCH,
    }));
  });

  test('envia null para retirar explicitamente la descripcion', async () => {
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getByLabelText('Descripcion'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(packagesApi.updateAdminPaquete).toHaveBeenCalledWith(PACKAGE, {
      descripcion: null, id_sucursal: BRANCH,
    }));
  });

  test('no ejecuta PATCH cuando no existen cambios', async () => {
    const dialog = await openMasterEditor();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(packagesApi.updateAdminPaquete).not.toHaveBeenCalled();
  });

  test('envia items solo cuando cambia realmente la composicion', async () => {
    const dialog = await openMasterEditor();
    const quantities = within(dialog).getAllByRole('spinbutton');
    fireEvent.change(quantities[0], { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(packagesApi.updateAdminPaquete).toHaveBeenCalledWith(PACKAGE, {
      items: [
        { id_servicio: SERVICE_A, cantidad: 2 },
        { id_servicio: SERVICE_B, cantidad: 1 },
      ],
      id_sucursal: BRANCH,
    }));
  });
});

describe('catálogo responsive de paquetes', () => {
  test('inicia en lista y alterna a tarjetas sin refetch ni perder datos', async () => {
    render(<AdminPackagesCatalogPage />);
    expect(await screen.findByRole('region', { name: 'Lista de paquetes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Servicio A · Servicio B')).toBeInTheDocument();
    const callsBefore = packagesApi.listAdminPaquetes.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Tarjetas' }));
    expect(await screen.findByRole('region', { name: 'Tarjetas de paquetes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tarjetas' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Servicio A · Servicio B')).toBeInTheDocument();
    expect(packagesApi.listAdminPaquetes).toHaveBeenCalledTimes(callsBefore);
  });

  test('agrupa ofertas globales por maestro y muestra rango identificado', async () => {
    authState.branchIds = [];
    authState.roles = ['super_admin'];
    packagesApi.listAdminPaquetes.mockResolvedValue({ data: { paquetes: [
      originalPackage,
      { ...originalPackage, id_sucursal: BRANCH_B, precio_hnl: 700, activo: false, visible_publico: false },
    ] } });
    render(<AdminPackagesCatalogPage />);
    await screen.findByRole('region', { name: 'Lista de paquetes' });
    expect(screen.getAllByText('Paquete base')).toHaveLength(1);
    expect(screen.getByText('Rango por sucursal')).toBeInTheDocument();
    expect(screen.getByText('L 500.00 - L 700.00')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver 2 oferta(s)'));
    expect(screen.getAllByText('Centro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Norte').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Gestionar ofertas' })).toBeInTheDocument();
  });

  test('pagina diez registros sin realizar solicitudes adicionales', async () => {
    packagesApi.listAdminPaquetes.mockResolvedValue({ data: { paquetes: Array.from({ length: 11 }, (_, index) => ({
      ...originalPackage,
      id_paquete: `${String(index + 1).padStart(8, '0')}-3333-4333-8333-333333333333`,
      nombre_paquete: `Paquete ${String(index + 1).padStart(2, '0')}`,
    })) } });
    render(<AdminPackagesCatalogPage />);
    await screen.findByText('Paquete 01');
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.queryByText('Paquete 11')).not.toBeInTheDocument();
    const callsBefore = packagesApi.listAdminPaquetes.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('Paquete 11')).toBeInTheDocument();
    expect(packagesApi.listAdminPaquetes).toHaveBeenCalledTimes(callsBefore);
  });

  test('presenta precio, estado, visibilidad y acciones propias de la sucursal', async () => {
    render(<AdminPackagesCatalogPage />);
    const list = await screen.findByRole('region', { name: 'Lista de paquetes' });
    expect(within(list).getByText('L 500.00')).toBeInTheDocument();
    expect(within(list).getByText('Activo')).toBeInTheDocument();
    expect(within(list).getByText('Visible')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Ver detalle' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Editar maestro' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Editar oferta' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Inactivar oferta' })).toBeInTheDocument();
  });

  test('conserva formulario y valores ante conflicto 409', async () => {
    packagesApi.updateAdminPaquete.mockRejectedValue({ data: { error: { code: 'CATALOG_PACKAGE_COMPOSITION_BRANCH_CONFLICT', message: 'La composición no está disponible en todas las sucursales.' } } });
    const dialog = await openMasterEditor();
    const nameInput = within(dialog).getByLabelText('Nombre del paquete maestro *');
    fireEvent.change(nameInput, { target: { value: 'Nombre conservado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La composición no está disponible en todas las sucursales.');
    expect(nameInput).toHaveValue('Nombre conservado');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('sucursales administrativas de la API', () => {
  const apiBranches = [{ id_sucursal: BRANCH, nombre_sucursal: 'Centro', estado: true }, { id_sucursal: BRANCH_B, nombre_sucursal: 'Norte', estado: true }];
  test('admin A + barbero B autoselecciona A solo despues de la API', async () => {
    authState.roles = ['admin', 'barbero']; authState.branchIds = [BRANCH, BRANCH_B];
    const pending = deferred(); branchesApi.listAdminSucursales.mockReturnValueOnce(pending.promise);
    render(<AdminPackagesCatalogPage />);
    expect(packagesApi.listAdminPaquetes).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ data: { sucursales: [apiBranches[0]] } }));
    await screen.findByText('Paquete base');
    expect(screen.getByText('Sucursal activa:')).toBeInTheDocument();
    expect(packagesApi.listAdminPaquetes.mock.calls.every(([args]) => args.id_sucursal === BRANCH)).toBe(true);
    expect(screen.queryByRole('option', { name: 'Norte' })).not.toBeInTheDocument();
  });

  test('API A+B requiere seleccion aunque branchIds tenga solo A', async () => {
    branchesApi.listAdminSucursales.mockResolvedValue({ data: { sucursales: apiBranches } });
    render(<AdminPackagesCatalogPage />);
    await screen.findByRole('option', { name: 'Norte' });
    expect(packagesApi.listAdminPaquetes).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nuevo maestro' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_B } });
    await screen.findByText('Paquete base');
    expect(packagesApi.listAdminPaquetes).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B });
  });

  test('super_admin + admin A conserva todas las opciones', async () => {
    authState.roles = ['super_admin', 'admin']; authState.branchIds = [BRANCH];
    render(<AdminPackagesCatalogPage />);
    await screen.findByRole('option', { name: 'Norte' });
    expect(screen.getByRole('option', { name: 'Todas las sucursales' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_B } });
    await waitFor(() => expect(packagesApi.listAdminPaquetes).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B }));
  });

  test.each(['admin', 'super_admin'])('API vacia bloquea acciones pese a branchIds: %s', async (role) => {
    authState.roles = [role];
    authState.branchIds = [BRANCH, BRANCH_B];
    branchesApi.listAdminSucursales.mockResolvedValue({ data: { sucursales: [] } });
    render(<AdminPackagesCatalogPage />);
    await screen.findByRole('combobox', { name: 'Sucursal' });
    expect(screen.getByRole('button', { name: 'Nuevo maestro' })).toBeDisabled();
    expect(packagesApi.listAdminPaquetes).not.toHaveBeenCalled();
    expect(catalogApi.listAdminServicios).not.toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: 'Centro' })).not.toBeInTheDocument();
  });

  test.each(['resolve', 'reject'])('cambio de permisos descarta sucursales antiguas: %s', async (outcome) => {
    authState.roles = ['admin', 'barbero']; authState.branchIds = [BRANCH, BRANCH_B];
    const old = deferred();
    branchesApi.listAdminSucursales.mockReturnValueOnce(old.promise).mockResolvedValue({ data: { sucursales: [apiBranches[1]] } });
    const view = render(<AdminPackagesCatalogPage />);
    authState.branchIds = [BRANCH_B]; view.rerender(<AdminPackagesCatalogPage />);
    await screen.findByText('Paquete base');
    await act(async () => outcome === 'resolve' ? old.resolve({ data: { sucursales: [apiBranches[0]] } }) : old.reject(new Error('anterior')));
    expect(packagesApi.listAdminPaquetes).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B });
    expect(screen.getByRole('button', { name: 'Nuevo maestro' })).toBeEnabled();
    expect(notifications.error).not.toHaveBeenCalled();
  });

  test('revocar alcance elimina seleccion y datos anteriores', async () => {
    const view = render(<AdminPackagesCatalogPage />); await screen.findByText('Paquete base');
    branchesApi.listAdminSucursales.mockResolvedValue({ data: { sucursales: [] } });
    authState.branchIds = [BRANCH, BRANCH_B]; view.rerender(<AdminPackagesCatalogPage />);
    await screen.findByRole('combobox', { name: 'Sucursal' });
    expect(screen.queryByText('Paquete base')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo maestro' })).toBeDisabled();
    expect(screen.getByLabelText('Sucursal')).toHaveValue('');
  });

  test('cambio de cuenta con los mismos claims recarga el alcance administrativo', async () => {
    authState.roles = ['admin', 'barbero']; authState.branchIds = [BRANCH, BRANCH_B];
    authState.user = { id_usuario: 'administrador-A' };
    branchesApi.listAdminSucursales.mockResolvedValue({ data: { sucursales: [apiBranches[0]] } });
    const view = render(<AdminPackagesCatalogPage />); await screen.findByText('Paquete base');
    branchesApi.listAdminSucursales.mockResolvedValue({ data: { sucursales: [apiBranches[1]] } });
    authState.user = { id_usuario: 'administrador-B' }; view.rerender(<AdminPackagesCatalogPage />);
    await waitFor(() => expect(packagesApi.listAdminPaquetes).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B }));
    expect(branchesApi.listAdminSucursales).toHaveBeenCalledTimes(2);
  });
});

test.each(['maestro', 'oferta'])('QA-UX conserva cambios de paquete %s sin escribir al cancelar', async (kind) => {
  let dialog;
  if (kind === 'maestro') dialog = await openMasterEditor();
  else {
    render(<AdminPackagesCatalogPage />);
    await screen.findByText('Paquete base');
    fireEvent.click(screen.getByRole('button', { name: 'Editar oferta', exact: true }));
    dialog = screen.getByRole('dialog');
  }
  const label = kind === 'maestro' ? 'Nombre del paquete maestro *' : 'Precio HNL de la oferta *';
  const value = kind === 'maestro' ? 'Paquete pendiente' : '590';
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Seguir editando' }));
  expect(String(within(screen.getByRole('dialog')).getByLabelText(label).value)).toBe(value);
  expect(packagesApi.updateAdminPaquete).not.toHaveBeenCalled();
});
