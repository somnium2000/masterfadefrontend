// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NotificationProvider, useNotifications } from '../../../../context/NotificationsContext.jsx';
import Page from '../AdminPackagesCatalogPage.jsx';

const api = vi.hoisted(() => ({ listAdminPaquetes: vi.fn(), createAdminPaquete: vi.fn(), updateAdminPaquete: vi.fn(), setAdminPaqueteEstado: vi.fn() }));
const branches = vi.hoisted(() => vi.fn());
const services = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id_usuario: 'qa-user' }, roles: ['super_admin'], branchIds: [] }) }));
vi.mock('../../lib/adminSucursalesApi.js', () => ({ listAdminSucursales: branches }));
vi.mock('../../lib/adminPackagesApi.js', () => api);
vi.mock('../../lib/adminCatalogApi.js', () => ({ listAdminServicios: services }));
vi.mock('../../../../lib/catalogSync.js', () => ({ emitCatalogSync: vi.fn() }));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const row = { id_paquete: '33333333-3333-4333-8333-333333333333', id_sucursal: A, nombre_paquete: 'QA paquete',
  descripcion: 'Inicial', precio_hnl: 500, activo: true, visible_publico: false, orden_visual: 1,
  items: [1, 2].map(n => ({ id_servicio: `${n}1111111-1111-4111-8111-111111111111`, nombre_servicio: `QA servicio ${n}`, cantidad: 1 })) };
function OtherNotification() {
  const { info } = useNotifications();
  return <button onClick={() => info('Carga asíncrona completada')}>Notificación asíncrona</button>;
}
beforeEach(() => {
  vi.clearAllMocks();
  branches.mockResolvedValue({ data: { sucursales: [
    { id_sucursal: A, nombre_sucursal: 'QA A', estado: true },
    { id_sucursal: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombre_sucursal: 'QA B', estado: true },
  ] } });
  api.listAdminPaquetes.mockResolvedValue({ data: { paquetes: [row] } });
  api.updateAdminPaquete.mockResolvedValue({ data: row });
  services.mockResolvedValue({ data: { servicios: [] } });
});
afterEach(cleanup);
async function edit() {
  render(<NotificationProvider><OtherNotification /><Page /></NotificationProvider>);
  await screen.findByText('QA paquete');
  fireEvent.click(screen.getByRole('button', { name: 'Editar maestro' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar paquete maestro' });
  fireEvent.change(within(dialog).getByLabelText('Descripcion'), { target: { value: 'Cambio pendiente' } });
  return dialog;
}
test.each([0, 500])('error %s con NotificationProvider real conserva datos, alcance y reintento', async (status) => {
  api.updateAdminPaquete.mockRejectedValueOnce({ status, code: status === 0 ? 'NETWORK_UNAVAILABLE' : 'QA_ERROR' });
  const dialog = await edit();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Editar paquete maestro' })).getByText('No se pudo completar la operación de paquetes.')).toBeInTheDocument());
  expect(within(dialog).getByLabelText('Descripcion')).toHaveValue('Cambio pendiente');
  expect(branches).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Seguir editando' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.updateAdminPaquete).toHaveBeenLastCalledWith(row.id_paquete, expect.objectContaining({ descripcion: 'Cambio pendiente' }));
  expect(branches).toHaveBeenCalledTimes(1);
});
test('notificación asíncrona no invalida el editor ni el guardado pendiente', async () => {
  let resolve;
  api.updateAdminPaquete.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const dialog = await edit();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  fireEvent.click(screen.getByText('Notificación asíncrona'));
  await act(async () => {});
  expect(screen.getByRole('dialog', { name: 'Editar paquete maestro' })).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Descripcion')).toHaveValue('Cambio pendiente');
  expect(branches).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ data: row }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(branches).toHaveBeenCalledTimes(1);
});
