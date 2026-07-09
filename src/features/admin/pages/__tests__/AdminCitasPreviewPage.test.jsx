// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import AdminCitasPreviewPage from '../AdminCitasPreviewPage.jsx';

const BRANCH_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_B = '22222222-2222-4222-8222-222222222222';
const BARBER_A = '33333333-3333-4333-8333-333333333333';
const BARBER_B = '44444444-4444-4444-8444-444444444444';
const SERVICE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const apiMock = vi.hoisted(() => ({
  getPublicBookingContext: vi.fn(),
  listPublicAgendaBarberos: vi.fn(),
  listPublicAgendaDisponibilidad: vi.fn(),
  listPublicAgendaHorarios: vi.fn(),
  listPublicCatalogPaquetes: vi.fn(),
  listPublicCatalogServicios: vi.fn(),
}));

const notificationMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../../../public/booking/publicBookingApi.js', () => apiMock);
vi.mock('../../../../context/NotificationsContext.jsx', () => ({
  useNotifications: () => notificationMock,
}));

beforeEach(() => {
  apiMock.getPublicBookingContext.mockReset();
  apiMock.listPublicAgendaBarberos.mockReset();
  apiMock.listPublicAgendaDisponibilidad.mockReset();
  apiMock.listPublicAgendaHorarios.mockReset();
  apiMock.listPublicCatalogPaquetes.mockReset();
  apiMock.listPublicCatalogServicios.mockReset();
  notificationMock.error.mockReset();
  notificationMock.info.mockReset();
  notificationMock.success.mockReset();
  notificationMock.warning.mockReset();

  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollBy = vi.fn();
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);

  apiMock.getPublicBookingContext.mockResolvedValue({
    data: {
      sucursales: [
        { id_sucursal: BRANCH_A, nombre_sucursal: 'Sucursal Centro' },
        { id_sucursal: BRANCH_B, nombre_sucursal: 'Sucursal Norte' },
      ],
      parametros: {
        permitir_acompanantes: false,
        pago_total_obligatorio: true,
        hold_duracion_min: 5,
      },
    },
  });

  apiMock.listPublicAgendaBarberos.mockImplementation(({ id_sucursal: branchId }) => Promise.resolve({
    data: {
      barberos: branchId === BRANCH_B
        ? [{ id_empleado: BARBER_B, id_sucursal: BRANCH_B, nombre_completo: 'Grace Hopper', alias_publico: 'Grace' }]
        : [
            { id_empleado: BARBER_A, id_sucursal: BRANCH_A, nombre_completo: 'Ada Lovelace', alias_publico: 'Ada' },
            { id_empleado: BARBER_B, id_sucursal: BRANCH_A, nombre_completo: 'Grace Hopper', alias_publico: 'Grace' },
          ],
    },
  }));

  apiMock.listPublicCatalogServicios.mockResolvedValue({
    data: {
      servicios: [{
        id_servicio: SERVICE_A,
        nombre_servicio: 'Corte Fade',
        precio_hnl: 250,
        duracion_min: 30,
        buffer_min: 0,
      }],
    },
  });
  apiMock.listPublicCatalogPaquetes.mockResolvedValue({
    data: {
      paquetes: [{
        id_paquete: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        nombre_paquete: 'Paquete Fade',
        precio_hnl: 400,
        items: [{ id_servicio: SERVICE_A, nombre_servicio: 'Corte Fade', cantidad: 1 }],
      }],
    },
  });
  apiMock.listPublicAgendaDisponibilidad.mockResolvedValue({
    disponibilidad: [{
      fecha: '2026-07-15',
      disponible: true,
      barberos_disponibles: 1,
      primer_horario_disponible: '09:00',
    }],
  });
  apiMock.listPublicAgendaHorarios.mockResolvedValue({
    horarios: [{ hora: '09:00', disponible: true }],
    hora_inicio: '09:00',
    hora_fin: '10:00',
  });
});

afterEach(() => {
  cleanup();
});

async function renderReadyPreview() {
  render(<AdminCitasPreviewPage />);
  expect(await screen.findByRole('button', { name: /Seleccionar a Ada/i })).toBeInTheDocument();
}

async function selectAdaAndExpectAgenda() {
  fireEvent.click(screen.getByRole('button', { name: /Seleccionar a Ada/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /2\. Agenda/i })).toHaveClass('is-active'));
  expect(screen.getAllByText(/Configurando: Titular/i).length).toBeGreaterThan(0);
}

async function completeAgendaSelection() {
  fireEvent.change(screen.getByLabelText(/Nombres/i), { target: { value: 'Carlos' } });
  fireEvent.change(screen.getByLabelText(/Apellidos/i), { target: { value: 'Ramirez' } });
  fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: 'carlos@example.test' } });
  fireEvent.change(screen.getByLabelText(/Tel/i), { target: { value: '+504 9999-9999' } });

  fireEvent.click(screen.getByRole('button', { name: /Corte Fade/i }));
  await waitFor(() => expect(apiMock.listPublicAgendaDisponibilidad).toHaveBeenCalledWith(
    expect.objectContaining({
      id_sucursal: BRANCH_A,
      id_barbero: BARBER_A,
      selection_type: 'services',
      servicios: SERVICE_A,
    }),
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  ));

  fireEvent.click(await screen.findByRole('button', { name: /2026-07-15 disponible/i }));
  await waitFor(() => expect(apiMock.listPublicAgendaHorarios).toHaveBeenCalledWith(
    expect.objectContaining({
      id_sucursal: BRANCH_A,
      id_barbero: BARBER_A,
      selection_type: 'services',
      servicios: SERVICE_A,
      fecha: '2026-07-15',
    }),
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  ));

  fireEvent.click(await screen.findByRole('button', { name: /9:00/i }));
}

describe('AdminCitasPreviewPage', () => {
  test('clic en card de barbero avanza a agenda y cambiar barbero no regresa a barberos', async () => {
    await renderReadyPreview();
    await selectAdaAndExpectAgenda();

    const barberSelect = screen.getByRole('combobox');
    fireEvent.change(barberSelect, { target: { value: BARBER_B } });

    await waitFor(() => expect(screen.getByRole('button', { name: /2\. Agenda/i })).toHaveClass('is-active'));
    expect(screen.getAllByText(/Configurando: Titular/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Selecciona sucursal y barbero/i)).not.toBeInTheDocument();
  });

  test('cambiar sucursal reinicia el flujo a barberos', async () => {
    await renderReadyPreview();
    await selectAdaAndExpectAgenda();

    fireEvent.click(screen.getByRole('button', { name: /1\. Barberos/i }));
    const branchSelect = screen.getByLabelText(/Sucursal/i);
    fireEvent.change(branchSelect, { target: { value: BRANCH_B } });

    expect(await screen.findByText(/Selecciona sucursal y barbero/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\. Barberos/i })).toHaveClass('is-active');
    expect(await screen.findByRole('button', { name: /Seleccionar a Grace/i })).toBeInTheDocument();
  });

  test('agenda carga disponibilidad, horarios, confirma y conserva Pagadito como demo', async () => {
    await renderReadyPreview();
    await selectAdaAndExpectAgenda();

    await completeAgendaSelection();

    const continueButton = screen.getByRole('button', { name: /Continuar a resumen/i });
    fireEvent.click(continueButton);

    expect(await screen.findByText(/Resumen de cita/i)).toBeInTheDocument();
    const actions = screen.getByText(/Resumen de cita/i).closest('.citas-confirm-wrap');
    expect(within(actions).getByRole('button', { name: /Ir a Pagadito \(demo\)/i })).toBeEnabled();

    fireEvent.click(within(actions).getByRole('button', { name: /Ir a Pagadito \(demo\)/i }));
    await waitFor(() => expect(notificationMock.info).toHaveBeenCalledWith(
      expect.stringContaining('Pagadito'),
      expect.objectContaining({ dedupeKey: 'admin-preview-payment-demo' })
    ));
  });
});
