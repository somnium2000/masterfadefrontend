// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NotificationProvider, useNotifications } from '../../../../context/NotificationsContext.jsx';
import Page from '../AdminServicesCatalogPage.jsx';

const api = vi.hoisted(() => ({ listAdminServiciosAgrupados: vi.fn(), updateAdminServicio: vi.fn() }));
const branches = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: { id_usuario: 'qa-user' }, roles: ['super_admin'], branchIds: [] }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../lib/adminSucursalesApi.js', () => ({ listAdminSucursales: branches }));
vi.mock('../../lib/adminCatalogApi.js', () => ({ ...api, SERVICE_BARBER_ASSIGNMENTS_ENABLED: false,
  createAdminServicio: vi.fn(), updateAdminServicioTarifa: vi.fn(), createAdminServicioTarifa: vi.fn(),
  setAdminServicioEstado: vi.fn(), deactivateAdminServicioTarifa: vi.fn(), deactivateAdminServicioGlobal: vi.fn(),
  getAdminServicioBarberos: vi.fn(), saveAdminServicioBarberos: vi.fn(),
}));
vi.mock('../../../../lib/catalogSync.js', () => ({ emitCatalogSync: vi.fn() }));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const row = { id_servicio: '11111111-1111-4111-8111-111111111111', nombre_servicio: 'QA servicio',
  descripcion: 'Inicial', orden_visual: 1, activo: true, visible_publico: false, agendable: false,
  tarifas: [{ id_sucursal: A, tarifa_activa: true, precio_hnl: 123, duracion_min: 25, buffer_min: 7 }] };
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
  api.listAdminServiciosAgrupados.mockResolvedValue({ data: { servicios: [row] } });
  api.updateAdminServicio.mockResolvedValue({ data: row });
});
afterEach(cleanup);
async function edit() {
  render(<NotificationProvider><OtherNotification /><Page /></NotificationProvider>);
  await screen.findByText('QA servicio');
  fireEvent.click(screen.getByRole('button', { name: 'Editar servicio global' }));
  const dialog = screen.getByRole('dialog', { name: 'Editar servicio' });
  fireEvent.change(within(dialog).getByLabelText('Descripción'), { target: { value: 'Cambio pendiente' } });
  return dialog;
}
test.each([0, 500])('error %s con notificaciones reales conserva formulario, alcance y reintento', async (status) => {
  api.updateAdminServicio.mockRejectedValueOnce({ status, code: status === 0 ? 'NETWORK_UNAVAILABLE' : 'QA_ERROR' });
  const dialog = await edit();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Editar servicio' })).getByText('No se pudo completar la operación de servicios.')).toBeInTheDocument());
  expect(within(dialog).getByLabelText('Descripción')).toHaveValue('Cambio pendiente');
  expect(branches).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Seguir editando' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.updateAdminServicio).toHaveBeenLastCalledWith(row.id_servicio, expect.objectContaining({ descripcion: 'Cambio pendiente' }));
  expect(branches).toHaveBeenCalledTimes(1);
});
test('notificación asíncrona no recarga sucursales ni invalida guardado pendiente', async () => {
  let resolve;
  api.updateAdminServicio.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const dialog = await edit();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  fireEvent.click(screen.getByText('Notificación asíncrona'));
  await act(async () => {});
  expect(screen.getByRole('dialog', { name: 'Editar servicio' })).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Descripción')).toHaveValue('Cambio pendiente');
  expect(branches).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ data: row }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(branches).toHaveBeenCalledTimes(1);
});
