// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { AuthProvider, useAuth } from '../../../../context/AuthContext.jsx';
import Page from '../ClientePerfilPage.jsx';
import useBookingMode from '../../../public/booking/hooks/useBookingMode.js';
import { getTitularState } from '../../../public/booking/bookingUtils.js';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const api = vi.hoisted(() => ({ getClienteMe: vi.fn(), updateClienteMe: vi.fn() }));
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http, abortInFlightRequests: vi.fn(), registerSessionInvalidationHandler: () => () => {}, resetSessionInvalidation: vi.fn() }));
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: null }));
vi.mock('../../../../features/admin/lib/adminReportesApi.js', () => ({ setAdminReportesSessionScope: vi.fn() }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('../../lib/clienteApi.js', () => ({ ...api, ALLOWED_PROFILE_IMAGE_TYPES: ['image/jpeg'], MAX_PROFILE_IMAGE_BYTES: 5242880, getClienteProfileImageReadUrl: vi.fn(), prepareClienteProfileImageUpload: vi.fn() }));
vi.mock('../../components/ClienteAccountDeletionDialog.jsx', () => ({ default: () => null }));

let latest;
const owner = (id = 'A', phone = null) => ({ ok: true, data: {
  user: { id_usuario: `user-${id}`, nombres: 'Cliente', apellidos: 'Sintetico', telefono_principal: phone },
  roles: ['cliente', 'admin', 'barbero'], cliente_id: `client-${id}`, empleado_id: 'employee', empresa_id: 'company', branch_ids: ['branch'],
} });
const profile = (id = 'A', phone = null) => ({ cliente: { id_usuario: `user-${id}`, id_cliente: `client-${id}`, nombres: 'Cliente', apellidos: 'Sintetico', telefono_principal: phone }, profile_completion: { completion_percent: 50 } });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function Probe() {
  const auth = useAuth();
  const booking = useBookingMode();
  const navigate = useNavigate();
  useLayoutEffect(() => { latest = auth; }, [auth]);
  return <><output data-testid="phone">{auth.user?.telefono_principal || 'sin telefono'}</output>
    <output data-testid="booking">{booking.titularState.missingFields.join(',') || 'completo'}</output>
    <button onClick={() => navigate('/booking')}>Ir a agendamiento</button></>;
}
beforeEach(() => {
  latest = null; localStorage.clear(); sessionStorage.clear(); window.history.pushState({}, '', '/');
  localStorage.setItem('mf_session_last_backend_touch_at', String(Date.now()));
  Object.values(api).forEach(mock => mock.mockReset()); Object.values(notices).forEach(mock => mock.mockReset());
  http.get.mockReset().mockResolvedValue(owner()); http.post.mockReset().mockResolvedValue({ ok: true, data: { logged_out: true } });
  api.getClienteMe.mockResolvedValue(profile()); api.updateClienteMe.mockResolvedValue(profile('A', '99998888'));
});
afterEach(cleanup);
async function ready() {
  render(<MemoryRouter initialEntries={['/perfil']}><AuthProvider><Probe /><Routes>
    <Route path="/perfil" element={<Page />} /><Route path="/booking" element={<p>Agendamiento sintético</p>} />
  </Routes></AuthProvider></MemoryRouter>);
  await act(async () => { await latest.hydrateSession(); });
  await screen.findByRole('button', { name: 'Editar perfil' });
}
function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }));
  fireEvent.change(screen.getByLabelText('Teléfono principal *'), { target: { value: '88887777' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
}

test('PATCH confirmado sincroniza Auth y agendamiento sin recarga ni rehidratación; conserva sesión multirrol', async () => {
  await ready();
  expect(getTitularState(latest.user).missingFields).toContain('telefono_principal');
  const previous = latest;
  save();
  await waitFor(() => expect(screen.getByTestId('phone')).toHaveTextContent('99998888'));
  expect(latest.user).toEqual({ ...previous.user, telefono_principal: '99998888' });
  for (const key of ['token', 'roles', 'branchIds', 'empresaId', 'empleadoId', 'clienteId', 'isAuthenticated']) expect(latest[key]).toEqual(previous[key]);
  expect(api.updateClienteMe.mock.calls[0][0].telefono_principal).toBe('88887777');
  expect(getTitularState(latest.user).missingFields).not.toContain('telefono_principal');
  fireEvent.click(screen.getByRole('button', { name: 'Ir a agendamiento' }));
  expect(screen.getByText('Agendamiento sintético')).toBeInTheDocument();
  expect(screen.getByTestId('booking')).toHaveTextContent('completo');
  expect(http.get).toHaveBeenCalledTimes(1); expect(http.post).not.toHaveBeenCalled();
});

test('fallo HTTP no sincroniza el valor del formulario', async () => {
  api.updateClienteMe.mockRejectedValue({ status: 500 }); await ready(); const previous = latest.user; save();
  await waitFor(() => expect(notices.error).toHaveBeenCalled());
  expect(latest.user).toBe(previous); expect(screen.getByTestId('booking')).toHaveTextContent('telefono_principal');
});

test.each([{}, { cliente: { id_cliente: 'client-A' } }, profile('B', '99998888'), { cliente: { id_cliente: 'client-A', id_usuario: 'user-B', telefono_principal: '99998888' } }])('respuesta incompleta o ajena no sincroniza %j', async payload => {
  api.updateClienteMe.mockResolvedValue(payload); await ready(); const previous = latest.user; save();
  await waitFor(() => expect(notices.success).toHaveBeenCalled()); expect(latest.user).toBe(previous);
});

test.each(['other-account', 'logout'])('guardado pendiente no restaura identidad tras %s', async change => {
  const pending = deferred(); api.updateClienteMe.mockReturnValue(pending.promise); await ready(); const staleSync = latest.syncClienteProfile; save();
  await act(async () => {
    if (change === 'logout') await latest.logout();
    else { http.get.mockResolvedValue(owner('B')); api.getClienteMe.mockResolvedValue(profile('B')); await latest.hydrateSession(); }
  });
  const previous = latest.user;
  await act(async () => { pending.resolve(profile('A', '99998888')); staleSync(profile('A', '99998888').cliente, 'user-A'); });
  expect(latest.user).toBe(previous);
  expect(notices.success).not.toHaveBeenCalled();
});

test('callback de una época anterior no actualiza una nueva sesión de la misma cuenta', async () => {
  await ready(); const staleSync = latest.syncClienteProfile;
  await act(async () => { await latest.logout(); await latest.hydrateSession(); });
  await act(async () => staleSync(profile('A', '99998888').cliente, 'user-A'));
  expect(latest.user.telefono_principal).toBeNull();
});

test('teléfono válido se conserva y sincronización no modifica otros campos de Auth', async () => {
  http.get.mockResolvedValue(owner('A', '77776666')); await ready(); const previous = latest.user;
  await act(async () => latest.syncClienteProfile({ ...profile('A', '77776666').cliente, roles: ['super_admin'], empresa_id: 'foreign' }, 'user-A'));
  expect(latest.user).toEqual(previous); expect(screen.getByTestId('booking')).toHaveTextContent('completo');
});
