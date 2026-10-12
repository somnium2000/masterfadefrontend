// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ClienteCatalogoPage from '../ClienteCatalogoPage.jsx';

const api = vi.hoisted(() => ({ getPublicCatalog: vi.fn(), listPublicCatalogBranches: vi.fn(), listPublicCatalogPromotions: vi.fn(), searchPublicCatalog: vi.fn() }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('../../../public/lib/catalogApi.js', () => api);
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => ({ error: notify }) }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ hash: '' }) }));
const service = (name, agendable, informative = false) => ({
  id_servicio: name, nombre_servicio: name, agendable, servicio_informativo: informative,
  activo: true, descripcion: `Detalle ${name}`, precio_hnl: 123, duracion_min: 25,
});
beforeEach(() => {
  localStorage.clear();
  notify.mockReset();
  Object.values(api).forEach((mock) => mock.mockReset());
  api.listPublicCatalogBranches.mockResolvedValue({ branches: [
    { id_sucursal: 'A', nombre_sucursal: 'Centro' }, { id_sucursal: 'B', nombre_sucursal: 'Norte' },
  ] });
  const catalog = { services: [service('Reservable', true), service('Informativo', false, true),
    service('No reservable', false), service('Sin confirmar', undefined)],
  packages: [{ id_paquete: 'P', nombre_paquete: 'Combo', precio_hnl: 300, items: [] }] };
  api.getPublicCatalog.mockResolvedValue(catalog);
  api.searchPublicCatalog.mockResolvedValue(catalog);
  api.listPublicCatalogPromotions.mockResolvedValue({ promotions: [{ id_promocion: 'promo', titulo: 'Promocion vigente', parrafos: [] }] });
});
afterEach(cleanup);

test('no agendables mantienen visibilidad separada y los informativos conservan su tratamiento', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const booked = document.getElementById('servicios');
  expect(within(booked).queryByText('No reservable')).not.toBeInTheDocument();
  expect(within(booked).queryByText('Sin confirmar')).not.toBeInTheDocument();
  const unavailable = screen.getByText('Servicios no disponibles para agendar').closest('section');
  expect(within(unavailable).getByText('No reservable')).toBeInTheDocument();
  expect(within(unavailable).getByText('Sin confirmar')).toBeInTheDocument();
  expect(within(unavailable).getByText('Detalle No reservable')).toBeInTheDocument();
  expect(within(unavailable).getAllByText('L 123.00')).toHaveLength(2);
  expect(within(unavailable).getAllByText('Duración: 25 min')).toHaveLength(2);
  const cards = within(unavailable).getAllByRole('article');
  expect(cards[0]).toHaveTextContent('No reservable');
  expect(cards[1]).toHaveTextContent('Sin confirmar');
  expect(screen.queryByText('Informativo')).not.toBeInTheDocument();
  expect(screen.getAllByText('No reservable')).toHaveLength(1);
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
});

test('sucursal almacenada, cambio de sucursal, paquetes y promociones conservados', async () => {
  localStorage.setItem('mf_cliente_catalog_sucursal', 'B');
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  expect(screen.getByRole('combobox')).toHaveValue('B');
  expect(api.getPublicCatalog).toHaveBeenCalledWith({ id_sucursal: 'B' });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'A' } });
  await screen.findByText('Reservable');
  expect(localStorage.getItem('mf_cliente_catalog_sucursal')).toBe('A');
  expect(api.getPublicCatalog).toHaveBeenLastCalledWith({ id_sucursal: 'A' });
  fireEvent.click(screen.getByRole('button', { name: /Paquetes Combos disponibles/ }));
  expect(screen.getByText('Combo')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Promociones Beneficios vigentes/ }));
  expect(screen.getByRole('heading', { name: 'Promocion vigente' })).toBeInTheDocument();
});

test('busqueda del cliente sigue usando la sucursal y no normaliza como agendable', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  fireEvent.change(screen.getByPlaceholderText('Buscar servicios o paquetes...'), { target: { value: 'consulta' } });
  await waitFor(() => expect(api.searchPublicCatalog).toHaveBeenCalledWith({ q: 'consulta', id_sucursal: 'A' }));
  await screen.findByText('No reservable');
  expect(within(document.getElementById('servicios')).queryByText('No reservable')).not.toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
});
