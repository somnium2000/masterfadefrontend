// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { StrictMode } from 'react';
import ServicesPage from '../ServicesPage.jsx';

const api = vi.hoisted(() => ({
  listPublicCatalogBranches: vi.fn(),
  listPublicCatalogServices: vi.fn(),
  listPublicCatalogPackages: vi.fn(),
}));
const sync = vi.hoisted(() => ({ callback: null, unsubscribe: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('../../lib/catalogApi.js', () => api);
vi.mock('../../../../lib/catalogSync.js', () => ({
  subscribeCatalogSync: (callback) => { sync.callback = callback; return sync.unsubscribe; },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('../../../../components/branding/MasterfadeLogo.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/navigation/PremiumBottomNav.jsx', () => ({
  default: ({ fabItem }) => <button type="button" onClick={fabItem.onClick}>{fabItem.label}</button>,
}));

const branches = [
  { id_sucursal: 'A', nombre_sucursal: 'Centro', estado: true },
  { id_sucursal: 'B', nombre_sucursal: 'Norte', estado: true },
];
const service = (name, informative = false) => ({
  id_servicio: name, nombre_servicio: name, precio_hnl: 150, duracion_min: 30,
  servicio_informativo: informative,
});
const pkg = (name) => ({
  id_paquete: name, nombre_paquete: name, precio_hnl: 300,
  items: [{ id_servicio: 'corte', nombre_servicio: 'Corte', cantidad: 2 }],
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const catalogCalls = () => [...api.listPublicCatalogServices.mock.calls, ...api.listPublicCatalogPackages.mock.calls];

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  navigate.mockReset();
  sync.callback = null;
  sync.unsubscribe.mockReset();
  api.listPublicCatalogBranches.mockResolvedValue({ branches });
  api.listPublicCatalogServices.mockResolvedValue({ services: [service('Corte A')] });
  api.listPublicCatalogPackages.mockResolvedValue({ packages: [pkg('Paquete A')] });
});
afterEach(() => cleanup());

describe('catálogo público por sucursal', () => {
  test('selecciona la primera sucursal y conserva servicios, paquetes y navegación', async () => {
    render(<ServicesPage />);
    expect(await screen.findByText('Corte A')).toBeInTheDocument();
    expect(screen.getByText('Paquete A')).toBeInTheDocument();
    expect(api.listPublicCatalogServices).toHaveBeenCalledWith({ id_sucursal: 'A' });
    expect(api.listPublicCatalogPackages).toHaveBeenCalledWith({ id_sucursal: 'A' });
    expect(screen.getByText('L 150.00')).toBeInTheDocument();
    expect(screen.getByText('L 300.00')).toBeInTheDocument();
    expect(screen.getByText('Corte x2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
    expect(navigate).toHaveBeenCalledWith('/agendar/barberos');
  });

  test('separa los servicios informativos de los agendables', async () => {
    api.listPublicCatalogServices.mockResolvedValue({ services: [service('Corte A'), service('Consulta A', true)] });
    render(<ServicesPage />);
    const agendable = await screen.findByRole('heading', { name: 'Servicios agendables' });
    const informative = screen.getByRole('heading', { name: 'Servicios informativos' });
    expect(within(agendable.closest('section')).getByText('Corte A')).toBeInTheDocument();
    expect(within(informative.closest('section')).getByText('Consulta A')).toBeInTheDocument();
  });

  test('colecciones realmente vacías muestran sus mensajes normales', async () => {
    api.listPublicCatalogServices.mockResolvedValue({ services: [] });
    api.listPublicCatalogPackages.mockResolvedValue({ packages: [] });
    render(<ServicesPage />);
    expect(await screen.findByText('Aun no hay servicios agendables visibles.')).toBeInTheDocument();
    expect(screen.getByText('Aun no hay servicios informativos visibles.')).toBeInTheDocument();
    expect(screen.getByText('Aun no hay paquetes visibles.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('un error exclusivo de paquetes no se representa como lista vacía', async () => {
    api.listPublicCatalogPackages.mockRejectedValue(new Error('server detail'));
    render(<ServicesPage />);
    expect(await screen.findByText('Corte A')).toBeInTheDocument();
    expect(screen.getByText(/No se pudieron cargar los paquetes/i)).toBeInTheDocument();
    expect(screen.queryByText('Aun no hay paquetes visibles.')).not.toBeInTheDocument();
  });

  test('un error exclusivo de servicios conserva los paquetes cargados', async () => {
    api.listPublicCatalogServices.mockRejectedValue(new Error('stack detail'));
    render(<ServicesPage />);
    expect(await screen.findByText('Paquete A')).toBeInTheDocument();
    expect(screen.getByText('No se pudieron cargar los servicios.')).toBeInTheDocument();
    expect(screen.queryByText('Aun no hay servicios agendables visibles.')).not.toBeInTheDocument();
    expect(screen.queryByText('stack detail')).not.toBeInTheDocument();
  });

  test('dos fallos muestran error general y permiten reintento', async () => {
    api.listPublicCatalogServices.mockRejectedValueOnce(new Error('service stack'));
    api.listPublicCatalogPackages.mockRejectedValueOnce(new Error('package stack'));
    render(<ServicesPage />);
    expect(await screen.findByText('No se pudieron cargar los servicios ni los paquetes.')).toBeInTheDocument();
    expect(screen.queryByText(/stack/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Corte A')).toBeInTheDocument();
    expect(screen.getByText('Paquete A')).toBeInTheDocument();
  });

  test('un error de sucursales reintenta sucursales y no consulta catálogos globales', async () => {
    api.listPublicCatalogBranches.mockRejectedValueOnce(new Error('server detail'));
    render(<ServicesPage />);
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(catalogCalls()).toHaveLength(0);
    fireEvent.click(retry);
    await screen.findByText('Corte A');
    expect(api.listPublicCatalogBranches).toHaveBeenCalledTimes(2);
    expect(catalogCalls().every(([options]) => options.id_sucursal)).toBe(true);
  });

  test('filtra sucursales inactivas y selecciona la primera activa', async () => {
    api.listPublicCatalogBranches.mockResolvedValue({ branches: [
      { id_sucursal: 'X', nombre_sucursal: 'Inactiva', estado: false }, ...branches,
    ] });
    render(<ServicesPage />);
    await screen.findByText('Corte A');
    expect(screen.queryByRole('button', { name: 'Inactiva' })).not.toBeInTheDocument();
    expect(catalogCalls().every(([options]) => options.id_sucursal === 'A')).toBe(true);
  });

  test('sin sucursales activas no solicita un catálogo global', async () => {
    api.listPublicCatalogBranches.mockResolvedValue({ branches: [] });
    render(<ServicesPage />);
    expect(await screen.findByText('No hay sucursales disponibles en este momento.')).toBeInTheDocument();
    expect(catalogCalls()).toHaveLength(0);
  });

  test('solo sucursales inactivas produce estado sin sucursales', async () => {
    api.listPublicCatalogBranches.mockResolvedValue({ branches: [
      { id_sucursal: 'X', nombre_sucursal: 'Inactiva', estado: false },
    ] });
    render(<ServicesPage />);
    expect(await screen.findByText('No hay sucursales disponibles en este momento.')).toBeInTheDocument();
    expect(catalogCalls()).toHaveLength(0);
  });

  test('cambio a B oculta de inmediato los productos de A y carga los de B', async () => {
    const slowB = deferred();
    api.listPublicCatalogServices.mockImplementation(({ id_sucursal }) => id_sucursal === 'B'
      ? slowB.promise : Promise.resolve({ services: [service('Corte A')] }));
    api.listPublicCatalogPackages.mockImplementation(({ id_sucursal }) => Promise.resolve({ packages: [pkg(`Paquete ${id_sucursal}`)] }));
    render(<ServicesPage />);
    await screen.findByText('Corte A');
    fireEvent.click(screen.getByRole('button', { name: 'Norte' }));
    expect(screen.getByText('Cargando catalogo')).toBeInTheDocument();
    expect(screen.queryByText('Corte A')).not.toBeInTheDocument();
    expect(screen.queryByText('Paquete A')).not.toBeInTheDocument();
    await act(async () => slowB.resolve({ services: [service('Corte B')] }));
    expect(await screen.findByText('Corte B')).toBeInTheDocument();
    expect(screen.getByText('Paquete B')).toBeInTheDocument();
  });

  test('pulsar la sucursal vigente no genera refetch', async () => {
    render(<ServicesPage />);
    await screen.findByText('Corte A');
    const calls = catalogCalls().length;
    fireEvent.click(screen.getByRole('button', { name: 'Centro' }));
    expect(catalogCalls()).toHaveLength(calls);
  });

  test('respuesta tardía de A no sustituye el catálogo vigente de B', async () => {
    const slowA = deferred();
    api.listPublicCatalogServices.mockImplementation(({ id_sucursal }) => id_sucursal === 'A'
      ? slowA.promise : Promise.resolve({ services: [service('Corte B')] }));
    api.listPublicCatalogPackages.mockImplementation(({ id_sucursal }) => Promise.resolve({ packages: [pkg(`Paquete ${id_sucursal}`)] }));
    render(<ServicesPage />);
    await waitFor(() => expect(api.listPublicCatalogServices).toHaveBeenCalledWith({ id_sucursal: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Norte' }));
    expect(await screen.findByText('Corte B')).toBeInTheDocument();
    slowA.resolve({ services: [service('Corte A')] });
    await waitFor(() => expect(screen.getByText('Corte B')).toBeInTheDocument());
    expect(screen.queryByText('Corte A')).not.toBeInTheDocument();
  });

  test('error tardío de A no afecta el catálogo vigente de B', async () => {
    const slowA = deferred();
    api.listPublicCatalogServices.mockImplementation(({ id_sucursal }) => id_sucursal === 'A'
      ? slowA.promise : Promise.resolve({ services: [service('Corte B')] }));
    api.listPublicCatalogPackages.mockImplementation(({ id_sucursal }) => Promise.resolve({ packages: [pkg(`Paquete ${id_sucursal}`)] }));
    render(<ServicesPage />);
    await waitFor(() => expect(api.listPublicCatalogServices).toHaveBeenCalledWith({ id_sucursal: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Norte' }));
    await screen.findByText('Corte B');
    await act(async () => slowA.reject(new Error('old error')));
    expect(screen.getByText('Corte B')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('A → B → A ignora la primera solicitud A aunque la sucursal vuelva a coincidir', async () => {
    const oldA = deferred();
    const newA = deferred();
    let callsA = 0;
    api.listPublicCatalogServices.mockImplementation(({ id_sucursal }) => {
      if (id_sucursal === 'B') return Promise.resolve({ services: [service('Corte B')] });
      callsA += 1;
      return callsA === 1 ? oldA.promise : newA.promise;
    });
    render(<ServicesPage />);
    await waitFor(() => expect(callsA).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Norte' }));
    await screen.findByText('Corte B');
    fireEvent.click(screen.getByRole('button', { name: 'Centro' }));
    await act(async () => oldA.resolve({ services: [service('Corte A antiguo')] }));
    expect(screen.queryByText('Corte A antiguo')).not.toBeInTheDocument();
    await act(async () => newA.resolve({ services: [service('Corte A vigente')] }));
    expect(await screen.findByText('Corte A vigente')).toBeInTheDocument();
  });

  test('catalogSync actualiza la sucursal vigente y un fallo silencioso queda indicado', async () => {
    render(<ServicesPage />);
    await screen.findByText('Corte A');
    api.listPublicCatalogServices.mockRejectedValueOnce(new Error('refresh failed'));
    act(() => sync.callback());
    expect(await screen.findByText('No se pudieron cargar los servicios.')).toBeInTheDocument();
    expect(screen.queryByText('Corte A')).not.toBeInTheDocument();
    expect(api.listPublicCatalogServices).toHaveBeenLastCalledWith({ id_sucursal: 'A' });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Corte A')).toBeInTheDocument();
  });

  test('catalogSync durante cambio de sucursal no permite que la carga anterior gane', async () => {
    const oldB = deferred();
    api.listPublicCatalogServices.mockImplementationOnce(() => Promise.resolve({ services: [service('Corte A')] }))
      .mockImplementationOnce(() => oldB.promise)
      .mockImplementationOnce(() => Promise.resolve({ services: [service('Corte B actual')] }));
    render(<ServicesPage />);
    await screen.findByText('Corte A');
    fireEvent.click(screen.getByRole('button', { name: 'Norte' }));
    act(() => sync.callback());
    expect(await screen.findByText('Corte B actual')).toBeInTheDocument();
    await act(async () => oldB.resolve({ services: [service('Corte B anterior')] }));
    expect(screen.queryByText('Corte B anterior')).not.toBeInTheDocument();
    expect(api.listPublicCatalogServices).toHaveBeenLastCalledWith({ id_sucursal: 'B' });
  });

  test('reintento de catálogo conserva la sucursal seleccionada', async () => {
    api.listPublicCatalogServices.mockImplementation(({ id_sucursal }) => id_sucursal === 'B'
      ? Promise.reject(new Error('failed')) : Promise.resolve({ services: [service('Corte A')] }));
    render(<ServicesPage />);
    await screen.findByText('Corte A');
    fireEvent.click(screen.getByRole('button', { name: 'Norte' }));
    await screen.findByText('No se pudieron cargar los servicios.');
    api.listPublicCatalogServices.mockResolvedValue({ services: [service('Corte B')] });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Corte B')).toBeInTheDocument();
    expect(api.listPublicCatalogServices).toHaveBeenLastCalledWith({ id_sucursal: 'B' });
  });

  test('desmontaje invalida solicitudes y cancela suscripción', async () => {
    const pending = deferred();
    api.listPublicCatalogServices.mockReturnValue(pending.promise);
    const view = render(<ServicesPage />);
    await waitFor(() => expect(api.listPublicCatalogServices).toHaveBeenCalled());
    view.unmount();
    await act(async () => pending.resolve({ services: [service('Corte tardío')] }));
    expect(sync.unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Corte tardío')).not.toBeInTheDocument();
  });

  test('StrictMode no duplica la carga inicial después de limpiar el primer efecto', async () => {
    render(<StrictMode><ServicesPage /></StrictMode>);
    await screen.findByText('Corte A');
    expect(api.listPublicCatalogBranches).toHaveBeenCalledTimes(1);
    expect(api.listPublicCatalogServices).toHaveBeenCalledTimes(1);
    expect(sync.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
