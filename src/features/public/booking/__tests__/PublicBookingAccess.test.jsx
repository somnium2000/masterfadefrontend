// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PublicBookingAccess from '../components/PublicBookingAccess.jsx';
import usePrivateCommerce from '../../../../hooks/usePrivateCommerce.js';
import LoginRoute from '../../../auth/components/LoginRoute.jsx';

const state = vi.hoisted(() => ({ auth: {}, get: vi.fn(), mounts: 0, unmounts: 0 }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => state.auth }));
vi.mock('../../../../services/httpClient.js', () => ({ http: { get: state.get } }));
vi.mock('../../../auth/pages/LoginPage.jsx', () => ({ default: () => <p>Autenticación requerida</p> }));
vi.mock('../components/BookingLoadingState.jsx', () => ({ default: () => <p>Verificando disponibilidad</p> }));
function Checkout() {
  useEffect(() => { state.mounts++; return () => { state.unmounts++; }; }, []);
  return <p>Checkout del cliente</p>;
}
function Entry() {
  const commerce = usePrivateCommerce();
  return <PublicBookingAccess commerce={commerce}><Checkout /></PublicBookingAccess>;
}
function Destination() {
  const location = useLocation();
  return <output aria-label="Destino">{location.pathname}{location.search}</output>;
}
function tree(path = '/agendar/barberos') {
  return <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/agendar/*" element={<Entry />} />
    <Route path="/login" element={<LoginRoute />} />
    <Route path="/unauthorized" element={<p>Sin autorización</p>} />
  </Routes><Destination /></MemoryRouter>;
}
function guest() { state.auth = { isAuthenticated: false, isHydrated: true, roles: [] }; }
function client() {
  state.auth = { isAuthenticated: true, isHydrated: true, user: { id_usuario: 'client' }, roles: ['cliente'] };
}
afterEach(() => { cleanup(); vi.resetAllMocks(); state.mounts = 0; state.unmounts = 0; });

test('guest with public booking enabled reaches login with safe local return, never checkout', async () => {
  guest(); state.get.mockResolvedValue({ data: { publicBooking: true, booking: false, vipPurchase: false } });
  const view = render(tree());
  await screen.findByText('Autenticación requerida');
  expect(screen.getByLabelText('Destino')).toHaveTextContent('/login?next=%2Fagendar%2Fbarberos');
  expect(state.mounts).toBe(0);
  client(); state.get.mockResolvedValue({ data: { publicBooking: true, booking: true, vipPurchase: false } });
  view.rerender(tree());
  await screen.findByText('Checkout del cliente');
  expect(screen.getByLabelText('Destino')).toHaveTextContent('/agendar/barberos');
  expect(state.mounts).toBe(1);
});

test('booking false keeps guest and client closed', async () => {
  for (const authenticate of [guest, client]) {
    authenticate(); state.get.mockResolvedValue({ data: { publicBooking: false, booking: false } });
    const view = render(tree());
    await screen.findByRole('heading', { name: 'Reservas temporalmente pausadas' });
    expect(state.mounts).toBe(0);
    view.unmount();
  }
});

test('a non-client never reaches checkout even if a malformed eligibility response grants booking', async () => {
  state.auth = { isAuthenticated: true, isHydrated: true, user: { id_usuario: 'admin' }, roles: ['admin'] };
  state.get.mockResolvedValue({ data: { publicBooking: true, booking: true } });
  render(tree());
  await screen.findByText('Sin autorización');
  expect(state.mounts).toBe(0);
});

test('same-user eligibility refresh does not unmount checkout; actual denial does', async () => {
  client(); state.get.mockResolvedValue({ data: { publicBooking: true, booking: true, vipPurchase: false } });
  render(tree('/agendar/pagar'));
  await screen.findByText('Checkout del cliente');
  let finish;
  state.get.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(screen.getByText('Checkout del cliente')).toBeInTheDocument();
  expect(state.mounts).toBe(1);
  expect(state.unmounts).toBe(0);
  await act(async () => finish({ data: { booking: false, publicBooking: false } }));
  await screen.findByRole('heading', { name: 'Reservas temporalmente pausadas' });
  expect(state.unmounts).toBe(1);
});

test('a hydrating identity cannot select the public adapter before authentication settles', async () => {
  state.auth = { isAuthenticated: true, isHydrated: false, isHydrating: true,
    user: { id_usuario: 'client' }, roles: ['cliente'] };
  state.get.mockResolvedValue({ data: { booking: true, publicBooking: true } });
  const view = render(tree());
  expect(screen.getByText('Verificando disponibilidad')).toBeInTheDocument();
  expect(state.get).not.toHaveBeenCalled();
  client(); view.rerender(tree());
  await waitFor(() => expect(state.mounts).toBe(1));
});
