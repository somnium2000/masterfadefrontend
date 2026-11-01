// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import AdminReservationCode from '../AdminReservationCode.jsx';
import { buildBookingShortCode } from '../../../public/booking/bookingUtils.js';
afterEach(cleanup);
it('muestra la misma referencia publica para todos los integrantes del grupo', () => {
  const groupId = '11111111-2222-4333-8444-555555555555';
  const code = buildBookingShortCode(groupId, 5);
  render(<><AdminReservationCode groupId={groupId} /><AdminReservationCode groupId={groupId} /></>);
  expect(screen.getAllByText(code)).toHaveLength(2);
  expect(screen.queryByText(groupId)).toBeNull();
});
it('no inventa un codigo si falta el grupo', () => {
  render(<AdminReservationCode />);
  expect(screen.getByText('No disponible')).toBeTruthy();
});
