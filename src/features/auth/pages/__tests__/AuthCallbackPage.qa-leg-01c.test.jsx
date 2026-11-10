// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AuthCallbackPage from '../AuthCallbackPage.jsx';

const mocks = vi.hoisted(() => ({
  post: vi.fn(), completeExchangeLogin: vi.fn(), signOut: vi.fn(),
  success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(),
}));

vi.mock('../../../../services/httpClient.js', () => ({ http: { post: mocks.post } }));
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: { auth: { signOut: mocks.signOut } } }));
vi.mock('../../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ completeExchangeLogin: mocks.completeExchangeLogin, isAuthenticated: false }),
}));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => mocks }));

const consentRequired = Object.assign(new Error('Consentimiento requerido'), {
  data: { error: { code: 'AUTH_SOCIAL_CONSENT_REQUIRED', message: 'Consentimiento requerido' } },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/auth/callback?social_confirm_token=synthetic-social-token');
  mocks.post.mockRejectedValueOnce(consentRequired);
  mocks.completeExchangeLogin.mockResolvedValue({ ok: true });
  mocks.signOut.mockResolvedValue({});
});
afterEach(cleanup);

const mount = ({ strict = false } = {}) => render(
  <MemoryRouter>{strict ? <StrictMode><AuthCallbackPage /></StrictMode> : <AuthCallbackPage />}</MemoryRouter>
);

test('nuevo usuario no se aprovisiona automaticamente y marketing inicia desmarcado', async () => {
  mount();
  expect(await screen.findByText('COMPLETAR REGISTRO')).toBeInTheDocument();
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Acepto recibir comunicaciones comerciales.')).not.toBeChecked();
  expect(mocks.signOut).not.toHaveBeenCalled();
});

test('terminos son obligatorios antes del segundo intento', async () => {
  mount(); await screen.findByText('COMPLETAR REGISTRO');
  fireEvent.click(screen.getByRole('button', { name: 'Completar registro' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Debes aceptar los terminos');
  expect(mocks.post).toHaveBeenCalledTimes(1);
});

test.each([false, true])('envia la decision explicita marketing=%s una sola vez', async marketing => {
  mocks.post.mockResolvedValueOnce({ ok: true, data: { session: { authenticated: true } } });
  mount({ strict: true }); await screen.findByText('COMPLETAR REGISTRO');
  fireEvent.click(screen.getByLabelText('Acepto los terminos y condiciones para crear mi cuenta.'));
  if (marketing) fireEvent.click(screen.getByLabelText('Acepto recibir comunicaciones comerciales.'));
  fireEvent.click(screen.getByRole('button', { name: 'Completar registro' }));
  await waitFor(() => expect(mocks.completeExchangeLogin).toHaveBeenCalledTimes(1));
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(mocks.post).toHaveBeenLastCalledWith('/v1/auth/social/confirm', {
    social_confirm_token: 'synthetic-social-token', acepta_terminos: true,
    consentimiento_marketing: marketing,
  }, { skipCsrf: true });
});

test('error de reintento conserva decisiones y permite intentar otra vez', async () => {
  mocks.post.mockRejectedValueOnce(new Error('Fallo temporal'));
  mount(); await screen.findByText('COMPLETAR REGISTRO');
  const terms = screen.getByLabelText('Acepto los terminos y condiciones para crear mi cuenta.');
  fireEvent.click(terms); fireEvent.click(screen.getByRole('button', { name: 'Completar registro' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Fallo temporal');
  expect(terms).toBeChecked();
  expect(screen.getByRole('button', { name: 'Completar registro' })).toBeEnabled();
});
