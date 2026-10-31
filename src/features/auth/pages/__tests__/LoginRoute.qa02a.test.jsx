// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../../../context/AuthContext.jsx';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';
import ProtectedRoute from '../../../../routes/ProtectedRoute.jsx';
import LoginRoute from '../../components/LoginRoute.jsx';
import { getSafeLoginReturnPath } from '../../lib/loginReturnPath.js';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), abort: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http: api, abortInFlightRequests: api.abort, registerSessionInvalidationHandler: () => () => {}, resetSessionInvalidation: vi.fn() }));
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: null }));
vi.mock('../../../../features/admin/lib/adminReportesApi.js', () => ({ setAdminReportesSessionScope: vi.fn() }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => api }));
let signed;
const user = { ok: true, data: { user: { id_usuario: 'synthetic-only', nombres: 'Prueba' }, roles: ['cliente'] } };
function Target() { const location = useLocation(); return <p data-testid="target">{location.pathname}{location.search}</p>; }
function Hydrate() { const { hydrateSession } = useAuth(); return <button onClick={() => void hydrateSession()}>Hidratar cookie simulada</button>; }
function mount(next = '/home/cliente/catalogo') {
  return render(<MemoryRouter initialEntries={['/login?next=' + encodeURIComponent(next)]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ThemeProvider><AuthProvider><Hydrate /><Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/home" element={<Target />} />
      <Route path="/home/cliente/catalogo" element={<ProtectedRoute allowedRoles={['cliente']}><Target /></ProtectedRoute>} />
      <Route path="/home/super" element={<ProtectedRoute allowedRoles={['super_admin']}><Target /></ProtectedRoute>} />
      <Route path="/membresias-vip" element={<Target />} />
      <Route path="/unauthorized" element={<Target />} />
    </Routes></AuthProvider></ThemeProvider></MemoryRouter>);
}
function fill() {
  fireEvent.change(document.querySelector('input[type="email"]'), { target: { value: 'synthetic@example.test' } });
  fireEvent.change(document.querySelector('input[type="password"]'), { target: { value: 'SyntheticOnly9!' } });
}
beforeEach(() => {
  signed = false; vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  api.get.mockImplementation(async () => { if (!signed) throw { status: 401 }; return user; });
  api.post.mockImplementation(async path => { if (path === '/v1/auth/login') signed = true; return { ok: true, data: { logged_out: true } }; });
});
afterEach(cleanup);

test('login con AuthContext y Router reales conserva next durante la hidratación', async () => {
  mount(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  await waitFor(() => expect(screen.getByTestId('target')).toHaveTextContent('/home/cliente/catalogo'));
});
test('reemplazo de sesión conserva el mismo next', async () => {
  api.post.mockImplementation(async (path, body) => {
    if (path === '/v1/auth/login' && !body.replace_active_session) throw { status: 409, data: { error: { code: 'AUTH_SESSION_LIMIT_REACHED' } } };
    if (path === '/v1/auth/login') signed = true;
    return { ok: true };
  });
  mount(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  await screen.findByRole('dialog'); fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesion anterior y continuar' }));
  await waitFor(() => expect(screen.getByTestId('target')).toHaveTextContent('/home/cliente/catalogo'));
  expect(api.post.mock.calls.filter(([path]) => path === '/v1/auth/login').at(-1)[1].replace_active_session).toBe(true);
});
test.each(['/home/cliente/catalogo', '/membresias-vip?id_plan=plan&id_sucursal=21355bf5-3ebc-4c7f-b16a-19e2ba2fe041'])('sesión ya autenticada respeta %s', async next => {
  mount(next); signed = true; fireEvent.click(screen.getByText('Hidratar cookie simulada'));
  await waitFor(() => expect(screen.getByTestId('target')).toHaveTextContent(next));
});
test('destino de otro rol continúa protegido', async () => {
  mount('/home/super'); fill(); fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  await waitFor(() => expect(screen.getByTestId('target')).toHaveTextContent('/unauthorized'));
});
test('destino inválido utiliza /home sin bucle', async () => {
  mount('//evil.example'); fill(); fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  await waitFor(() => expect(screen.getByTestId('target')).toHaveTextContent('/home'));
});
test('toggle de contraseña conserva el estado entre clics y actualiza icono y accesibilidad', () => {
  mount(); fill();
  const input = document.querySelector('input[autocomplete="current-password"]');
  const showButton = screen.getByRole('button', { name: 'Mostrar contraseña' });
  expect(showButton).toHaveAttribute('aria-pressed', 'false');
  expect(showButton.querySelector('.lucide-eye')).toBeInTheDocument();
  fireEvent.click(showButton);
  const hideButton = screen.getByRole('button', { name: 'Ocultar contraseña' });
  expect(input).toHaveAttribute('type', 'text');
  expect(hideButton).toHaveAttribute('aria-pressed', 'true');
  expect(hideButton.querySelector('.lucide-eye-off')).toBeInTheDocument();
  fireEvent.click(hideButton);
  expect(input).toHaveAttribute('type', 'password');
  expect(api.post).not.toHaveBeenCalled();
});
test.each(['Enter', ' '])('toggle de contraseña responde a %s como botón nativo sin enviar', key => {
  mount(); fill(); const button = screen.getByRole('button', { name: 'Mostrar contraseña' });
  const input = document.querySelector('input[autocomplete="current-password"]');
  button.focus();
  fireEvent.keyDown(button, { key });
  if (key === ' ') fireEvent.keyUp(button, { key });
  fireEvent.click(button);
  if (key === 'Enter') fireEvent.keyUp(button, { key });
  expect(input).toHaveAttribute('type', 'text');
  expect(button).toHaveAttribute('type', 'button');
  expect(api.post).not.toHaveBeenCalled();
});
test('presenta título exacto, recurso local Google y Facebook deshabilitado', async () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Iniciar Sesión' })).toBeInTheDocument();
  const google = screen.getByRole('button', { name: 'Continuar con Google' });
  const googleIcon = google.querySelector('img.mf-social-icon');
  expect(googleIcon).toBeInTheDocument();
  expect(googleIcon).toHaveAttribute('alt', '');
  expect(googleIcon.getAttribute('src')).toContain('google-g.svg');
  const svg = await readFile('src/features/auth/assets/google-g.svg', 'utf8');
  expect(svg).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect(svg).toMatch(/viewBox="0 0 24 24"/);
  expect([...svg.matchAll(/fill="(#[0-9A-F]{6})"/g)].map((match) => match[1]))
    .toEqual(['#EA4335', '#34A853', '#4A90E2', '#FBBC05']);
  expect(screen.getByRole('button', { name: 'Facebook próximamente' })).toBeDisabled();
});
test('bloque final agrupa auxiliares y mantiene el CTA antes del registro', () => {
  mount();
  const remember = screen.getByRole('checkbox', { name: 'Recordarme' });
  const forgot = screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' });
  const submit = screen.getByRole('button', { name: 'Entrar', exact: true });
  const register = screen.getByRole('link', { name: 'Regístrate' });
  expect(remember.closest('.mf-login-aux-row')).toContainElement(forgot);
  expect(submit).toHaveClass('mf-login-submit');
  expect(submit.compareDocumentPosition(register) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
test('error de Login mantiene un único anuncio inline', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  expect(screen.getAllByRole('alert')).toHaveLength(1); expect(api.warning).not.toHaveBeenCalled(); expect(api.error).not.toHaveBeenCalled();
});
test.each(['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil.example', '/%5cevil.example', '/%2f%2fevil.example', '/%252f%252fevil.example', '/foo/..//evil.example', '/home%0aevil', '/login', '/LOGIN/', '/foo/../login', '/%6cogin', '/register', '/auth/callback', '/reset-password', '/forgot-password', '/bad%zz', '\n/home'])('rechaza retorno inseguro o circular: %s', path => {
  expect(getSafeLoginReturnPath(path)).toBe('');
});
test('preserva parámetros internos válidos sin descodificar el destino', () => {
  const path = '/membresias-vip?id_plan=plan&id_sucursal=branch&label=Plan%20VIP';
  expect(getSafeLoginReturnPath(path)).toBe(path);
});
