// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PublicBookingSuccessStep from '../PublicBookingSuccessStep.jsx';
import AdminReservationCode from '../../../admin/components/AdminReservationCode.jsx';
const fixture = vi.hoisted(() => ({ value: {} }));
vi.mock('../BookingFlowContext.jsx', () => ({ usePublicBookingFlow: () => fixture.value }));
afterEach(cleanup);
const groupId = '11111111-2222-4333-8444-555555555555';
const groupCode = 'S64WZ';
for (const source of ['payment', 'membership_no_payment', 'authenticated', 'historical']) {
  it(`${source}: referencia de grupo coincide con administracion y no agrega codigos individuales`, () => {
    fixture.value = { bookingBlocksSummary: [], holdResult: { id_grupo_cita: groupId }, bookingSuccessResult: {
      source, booking_confirmed: true, codigo_cita: groupCode,
      citas_confirmadas: [{ codigo_cita: 'HIJO1' }, { codigo_cita: 'PADRE' }],
    } };
    render(<PublicBookingSuccessStep />);
    expect(screen.getByText(groupCode)).toBeTruthy();
    expect(screen.queryByText(/HIJO1|PADRE/)).toBeNull();
  });
}
it('codigo explicito divergente no sustituye la referencia canonica de un grupo conocido', () => {
  fixture.value = { bookingBlocksSummary: [], holdResult: { id_grupo_cita: groupId }, bookingSuccessResult: { booking_confirmed: true, codigo_cita: 'API01' } };
  render(<PublicBookingSuccessStep />);
  expect(screen.getByText(groupCode)).toBeTruthy();
  expect(screen.queryByText('API01')).toBeNull();
});

it('confirmacion y tarjeta administrativa muestran la misma referencia pese a API divergente', () => {
  fixture.value = { bookingBlocksSummary: [], bookingSuccessResult: { booking_confirmed: true, id_grupo_cita: groupId, codigo_cita: 'OTRO1', citas_confirmadas: [{ codigo_cita: 'HIJO1' }, { codigo_cita: 'HIJO2' }] } };
  render(<><PublicBookingSuccessStep /><AdminReservationCode groupId={groupId} /></>);
  expect(screen.getAllByText(groupCode)).toHaveLength(2);
  expect(screen.queryByText(/OTRO1|HIJO1|HIJO2/)).toBeNull();
});

it('usa grupo como fallback antes de una lista de codigos individuales', () => {
  fixture.value = { bookingBlocksSummary: [], holdResult: { id_grupo_cita: groupId }, bookingSuccessResult: { booking_confirmed: true, citas_confirmadas: [{ codigo_cita: 'HIJO1' }] } };
  render(<PublicBookingSuccessStep />);
  expect(screen.getByText(groupCode)).toBeTruthy();
  expect(screen.queryByText('HIJO1')).toBeNull();
});

it('conserva codigo historico explicito cuando no hay identificador de grupo', () => {
  fixture.value = { bookingBlocksSummary: [], bookingSuccessResult: { booking_confirmed: true, codigo_cita: 'OLD01' } };
  render(<PublicBookingSuccessStep />);
  expect(screen.getByText('OLD01')).toBeTruthy();
});

it('no deriva una referencia de un identificador de grupo invalido', () => {
  fixture.value = { bookingBlocksSummary: [], holdResult: { id_grupo_cita: 'no-es-un-uuid' }, bookingSuccessResult: { booking_confirmed: true, codigo_cita: 'OLD01' } };
  render(<PublicBookingSuccessStep />);
  expect(screen.getByText('OLD01')).toBeTruthy();
});

it('sin grupo valido ni codigo historico no inventa una referencia', () => {
  fixture.value = { bookingBlocksSummary: [], holdResult: { id_grupo_cita: 'no-es-un-uuid' }, bookingSuccessResult: { booking_confirmed: true } };
  render(<PublicBookingSuccessStep />);
  expect(screen.getByText('En proceso de asignación')).toBeTruthy();
});

it('publica pagada sin codigo explicito deriva referencia desde el grupo de la respuesta de estado', () => {
  fixture.value = { bookingBlocksSummary: [], paymentResult: { estado_intent_codigo: 'confirmado', booking_confirmed: true, id_grupo_cita: groupId, monto_hnl: 1 } };
  render(<PublicBookingSuccessStep />);
  expect(screen.getByText(groupCode)).toBeTruthy();
});
