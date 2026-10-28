// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import AdminAgendamientoCitasPage from '../AdminAgendamientoCitasPage.jsx';

const mocks = vi.hoisted(() => ({ search: vi.fn(), auth: { roles: ['super_admin'], isAuthenticated: false, invalidateSession: () => {} }, notifications: {} }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => mocks.notifications }));
vi.mock('../../lib/adminCitasApi.js', async (importOriginal) => ({ ...await importOriginal(), searchAdminReservation: (...args) => mocks.search(...args) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function open() {
  render(<MemoryRouter><AdminAgendamientoCitasPage /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole('button', { name: /Buscar reserva/ })[0]);
  return screen.getByRole('dialog');
}

it('busca por codigo y muestra padre completado e hijo confirmado sin confundir grupos', async () => {
  mocks.search.mockResolvedValue({ data: { reservas: [{ id_grupo_cita: 'group-a', codigo_reserva: 'GOXBD', citas: [
    { id_cita: 'a', alias_integrante: 'Padre', nombre_cliente: 'Padre', inicio_at: '2026-10-28T14:00:00Z', estado_cita_codigo: 'completada' },
    { id_cita: 'b', alias_integrante: 'Hijo', nombre_cliente: 'Padre', inicio_at: '2026-10-29T01:00:00Z', estado_cita_codigo: 'confirmada' },
  ] }, { id_grupo_cita: 'group-b', codigo_reserva: 'GOXBD', citas: [] }] } });
  const modal = open();
  fireEvent.change(within(modal).getByLabelText('Código de reserva'), { target: { value: 'goxbd' } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Buscar', exact: true }));
  expect((await within(modal).findAllByText('Hijo')).length).toBeGreaterThan(0);
  expect(within(modal).getByText(/coincide con varias reservas/)).toBeTruthy();
  expect(within(modal).getAllByText('Reserva GOXBD')).toHaveLength(2);
  expect(mocks.search.mock.calls[0][0]).toBe('GOXBD');
});

it('valida codigo antes de consultar y presenta ausencia de resultados', async () => {
  const modal = open();
  fireEvent.click(within(modal).getByRole('button', { name: 'Buscar', exact: true }));
  expect(within(modal).getByText(/cinco letras/)).toBeTruthy();
  expect(mocks.search).not.toHaveBeenCalled();
  mocks.search.mockResolvedValue({ data: { reservas: [] } });
  fireEvent.change(within(modal).getByLabelText('Código de reserva'), { target: { value: '00000' } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Buscar', exact: true }));
  expect(await within(modal).findByText(/No hay reservas coincidentes/)).toBeTruthy();
});

it('presenta error seguro sin filtrar detalles del servidor', async () => {
  mocks.search.mockRejectedValue(new Error('SQL secreto interno'));
  const modal = open();
  fireEvent.change(within(modal).getByLabelText('Código de reserva'), { target: { value: 'GOXBD' } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Buscar', exact: true }));
  expect(await within(modal).findByText(/No fue posible buscar/)).toBeTruthy();
  expect(within(modal).queryByText(/SQL secreto/)).toBeNull();
});

it('cancela la consulta al cerrar el modal', async () => {
  mocks.search.mockImplementation(() => new Promise(() => {}));
  const modal = open();
  fireEvent.change(within(modal).getByLabelText('Código de reserva'), { target: { value: 'GOXBD' } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Buscar', exact: true }));
  const signal = mocks.search.mock.calls[0][2].signal;
  fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }));
  expect(signal.aborted).toBe(true);
});
