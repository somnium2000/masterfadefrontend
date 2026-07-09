import { describe, expect, test } from 'vitest';
import { hasRealDayAvailability } from '../utils/bookingDates.js';

describe('hasRealDayAvailability', () => {
  test('habilita dias disponibles aunque el resumen mensual traiga slots vacio', () => {
    expect(hasRealDayAvailability({
      disponible: true,
      barberos_disponibles: 1,
      primer_horario_disponible: '10:00',
      slots: [],
    })).toBe(true);
  });

  test('bloquea dias sin barberos disponibles o sin primer horario', () => {
    expect(hasRealDayAvailability({
      disponible: true,
      barberos_disponibles: 0,
      primer_horario_disponible: '10:00',
      slots: [],
    })).toBe(false);

    expect(hasRealDayAvailability({
      disponible: true,
      barberos_disponibles: 1,
      primer_horario_disponible: '',
      slots: [],
    })).toBe(false);
  });

  test('bloquea cuando slots viene poblado y ninguno esta disponible', () => {
    expect(hasRealDayAvailability({
      disponible: true,
      barberos_disponibles: 1,
      primer_horario_disponible: '10:00',
      slots: [
        { hora: '10:00', disponible: false },
        { hora: '10:30', disponible: false },
      ],
    })).toBe(false);
  });
});
