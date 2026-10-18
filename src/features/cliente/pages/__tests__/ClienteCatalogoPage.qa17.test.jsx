// @vitest-environment jsdom

import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ClienteCatalogoPage from '../ClienteCatalogoPage.jsx';

const api = vi.hoisted(() => ({ getPublicCatalog: vi.fn(), listPublicCatalogBranches: vi.fn(), listPublicCatalogPromotions: vi.fn(), searchPublicCatalog: vi.fn() }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('../../../public/lib/catalogApi.js', () => api);
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => ({ error: notify }) }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ hash: '' }) }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Object.values(api).forEach((mock) => mock.mockReset());
  api.listPublicCatalogBranches.mockRejectedValueOnce(new Error('SQL connection internal detail'))
    .mockResolvedValue({ branches: [{ id_sucursal: 'A', nombre_sucursal: 'Suyapa' }] });
  api.getPublicCatalog.mockResolvedValue({ services: [{ id_servicio: 'S', nombre_servicio: 'Corte QA', agendable: true, precio_hnl: 300, duracion_min: 45 }], packages: [] });
  api.listPublicCatalogPromotions.mockResolvedValue({ promotions: [] });
});
afterEach(cleanup);

test('AM: fallo de sucursales no se presenta como catálogo vacío y ofrece recuperación', async () => {
  render(<ClienteCatalogoPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las sucursales.');
  expect(screen.queryByText('No hay servicios publicados para esta sucursal.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  expect(api.getPublicCatalog).not.toHaveBeenCalled();
  expect(api.listPublicCatalogPromotions).not.toHaveBeenCalled();
});

test('AM: fallo de sucursales no expone el mensaje técnico', async () => {
  render(<ClienteCatalogoPage />);
  await waitFor(() => expect(notify).toHaveBeenCalled());
  expect(notify).toHaveBeenCalledWith('No se pudieron cargar las sucursales. Intenta nuevamente.');
});

test('AM: reintento recupera sucursal y catálogo sin consulta global accidental', async () => {
  render(<ClienteCatalogoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Corte QA')).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('A');
  expect(screen.getByText('L 300.00')).toBeInTheDocument();
  expect(screen.getByText('Duración: 45 min')).toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledExactlyOnceWith({ id_sucursal: 'A' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('AM: fallo inicial bloquea filtros sin alcance confirmado', async () => {
  render(<ClienteCatalogoPage />);
  await waitFor(() => expect(notify).toHaveBeenCalled());
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByPlaceholderText('Buscar servicios o paquetes...')).toBeDisabled();
});

test('AM: segundo fallo de sucursales conserva error recuperable y no consulta catálogos', async () => {
  api.listPublicCatalogBranches.mockRejectedValue(new Error('internal error'));
  render(<ClienteCatalogoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(api.listPublicCatalogBranches).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las sucursales.');
  expect(api.getPublicCatalog).not.toHaveBeenCalled();
});

test('AM: recuperación en StrictMode y desmontaje pendiente no aplican resultados tardíos', async () => {
  let resolveBranches;
  api.listPublicCatalogBranches.mockReset().mockImplementationOnce(() => new Promise((resolve) => { resolveBranches = resolve; }));
  const view = render(<StrictMode><ClienteCatalogoPage /></StrictMode>);
  await waitFor(() => expect(api.listPublicCatalogBranches).toHaveBeenCalledTimes(1));
  view.unmount();
  resolveBranches({ branches: [{ id_sucursal: 'A', nombre_sucursal: 'Suyapa' }] });
  await Promise.resolve();
  expect(api.getPublicCatalog).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});
