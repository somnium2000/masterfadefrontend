import { describe, expect, test } from 'vitest';
import {
  buildAvailabilityMap,
  hasRealDayAvailability,
} from '../utils/bookingDates.js';

describe('buildAvailabilityMap', () => {
  test('normaliza payload ok/data/disponibilidad', () => {
    const map = buildAvailabilityMap({
      ok: true,
      data: {
        disponibilidad: [{
          fecha: '2026-07-10',
          disponible: true,
          barberos_disponibles: 1,
          primer_horario_disponible: '08:00',
        }],
      },
    });

    expect(map['2026-07-10']).toMatchObject({
      fecha: '2026-07-10',
      disponible: true,
    });
  });

  test('normaliza fecha ISO a YYYY-MM-DD y soporta doble data', () => {
    const map = buildAvailabilityMap({
      data: {
        data: {
          disponibilidad: [{
            fecha: '2026-07-09T00:00:00.000Z',
            disponible: true,
            barberos_disponibles: 1,
            primer_horario_disponible: '15:00',
          }],
        },
      },
    });

    expect(map['2026-07-09']).toMatchObject({
      fecha: '2026-07-09',
      primer_horario_disponible: '15:00',
    });
  });

  test('soporta payload directo con disponibilidad', () => {
    const map = buildAvailabilityMap({
      disponibilidad: [{
        fecha: '2026-07-11',
        disponible: true,
        barberos_disponibles: 1,
        primer_horario_disponible: '08:00',
      }],
    });

    expect(map['2026-07-11']?.barberos_disponibles).toBe(1);
  });
});

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

  test('bloquea martes cerrado sin primer horario', () => {
    expect(hasRealDayAvailability({
      fecha: '2026-07-14',
      disponible: true,
      barberos_disponibles: 1,
      primer_horario_disponible: null,
      slots: [],
    })).toBe(false);
  });

  test('bloquea cierre_total cuando backend devuelve disponible false', () => {
    expect(hasRealDayAvailability({
      fecha: '2026-07-17',
      disponible: false,
      barberos_disponibles: 0,
      primer_horario_disponible: null,
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
