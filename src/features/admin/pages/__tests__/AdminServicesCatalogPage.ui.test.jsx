// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
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
  render(<AdminServicesCatalogPage />);
  await screen.findByText('Corte clásico');
}

beforeEach(() => {
  authState.branchIds = [];
  authState.roles = ['super_admin'];
  navigateMock.mockReset();
  Object.values(notificationMock).forEach((mock) => mock.mockReset());
  Object.values(catalogApiMock).filter((value) => typeof value?.mockReset === 'function').forEach((mock) => mock.mockReset());
  branchesApiMock.listAdminSucursales.mockReset();
  branchesApiMock.listAdminSucursales.mockResolvedValue({ data: { sucursales: branches } });
  setServices([
    service(),
    service({ id_servicio: '12222222-2222-4222-8222-222222222222', nombre_servicio: 'Barba ejecutiva', descripcion: 'Perfilado y acabado', activo: false, visible_publico: false, agendable: false }),
  ]);
});

afterEach(() => cleanup());

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
