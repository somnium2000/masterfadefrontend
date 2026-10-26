// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import AdminServicesCatalogPage from '../AdminServicesCatalogPage.jsx';

const BRANCH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const authState = vi.hoisted(() => ({ branchIds: [], roles: ['super_admin'] }));
const navigateMock = vi.hoisted(() => vi.fn());
const notificationMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
const catalogApiMock = vi.hoisted(() => ({
  listAdminServiciosAgrupados: vi.fn(),
  createAdminServicio: vi.fn(),
  updateAdminServicio: vi.fn(),
  updateAdminServicioTarifa: vi.fn(),
  createAdminServicioTarifa: vi.fn(),
  setAdminServicioEstado: vi.fn(),
  deactivateAdminServicioTarifa: vi.fn(),
  deactivateAdminServicioGlobal: vi.fn(),
  getAdminServicioBarberos: vi.fn(),
  saveAdminServicioBarberos: vi.fn(),
  SERVICE_BARBER_ASSIGNMENTS_ENABLED: false,
}));
const branchesApiMock = vi.hoisted(() => ({ listAdminSucursales: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => authState }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notificationMock }));
vi.mock('../../lib/adminCatalogApi.js', () => catalogApiMock);
vi.mock('../../lib/adminSucursalesApi.js', () => branchesApiMock);
vi.mock('../../../../lib/catalogSync.js', () => ({ emitCatalogSync: vi.fn() }));

const branches = [
  { id_sucursal: BRANCH_A, nombre_sucursal: 'MasterFade Centro', estado: true },
  { id_sucursal: BRANCH_B, nombre_sucursal: 'MasterFade Norte', estado: true },
];

function service(overrides = {}) {
  return {
    id_servicio: '11111111-1111-4111-8111-111111111111',
    nombre_servicio: 'Corte clásico',
    descripcion: 'Corte tradicional con acabado profesional',
    activo: true,
    visible_publico: true,
    agendable: true,
    orden_visual: 10,
    tarifas: [
      { id_tarifa: '21111111-1111-4111-8111-111111111111', id_sucursal: BRANCH_A, nombre_sucursal: 'MasterFade Centro', precio_hnl: 250, duracion_min: 30, buffer_min: 5, tarifa_activa: true, servicio_informativo: false },
      { id_tarifa: '31111111-1111-4111-8111-111111111111', id_sucursal: BRANCH_B, nombre_sucursal: 'MasterFade Norte', precio_hnl: 300, duracion_min: 40, buffer_min: 10, tarifa_activa: true, servicio_informativo: false },
    ],
    ...overrides,
  };
}

function setServices(items) {
  catalogApiMock.listAdminServiciosAgrupados.mockResolvedValue({ data: { servicios: items } });
}

async function renderLoaded() {
  const view = render(<AdminServicesCatalogPage />);
  await screen.findByText('Corte clásico');
  return view;
}

beforeEach(() => {
  authState.user = null;
  authState.branchIds = [];
  authState.roles = ['super_admin'];
  navigateMock.mockReset();
  Object.values(notificationMock).forEach((mock) => mock.mockReset());
  Object.values(catalogApiMock).filter((value) => typeof value?.mockReset === 'function').forEach((mock) => mock.mockReset());
  branchesApiMock.listAdminSucursales.mockReset();
  branchesApiMock.listAdminSucursales.mockImplementation(async () => ({ data: { sucursales: branches.filter((branch) =>
    authState.roles.includes('super_admin') || authState.branchIds.includes(branch.id_sucursal)) } }));
  setServices([
    service(),
    service({ id_servicio: '12222222-2222-4222-8222-222222222222', nombre_servicio: 'Barba ejecutiva', descripcion: 'Perfilado y acabado', activo: false, visible_publico: false, agendable: false }),
  ]);
});

afterEach(() => cleanup());

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe('alcance y concurrencia de servicios administrativos', () => {
  test('A tardía no sustituye los servicios de B', async () => {
    await renderLoaded();
    const a = deferred();
    catalogApiMock.listAdminServiciosAgrupados.mockReturnValueOnce(a.promise)
      .mockResolvedValueOnce({ data: { servicios: [service({ nombre_servicio: 'Servicio B' })] } });
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_A } });
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_B } });
    await screen.findByText('Servicio B');
    await act(async () => a.resolve({ data: { servicios: [service({ nombre_servicio: 'Servicio A viejo' })] } }));
    expect(screen.getByText('Servicio B')).toBeInTheDocument();
    expect(screen.queryByText('Servicio A viejo')).not.toBeInTheDocument();
  });

  test.each([500, 401, 403])('error tardío A (%s) no reemplaza B ni navega', async (status) => {
    await renderLoaded();
    const a = deferred();
    catalogApiMock.listAdminServiciosAgrupados.mockReturnValueOnce(a.promise)
      .mockResolvedValueOnce({ data: { servicios: [service({ nombre_servicio: 'Servicio B' })] } });
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_A } });
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_B } });
    await screen.findByText('Servicio B');
    await act(async () => a.reject({ status }));
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByText('Servicio B')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('A antigua no libera loading mientras B está pendiente', async () => {
    await renderLoaded();
    const a = deferred();
    const b = deferred();
    catalogApiMock.listAdminServiciosAgrupados.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_A } });
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_B } });
    await act(async () => a.resolve({ data: { servicios: [] } }));
    expect(screen.getAllByText('Cargando...').length).toBeGreaterThan(0);
    await act(async () => b.resolve({ data: { servicios: [service({ nombre_servicio: 'Servicio B' })] } }));
    expect(screen.getByText('Servicio B')).toBeInTheDocument();
  });

  test('desmontaje descarta error tardío sin navegación', async () => {
    const pending = deferred();
    catalogApiMock.listAdminServiciosAgrupados.mockReturnValueOnce(pending.promise);
    const view = render(<AdminServicesCatalogPage />);
    await waitFor(() => expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalled());
    view.unmount();
    await act(async () => pending.reject({ status: 401 }));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('admin múltiple requiere sucursal, no ofrece Todas ni acciones globales', async () => {
    authState.roles = ['admin'];
    authState.branchIds = [BRANCH_A, BRANCH_B];
    render(<AdminServicesCatalogPage />);
    await screen.findByRole('option', { name: 'MasterFade Centro' });
    expect(screen.queryByRole('option', { name: 'Todas las sucursales' })).not.toBeInTheDocument();
    expect(screen.getByText('Selecciona una sucursal', { selector: 'p' })).toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nuevo', exact: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_A } });
    await screen.findByText('Corte clásico');
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: '' } });
    expect(screen.queryByText('Corte clásico')).not.toBeInTheDocument();
    expect(screen.queryByText('Desactivar globalmente')).not.toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalledTimes(1);
  });

  test('superadmin conserva Todas y consulta global', async () => {
    await renderLoaded();
    expect(screen.getByRole('option', { name: 'Todas las sucursales' })).toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalledExactlyOnceWith({});
  });

  test('admin sin selección descarta resultado pendiente de la sucursal anterior', async () => {
    authState.roles = ['admin'];
    authState.branchIds = [BRANCH_A, BRANCH_B];
    const pending = deferred();
    catalogApiMock.listAdminServiciosAgrupados.mockReturnValueOnce(pending.promise);
    render(<AdminServicesCatalogPage />);
    await screen.findByRole('option', { name: 'MasterFade Centro' });
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_A } });
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: '' } });
    await act(async () => pending.resolve({ data: { servicios: [service()] } }));
    expect(screen.queryByText('Corte clásico')).not.toBeInTheDocument();
    expect(screen.getByText('Selecciona una sucursal', { selector: 'p' })).toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalledExactlyOnceWith({ id_sucursal: BRANCH_A });
  });

  test('StrictMode conserva listado vigente y descarta solicitud del montaje anterior', async () => {
    const stale = deferred();
    branchesApiMock.listAdminSucursales.mockReturnValueOnce(stale.promise).mockResolvedValue({ data: { sucursales: branches } });
    catalogApiMock.listAdminServiciosAgrupados.mockResolvedValue({ data: { servicios: [service({ nombre_servicio: 'Vigente' })] } });
    render(<StrictMode><AdminServicesCatalogPage /></StrictMode>);
    await screen.findByText('Vigente');
    await act(async () => stale.resolve({ data: { sucursales: [branches[0]] } }));
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    expect(screen.queryByText('Antiguo')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'MasterFade Norte' })).toBeInTheDocument();
  });

  test('admin sin sucursales autorizadas no recibe opciones ajenas ni consulta global', async () => {
    authState.roles = ['admin'];
    render(<AdminServicesCatalogPage />);
    await screen.findByRole('combobox', { name: 'Sucursal' });
    await waitFor(() => expect(branchesApiMock.listAdminSucursales).toHaveBeenCalled());
    expect(screen.queryByRole('option', { name: 'MasterFade Centro' })).not.toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).not.toHaveBeenCalled();
  });

  test('crear servicio conserva payload por sucursal y refresca catálogo', async () => {
    catalogApiMock.createAdminServicio.mockResolvedValue({ data: {} });
    await renderLoaded();
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_A } });
    await waitFor(() => expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_A }));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo', exact: true }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nombre del servicio *'), { target: { value: 'Nuevo corte' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Precio HNL'), { target: { value: '275' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Duración min'), { target: { value: '35' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear servicio' }));
    await waitFor(() => expect(catalogApiMock.createAdminServicio).toHaveBeenCalledExactlyOnceWith({
      nombre_servicio: 'Nuevo corte', descripcion: null, orden_visual: 100,
      visible_publico: true, agendable: true, activo: true,
      sucursales: [{ id_sucursal: BRANCH_A, precio_hnl: 275, duracion_min: 35, buffer_min: 5, activo: true, servicio_informativo: false }],
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalledTimes(3);
  });

  test('editar maestro conserva alcance y no actualiza tarifas', async () => {
    catalogApiMock.updateAdminServicio.mockResolvedValue({ data: {} });
    await renderLoaded();
    const menu = screen.getByLabelText('Acciones de Corte clásico').closest('details');
    fireEvent.click(within(menu).getByLabelText('Acciones de Corte clásico'));
    fireEvent.click(within(menu).getByRole('button', { name: 'Editar servicio global' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Descripción'), { target: { value: 'Descripción revisada' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(catalogApiMock.updateAdminServicio).toHaveBeenCalledExactlyOnceWith(
      service().id_servicio, { nombre_servicio: 'Corte clásico', descripcion: 'Descripción revisada',
        orden_visual: 10, visible_publico: true, agendable: true, id_sucursal: BRANCH_A },
    ));
    expect(catalogApiMock.updateAdminServicioTarifa).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('admin mantiene edición local de tarifa sin modificar maestro', async () => {
    authState.roles = ['admin'];
    authState.branchIds = [BRANCH_A];
    catalogApiMock.updateAdminServicioTarifa.mockResolvedValue({ data: {} });
    await renderLoaded();
    const menu = screen.getByLabelText('Acciones de Corte clásico').closest('details');
    fireEvent.click(within(menu).getByLabelText('Acciones de Corte clásico'));
    fireEvent.click(within(menu).getByRole('button', { name: 'Editar tarifa' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Precio HNL *'), { target: { value: '290' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar tarifa' }));
    await waitFor(() => expect(catalogApiMock.updateAdminServicioTarifa).toHaveBeenCalledExactlyOnceWith(
      service().id_servicio, BRANCH_A,
      { precio_hnl: 290, duracion_min: 30, buffer_min: 5, activo: true, servicio_informativo: false },
    ));
    expect(catalogApiMock.updateAdminServicio).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

for (const failure of [false, true]) test(`QA-UX guardado bloquea Escape y editor B conserva cambios tras instancia antigua A, error=${failure}`, async () => {
  let finish, reject;
  const pending = new Promise((resolve, fail) => { finish = resolve; reject = fail; });
  catalogApiMock.updateAdminServicio.mockReturnValue(pending);
  setServices([service(), service({ id_servicio: '22222222-2222-4222-8222-222222222222', nombre_servicio: 'Servicio B', descripcion: 'Texto B' })]);
  const view = await renderLoaded();
  const open = name => {
    const menu = screen.getByLabelText(`Acciones de ${name}`).closest('details');
    fireEvent.click(within(menu).getByLabelText(`Acciones de ${name}`));
    fireEvent.click(within(menu).getByRole('button', { name: 'Editar servicio global' }));
  };
  open('Corte clásico');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar cambios' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  view.unmount();
  await renderLoaded();
  open('Servicio B');
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Descripción'), { target: { value: 'B sin guardar' } });
  await act(async () => { if (failure) reject({ status: 401 }); else finish({ data: {} }); });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByLabelText('Descripción')).toHaveValue('B sin guardar');
  expect(notificationMock.success).not.toHaveBeenCalled(); expect(navigateMock).not.toHaveBeenCalled();
});

describe('presentación responsive del catálogo de servicios', () => {
  test('muestra lista por defecto y conserva los mismos registros al alternar tarjetas y lista', async () => {
    await renderLoaded();
    const list = screen.getByRole('region', { name: 'Lista de servicios' });
    expect(list).toHaveClass('@container');
    expect(screen.getByText('Corte clásico').closest('[role="row"]')).toHaveClass('@[54rem]:grid-cols-[minmax(220px,1.5fr)_minmax(220px,1fr)_minmax(260px,1.25fr)_auto]');
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Tarjetas' }));
    const cards = screen.getByRole('region', { name: 'Tarjetas de servicios' });
    expect(within(cards).getByText('Corte clásico')).toBeInTheDocument();
    expect(within(cards).getByText('Barba ejecutiva')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
    expect(screen.getByRole('region', { name: 'Lista de servicios' })).toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalledTimes(1);
  });

  test('aplica búsqueda y filtros sin solicitar nuevamente el catálogo', async () => {
    await renderLoaded();
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o descripcion...'), { target: { value: 'barba' } });
    expect(screen.queryByText('Corte clásico')).not.toBeInTheDocument();
    expect(screen.getByText('Barba ejecutiva')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getAllByRole('combobox')[0], { target: { value: 'activo' } });
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cerrar' })[0]);
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalledTimes(1);
  });

  test('cambia de sucursal y muestra precio, duración y buffer de la tarifa seleccionada', async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_B } });
    await waitFor(() => expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B }));
    expect((await screen.findAllByText('L 300.00')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('40 min').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10 min').length).toBeGreaterThan(0);
  });

  test('diferencia estados globales, servicio informativo y maestro compartido', async () => {
    await renderLoaded();
    const activeRow = screen.getByText('Corte clásico').closest('[role="row"]');
    expect(within(activeRow).getByText('Activo')).toBeInTheDocument();
    expect(within(activeRow).getByText('Visible')).toBeInTheDocument();
    expect(within(activeRow).getByText('Disponible en 2 sucursales')).toBeInTheDocument();

    const inactiveRow = screen.getByText('Barba ejecutiva').closest('[role="row"]');
    expect(within(inactiveRow).getByText('Inactivo')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('Oculto')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('Informativo')).toBeInTheDocument();
  });

  test('mantiene acciones y confirmación destructiva existentes', async () => {
    catalogApiMock.deactivateAdminServicioGlobal.mockResolvedValue({ data: {} });
    await renderLoaded();
    const actionMenu = screen.getByLabelText('Acciones de Corte clásico').closest('details');
    fireEvent.click(within(actionMenu).getByLabelText('Acciones de Corte clásico'));
    expect(within(actionMenu).getByRole('button', { name: 'Editar servicio global' }).parentElement).toHaveClass('max-w-[calc(100vw-2rem)]');
    fireEvent.click(within(actionMenu).getByRole('button', { name: 'Desactivar globalmente' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Desactivar globalmente');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar globalmente' }));
    await waitFor(() => expect(catalogApiMock.deactivateAdminServicioGlobal).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111'));
  });

  test('representa listado vacío y fallo HTTP', async () => {
    setServices([]);
    const { unmount } = render(<AdminServicesCatalogPage />);
    expect(await screen.findByText('Sin servicios')).toBeInTheDocument();
    unmount();

    catalogApiMock.listAdminServiciosAgrupados.mockRejectedValue({ status: 500 });
    render(<AdminServicesCatalogPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la operación de servicios.');
  });

  test('presenta estado de carga sin datos obsoletos', async () => {
    let resolveRequest;
    catalogApiMock.listAdminServiciosAgrupados.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<AdminServicesCatalogPage />);
    expect((await screen.findAllByText('Cargando...')).length).toBeGreaterThan(0);
    resolveRequest({ data: { servicios: [service()] } });
    expect(await screen.findByText('Corte clásico')).toBeInTheDocument();
  });

  test('admite textos largos y pagina localmente sin nuevas solicitudes', async () => {
    const longName = `Servicio ${'muy largo '.repeat(12)}`.trim();
    const items = Array.from({ length: 11 }, (_, index) => service({
      id_servicio: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      nombre_servicio: index === 0 ? longName : `Servicio ${index + 1}`,
      descripcion: index === 0 ? 'Descripción extensa '.repeat(20) : `Descripción ${index + 1}`,
    }));
    setServices(items);
    render(<AdminServicesCatalogPage />);
    expect(await screen.findByText(longName)).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1-10 de 11')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Mostrando 11-11 de 11')).toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalledTimes(1);
  });

  test('conserva el alcance de sucursal para admin sin ampliar roles', async () => {
    authState.branchIds = [BRANCH_A];
    authState.roles = ['admin'];
    await renderLoaded();
    expect(screen.queryByLabelText('Sucursal')).not.toBeInTheDocument();
    expect(screen.getByText('Sucursal activa:')).toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenCalledWith({ id_sucursal: BRANCH_A });
  });
});

describe('sucursales administrativas de la API', () => {
  test('admin A + barbero B espera la API y autoselecciona solamente A', async () => {
    authState.roles = ['admin', 'barbero']; authState.branchIds = [BRANCH_A, BRANCH_B];
    const pending = deferred();
    branchesApiMock.listAdminSucursales.mockReturnValueOnce(pending.promise);
    render(<AdminServicesCatalogPage />);
    expect(catalogApiMock.listAdminServiciosAgrupados).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ data: { sucursales: [branches[0]] } }));
    await screen.findByText('Corte clásico');
    expect(screen.getByText('Sucursal activa:')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'MasterFade Norte' })).not.toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados.mock.calls.every(([args]) => args.id_sucursal === BRANCH_A)).toBe(true);
  });

  test('API A+B exige seleccion explicita aunque branchIds tenga solo A', async () => {
    authState.roles = ['admin']; authState.branchIds = [BRANCH_A];
    branchesApiMock.listAdminSucursales.mockResolvedValue({ data: { sucursales: branches } });
    render(<AdminServicesCatalogPage />);
    await screen.findByRole('option', { name: 'MasterFade Norte' });
    expect(catalogApiMock.listAdminServiciosAgrupados).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nuevo', exact: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_B } });
    await screen.findByText('Corte clásico');
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B });
  });

  test('super_admin + admin A conserva todas las opciones de la API', async () => {
    authState.roles = ['super_admin', 'admin']; authState.branchIds = [BRANCH_A];
    await renderLoaded();
    expect(screen.getByRole('option', { name: 'Todas las sucursales' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'MasterFade Norte' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_B } });
    await waitFor(() => expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B }));
  });

  test.each(['admin', 'super_admin'])('API vacia bloquea acciones aunque existan branchIds: %s', async (role) => {
    authState.roles = [role]; authState.branchIds = [BRANCH_A, BRANCH_B];
    branchesApiMock.listAdminSucursales.mockResolvedValue({ data: { sucursales: [] } });
    render(<AdminServicesCatalogPage />);
    await screen.findByRole('combobox', { name: 'Sucursal' });
    expect(screen.getByRole('button', { name: 'Nuevo', exact: true })).toBeDisabled();
    expect(screen.queryByRole('option', { name: 'MasterFade Centro' })).not.toBeInTheDocument();
    expect(catalogApiMock.listAdminServiciosAgrupados).not.toHaveBeenCalled();
  });

  test.each(['resolve', 'reject'])('cambio de permisos descarta sucursales antiguas: %s', async (outcome) => {
    authState.roles = ['admin', 'barbero']; authState.branchIds = [BRANCH_A, BRANCH_B];
    const old = deferred();
    branchesApiMock.listAdminSucursales.mockReturnValueOnce(old.promise).mockResolvedValue({ data: { sucursales: [branches[1]] } });
    const view = render(<AdminServicesCatalogPage />);
    authState.branchIds = [BRANCH_B];
    view.rerender(<AdminServicesCatalogPage />);
    await screen.findByText('Corte clásico');
    await act(async () => outcome === 'resolve' ? old.resolve({ data: { sucursales: [branches[0]] } }) : old.reject(new Error('anterior')));
    expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B });
    expect(screen.getByRole('button', { name: 'Nuevo', exact: true })).toBeEnabled();
    expect(notificationMock.error).not.toHaveBeenCalled();
  });

  test('revocar el alcance elimina seleccion y formularios anteriores', async () => {
    authState.roles = ['admin']; authState.branchIds = [BRANCH_A];
    const view = render(<AdminServicesCatalogPage />);
    await screen.findByText('Corte clásico');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo', exact: true }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    branchesApiMock.listAdminSucursales.mockResolvedValue({ data: { sucursales: [] } });
    authState.branchIds = [BRANCH_A, BRANCH_B];
    view.rerender(<AdminServicesCatalogPage />);
    await screen.findByRole('combobox', { name: 'Sucursal' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Corte clásico')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo', exact: true })).toBeDisabled();
    expect(screen.getByLabelText('Sucursal')).toHaveValue('');
  });

  test('cambio de cuenta con los mismos claims recarga el alcance administrativo', async () => {
    authState.roles = ['admin', 'barbero']; authState.branchIds = [BRANCH_A, BRANCH_B];
    authState.user = { id_usuario: 'cliente-administrativo-A' };
    branchesApiMock.listAdminSucursales.mockResolvedValue({ data: { sucursales: [branches[0]] } });
    const view = render(<AdminServicesCatalogPage />); await screen.findByText('Corte clásico');
    branchesApiMock.listAdminSucursales.mockResolvedValue({ data: { sucursales: [branches[1]] } });
    authState.user = { id_usuario: 'cliente-administrativo-B' };
    view.rerender(<AdminServicesCatalogPage />);
    await waitFor(() => expect(catalogApiMock.listAdminServiciosAgrupados).toHaveBeenLastCalledWith({ id_sucursal: BRANCH_B }));
    expect(branchesApiMock.listAdminSucursales).toHaveBeenCalledTimes(2);
  });
});

test.each(['servicio', 'tarifa'])('QA-UX conserva %s al cancelar y seguir editando', async (kind) => {
  await renderLoaded();
  if (kind === 'tarifa') await act(async () => fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: BRANCH_A } }));
  const menu = screen.getByLabelText('Acciones de Corte clásico').closest('details');
  fireEvent.click(within(menu).getByLabelText('Acciones de Corte clásico'));
  fireEvent.click(within(menu).getByRole('button', { name: kind === 'tarifa' ? 'Editar tarifa' : 'Editar servicio global' }));
  const dialog = screen.getByRole('dialog');
  const label = kind === 'tarifa' ? 'Precio HNL *' : 'Descripción';
  const value = kind === 'tarifa' ? '390' : 'Cambio pendiente';
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Seguir editando' }));
  expect(String(within(screen.getByRole('dialog')).getByLabelText(label).value)).toBe(value);
  expect(catalogApiMock.updateAdminServicio).not.toHaveBeenCalled();
  expect(catalogApiMock.updateAdminServicioTarifa).not.toHaveBeenCalled();
});

test('QA-UX detecta cambios de tarifa inicial aunque el maestro del servicio siga vacío', async () => {
  await renderLoaded();
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo', exact: true }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByPlaceholderText('Precio HNL'), { target: { value: '390' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Seguir editando' }));
  expect(within(screen.getByRole('dialog')).getByPlaceholderText('Precio HNL')).toHaveValue(390);
  expect(catalogApiMock.createAdminServicio).not.toHaveBeenCalled();
});
