// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { StrictMode } from 'react';
import AdminServiciosCatalogoPublicoPage from '../AdminServiciosCatalogoPublicoPage.jsx';

const api = vi.hoisted(() => ({ getPublicCatalog: vi.fn(), listPublicCatalogBranches: vi.fn(), listPublicCatalogPlans: vi.fn() }));
const sync = vi.hoisted(() => ({ callback: null }));
vi.mock('../../../public/lib/catalogApi.js', () => api);
vi.mock('../../../../lib/catalogSync.js', () => ({ subscribeCatalogSync: (callback) => { sync.callback = callback; return () => {}; } }));

const service = (name, agendable, informative = false, order = 10) => ({
  id_servicio: name, nombre_servicio: name, agendable, servicio_informativo: informative,
  activo: true, descripcion: `Detalle ${name}`, precio_hnl: 123, duracion_min: 25, orden_visual: order,
});
beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.listPublicCatalogBranches.mockResolvedValue({ branches: [
    { id_sucursal: 'A', nombre_sucursal: 'Centro' }, { id_sucursal: 'B', nombre_sucursal: 'Norte' },
  ] });
  api.getPublicCatalog.mockResolvedValue({ services: [
    service('Reservable', true), service('Informativo', false, true),
    service('No reservable', false, false, 20), service('Sin confirmar', undefined, false, 5),
  ], packages: [{ id_paquete: 'P', nombre_paquete: 'Combo', precio_hnl: 300, items: [] }] });
  api.listPublicCatalogPlans.mockResolvedValue({ plans: [{ id_plan: 'VIP', nombre_plan: 'Plan VIP', precio_hnl: 500 }] });
});
afterEach(cleanup);

test('QA11: fallo de sucursales no expone detalles técnicos y permite reintentar', async () => {
  api.listPublicCatalogBranches.mockRejectedValueOnce({ message: 'ECONNREFUSED private.internal password=SYNTHETIC' }).mockResolvedValueOnce({ branches: [{ id_sucursal: 'A', nombre_sucursal: 'Centro' }] });
  render(<AdminServiciosCatalogoPublicoPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el catálogo público.');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Reservable');
  expect(api.listPublicCatalogBranches).toHaveBeenCalledTimes(2);
});

test('clasifica servicios por el contrato sin duplicar y conserva datos y orden', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  const booked = (await screen.findByRole('heading', { name: 'Servicios agendables' })).closest('section');
  expect(within(booked).getByText('Reservable')).toBeInTheDocument();
  expect(within(booked).queryByText('No reservable')).not.toBeInTheDocument();
  expect(within(booked).queryByText('Sin confirmar')).not.toBeInTheDocument();
  const unavailable = screen.getByRole('heading', { name: 'Servicios no disponibles para agendar' }).closest('section');
  const cards = within(unavailable).getAllByRole('article');
  expect(cards[0]).toHaveTextContent('Sin confirmar');
  expect(cards[1]).toHaveTextContent('No reservable');
  expect(cards[1]).toHaveTextContent('Detalle No reservable');
  expect(cards[1]).toHaveTextContent('Precio: L 123.00');
  expect(cards[1]).toHaveTextContent('Duración: 25 min');
  const informative = screen.getByRole('heading', { name: 'Servicios informativos' }).closest('section');
  expect(within(informative).getByText('Informativo')).toBeInTheDocument();
  expect(screen.getAllByText('No reservable')).toHaveLength(1);
  expect(screen.getByText('Combo')).toBeInTheDocument();
  expect(screen.getByText('Plan VIP')).toBeInTheDocument();
});

test('busqueda y selector Todas conservan comportamiento sin consultas por clasificacion', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('No reservable');
  expect(api.getPublicCatalog).toHaveBeenCalledWith({ id_sucursal: undefined });
  fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o descripción...'), { target: { value: 'No reservable' } });
  expect(screen.getByText('No reservable')).toBeInTheDocument();
  expect(screen.queryByText('Reservable')).not.toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'B' } });
  await screen.findByText('No reservable');
  expect(api.getPublicCatalog).toHaveBeenLastCalledWith({ id_sucursal: 'B' });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
  await screen.findByText('No reservable');
  expect(api.getPublicCatalog).toHaveBeenLastCalledWith({ id_sucursal: undefined });
  await act(async () => sync.callback());
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(4);
});

test('solo no agendables no activa el empty state general', async () => {
  api.getPublicCatalog.mockResolvedValue({ services: [service('No reservable', false)], packages: [] });
  api.listPublicCatalogPlans.mockResolvedValue({ plans: [] });
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('No reservable');
  expect(screen.queryByText('Sin elementos publicados')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Servicios agendables' })).not.toBeInTheDocument();
});

test('fallo de Servicios conserva Paquetes y VIP, evita vacio y recupera con reintento', async () => {
  api.getPublicCatalog.mockResolvedValueOnce({ services: [], packages: [{ id_paquete: 'P', nombre_paquete: 'Combo', precio_hnl: 300 }], errors: { services: true, packages: false } });
  render(<AdminServiciosCatalogoPublicoPage />);
  expect(await screen.findByText('No se pudieron cargar los servicios.')).toBeInTheDocument();
  expect(screen.getByText('Combo')).toBeInTheDocument();
  expect(screen.getByText('Plan VIP')).toBeInTheDocument();
  expect(screen.queryByText('Sin elementos publicados')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Reservable')).toBeInTheDocument();
  expect(screen.queryByText('No se pudieron cargar los servicios.')).not.toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(2);
  expect(api.getPublicCatalog).toHaveBeenLastCalledWith({ id_sucursal: undefined });
});

test('fallo de Paquetes conserva clasificadores y precio; catalogSync recupera', async () => {
  api.getPublicCatalog.mockResolvedValueOnce({ services: [service('Reservable', true), service('No reservable', false)], packages: [], errors: { services: false, packages: true } });
  render(<AdminServiciosCatalogoPublicoPage />);
  expect(await screen.findByText('No se pudieron cargar los paquetes.')).toBeInTheDocument();
  expect(screen.getByText('Reservable')).toBeInTheDocument();
  expect(screen.getByText('No reservable')).toBeInTheDocument();
  expect(screen.getByText('Plan VIP')).toBeInTheDocument();
  expect(screen.getAllByText('Precio: L 123.00')).toHaveLength(2);
  await act(async () => sync.callback());
  expect(await screen.findByText('Combo')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('ambos catalogos fallan sin ocultar VIP ni exponer detalle interno', async () => {
  api.getPublicCatalog.mockRejectedValueOnce(new Error('SQL detalle privado'));
  render(<AdminServiciosCatalogoPublicoPage />);
  expect(await screen.findByText('No se pudieron cargar los servicios ni los paquetes.')).toBeInTheDocument();
  expect(screen.getByText('Plan VIP')).toBeInTheDocument();
  expect(screen.queryByText('SQL detalle privado')).not.toBeInTheDocument();
  expect(screen.queryByText('Sin elementos publicados')).not.toBeInTheDocument();
});

test('catalogos vacios exitosos conservan empty state sin alertas', async () => {
  api.getPublicCatalog.mockResolvedValue({ services: [], packages: [], errors: { services: false, packages: false } });
  api.listPublicCatalogPlans.mockResolvedValue({ plans: [] });
  render(<AdminServiciosCatalogoPublicoPage />);
  expect(await screen.findByText('Sin elementos publicados')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const catalog = (name) => ({ services: [service(`Servicio ${name}`, true)], packages: [{ id_paquete: name, nombre_paquete: `Paquete ${name}`, precio_hnl: 300 }] });
const vip = (name) => ({ plans: [{ id_plan: name, nombre_plan: `VIP ${name}`, precio_hnl: 500 }] });
const chooseBranch = (value) => fireEvent.change(screen.getByRole('combobox'), { target: { value } });

test('A/B respuesta antigua no sustituye Servicios, Paquetes ni VIP vigentes', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('Reservable');
  const oldCatalog = deferred();
  const oldVip = deferred();
  api.getPublicCatalog.mockImplementation(({ id_sucursal }) => id_sucursal === 'A' ? oldCatalog.promise : Promise.resolve(catalog('B')));
  api.listPublicCatalogPlans.mockImplementation(({ id_sucursal }) => id_sucursal === 'A' ? oldVip.promise : Promise.resolve(vip('B')));
  chooseBranch('A');
  chooseBranch('B');
  await screen.findByText('Servicio B');
  await act(async () => { oldCatalog.resolve(catalog('A')); oldVip.resolve(vip('A')); });
  expect(screen.getByText('Servicio B')).toBeInTheDocument();
  expect(screen.getByText('Paquete B')).toBeInTheDocument();
  expect(screen.getByText('VIP B')).toBeInTheDocument();
  expect(screen.queryByText('Servicio A')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('B');
});

test('error antiguo A no oculta resultado exitoso B', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  api.listPublicCatalogPlans.mockImplementation(({ id_sucursal }) => id_sucursal === 'A' ? old.promise : Promise.resolve(vip('B')));
  api.getPublicCatalog.mockImplementation(() => Promise.resolve(catalog('B')));
  chooseBranch('A');
  chooseBranch('B');
  await screen.findByText('VIP B');
  await act(async () => old.reject(new Error('Fallo antiguo A')));
  expect(screen.getByText('VIP B')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('Todas → A → B → A descarta generaciones anteriores incluso de A', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('Reservable');
  const first = deferred();
  const second = deferred();
  api.getPublicCatalog.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValueOnce(catalog('A vigente'));
  api.listPublicCatalogPlans.mockResolvedValue(vip('A vigente'));
  chooseBranch('A');
  chooseBranch('B');
  chooseBranch('A');
  await screen.findByText('Servicio A vigente');
  await act(async () => { second.resolve(catalog('B vieja')); first.resolve(catalog('A vieja')); });
  expect(screen.getByText('Servicio A vigente')).toBeInTheDocument();
  expect(screen.queryByText('Servicio A vieja')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('A');
});

test('catalogSync sustituye consulta pendiente y deja loading coherente', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  api.getPublicCatalog.mockReturnValueOnce(old.promise).mockResolvedValueOnce(catalog('sync'));
  chooseBranch('A');
  await act(async () => sync.callback());
  await screen.findByText('Servicio sync');
  await act(async () => old.resolve({ services: [], packages: [], errors: { services: true, packages: true } }));
  expect(screen.getByText('Servicio sync')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('reintento recupera fallo parcial sin aceptar respuesta vieja de catalogSync', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  api.getPublicCatalog.mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ services: [], packages: [], errors: { services: true, packages: false } })
    .mockResolvedValueOnce(catalog('recuperado'));
  await act(async () => sync.callback());
  await act(async () => sync.callback());
  await screen.findByText('No se pudieron cargar los servicios.');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Servicio recuperado');
  await act(async () => old.resolve(catalog('viejo')));
  expect(screen.getByText('Servicio recuperado')).toBeInTheDocument();
});

test('volver a Todas mantiene su scope ante respuesta tardia A', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  api.getPublicCatalog.mockReturnValueOnce(old.promise).mockResolvedValueOnce(catalog('Todas'));
  chooseBranch('A');
  chooseBranch('');
  await screen.findByText('Servicio Todas');
  await act(async () => old.resolve(catalog('A')));
  expect(screen.getByText('Servicio Todas')).toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenLastCalledWith({ id_sucursal: undefined });
});

test('StrictMode carga inicialmente una sola vez y desmontaje descarta respuesta', async () => {
  const pending = deferred();
  api.getPublicCatalog.mockReturnValue(pending.promise);
  const view = render(<StrictMode><AdminServiciosCatalogoPublicoPage /></StrictMode>);
  await screen.findByRole('option', { name: 'Centro' });
  expect(api.listPublicCatalogBranches).toHaveBeenCalledTimes(1);
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () => pending.resolve(catalog('tardio')));
  expect(screen.queryByText('Servicio tardio')).not.toBeInTheDocument();
});

test('catalogSync antes de recibir sucursales no invalida inicializacion ni duplica consultas', async () => {
  const branches = deferred();
  api.listPublicCatalogBranches.mockReturnValue(branches.promise);
  render(<AdminServiciosCatalogoPublicoPage />);
  await act(async () => sync.callback());
  await act(async () => branches.resolve({ branches: [{ id_sucursal: 'A', nombre_sucursal: 'Centro' }] }));
  await screen.findByText('Reservable');
  expect(screen.getByRole('option', { name: 'Centro' })).toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledExactlyOnceWith({ id_sucursal: 'A' });
});

test('06H A VIP falla pero conserva Servicios/Paquetes y recupera mediante reintento', async () => {
  const pending = deferred();
  api.listPublicCatalogPlans.mockReturnValueOnce(pending.promise);
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByRole('option', { name: 'Centro' });
  await act(async () => pending.reject(new Error('Detalle privado VIP')));
  expect(await screen.findByText('No se pudieron cargar los planes VIP.')).toBeInTheDocument();
  expect(screen.getByText('Reservable')).toBeInTheDocument();
  expect(screen.getByText('Combo')).toBeInTheDocument();
  expect(screen.queryByText('Detalle privado VIP')).not.toBeInTheDocument();
  const alert = screen.getByText('No se pudieron cargar los planes VIP.').closest('[role="alert"]');
  fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Plan VIP')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
  expect(api.listPublicCatalogPlans).toHaveBeenCalledTimes(2);
});

test('06H E todas fallan: errores por seccion sin empty state falso', async () => {
  api.getPublicCatalog.mockRejectedValue(new Error('Fallo privado catalogo'));
  api.listPublicCatalogPlans.mockRejectedValue(new Error('Fallo privado VIP'));
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('No se pudieron cargar los planes VIP.');
  expect(screen.getByText('No se pudieron cargar los servicios ni los paquetes.')).toBeInTheDocument();
  expect(screen.queryByText('Sin elementos publicados')).not.toBeInTheDocument();
  expect(screen.queryByText('Fallo privado VIP')).not.toBeInTheDocument();
});

test('06H F B conserva su catalogo aunque VIP falle, sin datos previos de A', async () => {
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('Plan VIP');
  api.getPublicCatalog.mockResolvedValue(catalog('B'));
  api.listPublicCatalogPlans.mockRejectedValue(new Error('Fallo VIP B'));
  chooseBranch('B');
  await screen.findByText('Servicio B');
  await screen.findByText('No se pudieron cargar los planes VIP.');
  expect(screen.getByText('Servicio B')).toBeInTheDocument();
  expect(screen.getByText('Paquete B')).toBeInTheDocument();
  expect(screen.queryByText('Reservable')).not.toBeInTheDocument();
  expect(screen.queryByText('Plan VIP')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('B');
});

test('06H reintento VIP fallido conserva alerta; respuesta obsoleta no revierte recuperacion', async () => {
  const old = deferred();
  api.listPublicCatalogPlans.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('Fallo VIP')).mockResolvedValueOnce(vip('recuperado'));
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByRole('option', { name: 'Norte' });
  await act(async () => sync.callback());
  await screen.findByText('No se pudieron cargar los planes VIP.');
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('VIP recuperado');
  await act(async () => old.reject(new Error('Fallo antiguo VIP')));
  expect(screen.getByText('VIP recuperado')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('06H reintento exclusivo VIP fallido conserva catalogo y mensaje seguro', async () => {
  api.listPublicCatalogPlans.mockRejectedValue(new Error('Detalle privado VIP'));
  render(<AdminServiciosCatalogoPublicoPage />);
  await screen.findByText('No se pudieron cargar los planes VIP.');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })));
  expect(screen.getByText('No se pudieron cargar los planes VIP.')).toBeInTheDocument();
  expect(screen.getByText('Reservable')).toBeInTheDocument();
  expect(screen.getByText('Combo')).toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
  expect(api.listPublicCatalogPlans).toHaveBeenCalledTimes(2);
});
