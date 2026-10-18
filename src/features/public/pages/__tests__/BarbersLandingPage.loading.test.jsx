// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import BarbersLandingPage from '../BarbersLandingPage.jsx';

const api = vi.hoisted(() => ({ branches: vi.fn(), barbers: vi.fn() }));
vi.mock('../../lib/catalogApi.js', () => ({ listPublicCatalogBranches: api.branches }));
vi.mock('../../booking/publicBookingApi.js', () => ({ listPublicAgendaBarberos: api.barbers }));
vi.mock('react-router-dom', () => ({ Link: ({ children }) => <span>{children}</span> }));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({ default: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  api.branches.mockResolvedValue({ branches: [{ id_sucursal: 'A' }, { id_sucursal: 'B' }] });
  api.barbers.mockResolvedValue({ data: { barberos: [] } });
  vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('consultas exitosas vacías muestran un vacío legítimo sin advertencia', async () => {
  render(<BarbersLandingPage />);
  expect(await screen.findByText('Sin barberos visibles')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(api.barbers).toHaveBeenCalledTimes(2);
});

test('sin sucursales públicas no consulta barberos', async () => {
  api.branches.mockResolvedValue({ branches: [] });
  render(<BarbersLandingPage />);
  await screen.findByText('Sin barberos visibles');
  expect(api.barbers).not.toHaveBeenCalled();
});

test('fallo total muestra error y solo reintenta por acción explícita', async () => {
  api.barbers.mockRejectedValue(new Error('detalle técnico privado'));
  render(<BarbersLandingPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el listado');
  expect(screen.queryByText('Sin barberos visibles')).not.toBeInTheDocument();
  expect(screen.queryByText('detalle técnico privado')).not.toBeInTheDocument();
  expect(api.barbers).toHaveBeenCalledTimes(2);
  api.barbers.mockResolvedValue({ data: { barberos: [] } });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Sin barberos visibles');
  expect(api.barbers).toHaveBeenCalledTimes(4);
});

test('éxito parcial conserva barberos, informa y permite reintento manual', async () => {
  api.barbers.mockImplementation(({ id_sucursal }) => id_sucursal === 'A'
    ? Promise.resolve({ data: { barberos: [{ id_empleado: '1', nombre_completo: 'Barbero sintético', visible_en_landing: true }] } })
    : Promise.reject(new Error('fallo B')));
  render(<BarbersLandingPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Algunas sucursales no pudieron cargarse');
  expect(screen.getByText('Barbero sintético')).toBeInTheDocument();
  expect(api.barbers).toHaveBeenCalledTimes(2);
  api.barbers.mockResolvedValue({ data: { barberos: [] } });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test('éxito parcial sin barberos no presenta vacío concluyente', async () => {
  api.barbers.mockResolvedValueOnce({ data: { barberos: [] } }).mockRejectedValueOnce(new Error('fallo'));
  render(<BarbersLandingPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Algunas sucursales');
  expect(screen.queryByText('Sin barberos visibles')).not.toBeInTheDocument();
});

test('fallo de sucursales conserva error y reintento existentes', async () => {
  api.branches.mockRejectedValue(new Error('fallo sucursales'));
  render(<BarbersLandingPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el listado');
  expect(api.barbers).not.toHaveBeenCalled();
  api.branches.mockResolvedValue({ branches: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Sin barberos visibles');
});
