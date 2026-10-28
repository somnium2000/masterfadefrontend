// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '../ForgotPasswordPage.jsx';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';
import { publicAuthError, NEUTRAL_RECOVERY_MESSAGE } from '../../lib/publicAuthErrors.js';

const api = vi.hoisted(() => ({ post: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http: api }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => api }));
beforeEach(() => { vi.clearAllMocks(); api.post.mockResolvedValue({ ok: true, data: { message: 'registered-secret@example.test' } }); });
afterEach(cleanup);
function mount() { render(<ThemeProvider><MemoryRouter><ForgotPasswordPage /></MemoryRouter></ThemeProvider>); }
function submit() { fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'synthetic@example.test' } }); fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' })); }
test('respuesta exitosa conserva neutralidad sin mostrar la existencia del correo', async () => {
  mount(); submit(); expect(await screen.findByRole('status')).toHaveTextContent(NEUTRAL_RECOVERY_MESSAGE);
  expect(screen.queryByText('registered-secret@example.test')).not.toBeInTheDocument();
});
test('respuesta exitosa muestra el contador del contrato HTTP real', async () => {
  api.post.mockResolvedValue({ ok: true, data: { message: 'neutral', rateLimit: { max: 3, remaining: 2, resetInSeconds: 900 } } });
  mount(); submit();
  expect(await screen.findByText(/Intentos restantes:/)).toHaveTextContent('2 / 3');
  expect(screen.getByText(/Intentos restantes:/)).toHaveTextContent('15m 0s');
});
test.each(['SQLSTATE host.internal password=secret', 'Error: arbitrary token\n at source.js:1', 'unknown text'])('mensaje hostil/desconocido se reemplaza: %s', async message => {
  api.post.mockRejectedValue({ status: 503, data: { error: { message } } }); mount(); submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar el enlace');
  expect(screen.getAllByRole('alert')).toHaveLength(1); expect(api.error).not.toHaveBeenCalled();
  expect(screen.queryByText(message)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeEnabled();
});
test('rate limit conserva mensaje, contador y bloqueo sin toast duplicado', async () => {
  api.post.mockRejectedValue({ status: 429, data: { error: { code: 'AUTH_RESET_RATE_LIMIT', message: 'SQLSTATE', details: { retryAfterSeconds: 60, rateLimit: { max: 3, remaining: 0, resetInSeconds: 60 } } } } });
  mount(); submit(); expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
  expect(screen.getByRole('button', { name: 'Bloqueado' })).toBeDisabled(); expect(api.error).not.toHaveBeenCalled();
});
test('validación local conserva su único anuncio accesible', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
  expect(screen.getByRole('alert')).toHaveTextContent('correo valido'); expect(api.warning).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
});
test.each([
  [{ code: 'otp_expired', message: 'secret' }, 'link', 'expiró'],
  [{ code: 'bad_jwt', message: 'secret' }, 'link', 'no es válido'],
  [{ code: 'weak_password', message: 'secret' }, 'update', 'al menos 8'],
  [{ code: 'same_password', message: 'secret' }, 'update', 'diferente'],
  [{ status: 429, message: 'secret' }, 'update', 'Demasiados'],
])('errores conocidos producen texto útil seguro', (error, stage, expected) => {
  expect(publicAuthError(error, stage)).toContain(expected); expect(publicAuthError(error, stage)).not.toContain('secret');
});
