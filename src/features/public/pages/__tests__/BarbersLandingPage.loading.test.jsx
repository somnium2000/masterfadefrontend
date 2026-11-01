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

function barber(overrides = {}) {
  return {
    id_empleado: 'barber-1',
    nombre_completo: 'Álvaro Zúniga',
    alias_publico: 'El Maestro',
    resumen_publico: 'Biografía pública',
    certificaciones_titulos: ['Certificación A'],
    foto_perfil_url: 'https://invalid.example/barber.jpg',
    foto_perfil_updated_at: '2026-10-31T12:00:00Z',
    visible_en_landing: true,
    ...overrides,
  };
}

function loadBarbers(items) {
  api.branches.mockResolvedValue({ branches: [{ id_sucursal: 'A' }] });
  api.barbers.mockResolvedValue({ data: { barberos: items } });
}

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

test('abre el perfil accesible, conserva la biografía completa y retorna el foco al cerrar con Escape', async () => {
  const fullBio = `${'Trayectoria profesional y atención personalizada. '.repeat(6)}\nSegunda línea íntegra.`;
  const certs = ['Título 1', 'Título 2', 'Título 3', 'Título 4', 'Título 5', 'Título 6'];
  loadBarbers([barber({ resumen_publico: fullBio, certificaciones_titulos: certs })]);
  render(<BarbersLandingPage />);

  const trigger = await screen.findByRole('button', { name: 'Ver perfil' });
  trigger.focus();
  fireEvent.click(trigger);

  const dialog = await screen.findByRole('dialog');
  expect(dialog.querySelector('.whitespace-pre-wrap')).toHaveTextContent('Segunda línea íntegra.');
  expect(dialog.querySelector('.whitespace-pre-wrap')?.textContent).toBe(fullBio);
  certs.forEach((cert) => expect(dialog).toHaveTextContent(cert));
  expect(dialog.querySelector('.whitespace-pre-wrap')).toBeInTheDocument();
  expect(dialog.className).toContain('100dvh');

  fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

test('cierre visible del perfil funciona y el alias solo aparece cuando existe', async () => {
  loadBarbers([barber({ alias_publico: '' })]);
  render(<BarbersLandingPage />);
  expect(await screen.findByText('Álvaro Zúniga')).toBeInTheDocument();
  expect(screen.queryByText('Barbero profesional')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver perfil' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('ausencia de biografía y certificaciones usa estados discretos sin inventar contenido', async () => {
  loadBarbers([barber({ resumen_publico: '', certificaciones_titulos: [] })]);
  render(<BarbersLandingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver perfil' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Biografía no disponible.');
  expect(dialog).toHaveTextContent('No hay certificaciones publicadas.');
});

test('fotografía faltante o fallida muestra iniciales reales', async () => {
  loadBarbers([barber({ foto_perfil_url: '' })]);
  const firstRender = render(<BarbersLandingPage />);
  expect(await screen.findByText('ÁZ')).toBeInTheDocument();
  firstRender.unmount();

  loadBarbers([barber()]);
  render(<BarbersLandingPage />);
  const image = await screen.findByRole('img', { name: 'Álvaro Zúniga' });
  fireEvent.error(image);
  expect(await screen.findByText('ÁZ')).toBeInTheDocument();
});

test('conserva visibilidad, deduplicación y orden alfabético', async () => {
  loadBarbers([
    barber({ id_empleado: '2', nombre_completo: 'Zoé Flores' }),
    barber({ id_empleado: '1', nombre_completo: 'Ana López' }),
    barber({ id_empleado: '3', nombre_completo: 'Oculto', visible_en_landing: false }),
    barber({ id_empleado: '1', nombre_completo: 'Ana López' }),
  ]);
  render(<BarbersLandingPage />);
  await screen.findByText('Ana López');
  const names = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
  expect(names).toEqual(['Ana López', 'Zoé Flores']);
  expect(screen.queryByText('Oculto')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Ver perfil' })).toHaveLength(2);
});
