// @vitest-environment jsdom
// AM: Todas las operaciones son dobles; no hay HTTP, SQL ni ajustes reales.
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminMasterPuntosPage.jsx';

const api = vi.hoisted(() => ({ createAdminClientePuntosAjuste: vi.fn(), getAdminMasterPuntosRegalias: vi.fn(), getAdminClientePuntosResumen: vi.fn(), searchAdminClientesActivos: vi.fn(), updateAdminMasterPuntosRegalias: vi.fn() }));
const auth = vi.hoisted(() => ({ roles: ['admin'] }));
const navigate = vi.hoisted(() => vi.fn());
const notifications = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('../../lib/adminMasterPuntosApi.js', () => api);
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notifications }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const clients = ['A', 'B'].map(id => ({ id_cliente: id, nombre_cliente: `Cliente ${id}`, correo: `${id}@example.test` }));
const results = (items = clients) => ({ data: { clientes: items } });
const config = { data: { regla: { puntos_para_premio: 10 }, servicios_catalogo: [{ id_servicio: 'S', nombre_servicio: 'Servicio QA' }], configuracion: { sin_membresia: [{ id_servicio: 'S' }], con_membresia: [] } } };
const summary = (id = 'A', balance = 7, count = 0) => ({ data: { nombre_cliente: `Cliente ${id}`, saldo_total: balance, puntos_titular: 5, puntos_integrante: 2, puntos_para_premio: 10, progreso_actual: balance % 10, puede_canjear: balance >= 10, historial: Array.from({ length: count }, (_, i) => ({ id_points_tx: `${id}-${i}`, motivo: `Movimiento ${id}-${i}`, puntos: 1, origen_punto_codigo: i % 2 ? 'integrante' : 'titular' })) } });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => {
  auth.roles = ['admin']; navigate.mockReset(); notifications.success.mockReset();
  Object.values(api).forEach(mock => mock.mockReset());
  api.getAdminMasterPuntosRegalias.mockResolvedValue(config);
  api.updateAdminMasterPuntosRegalias.mockResolvedValue(config);
  api.searchAdminClientesActivos.mockResolvedValue(results());
  api.getAdminClientePuntosResumen.mockImplementation(id => Promise.resolve(summary(id)));
  api.createAdminClientePuntosAjuste.mockResolvedValue({ data: {} });
});
afterEach(cleanup);
async function ready(strict = false) { const view = render(strict ? <StrictMode><Page /></StrictMode> : <Page />); await screen.findByText('Regla global activa: 10 puntos por recompensa.'); return view; }
async function picker() {
  fireEvent.click(screen.getByRole('button', { name: /Seleccionar cliente activo|^Cliente [AB]$/ }));
  return screen.findByRole('textbox', { name: 'Buscar cliente activo' });
}
async function select(id) { const input = await picker(); fireEvent.change(input, { target: { value: 'Cliente' } }); fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Cliente ${id}`) })); }
async function loaded(id = 'A') { await select(id); await screen.findByText('Saldo total'); }
function balance() { return screen.getByText('Saldo total').closest('article'); }
function fillAdjustment(subtract = false) {
  fireEvent.change(screen.getByPlaceholderText(subtract ? 'Ej. 3' : 'Ej. 10'), { target: { value: '2' } });
  fireEvent.change(screen.getByPlaceholderText('Describe el ajuste'), { target: { value: 'Motivo sintético' } });
}

test.each(['admin', 'super_admin', 'super_admin,admin'])('rol administrativo %s conserva acceso', async role => {
  auth.roles = role.split(','); await ready(); expect(navigate).not.toHaveBeenCalled();
});
test('admin consulta la configuración global sin controles de guardado', async () => {
  auth.roles = ['admin']; await ready();
  expect(api.getAdminMasterPuntosRegalias).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Guardar configuracion' })).not.toBeInTheDocument();
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
});
test.each([{ roles: ['super_admin'] }, { roles: ['admin', 'super_admin'] }])('super_admin $roles conserva controles de guardado', async ({ roles }) => {
  auth.roles = roles; await ready();
  expect(screen.getByRole('button', { name: 'Guardar configuracion' })).toBeEnabled();
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeEnabled();
});
test.each(['cliente', 'barbero'])('rol %s no consulta datos administrativos', async role => {
  auth.roles = [role]; render(<Page />); await waitFor(() => expect(navigate).toHaveBeenCalledWith('/unauthorized', { replace: true })); expect(api.getAdminMasterPuntosRegalias).not.toHaveBeenCalled();
});
test('saldo, titular, integrantes, progreso, historial y paginación mantienen contrato', async () => {
  api.getAdminClientePuntosResumen.mockImplementation(id => Promise.resolve(summary(id, 7, id === 'A' ? 6 : 0))); await ready(); await loaded();
  expect(within(balance()).getByText('7')).toBeInTheDocument(); expect(screen.getByText('7/10')).toBeInTheDocument();
  expect(screen.getByText('Titular').closest('article')).toHaveTextContent('5'); expect(screen.getByText('Acompanantes').closest('article')).toHaveTextContent('2');
  expect(screen.getByText('Movimiento A-0')).toBeInTheDocument(); expect(screen.queryByText('Movimiento A-4')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' })); expect(screen.getByText('Movimiento A-4')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pagina anterior' })); expect(screen.getByText('Movimiento A-0')).toBeInTheDocument();
  await loaded('B'); expect(screen.getByText('No hay movimientos registrados.')).toBeInTheDocument();
});
test('cero y búsqueda vacía son estados válidos, sin llamadas con término corto', async () => {
  api.getAdminClientePuntosResumen.mockResolvedValue(summary('A', 0)); await ready(); const input = await picker();
  fireEvent.change(input, { target: { value: 'A' } }); expect(api.searchAdminClientesActivos).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'Cliente' } }); fireEvent.click(await screen.findByRole('button', { name: /Cliente A/ }));
  await screen.findByText('Saldo total'); expect(within(balance()).getByText('0')).toBeInTheDocument();
});
test.each(['success', 401, 403, 500])('resumen A tardío %s no altera selección B', async outcome => {
  await ready(); const a = deferred(); api.getAdminClientePuntosResumen.mockReturnValueOnce(a.promise); await select('A'); await loaded('B');
  await act(async () => outcome === 'success' ? a.resolve(summary('A', 99)) : a.reject({ status: outcome, message: 'SQL interno' }));
  expect(within(balance()).getByText('7')).toBeInTheDocument(); expect(screen.queryByText('99')).not.toBeInTheDocument(); expect(navigate).not.toHaveBeenCalled();
});
test.each([401, 403])('resumen vigente %s conserva redirección', async status => {
  await ready(); api.getAdminClientePuntosResumen.mockRejectedValueOnce({ status }); await select('A');
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true }));
});
test.each(['success', 401, 403, 500])('búsqueda anterior %s se invalida desde el nuevo texto, antes del debounce', async outcome => {
  await ready(); const old = deferred(); api.searchAdminClientesActivos.mockReturnValueOnce(old.promise);
  const input = await picker(); fireEvent.change(input, { target: { value: 'Anterior' } });
  await waitFor(() => expect(api.searchAdminClientesActivos).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'Nueva' } });
  await act(async () => outcome === 'success' ? old.resolve(results([{ id_cliente: 'OLD', nombre_cliente: 'RESULTADO OBSOLETO' }])) : old.reject({ status: outcome, message: 'SQL interno' }));
  expect(screen.queryByText('RESULTADO OBSOLETO')).not.toBeInTheDocument(); expect(navigate).not.toHaveBeenCalled();
});
test.each(['success', 401, 403])('ajuste pendiente A %s no recarga A ni altera B', async outcome => {
  await ready(); await loaded(); const pending = deferred(); api.createAdminClientePuntosAjuste.mockReturnValueOnce(pending.promise);
  fillAdjustment(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' })); await loaded('B');
  await act(async () => outcome === 'success' ? pending.resolve({ data: {} }) : pending.reject({ status: outcome }));
  expect(api.getAdminClientePuntosResumen.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
  expect(notifications.success).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});
test('cambiar cliente descarta el borrador de ajuste anterior', async () => {
  await ready(); await loaded(); fillAdjustment(); await loaded('B');
  expect(screen.getByPlaceholderText('Ej. 10')).toHaveValue(null); expect(screen.getByPlaceholderText('Describe el ajuste')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Aplicar ajuste' })).toBeDisabled();
});
test.each([0, -1, 1.5])('ajuste inválido %s no se envía', async value => {
  await ready(); await loaded(); fillAdjustment(); fireEvent.change(screen.getByPlaceholderText('Ej. 10'), { target: { value: String(value) } });
  expect(screen.getByRole('button', { name: 'Aplicar ajuste' })).toBeDisabled(); expect(api.createAdminClientePuntosAjuste).not.toHaveBeenCalled();
});
test('suma válida conserva payload y bloquea duplicados mientras espera', async () => {
  await ready(); await loaded(); const pending = deferred(); api.createAdminClientePuntosAjuste.mockReturnValueOnce(pending.promise); fillAdjustment();
  const form = screen.getByRole('button', { name: 'Aplicar ajuste' }).closest('form');
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(api.createAdminClientePuntosAjuste).toHaveBeenCalledExactlyOnceWith('A', { accion: 'sumar', puntos: 2, motivo: 'Motivo sintético' });
  await act(async () => pending.resolve({ data: {} })); expect(notifications.success).toHaveBeenCalledWith('Ajuste aplicado correctamente.');
});
test('resta solicita confirmación y conserva payload', async () => {
  await ready(); await loaded(); fillAdjustment(true); fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }));
  expect(api.createAdminClientePuntosAjuste).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(api.createAdminClientePuntosAjuste).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' })); fireEvent.click(screen.getByRole('button', { name: 'Si, aplicar ajuste' }));
  await waitFor(() => expect(api.createAdminClientePuntosAjuste).toHaveBeenCalledExactlyOnceWith('A', { accion: 'restar', puntos: 2, motivo: 'Motivo sintético' }));
});
test.each(['summary', 'search', 'config', 'save', 'adjustment'])('error técnico %s se reemplaza por mensaje funcional', async operation => {
  const technical = { status: 500, message: 'SQL SECRET INTERNAL', data: { error: { message: 'SQL SECRET INTERNAL' } } };
  const expected = { summary: 'No se pudo cargar el resumen de puntos del cliente.', search: 'No se pudo buscar clientes activos.', config: 'No se pudo cargar la configuracion de servicios canjeables.', save: 'No se pudo guardar la configuracion de servicios canjeables.', adjustment: 'No fue posible aplicar el ajuste.' };
  if (operation === 'config') { api.getAdminMasterPuntosRegalias.mockRejectedValue(technical); render(<Page />); }
  else {
    if (operation === 'save') auth.roles = ['super_admin'];
    await ready();
    if (operation === 'summary') { api.getAdminClientePuntosResumen.mockRejectedValueOnce(technical); await select('A'); }
    if (operation === 'search') { api.searchAdminClientesActivos.mockRejectedValueOnce(technical); const input = await picker(); fireEvent.change(input, { target: { value: 'Cliente' } }); }
    if (operation === 'save') { api.updateAdminMasterPuntosRegalias.mockRejectedValueOnce(technical); fireEvent.click(screen.getByRole('button', { name: 'Guardar configuracion' })); }
    if (operation === 'adjustment') { await loaded(); api.createAdminClientePuntosAjuste.mockRejectedValueOnce(technical); fillAdjustment(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' })); }
  }
  await screen.findAllByText(expected[operation]); expect(screen.queryByText('SQL SECRET INTERNAL')).not.toBeInTheDocument();
});
test('saldo insuficiente mantiene mensaje funcional', async () => {
  await ready(); await loaded(); api.createAdminClientePuntosAjuste.mockRejectedValueOnce({ status: 422, data: { error: { code: 'POINTS_INSUFFICIENT_BALANCE' } } });
  fillAdjustment(true); fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' })); fireEvent.click(screen.getByRole('button', { name: 'Si, aplicar ajuste' }));
  await screen.findByText('No hay puntos suficientes para completar la resta solicitada.');
});
test('regalías conserva selección y payload sin duplicar guardado', async () => {
  auth.roles = ['super_admin'];
  await ready(); const pending = deferred(); api.updateAdminMasterPuntosRegalias.mockReturnValueOnce(pending.promise);
  const checks = screen.getAllByRole('checkbox'); expect(checks[0]).toBeChecked(); fireEvent.click(checks[1]);
  const save = screen.getByRole('button', { name: 'Guardar configuracion' }); act(() => { fireEvent.click(save); fireEvent.click(save); });
  expect(api.updateAdminMasterPuntosRegalias).toHaveBeenCalledExactlyOnceWith({ sin_membresia: ['S'], con_membresia: ['S'] });
  await act(async () => pending.resolve(config));
});
test.each([401, 403])('desmontaje descarta resumen y error tardío %s', async status => {
  const view = await ready(); const pending = deferred(); api.getAdminClientePuntosResumen.mockReturnValueOnce(pending.promise); await select('A'); view.unmount();
  await act(async () => pending.reject({ status })); expect(navigate).not.toHaveBeenCalled();
});
test('StrictMode no permite configuración antigua sobre la vigente', async () => {
  const old = deferred(); api.getAdminMasterPuntosRegalias.mockReturnValueOnce(old.promise); await ready(true);
  await act(async () => old.resolve({ data: { regla: { puntos_para_premio: 99 } } }));
  expect(screen.getByText('Regla global activa: 10 puntos por recompensa.')).toBeInTheDocument(); expect(screen.queryByText(/99 puntos por recompensa/)).not.toBeInTheDocument();
});

test.each([401, 403])('búsqueda vigente %s conserva redirección', async status => {
  await ready(); api.searchAdminClientesActivos.mockRejectedValueOnce({ status });
  fireEvent.change(await picker(), { target: { value: 'Cliente' } });
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true }));
});
test.each([401, 403])('ajuste vigente %s conserva redirección', async status => {
  await ready(); await loaded(); api.createAdminClientePuntosAjuste.mockRejectedValueOnce({ status }); fillAdjustment();
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true }));
});
test.each([401, 403])('regalías vigentes %s conservan redirección', async status => {
  api.getAdminMasterPuntosRegalias.mockRejectedValueOnce({ status }); render(<Page />);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true }));
});
test.each([401, 403])('guardar regalías vigente %s conserva redirección', async status => {
  auth.roles = ['super_admin'];
  await ready(); api.updateAdminMasterPuntosRegalias.mockRejectedValueOnce({ status });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuracion' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(status === 401 ? '/login' : '/unauthorized', { replace: true }));
});
test('saldo B pendiente no se libera con resumen A tardío', async () => {
  await ready(); const a = deferred(), b = deferred(); api.getAdminClientePuntosResumen.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await select('A'); await select('B'); await act(async () => a.resolve(summary('A', 99)));
  expect(screen.getByText('Cargando resumen del cliente...')).toBeInTheDocument(); expect(screen.queryByText('Saldo total')).not.toBeInTheDocument();
  await act(async () => b.resolve(summary('B', 4))); expect(within(balance()).getByText('4')).toBeInTheDocument();
});
test('A → B → A no acepta un ajuste del primer contexto A', async () => {
  await ready(); await loaded(); const pending = deferred(); api.createAdminClientePuntosAjuste.mockReturnValueOnce(pending.promise);
  fillAdjustment(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' })); await loaded('B'); await loaded('A');
  await act(async () => pending.resolve({ data: {} }));
  expect(api.getAdminClientePuntosResumen.mock.calls.map(call => call[0])).toEqual(['A', 'B', 'A']); expect(notifications.success).not.toHaveBeenCalled();
});
test('volver al mismo término durante debounce no deja la búsqueda bloqueada', async () => {
  await ready(); const old = deferred(); api.searchAdminClientesActivos.mockReturnValueOnce(old.promise);
  const input = await picker(); fireEvent.change(input, { target: { value: 'Anterior' } });
  await waitFor(() => expect(api.searchAdminClientesActivos).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'Nueva' } }); fireEvent.change(input, { target: { value: 'Anterior' } });
  await screen.findByRole('button', { name: /Cliente B/ }); expect(api.searchAdminClientesActivos).toHaveBeenCalledTimes(2);
  await act(async () => old.resolve(results([{ id_cliente: 'OLD', nombre_cliente: 'OBSOLETO' }]))); expect(screen.queryByText('OBSOLETO')).not.toBeInTheDocument();
});
test('cerrar selector descarta respuesta y búsqueda sin resultados mantiene estado vacío', async () => {
  await ready(); const old = deferred(); api.searchAdminClientesActivos.mockReturnValueOnce(old.promise).mockResolvedValue(results([]));
  fireEvent.change(await picker(), { target: { value: 'Anterior' } }); await waitFor(() => expect(api.searchAdminClientesActivos).toHaveBeenCalledTimes(1));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await act(async () => old.reject({ status: 401 })); expect(navigate).not.toHaveBeenCalled();
  fireEvent.change(await picker(), { target: { value: 'Ninguno' } }); await screen.findByText('No se encontraron clientes activos.');
});
test('pérdida de permisos oculta datos e invalida respuestas pendientes', async () => {
  const view = await ready(); await loaded(); const old = deferred(); api.getAdminClientePuntosResumen.mockReturnValueOnce(old.promise); await select('B');
  auth.roles = ['cliente']; view.rerender(<Page />); await act(async () => old.resolve(summary('B', 99)));
  expect(screen.queryByText('Saldo total')).not.toBeInTheDocument(); expect(screen.queryByText('99')).not.toBeInTheDocument();
  expect(navigate).toHaveBeenCalledWith('/unauthorized', { replace: true });
});
test('desmontaje descarta respuesta de guardado sin notificación', async () => {
  auth.roles = ['super_admin'];
  const view = await ready(); const old = deferred(); api.updateAdminMasterPuntosRegalias.mockReturnValueOnce(old.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuracion' })); view.unmount();
  await act(async () => old.resolve(config)); expect(notifications.success).not.toHaveBeenCalled();
});
test('conflicto 409 no muestra detalles técnicos', async () => {
  await ready(); await loaded(); api.createAdminClientePuntosAjuste.mockRejectedValueOnce({ status: 409, message: 'SQL INTERNAL' });
  fillAdjustment(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }));
  await screen.findByText('No fue posible completar la operacion por un conflicto. Actualiza los datos e intenta nuevamente.'); expect(screen.queryByText('SQL INTERNAL')).not.toBeInTheDocument();
});

test('fallo de carga de regalías no permite guardar una selección vacía no confirmada', async () => {
  auth.roles = ['super_admin'];
  api.getAdminMasterPuntosRegalias.mockRejectedValue(new Error('Red no disponible')); render(<Page />);
  await screen.findByText('No se pudo cargar la configuracion de servicios canjeables.');
  const save = screen.getByRole('button', { name: 'Guardar configuracion' });
  fireEvent.click(save); expect(api.updateAdminMasterPuntosRegalias).not.toHaveBeenCalled(); expect(save).toBeDisabled();
});

test('fallo de guardado permite reintentar la configuración previamente cargada', async () => {
  auth.roles = ['super_admin'];
  await ready(); api.updateAdminMasterPuntosRegalias.mockRejectedValueOnce(new Error('Red no disponible')).mockResolvedValue(config);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuracion' })); await screen.findByText('No se pudo guardar la configuracion de servicios canjeables.');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuracion' }));
  await waitFor(() => expect(api.updateAdminMasterPuntosRegalias).toHaveBeenCalledTimes(2));
});
