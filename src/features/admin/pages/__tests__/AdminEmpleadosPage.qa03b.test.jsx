// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminEmpleadosPage.jsx';

const api = vi.hoisted(() => Object.fromEntries(['activateAdminPersonaEmpleado', 'createAdminPersonaEmpleado', 'getAdminPersonaEmpleado', 'inactivateAdminPersonaEmpleado', 'listAdminPersonasCatalogos', 'listAdminPersonasEmpleados', 'updateAdminPersonaEmpleado'].map((key) => [key, vi.fn()])));
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
const auth = vi.hoisted(() => ({ roles: ['admin'] }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../lib/adminPersonasApi.js', () => api);
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));

const client = (id = 'A') => ({ id_empleado: id, nombres: `Empleado ${id}`, apellidos: 'Sintetico', nombre_completo: `Empleado ${id} Sintetico`, correo_principal: `${id.toLowerCase()}@example.test`, dni: '0801199012345', telefono_principal: '99990000', roles: ['admin'], id_sucursal: 'S', salario_base: 1000, tiene_acceso: true, estado_laboral: true, estado_acceso: 'activo' });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const dialog = () => screen.getByRole('dialog');
async function edit(id = 'A') {
  const row = (await screen.findByText(`Empleado ${id} Sintetico`)).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: 'Editar' }));
  await screen.findByDisplayValue(`Empleado ${id}`);
}
beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  Object.values(notices).forEach((mock) => mock.mockReset());
  navigate.mockReset(); auth.roles = ['admin'];
  localStorage.setItem('mf-view-empleados', 'table');
  api.listAdminPersonasEmpleados.mockResolvedValue({ data: { empleados: [client(), client('B')] } });
  api.listAdminPersonasCatalogos.mockResolvedValue({ data: { sucursales: [{ id_sucursal: 'S', nombre_sucursal: 'Sucursal Sintetica' }] } });
  api.getAdminPersonaEmpleado.mockImplementation((id) => Promise.resolve({ data: { empleado: client(id) } }));
  api.updateAdminPersonaEmpleado.mockResolvedValue({ data: { empleado: client() } });
});
afterEach(cleanup);

test.each(['resolve', 'reject'])('guardar A y abrir B: resultado tardío %s no cierra ni contamina B', async (outcome) => {
  const pending = deferred(); api.updateAdminPersonaEmpleado.mockReturnValue(pending.promise);
  render(<Page />); await edit();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Actualizar' }));
  fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
  await edit('B');
  await act(async () => outcome === 'resolve' ? pending.resolve({ data: { empleado: client() } }) : pending.reject(new Error('connect ECONNREFUSED internal.test')));
  expect(screen.getByDisplayValue('Empleado B')).toBeInTheDocument();
  expect(notices.success).not.toHaveBeenCalled();
  expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  expect(screen.queryByText('No se pudo completar la operacion de empleados. Intenta nuevamente.')).not.toBeInTheDocument();
});

test('error técnico vigente se presenta como mensaje funcional seguro', async () => {
  api.updateAdminPersonaEmpleado.mockRejectedValue({ data: { error: { message: 'connect ECONNREFUSED internal.test password=SYNTHETIC' } } });
  render(<Page />); await edit();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Actualizar' }));
  expect(await screen.findByText('No se pudo completar la operacion de empleados. Intenta nuevamente.')).toBeInTheDocument();
  expect(screen.queryByText(/ECONNREFUSED|SYNTHETIC/)).not.toBeInTheDocument();
});

test('guardar pendiente y desmontar descarta avisos y revalidación', async () => {
  const pending = deferred(); api.updateAdminPersonaEmpleado.mockReturnValue(pending.promise);
  const view = render(<Page />); await edit();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Actualizar' }));
  const count = api.listAdminPersonasEmpleados.mock.calls.length;
  view.unmount();
  await act(async () => pending.resolve({ data: { empleado: client() } }));
  expect(notices.success).not.toHaveBeenCalled();
  expect(api.listAdminPersonasEmpleados).toHaveBeenCalledTimes(count);
});

test('StrictMode, búsqueda por nombre y correo, edición correcta y doble clic', async () => {
  const pending = deferred(); api.updateAdminPersonaEmpleado.mockReturnValue(pending.promise);
  render(<StrictMode><Page /></StrictMode>);
  await screen.findByText('Empleado A Sintetico');
  const search = screen.getByPlaceholderText(/Buscar/);
  fireEvent.change(search, { target: { value: 'b@example.test' } });
  expect(screen.queryByText('Empleado A Sintetico')).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'Empleado A' } });
  await edit();
  const save = within(dialog()).getByRole('button', { name: 'Actualizar' });
  act(() => { fireEvent.click(save); fireEvent.click(save); });
  expect(api.updateAdminPersonaEmpleado).toHaveBeenCalledTimes(1);
  expect(api.updateAdminPersonaEmpleado.mock.calls[0][0]).toBe('A');
  await act(async () => pending.resolve({ data: { empleado: client() } }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(notices.success).toHaveBeenCalledTimes(1);
});

test('detalle A tardío no sobrescribe editor B', async () => {
  const pending = deferred(); api.getAdminPersonaEmpleado.mockImplementation((id) => id === 'A' ? pending.promise : Promise.resolve({ data: { empleado: client(id) } }));
  render(<Page />);
  const row = (await screen.findByText('Empleado A Sintetico')).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: 'Ver detalle' }));
  await edit('B');
  await act(async () => pending.resolve({ data: { empleado: client() } }));
  expect(screen.getByDisplayValue('Empleado B')).toBeInTheDocument();
});

test('inactivación pendiente y desmontaje no emiten avisos posteriores', async () => {
  const pending = deferred(); api.inactivateAdminPersonaEmpleado.mockReturnValue(pending.promise);
  const view = render(<Page />);
  const row = (await screen.findByText('Empleado A Sintetico')).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: 'Inactivar' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Inactivar' }));
  view.unmount();
  await act(async () => pending.resolve({ data: { empleado: { ...client(), estado_laboral: false } } }));
  expect(notices.warning).not.toHaveBeenCalled();
});

test('paginación, estado vacío y reintento después de error de lista', async () => {
  api.listAdminPersonasEmpleados.mockRejectedValueOnce({ status: 503, message: 'internal synthetic' });
  api.listAdminPersonasEmpleados.mockResolvedValue({ data: { empleados: Array.from({ length: 12 }, (_, i) => client(String(i))) } });
  render(<Page />);
  fireEvent.click(await screen.findByRole('button', { name: /Reintentar/ }));
  await screen.findByText('Empleado 0 Sintetico');
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByText('Empleado 10 Sintetico')).toBeInTheDocument();
  expect(screen.queryByText('Empleado 0 Sintetico')).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: 'inexistente' } });
  expect(screen.queryByText('Empleado 10 Sintetico')).not.toBeInTheDocument();
  expect(notices.success).not.toHaveBeenCalled();
});

test('creación valida obligatorios localmente y cancelación no escribe', async () => {
  render(<Page />); await screen.findByText('Empleado A Sintetico');
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo' }));
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear empleado' }));
  expect(api.createAdminPersonaEmpleado).not.toHaveBeenCalled();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('campos obligatorios identificables por su etiqueta accesible', async () => {
  render(<Page />); await edit();
  expect(screen.getByRole('textbox', { name: 'Nombres *' })).toHaveValue('Empleado A');
  expect(screen.getByRole('textbox', { name: 'Correo de acceso *' })).toHaveValue('a@example.test');
  expect(screen.getByRole('combobox', { name: 'Sucursal *' })).toHaveValue('S');
});

test.each([['admin'], ['super_admin'], ['super_admin','admin']])('selector respeta precedencia del actor %s', async (...args) => {
  auth.roles = args.filter(value => typeof value === 'string');
  render(<Page />); await edit();
  const option = within(dialog()).queryByRole('checkbox', { name: 'Super Admin' });
  if (auth.roles.includes('super_admin')) expect(option).toBeInTheDocument();
  else expect(option).not.toBeInTheDocument();
});

test('admin no recibe acciones sobre un empleado Super Admin', async () => {
  api.listAdminPersonasEmpleados.mockResolvedValue({ data: { empleados: [{ ...client(), roles: ['super_admin'] }] } });
  render(<Page />);
  const row = (await screen.findByText('Empleado A Sintetico')).closest('tr');
  expect(within(row).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  expect(within(row).queryByRole('button', { name: 'Inactivar' })).not.toBeInTheDocument();
  expect(within(row).getByRole('button', { name: 'Ver detalle' })).toBeInTheDocument();
});

test.each([[0, 'inactivo'], [2, 'barbero'], [3, 'T']])('filtro existente %s no consulta otros datos', async (index, value) => {
  api.listAdminPersonasEmpleados.mockResolvedValue({ data: { empleados: [client(), { ...client('B'), estado_laboral: false, roles: ['barbero'], id_sucursal: 'T' }] } });
  api.listAdminPersonasCatalogos.mockResolvedValue({ data: { sucursales: [{ id_sucursal: 'S', nombre_sucursal: 'S' }, { id_sucursal: 'T', nombre_sucursal: 'T' }] } });
  render(<Page />); await screen.findByText('Empleado A Sintetico');
  fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
  const selects = within(dialog()).getAllByRole('combobox');
  fireEvent.change(selects[index], { target: { value } });
  fireEvent.click(within(dialog()).getAllByRole('button', { name: 'Cerrar' })[0]);
  expect(screen.queryByText('Empleado A Sintetico')).not.toBeInTheDocument();
  expect(screen.getByText('Empleado B Sintetico')).toBeInTheDocument();
  expect(api.listAdminPersonasEmpleados).toHaveBeenCalledTimes(1);
});
