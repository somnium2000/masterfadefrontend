// @vitest-environment jsdom
// AM: Todas las operaciones son dobles; no hay HTTP, SQL ni ajustes reales.
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminMasterPuntosPage.jsx';

const api = vi.hoisted(() => ({ createAdminClientePuntosAjuste: vi.fn(), getAdminMasterPuntosRegalias: vi.fn(), getAdminClientePuntosResumen: vi.fn(), searchAdminClientesActivos: vi.fn(), updateAdminMasterPuntosRegalias: vi.fn() }));
const auth = vi.hoisted(() => ({ roles: ['admin'], user: { id_usuario: 'actor-a' }, branchIds: ['branch-a'] }));
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
  auth.roles = ['admin']; auth.user = { id_usuario: 'actor-a' }; auth.branchIds = ['branch-a']; navigate.mockReset(); notifications.success.mockReset();
  Object.values(api).forEach(mock => mock.mockReset());
  api.getAdminMasterPuntosRegalias.mockResolvedValue(config);
  api.updateAdminMasterPuntosRegalias.mockResolvedValue(config);
  api.searchAdminClientesActivos.mockResolvedValue(results());
  api.getAdminClientePuntosResumen.mockImplementation(id => Promise.resolve(summary(id)));
  api.createAdminClientePuntosAjuste.mockResolvedValue({ data: {} });
});
afterEach(() => { cleanup(); expect(api.createAdminClientePuntosAjuste).not.toHaveBeenCalled(); expect(api.updateAdminMasterPuntosRegalias).not.toHaveBeenCalled(); });
async function ready(strict = false) { const view = render(strict ? <StrictMode><Page /></StrictMode> : <Page />); await screen.findByText('Regla global activa: 10 puntos por recompensa.'); return view; }
async function picker() {
  fireEvent.click(screen.getByRole('button', { name: /Seleccionar cliente activo|^Cliente [AB]$/ }));
  return screen.findByRole('textbox', { name: 'Buscar cliente activo' });
}
async function select(id) { const input = await picker(); fireEvent.change(input, { target: { value: 'Cliente' } }); fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Cliente ${id}`) })); }
async function loaded(id = 'A') { await select(id); await screen.findByText('Saldo total'); }
function balance() { return screen.getByText('Saldo total').closest('article'); }


test('cambiar de administrador limpia saldo, cliente e historial anteriores', async () => {
  const view = await ready(); await loaded('A');
  expect(within(balance()).getByText('7')).toBeInTheDocument();
  auth.user = { id_usuario: 'actor-b' }; view.rerender(<Page />);
  expect(screen.queryByText('Saldo total')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Cliente A$/ })).not.toBeInTheDocument();
  await waitFor(() => expect(api.getAdminMasterPuntosRegalias).toHaveBeenCalledTimes(2));
  expect(api.getAdminClientePuntosResumen).toHaveBeenCalledTimes(1);
});
test('cambio de alcance autorizado invalida el cliente elegido aunque conserve el rol', async () => {
  const view = await ready(); await loaded('A');
  auth.branchIds = ['branch-b']; view.rerender(<Page />);
  expect(screen.queryByText('Saldo total')).not.toBeInTheDocument();
});
test('resumen transmite señal y la aborta al desmontar', async () => {
  const view = await ready(); const old = deferred();
  api.getAdminClientePuntosResumen.mockReturnValueOnce(old.promise); await select('A');
  const signal = api.getAdminClientePuntosResumen.mock.calls[0][1]?.signal;
  view.unmount();
  await act(async () => old.reject({ status: 401 }));
  expect(signal).toBeInstanceOf(AbortSignal); expect(signal.aborted).toBe(true);
  expect(navigate).not.toHaveBeenCalled();
});
test('nuevo texto aborta la búsqueda previa antes del debounce', async () => {
  await ready(); const old = deferred(); api.searchAdminClientesActivos.mockReturnValueOnce(old.promise);
  const input = await picker(); fireEvent.change(input, { target: { value: 'Anterior' } });
  await waitFor(() => expect(api.searchAdminClientesActivos).toHaveBeenCalledOnce());
  const signal = api.searchAdminClientesActivos.mock.calls[0][1]?.signal;
  fireEvent.change(input, { target: { value: 'Nueva' } });
  await act(async () => old.reject({ status: 403 }));
  expect(signal).toBeInstanceOf(AbortSignal); expect(signal.aborted).toBe(true);
  expect(navigate).not.toHaveBeenCalled();
});
test('configuración pendiente queda abortada después del desmontaje', async () => {
  const old = deferred(); api.getAdminMasterPuntosRegalias.mockReturnValueOnce(old.promise);
  const view = render(<StrictMode><Page /></StrictMode>);
  const signal = api.getAdminMasterPuntosRegalias.mock.calls[0][0]?.signal;
  view.unmount(); await act(async () => old.reject({ status: 401 }));
  expect(signal).toBeInstanceOf(AbortSignal); expect(signal.aborted).toBe(true);
  expect(navigate).not.toHaveBeenCalled();
});
test('respuesta de la identidad anterior no restaura cliente ni redirige a la nueva', async () => {
  const view = await ready(); const old = deferred(); api.getAdminClientePuntosResumen.mockReturnValueOnce(old.promise);
  await select('A'); auth.user = { id_usuario: 'actor-b' }; view.rerender(<Page />);
  await screen.findByRole('button', { name: /Seleccionar cliente activo/ }); await loaded('B');
  await act(async () => old.reject({ status: 401 }));
  expect(within(balance()).getByText('7')).toBeInTheDocument(); expect(navigate).not.toHaveBeenCalled();
});
test('volver a seleccionar el mismo cliente después de un error reintenta el resumen', async () => {
  await ready(); api.getAdminClientePuntosResumen.mockRejectedValueOnce({ status: 503 });
  await select('A'); await screen.findByText('No se pudo cargar el resumen de puntos del cliente.');
  await select('A'); await screen.findByText('Saldo total');
  expect(api.getAdminClientePuntosResumen).toHaveBeenCalledTimes(2);
});
test('búsqueda fallida permite reintentar desde el selector sin escrituras', async () => {
  await ready(); api.searchAdminClientesActivos.mockRejectedValueOnce({ status: 503 });
  const input = await picker(); fireEvent.change(input, { target: { value: 'Cliente' } });
  await screen.findAllByText('No se pudo buscar clientes activos.');
  fireEvent.change(input, { target: { value: '' } }); fireEvent.change(input, { target: { value: 'Cliente' } });
  await screen.findByRole('button', { name: /Cliente B/ }); expect(api.searchAdminClientesActivos).toHaveBeenCalledTimes(2);
});
