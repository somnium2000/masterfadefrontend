// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ClienteDashboardPage from '../ClienteDashboardPage.jsx';
import ClienteHistorialCitasPage from '../ClienteHistorialCitasPage.jsx';

const startNewAppointment = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../../../hooks/usePrivateCommerce.js', () => ({ default: () => ({ booking: true }) }));
const api = vi.hoisted(() => ({
  descartarClienteCitaPendiente: vi.fn(),
  getClienteCitaDetalle: vi.fn(),
  getClienteCitaPendiente: vi.fn(),
  getClienteMe: vi.fn(),
  listClienteCitas: vi.fn(),
  retomarClienteCitaPendiente: vi.fn(),
}));
const notifications = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocation: () => ({ pathname: '/home/cliente/citas', state: null }),
    useNavigate: () => navigate,
    useOutletContext: () => ({ refreshClienteProfile: vi.fn(), startNewAppointment }),
  };
});
vi.mock('../../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id_usuario: 'U', cliente_id: 'C' }, isAuthenticated: true, isHydrated: true, isHydrating: false, logout: vi.fn() }),
}));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notifications }));
vi.mock('../../lib/clienteApi.js', () => api);
vi.mock('../../../public/lib/catalogApi.js', () => ({ listPublicCatalogServices: vi.fn().mockResolvedValue({ services: [] }) }));
vi.mock('../../components/ClienteCourtesyRouteSection.jsx', () => ({ default: () => null }));
vi.mock('../../components/ClienteProfileCompletionBanner.jsx', () => ({ default: () => null }));
vi.mock('../../components/ClienteProfileEditModal.jsx', () => ({ default: () => null }));
vi.mock('../../components/ClienteSummaryCards.jsx', () => ({
  default: ({ onNewAppointment }) => <button type="button" onClick={onNewAppointment}>Agendar nueva</button>,
}));
vi.mock('../../../../components/data/CardsCarousel.jsx', () => ({ default: () => null }));

beforeEach(() => {
  startNewAppointment.mockReset(); navigate.mockReset();
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getClienteMe.mockResolvedValue({ cliente: {}, profile_completion: { completion_percent: 100, is_complete: true } });
  api.listClienteCitas.mockResolvedValue({ citas: [] });
  api.getClienteCitaPendiente.mockResolvedValue({ pendiente: null });
});
afterEach(cleanup);

test('Inicio delega ambas acciones de nueva cita en la verificación central', async () => {
  render(<ClienteDashboardPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Agendar nueva' }));
  fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
  expect(startNewAppointment).toHaveBeenCalledTimes(2);
  expect(navigate).not.toHaveBeenCalledWith('/agendar');
});

test('Historial delega Nueva cita en la verificación central', async () => {
  render(<ClienteHistorialCitasPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva cita' }));
  expect(startNewAppointment).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalledWith('/agendar');
});

test('Historial conserva sin interceptar la recuperación de pago pendiente', async () => {
  api.getClienteCitaPendiente.mockResolvedValue({
    pendiente: { id_grupo_cita: 'GRUPO', citas: [], sucursal: {}, total_pendiente_hnl: 100 },
  });
  api.retomarClienteCitaPendiente.mockResolvedValue({
    payment_intent: { id_intent: 'INTENT', id_grupo_cita: 'GRUPO' },
  });
  render(<ClienteHistorialCitasPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar pago' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar pago' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/agendar/pagar?id_grupo_cita=GRUPO&id_intent=INTENT'));
  expect(startNewAppointment).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalledWith('/agendar');
});
