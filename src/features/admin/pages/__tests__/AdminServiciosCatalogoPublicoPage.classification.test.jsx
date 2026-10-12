// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
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
