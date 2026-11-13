// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from '../RegisterPage.jsx';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({ post: vi.fn(), login: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http: { post: mocks.post } }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ login: mocks.login }) }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => mocks }));

beforeEach(() => { vi.clearAllMocks(); mocks.post.mockResolvedValue({}); mocks.login.mockResolvedValue({ ok: false }); });
afterEach(cleanup);
const mount = () => render(<ThemeProvider><MemoryRouter><RegisterPage /></MemoryRouter></ThemeProvider>);
function complete() {
  for (const [name, value] of [['Nombre', ' Persona '], ['Apellido', ' QA '], ['Correo (sera tu usuario/login)', 'TEST@EXAMPLE.TEST'], ['Contraseña', 'SoloLocal9!'], ['Confirmar contraseña', 'SoloLocal9!']]) {
    fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
  }
}

test.each([false, true])('marketing=%s se conserva sin cambiar el consentimiento', async (marketing) => {
  mount(); complete();
  fireEvent.click(screen.getByLabelText('Acepto términos y condiciones para crear mi cuenta.'));
  const checkbox = screen.getByLabelText('Acepto recibir comunicaciones por correo sobre servicios, novedades y promociones.');
  if (marketing) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledOnce());
  expect(mocks.post).toHaveBeenCalledWith('/v1/auth/register', expect.objectContaining({ acepta_terminos: true, consentimiento_marketing: marketing, email: 'test@example.test' }), { skipCsrf: true });
  expect(checkbox.checked).toBe(marketing);
});

test('términos siguen obligatorios y el error tiene un único anuncio asociado al formulario', () => {
  mount(); complete();
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Debes aceptar los términos');
  expect(document.querySelector('form')).toHaveAttribute('aria-describedby', alert.id);
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.warning).not.toHaveBeenCalled();
});

test('visibilidad alterna de forma independiente y conserva valores, puntero y foco', () => {
  mount();
  const password = screen.getByLabelText('Contraseña', { exact: true });
  const confirmation = screen.getByLabelText('Confirmar contraseña');
  fireEvent.change(password, { target: { value: 'SoloLocal9!' } });
  fireEvent.change(confirmation, { target: { value: 'SoloLocal9!' } });
  const showPassword = screen.getByRole('button', { name: 'Mostrar contraseña' });
  const showConfirmation = screen.getByRole('button', { name: 'Mostrar confirmación de contraseña' });
  expect(password).toHaveAttribute('type', 'password');
  expect(confirmation).toHaveAttribute('type', 'password');
  expect(showPassword).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(showPassword);
  expect(password).toHaveAttribute('type', 'text');
  expect(confirmation).toHaveAttribute('type', 'password');
  expect(password).toHaveValue('SoloLocal9!');
  const hidePassword = screen.getByRole('button', { name: 'Ocultar contraseña' });
  fireEvent.pointerUp(hidePassword);
  fireEvent.blur(hidePassword);
  expect(password).toHaveAttribute('type', 'text');
  fireEvent.click(hidePassword);
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.click(showConfirmation);
  expect(confirmation).toHaveAttribute('type', 'text');
  expect(password).toHaveAttribute('type', 'password');
  expect(confirmation).toHaveValue('SoloLocal9!');
  expect(mocks.post).not.toHaveBeenCalled();
});

test.each(['Enter', ' '])('botón estándar conserva activación por teclado con %s sin enviar', (key) => {
  mount();
  const button = screen.getByRole('button', { name: 'Mostrar contraseña' });
  const input = screen.getByLabelText('Contraseña', { exact: true });
  button.focus();
  fireEvent.keyDown(button, { key });
  fireEvent.keyUp(button, { key });
  fireEvent.click(button);
  expect(input).toHaveAttribute('type', 'text');
  expect(button).toHaveAttribute('type', 'button');
  expect(mocks.post).not.toHaveBeenCalled();
});

test('error de red se anuncia una sola vez y libera el formulario', async () => {
  mocks.post.mockRejectedValue(new Error('No se pudo completar el registro.'));
  mount(); complete(); fireEvent.click(screen.getByLabelText('Acepto términos y condiciones para crear mi cuenta.'));
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  await screen.findByRole('alert');
  expect(mocks.error).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
});

test('error claro alcanza AA sobre el fondo compuesto conservador y oscuro se conserva', () => {
  const css = readFileSync('src/features/auth/pages/LoginPage.css', 'utf8');
  expect(css).toContain(':root[data-theme="light"] .mf-login-page .mf-error');
  expect(css).toContain('color: #721c1c');
  expect(css).toContain('color: #fda29b');
  const luminance = (rgb) => rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const lightBackground = [127, 29, 29].map((v) => v * 0.22 + 255 * 0.82 * 0.78);
  const darkBackground = [127, 29, 29].map((v) => v * 0.22 + (30 * 0.82 + 255 * 0.18) * 0.78);
  expect(contrast([114, 28, 28], lightBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrast([253, 162, 155], darkBackground)).toBeGreaterThanOrEqual(4.5);
});

test('lectura legal en otra pestaña conserva campos y no acepta términos ni marketing', () => {
  mount(); complete();
  const terms = screen.getByRole('checkbox', { name: 'Acepto términos y condiciones para crear mi cuenta.' });
  const marketing = screen.getByRole('checkbox', { name: /Acepto recibir comunicaciones/ });
  for (const [name, hash] of [['términos y condiciones', 'terminos-y-condiciones'], ['Política de privacidad', 'politica-de-privacidad']]) {
    const link = screen.getByRole('link', { name, exact: true });
    expect(link).toHaveAttribute('href', `/terminos-y-condiciones#${hash}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
    expect(terms).not.toBeChecked();
    expect(marketing).not.toBeChecked();
  }
  expect(screen.getByLabelText('Nombre', { exact: true })).toHaveValue(' Persona ');
  expect(screen.getByLabelText('Contraseña', { exact: true })).toHaveValue('SoloLocal9!');
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Debes aceptar los términos');
  expect(mocks.post).not.toHaveBeenCalled();
});
