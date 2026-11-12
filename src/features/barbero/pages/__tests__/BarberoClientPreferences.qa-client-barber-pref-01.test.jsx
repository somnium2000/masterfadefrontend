// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import BarberoHomePage from '../BarberoHomePage.jsx';
import BarberoCalendarioPage from '../BarberoCalendarioPage.jsx';

const api = vi.hoisted(() => ({
  getAdminCitasOperativasContexto: vi.fn(),
  getAdminCitasOperativasCompletadasHoy: vi.fn(),
  listAdminCitasOperativas: vi.fn(),
}));
const navigate = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  user: { id_usuario: 'U', empleado_id: 'E' },
  isAuthenticated: true,
  invalidateSession: vi.fn(),
}));

vi.mock('../../../../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
  getUserDisplayName: () => 'Barbero QA',
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../../admin/lib/adminCitasApi.js', () => api);

function appointment(preferences = 'Degradado bajo\nConservar largo en la parte superior y perfilar la barba cuidadosamente.') {
  return {
    id_cita: 'CITA',
    id_empleado_barbero: 'E',
    nombre_cliente: 'Cliente QA',
    estado_cita_codigo: 'confirmada',
    inicio_at: new Date().toISOString(),
    fin_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    duracion_total_min: 60,
    servicios_detalle: [{ id_servicio: 'S', nombre_servicio: 'Corte QA' }],
    preferencias_corte: preferences,
  };
}

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  navigate.mockReset(); auth.invalidateSession.mockReset();
  api.getAdminCitasOperativasContexto.mockResolvedValue({ data: { sucursales: [], barberos: [] } });
  api.getAdminCitasOperativasCompletadasHoy.mockResolvedValue({ data: { citas: [] } });
  api.listAdminCitasOperativas.mockResolvedValue({ data: { citas: [appointment()] } });
});
afterEach(cleanup);

test('Inicio muestra preferencias completas en una sección expandible y responsive', async () => {
  render(<BarberoHomePage />);
  const summaries = await screen.findAllByText('Preferencias del cliente');
  expect(summaries.length).toBeGreaterThan(0);
  const text = screen.getAllByText(/Conservar largo en la parte superior/)[0];
  expect(text).toHaveClass('whitespace-pre-wrap', 'break-words');
  expect(text.closest('details')).toContainElement(summaries[0]);
});

test('Calendario muestra las preferencias de la respuesta operativa sin otra consulta', async () => {
  render(<BarberoCalendarioPage />);
  expect(await screen.findByText('Preferencias del cliente')).toBeInTheDocument();
  expect(screen.getByText(/Conservar largo en la parte superior/)).toHaveClass('whitespace-pre-wrap', 'break-words');
  expect(api.listAdminCitasOperativas).toHaveBeenCalledTimes(1);
});

test('tarjetas sin preferencias no presentan contenido innecesario', async () => {
  api.listAdminCitasOperativas.mockResolvedValue({ data: { citas: [appointment('   ')] } });
  render(<BarberoCalendarioPage />);
  await screen.findByText('Cliente QA');
  expect(screen.queryByText('Preferencias del cliente')).not.toBeInTheDocument();
});
