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
it.each([['en_espera','En espera'],['pendiente_pago','Pendiente de pago'],['confirmada','Confirmada'],['en_salon','En salón'],['en_atencion','En atención'],['completada','Completada'],['cancelada','Cancelada'],['cancelada_por_cliente','Cancelada por el cliente'],['expirada','Expirada'],['no_show','No asistió'],['anulada','Anulada']])('Buscar reserva: %s legible en resultado y detalle',async(code,label)=>{
 const cita={id_cita:'fixture',nombre_cliente:'Integrante',alias_integrante:'Integrante',estado_cita_codigo:code,inicio_at:'2026-11-15T14:00:00Z'};
 mocks.search.mockResolvedValue({data:{reservas:[{id_grupo_cita:'fixture',codigo_reserva:'ABCDE',citas:[cita]}]}});
 const dialog=open();fireEvent.change(within(dialog).getByLabelText('Código de reserva'),{target:{value:'ABCDE'}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Buscar',exact:true}));
 expect((await within(dialog).findAllByText(label,{exact:true})).length).toBeGreaterThan(0);
 expect(dialog.textContent).toContain(' · '+label);expect(cita.estado_cita_codigo).toBe(code);
 expect(dialog.textContent).not.toMatch(/no_show|en_salon|en_atencion|pendiente_pago|cancelada_por_cliente/);
});

it('mantiene un único encabezado accesible y conserva búsqueda y herramientas', () => {
  render(<MemoryRouter><AdminAgendamientoCitasPage /></MemoryRouter>);
  const header = screen.getByRole('banner', { name: 'Herramientas de citas' });
  expect(within(header).getAllByRole('heading', { name: 'Citas' })).toHaveLength(1);
  expect(within(header).getByLabelText('Sucursal operativa')).toBeTruthy();
  const search = within(header).getByRole('textbox', { name: 'Buscar por cliente, barbero o ID' });
  fireEvent.change(search, { target: { value: 'Cliente' } });
  fireEvent.click(within(header).getByRole('button', { name: 'Borrar búsqueda' }));
  expect(search.value).toBe('');
  fireEvent.click(within(header).getByRole('button', { name: 'Buscar reserva' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
});

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
