// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminConfiguracionPromocionesPage.jsx';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SERVICE = '21111111-1111-4111-8111-111111111111';
const PACKAGE = '31111111-1111-4111-8111-111111111111';
const auth = vi.hoisted(() => ({ roles: ['super_admin'], branchIds: [] }));
const api = vi.hoisted(() => ({ listAdminConfigPromociones: vi.fn(), getAdminConfigPromocion: vi.fn(), createAdminConfigPromocion: vi.fn(), updateAdminConfigPromocion: vi.fn() }));
const branches = vi.hoisted(() => ({ listAdminSucursales: vi.fn() }));
const services = vi.hoisted(() => ({ listAdminServicios: vi.fn() }));
const packages = vi.hoisted(() => ({ listAdminPaquetes: vi.fn() }));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const sync = vi.hoisted(() => ({ emitCatalogSync: vi.fn() }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notifications }));
vi.mock('../../lib/adminConfiguracionApi.js', () => api);
vi.mock('../../lib/adminSucursalesApi.js', () => branches);
vi.mock('../../lib/adminCatalogApi.js', () => services);
vi.mock('../../lib/adminPackagesApi.js', () => packages);
vi.mock('../../../../lib/catalogSync.js', () => sync);
vi.mock('../../../../components/data/CardsCarousel.jsx', () => ({ default: ({ items, renderItem }) => <div>{items.map((item, index) => <div key={`${item.id_promocion}:${item.id_sucursal}`}>{renderItem(item, index, 0)}</div>)}</div> }));
vi.mock('../../../../components/data/ImageUploaderField.jsx', () => ({ default: ({ label, valueAssetId, initialPreviewUrl }) => <div data-testid={label} data-asset={valueAssetId || ''} data-url={initialPreviewUrl || ''}>{label}</div> }));

function promo(branch = A, title = 'Promo A', overrides = {}) {
  return { id_promocion: '11111111-1111-4111-8111-111111111111', id_sucursal: branch, titulo: title, slug: 'promo-a',
    subtitulo: 'Subtitulo original', parrafos: ['Descripcion original'], estado: 'borrador', visible_publico: false, destacada: false,
    orden_visual: 10, tipo_promocion: 'descuento_servicio', aplica_a: 'servicio', mecanica: 'porcentaje', id_servicio_objetivo: SERVICE,
    id_paquete_objetivo: null, valor_descuento: 10, cantidad_requerida: null, cantidad_bonificada: null,
    imagen_principal_url: 'https://example.test/main.png', imagen_mobile_url: 'https://example.test/mobile.png',
    vigencia_desde: '2027-01-01', vigencia_hasta: '2027-01-31', vigencia_hora_desde: '09:00:00', vigencia_hora_hasta: '18:00:00', ...overrides };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function select(branch) {
  await screen.findByRole('option', { name: 'Norte' });
  fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: branch } });
}
async function editor() {
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  return screen.findByRole('dialog');
}
beforeEach(() => {
  localStorage.clear();
  auth.roles = ['super_admin']; auth.branchIds = [];
  [api, branches, services, packages, notifications, sync].forEach((group) => Object.values(group).forEach((mock) => mock.mockReset()));
  branches.listAdminSucursales.mockResolvedValue({ data: { sucursales: [{ id_sucursal: A, nombre_sucursal: 'Centro', estado: true }, { id_sucursal: B, nombre_sucursal: 'Norte', estado: true }] } });
  api.listAdminConfigPromociones.mockImplementation(({ id_sucursal }) => Promise.resolve({ data: { promociones: id_sucursal ? [promo(id_sucursal, id_sucursal === A ? 'Promo A' : 'Promo B')] : [] } }));
  api.getAdminConfigPromocion.mockImplementation((id, { id_sucursal }) => Promise.resolve({ data: { promocion: promo(id_sucursal, id_sucursal === A ? 'Promo A' : 'Promo B') } }));
  api.updateAdminConfigPromocion.mockResolvedValue({ data: { promocion: promo() } });
  api.createAdminConfigPromocion.mockResolvedValue({ data: { promocion: promo() } });
  services.listAdminServicios.mockImplementation(({ id_sucursal }) => Promise.resolve({ data: { servicios: [{ id_servicio: SERVICE, id_sucursal, nombre_servicio: 'Servicio vigente', activo: true, tarifa_activa: true }] } }));
  packages.listAdminPaquetes.mockImplementation(({ id_sucursal }) => Promise.resolve({ data: { paquetes: [{ id_paquete: PACKAGE, id_sucursal, nombre_paquete: 'Paquete vigente', activo: true }] } }));
});
afterEach(() => cleanup());

test.each([0, 2])('admin %i sucursales no consulta global ni opera sin seleccion', async (count) => {
  auth.roles = ['admin']; auth.branchIds = [A, B].slice(0, count);
  render(<Page />);
  await waitFor(() => expect(branches.listAdminSucursales).toHaveBeenCalled());
  expect(api.listAdminConfigPromociones).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Nueva' })).toBeDisabled();
  if (!count) expect(screen.queryByRole('option', { name: 'Centro' })).not.toBeInTheDocument();
});

test.each(['success', 'error'])('listado tardio A (%s) no reemplaza B', async (outcome) => {
  const pending = deferred();
  api.listAdminConfigPromociones.mockImplementation(({ id_sucursal }) => id_sucursal === A ? pending.promise : Promise.resolve({ data: { promociones: id_sucursal === B ? [promo(B, 'Promo B')] : [] } }));
  render(<Page />); await select(A); await select(B);
  expect(await screen.findByText('Promo B')).toBeInTheDocument();
  await act(async () => outcome === 'success' ? pending.resolve({ data: { promociones: [promo()] } }) : pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(screen.getByText('Promo B')).toBeInTheDocument();
  expect(screen.queryByText('Promo A')).not.toBeInTheDocument();
  expect(screen.queryByText('Error antiguo')).not.toBeInTheDocument();
});

test('opciones tardias A no sustituyen objetivos B', async () => {
  const pending = deferred();
  services.listAdminServicios.mockImplementation(({ id_sucursal }) => id_sucursal === A ? pending.promise : Promise.resolve({ data: { servicios: [{ id_servicio: SERVICE, id_sucursal: B, nombre_servicio: 'Servicio B', activo: true, tarifa_activa: true }] } }));
  render(<Page />); await select(A); await select(B);
  const dialog = await editor();
  await within(dialog).findByRole('option', { name: 'Servicio B' });
  await act(async () => pending.resolve({ data: { servicios: [{ id_servicio: SERVICE, id_sucursal: A, nombre_servicio: 'Servicio A', activo: true, tarifa_activa: true }] } }));
  expect(within(dialog).getByRole('option', { name: 'Servicio B' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('option', { name: 'Servicio A' })).not.toBeInTheDocument();
});

test('fallo auxiliar no borra objetivo persistido en edicion descriptiva', async () => {
  auth.roles = ['admin']; auth.branchIds = [A];
  services.listAdminServicios.mockRejectedValue({ data: { error: { message: 'Catalogo no disponible' } } });
  render(<Page />);
  const dialog = await editor();
  // AM: El formulario existente no asocia todos sus labels; seleccion por tipo de control.
  fireEvent.change(dialog.querySelector('textarea'), { target: { value: 'Descripcion editada' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.updateAdminConfigPromocion).toHaveBeenCalled());
  expect(api.updateAdminConfigPromocion.mock.calls[0][1]).toMatchObject({ id_sucursal: A, id_servicio_objetivo: SERVICE, valor_descuento: 10, parrafos: ['Descripcion editada'] });
});

test('loading pertenece a B aunque termine A', async () => {
  const a = deferred(), b = deferred();
  api.listAdminConfigPromociones.mockImplementation(({ id_sucursal }) => id_sucursal === A ? a.promise : id_sucursal === B ? b.promise : Promise.resolve({ data: { promociones: [] } }));
  render(<Page />); await select(A); await select(B);
  await act(async () => a.resolve({ data: { promociones: [promo()] } }));
  expect(screen.getByText('Cargando promociones...')).toBeInTheDocument();
  expect(screen.queryByText('Promo A')).not.toBeInTheDocument();
  await act(async () => b.resolve({ data: { promociones: [promo(B, 'Promo B')] } }));
  expect(screen.getByText('Promo B')).toBeInTheDocument();
  expect(screen.queryByText('Cargando promociones...')).not.toBeInTheDocument();
});

test.each(['Detalle', 'Editar'])('respuesta obsoleta de %s no abre ni reemplaza formulario B', async (action) => {
  const pending = deferred();
  api.getAdminConfigPromocion.mockImplementation((id, { id_sucursal }) => id_sucursal === A ? pending.promise : Promise.resolve({ data: { promocion: promo(B, 'Promo B') } }));
  render(<Page />); await select(A);
  fireEvent.click(await screen.findByRole('button', { name: action }));
  fireEvent.change(document.getElementById('promotions-branch'), { target: { value: B } });
  fireEvent.click(await screen.findByRole('button', { name: action }));
  const dialog = await screen.findByRole('dialog');
  if (action === 'Editar') await within(dialog).findByDisplayValue('Promo B');
  else await within(dialog).findAllByText('Promo B');
  await act(async () => pending.resolve({ data: { promocion: promo() } }));
  if (action === 'Editar') expect(within(dialog).getByDisplayValue('Promo B')).toBeInTheDocument();
  else expect(within(dialog).queryAllByText('Promo B').length).toBeGreaterThan(0);
  expect(within(dialog).queryByDisplayValue('Promo A')).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Promo A')).not.toBeInTheDocument();
});

test.each(['Detalle', 'Editar'])('error tardio de %s no notifica despues de cambio de sucursal', async (action) => {
  const pending = deferred();
  api.getAdminConfigPromocion.mockImplementation(() => pending.promise);
  render(<Page />); await select(A);
  fireEvent.click(await screen.findByRole('button', { name: action }));
  fireEvent.change(document.getElementById('promotions-branch'), { target: { value: B } });
  await screen.findByText('Promo B');
  await act(async () => pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(notifications.error).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each(['success', 'error'])('guardado tardio (%s) no toca B ni repite operacion', async (outcome) => {
  const pending = deferred();
  api.updateAdminConfigPromocion.mockImplementation(() => pending.promise);
  render(<Page />); await select(A);
  const dialog = await editor();
  fireEvent.change(dialog.querySelector('textarea'), { target: { value: 'Descripcion editada' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.updateAdminConfigPromocion).toHaveBeenCalledTimes(1));
  fireEvent.change(document.getElementById('promotions-branch'), { target: { value: B } });
  await screen.findByText('Promo B');
  const next = await editor();
  await act(async () => outcome === 'success' ? pending.resolve({ data: { promocion: promo() } }) : pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(within(next).getByDisplayValue('Promo B')).toBeInTheDocument();
  expect(within(next).getByRole('button', { name: 'Guardar cambios' })).not.toBeDisabled();
  expect(notifications.success).not.toHaveBeenCalled();
  expect(notifications.error).not.toHaveBeenCalled();
  expect(sync.emitCatalogSync).not.toHaveBeenCalled();
  expect(api.updateAdminConfigPromocion).toHaveBeenCalledTimes(1);
  expect(api.createAdminConfigPromocion).not.toHaveBeenCalled();
});

test('perdida de sucursales cierra editor y limpia informacion', async () => {
  auth.roles = ['admin']; auth.branchIds = [A];
  const view = render(<Page />); await editor();
  auth.branchIds = [];
  view.rerender(<Page />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Promo A')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nueva' })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'Norte' })).not.toBeInTheDocument();
  expect(api.listAdminConfigPromociones.mock.calls.every(([params]) => params.id_sucursal === A)).toBe(true);
});

test.each(['success', 'error'])('carga de sucursales obsoleta (%s) respeta permisos nuevos', async (outcome) => {
  auth.roles = ['admin']; auth.branchIds = [A];
  const pending = deferred();
  branches.listAdminSucursales.mockImplementationOnce(() => pending.promise);
  const view = render(<Page />);
  auth.branchIds = [B];
  view.rerender(<Page />);
  await screen.findByText('Norte');
  await act(async () => outcome === 'success' ? pending.resolve({ data: { sucursales: [{ id_sucursal: A, nombre_sucursal: 'Centro', estado: true }] } }) : pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(screen.getByText('Norte')).toBeInTheDocument();
  expect(screen.queryByText('Centro')).not.toBeInTheDocument();
  expect(notifications.error).not.toHaveBeenCalled();
});

test.each(['admin', 'super_admin'])('%s con una sucursal mantiene alcance esperado', async (role) => {
  auth.roles = [role]; auth.branchIds = [A];
  render(<Page />);
  if (role === 'admin') {
    await screen.findByText('Promo A');
    expect(api.listAdminConfigPromociones.mock.calls.every(([params]) => params.id_sucursal === A)).toBe(true);
    expect(screen.queryByRole('option', { name: 'Norte' })).not.toBeInTheDocument();
  } else {
    await screen.findByRole('option', { name: 'Todas las sucursales' });
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: '' } });
    await waitFor(() => expect(api.listAdminConfigPromociones).toHaveBeenCalledWith({ id_sucursal: undefined }));
    expect(screen.getByRole('option', { name: 'Norte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva' })).toBeDisabled();
  }
});

test('admin con varias sucursales selecciona una autorizada para operar', async () => {
  auth.roles = ['admin']; auth.branchIds = [A, B];
  render(<Page />); await select(B);
  expect(await screen.findByText('Promo B')).toBeInTheDocument();
  expect(api.listAdminConfigPromociones.mock.calls.every(([params]) => params.id_sucursal === B)).toBe(true);
  expect(screen.getByRole('button', { name: 'Nueva' })).not.toBeDisabled();
  expect(screen.queryByRole('option', { name: 'Todas las sucursales' })).not.toBeInTheDocument();
});

test('StrictMode conserva carga y edicion vigente', async () => {
  auth.roles = ['admin']; auth.branchIds = [A];
  render(<StrictMode><Page /></StrictMode>);
  const dialog = await editor();
  expect(within(dialog).getByDisplayValue('Promo A')).toBeInTheDocument();
  expect(within(dialog).getByRole('option', { name: 'Servicio vigente' })).toBeInTheDocument();
});

test('desmontaje descarta errores de todas las cargas pendientes', async () => {
  auth.roles = ['admin']; auth.branchIds = [A];
  const pending = deferred();
  branches.listAdminSucursales.mockImplementation(() => pending.promise);
  api.listAdminConfigPromociones.mockImplementation(() => pending.promise);
  services.listAdminServicios.mockImplementation(() => pending.promise);
  packages.listAdminPaquetes.mockImplementation(() => pending.promise);
  const view = render(<Page />); view.unmount();
  await act(async () => pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(notifications.error).not.toHaveBeenCalled();
  expect(notifications.warning).not.toHaveBeenCalled();
});

test.each(['success', 'error'])('detalle cerrado no reaparece por respuesta tardia (%s)', async (outcome) => {
  auth.roles = ['admin']; auth.branchIds = [A];
  const pending = deferred(); api.getAdminConfigPromocion.mockImplementation(() => pending.promise);
  render(<Page />);
  fireEvent.click(await screen.findByRole('button', { name: 'Detalle' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
  await act(async () => outcome === 'success' ? pending.resolve({ data: { promocion: promo() } }) : pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(notifications.error).not.toHaveBeenCalled();
});

test('editor antiguo no reemplaza apertura posterior de Nueva', async () => {
  auth.roles = ['admin']; auth.branchIds = [A];
  const pending = deferred(); api.getAdminConfigPromocion.mockImplementation(() => pending.promise);
  render(<Page />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
  const dialog = await screen.findByRole('dialog');
  await act(async () => pending.resolve({ data: { promocion: promo() } }));
  expect(within(dialog).getByRole('heading', { name: 'Nueva promocion' })).toBeInTheDocument();
  expect(within(dialog).queryByDisplayValue('Promo A')).not.toBeInTheDocument();
});

test('detalle vigente invalida una apertura anterior del editor', async () => {
  auth.roles = ['admin']; auth.branchIds = [A];
  const pending = deferred();
  api.getAdminConfigPromocion.mockImplementationOnce(() => pending.promise);
  render(<Page />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Detalle' }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findAllByText('Promo A');
  await act(async () => pending.resolve({ data: { promocion: promo() } }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(within(dialog).getByRole('heading', { name: 'Detalle de promocion' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Editar promocion' })).not.toBeInTheDocument();
});

test('error auxiliar antiguo no cambia loading ni opciones vigentes', async () => {
  const a = deferred(), b = deferred();
  packages.listAdminPaquetes.mockImplementation(({ id_sucursal }) => id_sucursal === A ? a.promise : b.promise);
  render(<Page />); await select(A); await select(B);
  const dialog = await editor();
  await act(async () => a.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(within(dialog).getByText('Cargando catalogo...')).toBeInTheDocument();
  expect(notifications.warning).not.toHaveBeenCalled();
  await act(async () => b.resolve({ data: { paquetes: [{ id_paquete: PACKAGE, id_sucursal: B, nombre_paquete: 'Paquete B', activo: true }] } }));
  const type = within(dialog).getByRole('option', { name: 'Descuento a paquete' }).parentElement;
  fireEvent.change(type, { target: { value: 'descuento_paquete' } });
  expect(within(dialog).getByRole('option', { name: 'Paquete B' })).toBeInTheDocument();
});

test('edicion conserva campos comerciales, imagenes, fechas y publica sin nuevas reglas', async () => {
  auth.roles = ['admin']; auth.branchIds = [A];
  render(<Page />); const dialog = await editor();
  fireEvent.change(dialog.querySelector('textarea'), { target: { value: 'Descripcion editada' } });
  const state = within(dialog).getByRole('option', { name: 'Publicada' }).parentElement;
  fireEvent.change(state, { target: { value: 'publicada' } });
  const boxes = within(dialog).getAllByRole('checkbox');
  fireEvent.click(boxes[0]);
  fireEvent.click(boxes[1]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.updateAdminConfigPromocion).toHaveBeenCalledTimes(1));
  expect(api.updateAdminConfigPromocion.mock.calls[0][1]).toMatchObject({
    id_sucursal: A, titulo: 'Promo A', subtitulo: 'Subtitulo original', parrafos: ['Descripcion editada'],
    tipo_promocion: 'descuento_servicio', aplica_a: 'servicio', mecanica: 'porcentaje', id_servicio_objetivo: SERVICE,
    id_paquete_objetivo: null, valor_descuento: 10, cantidad_requerida: null, cantidad_bonificada: null,
    estado: 'publicada', visible_publico: true, destacada: true, orden_visual: 10,
    imagen_principal_url: 'https://example.test/main.png', imagen_mobile_url: 'https://example.test/mobile.png',
    vigencia_desde: '2027-01-01', vigencia_hasta: '2027-01-31', vigencia_hora_desde: '09:00', vigencia_hora_hasta: '18:00',
  });
  expect(notifications.success).toHaveBeenCalledTimes(1);
});

test.each(['descuento_servicio', 'descuento_paquete', 'dos_por_uno_servicio'])('crear mantiene contrato %s', async (type) => {
  auth.roles = ['admin']; auth.branchIds = [A];
  render(<Page />);
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva' }));
  const dialog = await screen.findByRole('dialog');
  const typeSelect = within(dialog).getByRole('option', { name: 'Descuento a servicio' }).parentElement;
  fireEvent.change(typeSelect, { target: { value: type } });
  const targetLabel = type === 'descuento_paquete' ? 'Paquete vigente' : 'Servicio vigente';
  const target = await within(dialog).findByRole('option', { name: targetLabel });
  fireEvent.change(target.parentElement, { target: { value: type === 'descuento_paquete' ? PACKAGE : SERVICE } });
  const textInputs = within(dialog).getAllByRole('textbox');
  fireEvent.change(textInputs[0], { target: { value: 'Promocion nueva' } });
  fireEvent.change(dialog.querySelector('textarea'), { target: { value: 'Descripcion nueva' } });
  if (type === 'dos_por_uno_servicio') {
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0], { target: { value: '2' } });
  } else {
    fireEvent.change(within(dialog).getByPlaceholderText('Ej: 10'), { target: { value: '15' } });
  }
  fireEvent.click(within(dialog).getByRole('button', { name: 'Crear promocion' }));
  await waitFor(() => expect(api.createAdminConfigPromocion).toHaveBeenCalledTimes(1));
  const payload = api.createAdminConfigPromocion.mock.calls[0][0];
  expect(payload).toMatchObject({ id_sucursal: A, titulo: 'Promocion nueva', tipo_promocion: type, estado: 'borrador', visible_publico: false, destacada: false });
  if (type === 'dos_por_uno_servicio') expect(payload).toMatchObject({ mecanica: 'dos_por_uno', cantidad_requerida: 2, cantidad_bonificada: 1, valor_descuento: null });
  else expect(payload).toMatchObject({ mecanica: 'porcentaje', valor_descuento: 15, cantidad_requerida: null, cantidad_bonificada: null });
  expect(sync.emitCatalogSync).toHaveBeenCalledWith('promocion-created');
});

test('paquete historico persiste aunque catalogo auxiliar este vacio', async () => {
  auth.roles = ['admin']; auth.branchIds = [A];
  api.getAdminConfigPromocion.mockResolvedValue({ data: { promocion: promo(A, 'Promo paquete', { tipo_promocion: 'descuento_paquete', aplica_a: 'paquete', id_servicio_objetivo: null, id_paquete_objetivo: PACKAGE }) } });
  packages.listAdminPaquetes.mockResolvedValue({ data: { paquetes: [] } });
  render(<Page />); const dialog = await editor();
  expect(within(dialog).getByRole('option', { name: 'Objetivo existente (No disponible)' })).toHaveValue(PACKAGE);
  fireEvent.change(dialog.querySelector('textarea'), { target: { value: 'Descripcion editada' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.updateAdminConfigPromocion).toHaveBeenCalledTimes(1));
  expect(api.updateAdminConfigPromocion.mock.calls[0][1]).toMatchObject({ id_sucursal: A, id_paquete_objetivo: PACKAGE, id_servicio_objetivo: null, valor_descuento: 10 });
});
