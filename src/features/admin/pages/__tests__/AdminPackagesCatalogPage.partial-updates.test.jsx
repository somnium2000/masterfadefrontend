// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  authState.branchIds = [BRANCH];
  authState.roles = ['admin'];
  navigateMock.mockReset();
  Object.values(packagesApi).forEach((mock) => mock.mockReset());
  Object.values(notifications).forEach((mock) => mock.mockReset());
  catalogApi.listAdminServicios.mockReset();
  branchesApi.listAdminSucursales.mockReset();
  packagesApi.listAdminPaquetes.mockResolvedValue({ data: { paquetes: [originalPackage] } });
  packagesApi.updateAdminPaquete.mockResolvedValue({ data: originalPackage });
  branchesApi.listAdminSucursales.mockResolvedValue({ data: { sucursales: [
    { id_sucursal: BRANCH, nombre_sucursal: 'Centro', estado: true },
    { id_sucursal: BRANCH_B, nombre_sucursal: 'Norte', estado: true },
  ] } });
  catalogApi.listAdminServicios.mockResolvedValue({ data: { servicios: [
    { id_servicio: SERVICE_A, id_sucursal: BRANCH, nombre_servicio: 'Servicio A', activo: true, precio_hnl: 200 },
    { id_servicio: SERVICE_B, id_sucursal: BRANCH, nombre_servicio: 'Servicio B', activo: true, precio_hnl: 300 },
  ] } });
});

afterEach(() => cleanup());

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
