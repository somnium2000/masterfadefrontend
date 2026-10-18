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
  fireEvent.click(screen.getByLabelText('Acepto terminos y condiciones para crear mi cuenta.'));
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

test.each([' ', 'Enter'])('revelar con %s oculta al soltar o perder foco en ambos campos', (key) => {
  mount();
  const buttons = screen.getAllByRole('button', { name: 'Mantén presionado para ver la contraseña' });
  const inputs = [screen.getByLabelText('Contraseña', { exact: true }), screen.getByLabelText('Confirmar contraseña')];
  buttons.forEach((button, index) => {
    fireEvent.keyDown(button, { key });
    expect(inputs[index]).toHaveAttribute('type', 'text');
    fireEvent.keyUp(button, { key });
    expect(inputs[index]).toHaveAttribute('type', 'password');
    fireEvent.keyDown(button, { key });
    fireEvent.blur(button);
    expect(inputs[index]).toHaveAttribute('type', 'password');
  });
  expect(mocks.post).not.toHaveBeenCalled();
});

test('puntero conserva revelado temporal y cancelación', () => {
  mount();
  const button = screen.getAllByRole('button', { name: 'Mantén presionado para ver la contraseña' })[0];
  const input = screen.getByLabelText('Contraseña', { exact: true });
  fireEvent.pointerDown(button); expect(input).toHaveAttribute('type', 'text');
  fireEvent.pointerUp(button); expect(input).toHaveAttribute('type', 'password');
  fireEvent.pointerDown(button); fireEvent.pointerCancel(button); expect(input).toHaveAttribute('type', 'password');
});

test('error de red se anuncia una sola vez y libera el formulario', async () => {
  mocks.post.mockRejectedValue(new Error('No se pudo completar el registro.'));
  mount(); complete(); fireEvent.click(screen.getByLabelText('Acepto terminos y condiciones para crear mi cuenta.'));
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
