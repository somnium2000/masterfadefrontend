import { expect, test } from 'vitest';
import { getAppointmentStatusLabel } from '../appointmentStatus.js';

test.each([
  ['en_espera', 'En espera'], ['pendiente_pago', 'Pendiente de pago'],
  ['confirmada', 'Confirmada'], ['en_salon', 'En salón'], ['en_atencion', 'En atención'],
  ['completada', 'Completada'], ['cancelada', 'Cancelada'],
  ['cancelada_por_cliente', 'Cancelada por el cliente'], ['expirada', 'Expirada'],
  ['no_show', 'No asistió'], ['anulada', 'Anulada'],
])('%s se presenta como %s sin alterar el código', (code, label) => {
  const source = Object.freeze({ estado_cita_codigo: code });
  expect(getAppointmentStatusLabel(source.estado_cita_codigo)).toBe(label);
  expect(getAppointmentStatusLabel(' ' + code.toUpperCase() + ' ')).toBe(label);
  expect(source.estado_cita_codigo).toBe(code);
});
test('inasistencias en métricas; los demás estados conservan su significado', () => {
  expect(getAppointmentStatusLabel('no_show', { metric: true })).toBe('Inasistencias');
  expect(['cancelada', 'cancelada_por_cliente', 'anulada', 'expirada'].map(code => getAppointmentStatusLabel(code)))
    .toEqual(['Cancelada', 'Cancelada por el cliente', 'Anulada', 'Expirada']);
});
test.each([null, undefined, '', 'estado_desconocido', '__proto__', 'constructor'])('fallback seguro: %s', code => {
  expect(getAppointmentStatusLabel(code)).toBe('Sin registrar');
});
