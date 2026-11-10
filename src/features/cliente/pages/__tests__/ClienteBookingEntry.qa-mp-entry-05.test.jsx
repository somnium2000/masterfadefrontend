// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ClienteDashboardPage from '../ClienteDashboardPage.jsx';
import ClienteHistorialCitasPage from '../ClienteHistorialCitasPage.jsx';

const startNewAppointment = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const flags = vi.hoisted(() => ({ CLIENT_BOOKING_ENABLED: false, CLIENT_CITAS_ENABLED: true, CLIENT_LOCK_MESSAGE: 'Agendamiento temporalmente no disponible' }));
const location = vi.hoisted(() => ({ pathname:'/home/cliente/citas', state:null }));
vi.mock('../../lib/clientFeatureFlags.js', () => flags);
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
    useLocation: () => location,
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
  default: ({ onNewAppointment, appointmentActionsEnabled, appointmentActionLabel }) => (
    <button type="button" disabled={!appointmentActionsEnabled} onClick={onNewAppointment}>{appointmentActionLabel}</button>
  ),
}));
vi.mock('../../../../components/data/CardsCarousel.jsx', () => ({ default: () => null }));

beforeEach(() => {
  flags.CLIENT_BOOKING_ENABLED=false; location.state=null;
  startNewAppointment.mockReset(); navigate.mockReset();
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getClienteMe.mockResolvedValue({ cliente: {}, profile_completion: { completion_percent: 100, is_complete: true } });
  api.listClienteCitas.mockResolvedValue({ citas: [] });
  api.getClienteCitaPendiente.mockResolvedValue({ pendiente: null });
});
afterEach(cleanup);

test('Inicio bloquea ambas acciones de nueva cita cuando el indicador está deshabilitado', async () => {
  render(<ClienteDashboardPage />);
  const buttons = await screen.findAllByRole('button', { name: flags.CLIENT_LOCK_MESSAGE });
  expect(buttons).toHaveLength(2);
  for (const button of buttons) expect(button).toBeDisabled();
  expect(startNewAppointment).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalledWith('/agendar');
});

test('Historial delega Nueva cita en la verificación central', async () => {
  render(<ClienteHistorialCitasPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva cita' }));
  expect(startNewAppointment).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalledWith('/agendar');
});

test('Historial conserva sin interceptar la recuperación de pago pendiente', async () => {
  flags.CLIENT_BOOKING_ENABLED=true;
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

test.each([false,true])('pausa bloquea reanudacion por acceso guardado %s',async saved=>{
  if(saved)location.state={openPendingPaymentModal:true};
  sessionStorage.setItem('mf_pending_payment_context_v1',JSON.stringify({id_grupo_cita:'GRUPO',id_intent:'INTENT'}));
  api.getClienteCitaPendiente.mockResolvedValue({pendiente:{id_grupo_cita:'GRUPO',citas:[],sucursal:{},total_pendiente_hnl:0}});
  render(<ClienteHistorialCitasPage />);
  if(!saved)fireEvent.click(await screen.findByRole('button',{name:'Continuar pago'}));
  await waitFor(()=>expect(notifications.info).toHaveBeenCalledWith(flags.CLIENT_LOCK_MESSAGE));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.retomarClienteCitaPendiente).not.toHaveBeenCalled();
  expect(startNewAppointment).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining('/agendar'));
});
