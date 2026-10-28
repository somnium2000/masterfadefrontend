// @vitest-environment jsdom
// AM: Dialogos productivos con Auth/API simulados; nunca autentica ni elimina cuentas reales.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Cliente from '../../../cliente/components/ClienteAccountDeletionDialog.jsx';
import Internal from '../../../account/components/InternalAccountDeletionRequestDialog.jsx';
import Admin from '../../components/AdminAccountDeletionDecisionDialog.jsx';

const state = vi.hoisted(() => ({ user: { id_usuario: 'actor', email: 'qa@example.invalid' } }));
const sdk = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signInWithOAuth: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), refreshSession: vi.fn() }));
const api = vi.hoisted(() => ({ preview: vi.fn(), create: vi.fn(), confirm: vi.fn(), internalPreview: vi.fn(), internalCreate: vi.fn(), navigate: vi.fn() }));
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: { auth: sdk } }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => state }));
vi.mock('react-router-dom', () => ({ useNavigate: () => api.navigate }));
vi.mock('../../../cliente/lib/clienteApi.js', () => ({ getClienteAccountDeletionPreview: api.preview, createClienteAccountDeletionRequest: api.create, confirmClienteAccountDeletionRequest: api.confirm }));
vi.mock('../../../account/lib/internalAccountDeletionApi.js', () => ({ getInternalAccountDeletionPreview: api.internalPreview, createInternalAccountDeletionRequest: api.internalCreate }));

const token = (method = 'password', timestamp = Math.floor(Date.now() / 1000), sub = 'actor') =>
  `header.${btoa(JSON.stringify({ sub, iat: Math.floor(Date.now() / 1000), amr: [{ method, timestamp }] }))}.signature`;
const verifiedUser = () => ({ id: 'actor', identities: [{ provider: 'google' }] });
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id_usuario: 'actor', email: 'qa@example.invalid' };
  sdk.signInWithPassword.mockResolvedValue({ data: { user: verifiedUser(), session: { access_token: token() } } });
  sdk.getUser.mockResolvedValue({ data: { user: verifiedUser() } });
  sdk.getSession.mockResolvedValue({ data: { session: { user: verifiedUser(), access_token: token('token_refresh') } } });
  sdk.signInWithOAuth.mockResolvedValue({ data: { url: 'https://synthetic.invalid/oauth' } });
  api.preview.mockResolvedValue({ can_delete: true });
  api.create.mockResolvedValue({ request: { id_solicitud: 'request', estado_codigo: 'pendiente_confirmacion' } });
  api.confirm.mockResolvedValue({ ready_for_processing: false });
  api.internalPreview.mockResolvedValue({ can_request: true, dependencies: { active_roles: ['barbero'] } });
  api.internalCreate.mockResolvedValue({ message: 'Solicitud sintetica' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });

async function ready(kind) {
  const approve = vi.fn().mockResolvedValue({}), close = vi.fn(), created = vi.fn();
  const props = kind === 'cliente'
    ? { open: true, onOpenChange: close, expectedUserId: state.user.id_usuario, profile: { correo_principal: state.user.email } }
    : kind === 'interno' ? { open: true, onOpenChange: close, onCreated: created }
      : { open: true, mode: 'approve', detail: { request: { id_solicitud: 'request' }, permissions: { can_approve: true } }, onOpenChange: close, onApprove: approve };
  const Component = kind === 'cliente' ? Cliente : kind === 'interno' ? Internal : Admin;
  const view = render(<Component {...props} />);
  if (kind === 'cliente') fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
  const phrase = await screen.findByLabelText(/Escribe exactamente/);
  for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
  fireEvent.change(phrase, { target: { value: kind === 'cliente' ? 'ELIMINAR MI CUENTA' : kind === 'interno' ? 'SOLICITAR ELIMINACION DE MI CUENTA' : 'APROBAR ELIMINACION DE CUENTA' } });
  fireEvent.change(screen.getByLabelText('Contrasena de la cuenta'), { target: { value: 'synthetic-only' } });
  return { view, props, Component, approve, close, created,
    submit: () => fireEvent.click(screen.getByRole('button', { name: kind === 'cliente' ? 'Eliminar mi cuenta definitivamente' : kind === 'interno' ? 'Enviar solicitud' : 'Aprobar' })),
    sent: kind === 'cliente' ? api.confirm : kind === 'interno' ? api.internalCreate : approve };
}

for (const kind of ['cliente', 'interno', 'admin']) {
  test(`AM: ${kind} exige password nuevo aunque exista sesion`, async () => {
    const f = await ready(kind); f.submit();
    await waitFor(() => expect(f.sent).toHaveBeenCalledTimes(1));
    expect(sdk.signInWithPassword).toHaveBeenCalledWith({ email: 'qa@example.invalid', password: 'synthetic-only' });
    expect(sdk.getUser).toHaveBeenCalled(); expect(sdk.refreshSession).not.toHaveBeenCalled();
    expect(sdk.getSession).not.toHaveBeenCalled();
  });
  test(`AM: ${kind} rechaza refresh/AMR antiguo y conserva formulario`, async () => {
    sdk.signInWithPassword.mockResolvedValue({ data: { user: verifiedUser(), session: { access_token: token('token_refresh') } } });
    const f = await ready(kind); f.submit(); await screen.findByRole('alert');
    expect(f.sent).not.toHaveBeenCalled(); expect(screen.getByLabelText(/Escribe exactamente/).value).not.toBe('');
    expect(screen.getByLabelText('Contrasena de la cuenta')).toHaveValue('');
  });
  test(`AM: ${kind} rechaza otra identidad`, async () => {
    sdk.getUser.mockResolvedValue({ data: { user: { id: 'other' } } });
    const f = await ready(kind); f.submit(); await screen.findByRole('alert'); expect(f.sent).not.toHaveBeenCalled();
  });
  test(`AM: ${kind} descarta password tardio al cambiar identidad`, async () => {
    let finish; sdk.signInWithPassword.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const f = await ready(kind); f.submit();
    state.user = { id_usuario: 'other', email: 'other@example.invalid' };
    f.view.rerender(<f.Component {...f.props} {...(kind === 'cliente' ? { expectedUserId: 'other' } : {})} />);
    await act(async () => finish({ data: { user: verifiedUser(), session: { access_token: token() } } }));
    expect(f.sent).not.toHaveBeenCalled();
  });
  test(`AM: ${kind} Google usa OAuth nuevo, correlacion y misma identidad`, async () => {
    const popup = { closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const f = await ready(kind);
    fireEvent.change(screen.getByLabelText('Metodo de reautenticacion'), { target: { value: 'google' } });
    f.submit(); await waitFor(() => expect(sdk.signInWithOAuth).toHaveBeenCalledTimes(1));
    const options = sdk.signInWithOAuth.mock.calls[0][0].options;
    expect(options.queryParams).toMatchObject({ prompt: 'select_account', max_age: '0' });
    const nonce = new URL(options.redirectTo).searchParams.get('mf_delete_reauth');
    await act(async () => window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.invalid', source: popup,
      data: { type: 'mf-delete-reauth', nonce, token: token('oauth') } })));
    expect(f.sent).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup,
      data: { type: 'mf-delete-reauth', nonce: 'wrong', token: token('oauth') } })));
    expect(f.sent).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup,
      data: { type: 'mf-delete-reauth', nonce, token: token('oauth') } })));
    await waitFor(() => expect(f.sent).toHaveBeenCalledTimes(1));
    expect(sdk.signInWithPassword).not.toHaveBeenCalled(); expect(sdk.refreshSession).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled(); expect(popup.close).toHaveBeenCalled();
  });
  test(`AM: ${kind} popup bloqueado no confirma ni pierde datos`, async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const f = await ready(kind);
    fireEvent.change(screen.getByLabelText('Metodo de reautenticacion'), { target: { value: 'google' } });
    f.submit(); await screen.findByRole('alert'); expect(f.sent).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Escribe exactamente/).value).not.toBe('');
  });
  // AM: Fallos/cancelacion de Google y respuestas tardias nunca autorizan la operacion original.
  test(`AM: ${kind} Google de otra cuenta se rechaza`, async () => {
    const popup = { closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    vi.spyOn(window, 'open').mockReturnValue(popup);
    sdk.getUser.mockResolvedValue({ data: { user: { id: 'other', identities: [{ provider: 'google' }] } } });
    const f = await ready(kind);
    fireEvent.change(screen.getByLabelText('Metodo de reautenticacion'), { target: { value: 'google' } });
    f.submit(); await waitFor(() => expect(sdk.signInWithOAuth).toHaveBeenCalled());
    const nonce = new URL(sdk.signInWithOAuth.mock.calls[0][0].options.redirectTo).searchParams.get('mf_delete_reauth');
    await act(async () => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup,
      data: { type: 'mf-delete-reauth', nonce, token: token('oauth', undefined, 'other') } })));
    await screen.findByRole('alert'); expect(f.sent).not.toHaveBeenCalled();
  });
  test(`AM: ${kind} Google cancelado conserva frase y confirmaciones`, async () => {
    const popup = { closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const f = await ready(kind);
    fireEvent.change(screen.getByLabelText('Metodo de reautenticacion'), { target: { value: 'google' } });
    f.submit(); await waitFor(() => expect(sdk.signInWithOAuth).toHaveBeenCalled());
    const nonce = new URL(sdk.signInWithOAuth.mock.calls[0][0].options.redirectTo).searchParams.get('mf_delete_reauth');
    await act(async () => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup,
      data: { type: 'mf-delete-reauth', nonce, failed: true } })));
    await screen.findByRole('alert'); expect(f.sent).not.toHaveBeenCalled();
    expect(screen.getAllByRole('checkbox').every(input => input.checked)).toBe(true);
    expect(screen.getByLabelText(/Escribe exactamente/).value).not.toBe('');
  });
}
