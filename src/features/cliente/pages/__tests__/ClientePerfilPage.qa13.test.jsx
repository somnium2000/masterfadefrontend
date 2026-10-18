// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Page from '../ClientePerfilPage.jsx';
import Editor from '../../components/ClienteProfileEditModal.jsx';

const auth = vi.hoisted(() => ({ user: { id_usuario: 'account-A' }, clienteId: 'client-A', isAuthenticated: true, isHydrated: true, isHydrating: false, logout: vi.fn() }));
const api = vi.hoisted(() => ({ getClienteMe: vi.fn(), updateClienteMe: vi.fn(), prepareClienteProfileImageUpload: vi.fn(), getClienteProfileImageReadUrl: vi.fn() }));
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const nav = vi.hoisted(() => vi.fn());
const layout = vi.hoisted(() => ({ refreshClienteProfile: vi.fn() }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('react-router-dom', () => ({ useNavigate: () => nav, useOutletContext: () => layout }));
vi.mock('../../lib/clienteApi.js', () => ({ ...api, ALLOWED_PROFILE_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'], MAX_PROFILE_IMAGE_BYTES: 5242880 }));
vi.mock('../../components/ClienteAccountDeletionDialog.jsx', () => ({ default: ({ open }) => open ? <p role="dialog" aria-label="Eliminar cuenta sintética">Eliminar</p> : null }));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const profile = id => ({ id_usuario: `account-${id}`, id_cliente: `client-${id}`, id_persona: `person-${id}`, nombre_completo: `CLIENT-${id}`, telefono_principal: '99999999', foto_perfil_asset_id: `asset-${id}`, foto_perfil_signed_url: `https://synthetic.invalid/${id}.jpg` });
const payload = id => ({ cliente: profile(id), profile_completion: { completion_percent: 25, is_complete: false, missing_fields: ['direccion_texto'] } });
function identity(id) { auth.user = { id_usuario: `account-${id}` }; auth.clienteId = `client-${id}`; }
beforeEach(() => { identity('A'); auth.isAuthenticated = true; auth.isHydrated = true; auth.isHydrating = false; auth.logout.mockReset(); nav.mockReset(); layout.refreshClienteProfile.mockReset(); Object.values(notices).forEach(m => m.mockReset()); Object.values(api).forEach(m => m.mockReset()); api.getClienteMe.mockResolvedValue(payload('A')); api.updateClienteMe.mockResolvedValue(payload('A')); api.prepareClienteProfileImageUpload.mockResolvedValue({ asset_id: 'new-asset' }); api.getClienteProfileImageReadUrl.mockResolvedValue({ url: 'https://synthetic.invalid/new.jpg' }); });
afterEach(cleanup);

describe('aislamiento del perfil', () => {
  test('A normal; cambio a B elimina inmediatamente nombre y URL A', async () => {
    const view = render(<Page />); await screen.findAllByText('CLIENT-A');
    const pending = deferred(); api.getClienteMe.mockReturnValue(pending.promise); identity('B'); view.rerender(<Page />);
    expect(screen.queryAllByText('CLIENT-A')).toHaveLength(0); expect(document.querySelector('img[src*="/A.jpg"]')).toBeNull();
    await act(async () => pending.resolve(payload('B'))); expect(screen.getAllByText('CLIENT-B').length).toBeGreaterThan(0);
  });
  test.each(['success', 401, 500])('A pendiente termina %s después de B sin efectos obsoletos', async outcome => {
    const a = deferred(); api.getClienteMe.mockReturnValueOnce(a.promise).mockResolvedValue(payload('B'));
    const view = render(<Page />); identity('B'); view.rerender(<Page />); await screen.findAllByText('CLIENT-B');
    await act(async () => outcome === 'success' ? a.resolve(payload('A')) : a.reject({ status: outcome }));
    expect(screen.queryAllByText('CLIENT-A')).toHaveLength(0); expect(screen.getAllByText('CLIENT-B').length).toBeGreaterThan(0);
    expect(auth.logout).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled(); expect(notices.error).not.toHaveBeenCalled();
    expect(layout.refreshClienteProfile).toHaveBeenCalledTimes(1);
  });
  test.each(['logout', 'hydrating', 'unhydrated'])('transición %s no renderiza datos anteriores', async state => {
    const view = render(<Page />); await screen.findAllByText('CLIENT-A');
    if (state === 'logout') auth.isAuthenticated = false; else if (state === 'hydrating') auth.isHydrating = true; else auth.isHydrated = false;
    view.rerender(<Page />); expect(screen.queryAllByText('CLIENT-A')).toHaveLength(0); expect(screen.queryByAltText('Foto de perfil')).not.toBeInTheDocument();
  });
  test.each(['unauthenticated', 'hydrating'])('sin contexto válido %s no consulta', state => {
    if (state === 'unauthenticated') auth.isAuthenticated = false; else auth.isHydrating = true;
    render(<Page />); expect(api.getClienteMe).not.toHaveBeenCalled();
  });
  test('fallo B no muestra datos A', async () => {
    const view = render(<Page />); await screen.findAllByText('CLIENT-A'); api.getClienteMe.mockRejectedValue({ status: 500 }); identity('B'); view.rerender(<Page />);
    await waitFor(() => expect(notices.error).toHaveBeenCalledTimes(1)); expect(screen.queryAllByText('CLIENT-A')).toHaveLength(0);
  });
  test.each(['Editar perfil', 'Eliminar mi cuenta'])('cambio titular cierra %s', async name => {
    const view = render(<Page />); await screen.findAllByText('CLIENT-A'); fireEvent.click(screen.getByRole('button', { name })); expect(screen.getByRole('dialog')).toBeInTheDocument();
    identity('B'); api.getClienteMe.mockResolvedValue(payload('B')); view.rerender(<Page />); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); await screen.findAllByText('CLIENT-B');
  });
  test('cambio de cliente_id también invalida el titular', async () => {
    const view = render(<Page />); await screen.findAllByText('CLIENT-A'); auth.clienteId = 'new-client'; api.getClienteMe.mockResolvedValue(payload('B')); view.rerender(<Page />);
    expect(screen.queryAllByText('CLIENT-A')).toHaveLength(0); await screen.findAllByText('CLIENT-B');
  });
  test('desmontaje y error 401 tardío no provocan logout', async () => {
    const p = deferred(); api.getClienteMe.mockReturnValue(p.promise); const view = render(<Page />); view.unmount(); await act(async () => p.reject({ status: 401 }));
    expect(auth.logout).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled(); expect(layout.refreshClienteProfile).not.toHaveBeenCalled();
  });
  test('StrictMode conserva carga vigente', async () => {
    render(<StrictMode><Page /></StrictMode>); await screen.findAllByText('CLIENT-A'); expect(layout.refreshClienteProfile).toHaveBeenCalledTimes(1);
  });
});

describe('editor vigente', () => {
  function mount(id = 'A') { const saved = vi.fn(), close = vi.fn(); const view = render(<Editor open profile={profile(id)} onSaved={saved} onOpenChange={close} />); return { ...view, saved, close }; }
  function submit() { fireEvent.submit(screen.getByRole('dialog').querySelector('form')); }
  test('guardado normal conserva foto omitida y datos; no dispara upload', async () => {
    const view = mount(); fireEvent.change(screen.getByLabelText('Dirección (opcional)'), { target: { value: 'Dirección sintética' } }); submit();
    await waitFor(() => expect(view.saved).toHaveBeenCalledWith(payload('A'))); expect(view.close).toHaveBeenCalledWith(false);
    expect(api.updateClienteMe.mock.calls[0][0]).toMatchObject({ telefono_principal: '99999999', direccion_texto: 'Dirección sintética' });
    expect(api.updateClienteMe.mock.calls[0][0]).not.toHaveProperty('foto_perfil_asset_id'); expect(api.prepareClienteProfileImageUpload).not.toHaveBeenCalled();
  });
  test('error vigente conserva editor y permite reintento', async () => {
    api.updateClienteMe.mockRejectedValue({ data: { error: { message: 'No fue posible guardar' } } }); const v = mount(); submit(); await waitFor(() => expect(notices.error).toHaveBeenCalledWith('No fue posible guardar'));
    expect(v.saved).not.toHaveBeenCalled(); expect(v.close).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Guardar perfil' })).toBeEnabled();
  });
  test('doble submit no duplica mutación', async () => { const p = deferred(); api.updateClienteMe.mockReturnValue(p.promise); mount(); act(() => { submit(); submit(); }); expect(api.updateClienteMe).toHaveBeenCalledTimes(1); await act(async () => p.resolve(payload('A'))); });
  test.each(['identity', 'close', 'unmount'])('finalización A tras %s no produce efectos visuales', async change => {
    const p = deferred(); api.updateClienteMe.mockReturnValue(p.promise); const v = mount(); submit();
    if (change === 'unmount') v.unmount(); else v.rerender(<Editor open={change !== 'close'} profile={profile(change === 'identity' ? 'B' : 'A')} onSaved={v.saved} onOpenChange={v.close} />);
    await act(async () => p.resolve(payload('A'))); expect(v.saved).not.toHaveBeenCalled(); expect(v.close).not.toHaveBeenCalled(); expect(notices.success).not.toHaveBeenCalled();
  });
  test('error A no reemplaza éxito B ni libera otra operación', async () => {
    const a = deferred(), b = deferred(); api.updateClienteMe.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); const v = mount(); submit();
    v.rerender(<Editor open profile={profile('B')} onSaved={v.saved} onOpenChange={v.close} />); submit(); await act(async () => a.reject({ message: 'Error A' }));
    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled(); expect(notices.error).not.toHaveBeenCalled();
    await act(async () => b.resolve(payload('B'))); expect(v.saved).toHaveBeenCalledExactlyOnceWith(payload('B'));
  });
  test('upload A tardío no asigna asset ni URL a B', async () => {
    const p = deferred(); api.prepareClienteProfileImageUpload.mockReturnValue(p.promise); const v = mount();
    fireEvent.change(screen.getByLabelText('Archivo de fotografía privada'), { target: { files: [new File(['x'], 'synthetic.jpg', { type: 'image/jpeg' })] } });
    v.rerender(<Editor open profile={profile('B')} onSaved={v.saved} onOpenChange={v.close} />);
    await act(async () => p.resolve({ asset_id: 'old-asset' })); expect(api.getClienteProfileImageReadUrl).not.toHaveBeenCalled(); expect(screen.getByAltText('Foto de perfil')).toHaveAttribute('src', 'https://synthetic.invalid/B.jpg'); expect(notices.success).not.toHaveBeenCalled();
  });
  test('URL firmada A tardía no cambia preview B', async () => {
    const p = deferred(); api.getClienteProfileImageReadUrl.mockReturnValue(p.promise); const v = mount();
    fireEvent.change(screen.getByLabelText('Archivo de fotografía privada'), { target: { files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(api.getClienteProfileImageReadUrl).toHaveBeenCalled());
    v.rerender(<Editor open profile={profile('B')} onSaved={v.saved} onOpenChange={v.close} />); await act(async () => p.resolve({ url: 'https://synthetic.invalid/old.jpg' }));
    expect(screen.getByAltText('Foto de perfil')).toHaveAttribute('src', 'https://synthetic.invalid/B.jpg');
  });
  test.each(['Formato no válido', 'Fallo simulado'])('upload rechazado %s conserva fotografía', async message => {
    api.prepareClienteProfileImageUpload.mockRejectedValue(new Error(message)); mount();
    fireEvent.change(screen.getByLabelText('Archivo de fotografía privada'), { target: { files: [new File(['x'], 'x.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(notices.error).toHaveBeenCalledWith(message)); expect(api.updateClienteMe).not.toHaveBeenCalled(); expect(screen.getByAltText('Foto de perfil')).toHaveAttribute('src', 'https://synthetic.invalid/A.jpg');
  });
  test('retiro voluntario envía null explícito', async () => { mount(); fireEvent.click(screen.getByRole('button', { name: 'Quitar' })); submit(); await waitFor(() => expect(api.updateClienteMe).toHaveBeenCalled()); expect(api.updateClienteMe.mock.calls[0][0].foto_perfil_asset_id).toBeNull(); });
  test('upload vigente conserva asset y URL para el guardado explícito', async () => {
    mount(); fireEvent.change(screen.getByLabelText('Archivo de fotografía privada'), { target: { files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByAltText('Foto de perfil')).toHaveAttribute('src', 'https://synthetic.invalid/new.jpg'));
    expect(api.updateClienteMe).not.toHaveBeenCalled(); submit();
    await waitFor(() => expect(api.updateClienteMe).toHaveBeenCalled()); expect(api.updateClienteMe.mock.calls[0][0].foto_perfil_asset_id).toBe('new-asset');
  });
  test('validador real rechaza formato y tamaño antes de preparar cualquier subida', async () => {
    const realApi = await vi.importActual('../../lib/clienteApi.js');
    await expect(realApi.prepareClienteProfileImageUpload({ type: 'text/plain', size: 1 })).rejects.toThrow('Formato no válido');
    await expect(realApi.prepareClienteProfileImageUpload({ type: 'image/jpeg', size: 5242881 })).rejects.toThrow('5MB');
    expect(api.prepareClienteProfileImageUpload).not.toHaveBeenCalled();
  });
  test('labels, descripción Radix y foco están vinculados sin duplicados', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); mount();
    const dialog = screen.getByRole('dialog', { name: 'Perfil privado del cliente' }); expect(document.getElementById(dialog.getAttribute('aria-describedby'))).toHaveTextContent('Actualiza solo lo necesario');
    for (const label of ['Teléfono principal *', 'Fecha de nacimiento', 'Género (opcional)', 'Dirección (opcional)', 'Preferencias para tu barbero']) { const control = screen.getByLabelText(label); control.focus(); expect(control).toHaveFocus(); }
    const ids = Array.from(dialog.querySelectorAll('[id]'), n => n.id); expect(new Set(ids).size).toBe(ids.length); expect(warn).not.toHaveBeenCalled(); warn.mockRestore();
    expect(dialog.textContent).not.toMatch(/Ã|Â/);
    fireEvent.keyDown(document.activeElement, { key: 'Escape', code: 'Escape' });
  });
});
