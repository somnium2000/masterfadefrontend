// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminClientesPage.jsx';

const api = vi.hoisted(() => Object.fromEntries(['activateAdminPersonaCliente', 'createAdminPersonaCliente', 'getAdminPersonaCliente', 'inactivateAdminPersonaCliente', 'listAdminPersonasCatalogos', 'listAdminPersonasClientes', 'updateAdminPersonaCliente'].map((key) => [key, vi.fn()])));
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../lib/adminPersonasApi.js', () => api);
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));

const client = (id = 'A') => ({ id_cliente: id, nombres: `Cliente ${id}`, apellidos: 'Sintetico', nombre_completo: `Cliente ${id} Sintetico`, correo_principal: `${id.toLowerCase()}@example.test`, dni: '0801199012345', telefono_principal: '99990000', tiene_acceso: true, estado_cliente: true, estado_acceso: 'activo' });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const dialog = () => screen.getByRole('dialog');
async function edit(id = 'A') {
  const row = (await screen.findByText(`Cliente ${id} Sintetico`)).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: 'Editar' }));
  await screen.findByDisplayValue(`Cliente ${id}`);
}
beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  Object.values(notices).forEach((mock) => mock.mockReset());
  navigate.mockReset();
  localStorage.setItem('mf-view-clientes', 'table');
  api.listAdminPersonasClientes.mockResolvedValue({ data: { clientes: [client(), client('B')] } });
  api.listAdminPersonasCatalogos.mockResolvedValue({ data: { sucursales: [] } });
  api.getAdminPersonaCliente.mockImplementation((id) => Promise.resolve({ data: { cliente: client(id) } }));
  api.updateAdminPersonaCliente.mockResolvedValue({ data: { cliente: client() } });
});
afterEach(cleanup);

test.each(['resolve', 'reject'])('guardar A y abrir B: resultado tardío %s no cierra ni contamina B', async (outcome) => {
  const pending = deferred(); api.updateAdminPersonaCliente.mockReturnValue(pending.promise);
  render(<Page />); await edit();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Actualizar cliente' }));
  fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
  await edit('B');
  await act(async () => outcome === 'resolve' ? pending.resolve({ data: { cliente: client() } }) : pending.reject(new Error('connect ECONNREFUSED internal.test')));
  expect(screen.getByDisplayValue('Cliente B')).toBeInTheDocument();
  expect(notices.success).not.toHaveBeenCalled();
  expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
});

test('error técnico vigente se presenta como mensaje funcional seguro', async () => {
  api.updateAdminPersonaCliente.mockRejectedValue(new Error('connect ECONNREFUSED internal.test password=SYNTHETIC'));
  render(<Page />); await edit();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Actualizar cliente' }));
  expect(await screen.findByText('No se pudo completar la operacion de clientes. Intenta nuevamente.')).toBeInTheDocument();
  expect(screen.queryByText(/ECONNREFUSED|SYNTHETIC/)).not.toBeInTheDocument();
});

test('guardar pendiente y desmontar descarta avisos y revalidación', async () => {
  const pending = deferred(); api.updateAdminPersonaCliente.mockReturnValue(pending.promise);
  const view = render(<Page />); await edit();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Actualizar cliente' }));
  const count = api.listAdminPersonasClientes.mock.calls.length;
  view.unmount();
  await act(async () => pending.resolve({ data: { cliente: client() } }));
  expect(notices.success).not.toHaveBeenCalled();
  expect(api.listAdminPersonasClientes).toHaveBeenCalledTimes(count);
});

test('StrictMode, búsqueda por nombre y correo, edición correcta y doble clic', async () => {
  const pending = deferred(); api.updateAdminPersonaCliente.mockReturnValue(pending.promise);
  render(<StrictMode><Page /></StrictMode>);
  await screen.findByText('Cliente A Sintetico');
  const search = screen.getByPlaceholderText(/Buscar/);
  fireEvent.change(search, { target: { value: 'b@example.test' } });
  expect(screen.queryByText('Cliente A Sintetico')).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'Cliente A' } });
  await edit();
  const save = within(dialog()).getByRole('button', { name: 'Actualizar cliente' });
  act(() => { fireEvent.click(save); fireEvent.click(save); });
  expect(api.updateAdminPersonaCliente).toHaveBeenCalledTimes(1);
  expect(api.updateAdminPersonaCliente.mock.calls[0][0]).toBe('A');
  await act(async () => pending.resolve({ data: { cliente: client() } }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(notices.success).toHaveBeenCalledTimes(1);
});

test('detalle A tardío no sobrescribe editor B', async () => {
  const pending = deferred(); api.getAdminPersonaCliente.mockImplementation((id) => id === 'A' ? pending.promise : Promise.resolve({ data: { cliente: client(id) } }));
  render(<Page />);
  const row = (await screen.findByText('Cliente A Sintetico')).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: 'Ver detalle' }));
  await edit('B');
  await act(async () => pending.resolve({ data: { cliente: client() } }));
  expect(screen.getByDisplayValue('Cliente B')).toBeInTheDocument();
});

test('inactivación pendiente y desmontaje no emiten avisos posteriores', async () => {
  const pending = deferred(); api.inactivateAdminPersonaCliente.mockReturnValue(pending.promise);
  const view = render(<Page />);
  const row = (await screen.findByText('Cliente A Sintetico')).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: 'Inactivar' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Inactivar' }));
  view.unmount();
  await act(async () => pending.resolve({ data: { cliente: { ...client(), estado_cliente: false } } }));
  expect(notices.warning).not.toHaveBeenCalled();
});

test('paginación, estado vacío y reintento después de error de lista', async () => {
  api.listAdminPersonasClientes.mockRejectedValueOnce({ status: 503, message: 'internal synthetic' });
  api.listAdminPersonasClientes.mockResolvedValue({ data: { clientes: Array.from({ length: 12 }, (_, i) => client(String(i))) } });
  render(<Page />);
  fireEvent.click(await screen.findByRole('button', { name: /Reintentar/ }));
  await screen.findByText('Cliente 0 Sintetico');
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByText('Cliente 10 Sintetico')).toBeInTheDocument();
  expect(screen.queryByText('Cliente 0 Sintetico')).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: 'inexistente' } });
  expect(screen.queryByText('Cliente 10 Sintetico')).not.toBeInTheDocument();
  expect(notices.success).not.toHaveBeenCalled();
});

test('creación valida obligatorios localmente y cancelación no escribe', async () => {
  render(<Page />); await screen.findByText('Cliente A Sintetico');
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo' }));
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear cliente' }));
  expect(api.createAdminPersonaCliente).not.toHaveBeenCalled();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
