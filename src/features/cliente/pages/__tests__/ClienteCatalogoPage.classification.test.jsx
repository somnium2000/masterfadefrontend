// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { StrictMode } from 'react';
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

test('separa uniformemente Servicios, Paquetes y Promociones en todos los anchos', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const sections = screen.getByTestId('cliente-catalog-sections');
  expect(sections).toHaveClass('flex', 'flex-col', 'gap-5', 'sm:gap-6');
  expect(sections).toContainElement(document.getElementById('servicios'));
  expect(sections).toContainElement(document.getElementById('paquetes'));
  expect(sections).toContainElement(document.getElementById('promociones'));
});

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

test('fallo Servicios conserva paquete y cantidades, reintenta en sucursal almacenada', async () => {
  localStorage.setItem('mf_cliente_catalog_sucursal', 'B');
  api.getPublicCatalog.mockResolvedValueOnce({ services: [], packages: [{ id_paquete: 'P', nombre_paquete: 'Combo', precio_hnl: 300, items: [{ id_servicio: 'S', nombre_servicio: 'Corte', cantidad: 2 }] }], errors: { services: true, packages: false } });
  render(<ClienteCatalogoPage />);
  expect(await screen.findByText('No se pudieron cargar los servicios.')).toBeInTheDocument();
  expect(screen.queryByText('No hay servicios publicados para esta sucursal.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Paquetes Combos disponibles/ }));
  expect(screen.getByText('Combo')).toBeInTheDocument();
  expect(screen.getByText('L 300.00')).toBeInTheDocument();
  expect(screen.getByText('- Corte x2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Servicios Selecciona tu experiencia/ }));
  expect(screen.getByText('Reservable')).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('B');
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(2);
  expect(api.getPublicCatalog).toHaveBeenLastCalledWith({ id_sucursal: 'B' });
  expect(notify).not.toHaveBeenCalled();
});

test('fallo Paquetes conserva Servicios y Promociones; no muestra vacio legitimo', async () => {
  api.getPublicCatalog.mockResolvedValueOnce({ services: [service('Reservable', true), service('No reservable', false)], packages: [], errors: { services: false, packages: true } });
  render(<ClienteCatalogoPage />);
  expect(await screen.findByText('No se pudieron cargar los paquetes.')).toBeInTheDocument();
  expect(screen.getByText('Reservable')).toBeInTheDocument();
  expect(screen.getByText('No reservable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Paquetes Combos disponibles/ }));
  expect(screen.queryByText('No hay paquetes activos para esta sucursal.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Promociones Beneficios vigentes/ }));
  expect(screen.getByRole('heading', { name: 'Promocion vigente' })).toBeInTheDocument();
});

test('ambos catalogos fallan con error seguro y Promociones conservadas', async () => {
  api.getPublicCatalog.mockRejectedValueOnce(new Error('SQL detalle privado'));
  render(<ClienteCatalogoPage />);
  expect(await screen.findByText('No se pudieron cargar los servicios ni los paquetes.')).toBeInTheDocument();
  expect(screen.queryByText('SQL detalle privado')).not.toBeInTheDocument();
  expect(screen.queryByText('No hay servicios publicados para esta sucursal.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Promociones Beneficios vigentes/ }));
  expect(screen.getByRole('heading', { name: 'Promocion vigente' })).toBeInTheDocument();
  expect(notify).not.toHaveBeenCalled();
});

test('vacio legitimo del cliente muestra empty states y ninguna alerta', async () => {
  api.getPublicCatalog.mockResolvedValue({ services: [], packages: [], errors: { services: false, packages: false } });
  render(<ClienteCatalogoPage />);
  expect(await screen.findByText('No hay servicios publicados para esta sucursal.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Paquetes Combos disponibles/ }));
  expect(screen.getByText('No hay paquetes activos para esta sucursal.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const catalog = (name) => ({ services: [service(`Servicio ${name}`, true)], packages: [{ id_paquete: name, nombre_paquete: `Paquete ${name}`, precio_hnl: 300, items: [] }] });
const promotions = (name) => ({ promotions: [{ id_promocion: name, titulo: `Promo ${name}`, parrafos: [] }] });
const chooseBranch = (value) => fireEvent.change(screen.getByRole('combobox'), { target: { value } });

test('A/B conserva catalogo B y Promociones cuando A responde tarde', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const oldCatalog = deferred();
  const oldPromo = deferred();
  api.getPublicCatalog.mockImplementation(({ id_sucursal }) => id_sucursal === 'B' ? Promise.resolve(catalog('B')) : oldCatalog.promise);
  api.listPublicCatalogPromotions.mockImplementation(({ id_sucursal }) => id_sucursal === 'B' ? Promise.resolve(promotions('B')) : oldPromo.promise);
  chooseBranch('');
  chooseBranch('B');
  await screen.findByText('Servicio B');
  await act(async () => { oldCatalog.resolve(catalog('Todas vieja')); oldPromo.resolve(promotions('Todas vieja')); });
  expect(screen.getByText('Servicio B')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Paquetes Combos disponibles/ }));
  expect(screen.getByText('Paquete B')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Promociones Beneficios vigentes/ }));
  expect(screen.getByRole('heading', { name: 'Promo B' })).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('B');
});

test('error de Promociones antiguo no notifica ni cambia loading vigente', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  api.getPublicCatalog.mockResolvedValue(catalog('B'));
  api.listPublicCatalogPromotions.mockReturnValueOnce(old.promise).mockResolvedValue(promotions('B'));
  chooseBranch('');
  chooseBranch('B');
  await screen.findByText('Servicio B');
  await act(async () => old.reject(new Error('Error viejo')));
  expect(notify).not.toHaveBeenCalled();
  expect(screen.getByText('Servicio B')).toBeInTheDocument();
});

test('A → B → A conserva la ultima generacion de A', async () => {
  const firstA = deferred();
  const oldB = deferred();
  api.getPublicCatalog.mockReturnValueOnce(firstA.promise).mockReturnValueOnce(oldB.promise).mockResolvedValueOnce(catalog('A vigente'));
  render(<ClienteCatalogoPage />);
  await screen.findByRole('option', { name: 'Norte' });
  chooseBranch('B');
  chooseBranch('A');
  await screen.findByText('Servicio A vigente');
  await act(async () => {
    firstA.resolve(catalog('A vieja'));
    oldB.resolve({ services: [], packages: [], errors: { services: true, packages: true } });
  });
  expect(screen.getByText('Servicio A vigente')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('consulta inicial pendiente no sobrescribe seleccion B posterior', async () => {
  const old = deferred();
  api.getPublicCatalog.mockReturnValueOnce(old.promise).mockResolvedValueOnce(catalog('B'));
  render(<ClienteCatalogoPage />);
  await screen.findByRole('option', { name: 'Norte' });
  chooseBranch('B');
  await screen.findByText('Servicio B');
  await act(async () => old.resolve(catalog('A inicial')));
  expect(screen.getByText('Servicio B')).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('B');
});

test('busqueda vieja no reemplaza texto ni resultado nuevo', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  api.searchPublicCatalog.mockReturnValueOnce(old.promise).mockResolvedValueOnce(catalog('nuevo'));
  const input = screen.getByPlaceholderText('Buscar servicios o paquetes...');
  fireEvent.change(input, { target: { value: 'viejo' } });
  await waitFor(() => expect(api.searchPublicCatalog).toHaveBeenCalledWith({ q: 'viejo', id_sucursal: 'A' }));
  fireEvent.change(input, { target: { value: 'nuevo' } });
  await screen.findByText('Servicio nuevo');
  await act(async () => old.resolve(catalog('viejo')));
  expect(screen.getByText('Servicio nuevo')).toBeInTheDocument();
  expect(input).toHaveValue('nuevo');
});

test('busqueda vieja no aplica durante debounce del termino nuevo', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  const current = deferred();
  api.searchPublicCatalog.mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
  const input = screen.getByPlaceholderText('Buscar servicios o paquetes...');
  fireEvent.change(input, { target: { value: 'viejo' } });
  await waitFor(() => expect(api.searchPublicCatalog).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'nuevo' } });
  await act(async () => old.resolve(catalog('viejo')));
  expect(screen.queryByText('Servicio viejo')).not.toBeInTheDocument();
  await act(async () => current.resolve(catalog('nuevo')));
  await screen.findByText('Servicio nuevo');
});

test('busqueda antigua en A no sustituye B ni genera consultas redundantes', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  api.searchPublicCatalog.mockImplementation(({ id_sucursal }) => id_sucursal === 'A' ? old.promise : Promise.resolve(catalog('B buscado')));
  fireEvent.change(screen.getByPlaceholderText('Buscar servicios o paquetes...'), { target: { value: 'corte' } });
  await waitFor(() => expect(api.searchPublicCatalog).toHaveBeenCalledTimes(1));
  chooseBranch('B');
  await screen.findByText('Servicio B buscado');
  await act(async () => old.resolve(catalog('A buscado')));
  expect(screen.getByText('Servicio B buscado')).toBeInTheDocument();
  expect(api.searchPublicCatalog).toHaveBeenCalledTimes(2);
});

test('limpiar busqueda invalida respuesta pendiente y vuelve al catalogo compartido', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  api.searchPublicCatalog.mockReturnValue(old.promise);
  api.getPublicCatalog.mockResolvedValue(catalog('sin filtro'));
  const input = screen.getByPlaceholderText('Buscar servicios o paquetes...');
  fireEvent.change(input, { target: { value: 'viejo' } });
  await waitFor(() => expect(api.searchPublicCatalog).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: '' } });
  await act(async () => old.resolve(catalog('viejo')));
  await screen.findByText('Servicio sin filtro');
  expect(screen.queryByText('Servicio viejo')).not.toBeInTheDocument();
});

test('StrictMode no duplica inicial y rechazo tras desmontaje no notifica', async () => {
  const old = deferred();
  api.listPublicCatalogPromotions.mockReturnValue(old.promise);
  const view = render(<StrictMode><ClienteCatalogoPage /></StrictMode>);
  await screen.findByRole('option', { name: 'Norte' });
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () => old.reject(new Error('Error despues de desmontar')));
  expect(notify).not.toHaveBeenCalled();
});

test('reintento mas reciente conserva recuperacion y descarta error parcial anterior', async () => {
  api.getPublicCatalog.mockResolvedValueOnce({ services: [], packages: [], errors: { services: true, packages: false } });
  render(<ClienteCatalogoPage />);
  await screen.findByText('No se pudieron cargar los servicios.');
  const old = deferred();
  api.getPublicCatalog.mockReturnValueOnce(old.promise).mockResolvedValueOnce(catalog('recuperado'));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Servicio recuperado');
  await act(async () => old.resolve({ services: [], packages: [], errors: { services: true, packages: true } }));
  expect(screen.getByText('Servicio recuperado')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(3);
});

test('respuesta vieja no libera loading de la sucursal nueva pendiente', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  const old = deferred();
  const current = deferred();
  api.getPublicCatalog.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  chooseBranch('B');
  chooseBranch('A');
  await act(async () => old.resolve(catalog('B viejo')));
  expect(screen.queryByText('Servicio B viejo')).not.toBeInTheDocument();
  expect(screen.queryByText('Reservable')).not.toBeInTheDocument();
  await act(async () => current.resolve(catalog('A vigente')));
  await screen.findByText('Servicio A vigente');
});

test('error vigente de reintento identifica Promociones con alerta segura', async () => {
  api.getPublicCatalog.mockResolvedValue({ services: [], packages: [], errors: { services: true, packages: false } });
  render(<ClienteCatalogoPage />);
  await screen.findByText('No se pudieron cargar los servicios.');
  api.listPublicCatalogPromotions.mockRejectedValueOnce(new Error('Detalle tecnico privado'));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('No se pudieron cargar las promociones.')).toBeInTheDocument();
  expect(notify).not.toHaveBeenCalled();
});

test('06H G fallo Promociones conserva catalogo, cantidades y reintento recupera', async () => {
  const pending = deferred();
  api.listPublicCatalogPromotions.mockReturnValueOnce(pending.promise);
  api.getPublicCatalog.mockResolvedValue({ services: [service('Reservable', true)], packages: [{ id_paquete: 'P', nombre_paquete: 'Combo', precio_hnl: 300, items: [{ id_servicio: 'S', nombre_servicio: 'Corte', cantidad: 2 }] }] });
  render(<ClienteCatalogoPage />);
  await screen.findByRole('option', { name: 'Centro' });
  await act(async () => pending.reject(new Error('Detalle privado Promociones')));
  await screen.findByText('No se pudieron cargar las promociones.');
  expect(screen.getByText('Reservable')).toBeInTheDocument();
  expect(screen.queryByText('Detalle privado Promociones')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Paquetes Combos disponibles/ }));
  expect(screen.getByText('- Corte x2')).toBeInTheDocument();
  expect(screen.getByText('L 300.00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Promociones Beneficios vigentes/ }));
  expect(screen.queryByText('Aún no hay promociones visibles para esta sucursal.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByRole('heading', { name: 'Promocion vigente' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
  expect(api.listPublicCatalogPromotions).toHaveBeenCalledTimes(2);
});

test('06H K B con Promociones fallidas no muestra catalogo ni promociones previas de A', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  api.getPublicCatalog.mockResolvedValue(catalog('B'));
  api.listPublicCatalogPromotions.mockRejectedValue(new Error('Fallo Promociones B'));
  chooseBranch('B');
  await screen.findByText('Servicio B');
  await screen.findByText('No se pudieron cargar las promociones.');
  expect(screen.getByText('Servicio B')).toBeInTheDocument();
  expect(screen.queryByText('Reservable')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Promociones Beneficios vigentes/ }));
  expect(screen.queryByRole('heading', { name: 'Promocion vigente' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('B');
});

test('06H L busqueda fallida conserva Promociones y descarta productos anteriores', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  api.searchPublicCatalog.mockRejectedValue(new Error('Detalle privado busqueda'));
  fireEvent.change(screen.getByPlaceholderText('Buscar servicios o paquetes...'), { target: { value: 'corte' } });
  await screen.findByText('No se pudieron cargar los servicios ni los paquetes.');
  expect(screen.queryByText('Reservable')).not.toBeInTheDocument();
  expect(screen.queryByText('No hay servicios publicados para esta sucursal.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Promociones Beneficios vigentes/ }));
  expect(screen.getByRole('heading', { name: 'Promocion vigente' })).toBeInTheDocument();
  expect(screen.queryByText('Detalle privado busqueda')).not.toBeInTheDocument();
  api.searchPublicCatalog.mockResolvedValue(catalog('recuperado'));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Servicios Selecciona tu experiencia/ }));
  expect(screen.getByText('Servicio recuperado')).toBeInTheDocument();
  expect(api.searchPublicCatalog).toHaveBeenCalledTimes(2);
  expect(api.searchPublicCatalog).toHaveBeenLastCalledWith({ q: 'corte', id_sucursal: 'A' });
});

test('06H todas fallan sin datos viejos; muestra errores de catalogo y Promociones', async () => {
  render(<ClienteCatalogoPage />);
  await screen.findByText('Reservable');
  api.getPublicCatalog.mockRejectedValue(new Error('Fallo privado catalogo'));
  api.listPublicCatalogPromotions.mockRejectedValue(new Error('Fallo privado Promociones'));
  chooseBranch('B');
  await screen.findByText('No se pudieron cargar las promociones.');
  expect(screen.getByText('No se pudieron cargar los servicios ni los paquetes.')).toBeInTheDocument();
  expect(screen.queryByText('Reservable')).not.toBeInTheDocument();
  expect(screen.queryByText('No hay servicios publicados para esta sucursal.')).not.toBeInTheDocument();
});

test('06H reintento exclusivo Promociones fallido conserva catalogo y error seguro', async () => {
  api.listPublicCatalogPromotions.mockRejectedValue(new Error('Detalle privado Promociones'));
  render(<ClienteCatalogoPage />);
  await screen.findByText('No se pudieron cargar las promociones.');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })));
  expect(screen.getByText('Reservable')).toBeInTheDocument();
  expect(screen.getByText('No se pudieron cargar las promociones.')).toBeInTheDocument();
  expect(api.getPublicCatalog).toHaveBeenCalledTimes(1);
  expect(api.listPublicCatalogPromotions).toHaveBeenCalledTimes(2);
  expect(notify).not.toHaveBeenCalled();
});
