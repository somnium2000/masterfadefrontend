// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import DashboardLayout, { buildNavModules } from '../DashboardLayout.jsx';

const session = vi.hoisted(() => ({ user: { id_usuario: 'same-session' }, roles: [], logout: vi.fn() }));
vi.mock('../../../context/AuthContext.jsx', () => ({ useAuth: () => session, getUserDisplayName: () => 'Usuario' }));
vi.mock('../../theme/ThemeSwitcher.jsx', () => ({ default: () => null }));
vi.mock('../../branding/MasterfadeLogo.jsx', () => ({ default: () => null }));
vi.mock('../../navigation/PremiumBottomNav.jsx', () => ({ default: () => null }));
vi.mock('framer-motion', async () => {
  const { createElement } = await import('react');
  const components = {};
  return {
    AnimatePresence: ({ children }) => children,
    motion: new Proxy({}, { get: (_, tag) => {
      components[tag] ??= ({ children, ...props }) => createElement(tag,
        Object.fromEntries(Object.entries(props).filter(([key]) => !['animate', 'initial', 'exit', 'transition', 'whileTap', 'layoutId'].includes(key))), children);
      return components[tag];
    } }),
  };
});

beforeEach(() => { session.roles = []; session.logout.mockClear(); });
afterEach(cleanup);
const adminPath = roles => roles.includes('super_admin') ? '/home/super' : '/home/admin';

test.each([['admin', 'barbero'], ['super_admin', 'barbero'], ['admin', 'super_admin', 'barbero']])('módulos combinados conservan el menú administrativo: %j', (...roles) => {
  const role = roles.includes('super_admin') ? 'super_admin' : 'admin';
  const path = adminPath(roles);
  const original = buildNavModules(path, role, [role]);
  const combined = buildNavModules(path, role, roles);
  expect(combined.slice(0, -1)).toEqual(original);
  expect(combined.at(-1)).toMatchObject({ label: 'Mi espacio Barbero', subItems: [
    { label: 'Inicio Barbero', path: '/home/barbero' },
    { label: 'Mi Calendario', path: '/home/barbero/citas' },
    { label: 'Mi Perfil Barbero', path: '/home/barbero/perfil' },
  ] });
  expect(new Set(combined.map(item => item.id)).size).toBe(combined.length);
  expect(combined.some(item => item.id === 'seguridad')).toBe(role === 'super_admin');
  expect(combined.some(item => item.id === 'reportes')).toBe(role === 'super_admin');
  expect(buildNavModules('/home/barbero', 'barbero', roles).at(-1)).toMatchObject({ label: 'Volver a Administración', path });
});

test.each(['admin', 'super_admin', 'cliente', 'barbero', 'security_admin'])('rol individual %s conserva su menú', role => {
  const modules = buildNavModules('/home/' + role, role, [role]);
  expect(modules.some(item => ['mi-espacio-barbero', 'volver-administracion'].includes(item.id))).toBe(false);
  if (role === 'barbero') expect(modules.map(item => item.label)).toEqual(['Inicio', 'Calendario', 'Perfil Barbero']);
  if (role === 'cliente') expect(modules.map(item => item.id)).toEqual(['inicio']);
});

test('root y roles de pantalla sin claims operativos no añaden accesos combinados', () => {
  for (const roles of [['root', 'admin', 'barbero'], ['barbero'], ['admin'], []]) {
    expect(buildNavModules('/home/admin', 'admin', roles).some(item => item.id === 'mi-espacio-barbero')).toBe(false);
  }
  expect(buildNavModules('/home/security', 'security_admin', ['root']).map(item => item.id)).toEqual(['seguridad']);
});

function Panels() {
  const { pathname } = useLocation();
  const pageRole = pathname.startsWith('/home/barbero') ? 'barbero' : session.roles.includes('super_admin') ? 'super_admin' : 'admin';
  return <><output data-testid="location">{pathname}</output><DashboardLayout pageRole={pageRole} /></>;
}
function view(path) {
  return <MemoryRouter initialEntries={[path]}><Panels /></MemoryRouter>;
}

test.each([['admin', 'barbero'], ['super_admin', 'barbero']])('escritorio: cambia de panel, navega y vuelve con la misma sesión %j', async (...roles) => {
  session.roles = roles;
  const user = session.user;
  const path = adminPath(roles);
  render(view(path));
  fireEvent.click(screen.getByRole('button', { name: 'Colapsar sidebar' }));
  const shortcut = screen.getByRole('button', { name: 'Mi espacio Barbero' });
  expect(shortcut).toHaveAttribute('title', 'Mi espacio Barbero');
  fireEvent.click(shortcut);
  expect(screen.getByTestId('location')).toHaveTextContent('/home/barbero');
  fireEvent.click(screen.getByRole('button', { name: 'Calendario' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/home/barbero/citas');
  expect(screen.getByRole('button', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Perfil Barbero' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/home/barbero/perfil');
  fireEvent.click(screen.getByRole('button', { name: 'Volver a Administración' }));
  expect(screen.getByTestId('location').textContent).toBe(path);
  expect(session.user).toBe(user);
  expect(session.logout).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Volver a Administración' })).not.toBeInTheDocument());
});

test('móvil: drawer comparte módulos, cierra al navegar y permite regresar', async () => {
  session.roles = ['super_admin', 'admin', 'barbero'];
  render(view('/home/super'));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const close = screen.getByRole('button', { name: 'Cerrar menú' });
  const drawer = close.parentElement.parentElement;
  expect(within(drawer).getAllByRole('button', { name: 'Mi espacio Barbero' })).toHaveLength(1);
  for (const name of ['Inicio Barbero', 'Mi Calendario', 'Mi Perfil Barbero']) {
    expect(within(drawer).getAllByRole('button', { name })).toHaveLength(1);
  }
  expect(within(drawer).getByRole('button', { name: 'Seguridad' })).toBeInTheDocument();
  expect(within(drawer).getByRole('button', { name: 'Reportes' })).toBeInTheDocument();
  fireEvent.click(within(drawer).getByRole('button', { name: 'Mi espacio Barbero' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Cerrar menú' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const barberDrawer = screen.getByRole('button', { name: 'Cerrar menú' }).parentElement.parentElement;
  fireEvent.click(within(barberDrawer).getByRole('button', { name: 'Calendario' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/home/barbero/citas');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Cerrar menú' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const calendarDrawer = screen.getByRole('button', { name: 'Cerrar menú' }).parentElement.parentElement;
  expect(within(calendarDrawer).getByRole('button', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(within(calendarDrawer).getByRole('button', { name: 'Volver a Administración' }));
  expect(screen.getByTestId('location').textContent).toBe('/home/super');
});

test.each([['Inicio Barbero', '/home/barbero'], ['Mi Calendario', '/home/barbero/citas'], ['Mi Perfil Barbero', '/home/barbero/perfil']])('enlace administrativo %s navega a %s', (label, path) => {
  session.roles = ['admin', 'barbero'];
  render(view('/home/admin'));
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(screen.getByTestId('location').textContent).toBe(path);
});

test('claims actualizados eliminan accesos combinados en sidebar y drawer abierto', () => {
  session.roles = ['admin', 'barbero'];
  const rendered = render(view('/home/admin'));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  expect(screen.getAllByRole('button', { name: 'Mi espacio Barbero' })).toHaveLength(2);
  session.roles = ['admin'];
  rendered.rerender(view('/home/admin'));
  expect(screen.queryByRole('button', { name: 'Mi espacio Barbero' })).not.toBeInTheDocument();
});

test('revocar admin en panel barbero elimina regreso sin conservar claims anteriores', () => {
  session.roles = ['admin', 'barbero'];
  const rendered = render(view('/home/barbero'));
  expect(screen.getByRole('button', { name: 'Volver a Administración' })).toBeInTheDocument();
  session.roles = ['barbero'];
  rendered.rerender(view('/home/barbero'));
  expect(screen.queryByRole('button', { name: 'Volver a Administración' })).not.toBeInTheDocument();
});
