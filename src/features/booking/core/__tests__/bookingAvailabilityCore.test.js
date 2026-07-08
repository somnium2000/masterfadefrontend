import { describe, expect, it } from 'vitest';
import {
  buildBarberSlotSuggestions,
  buildBookingAvailabilityParams,
  buildPreviewSlotsFromResponse,
  findBookingBlockCollision,
  normalizeBookingAvailabilityMap,
} from '../bookingAvailabilityCore.js';

describe('booking availability core', () => {
  it('normalizes availability and request params', () => {
    expect(buildBookingAvailabilityParams({
      branchId: 'branch',
      barberId: 'barber',
      selectionType: 'mixed',
      packageId: 'pkg',
      servicesCsv: 'svc-1',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    })).toMatchObject({
      id_sucursal: 'branch',
      id_barbero: 'barber',
      selection_type: 'mixed',
      servicios: 'svc-1',
      id_paquete: 'pkg',
    });
    expect(normalizeBookingAvailabilityMap({
      data: { disponibilidad: [{ fecha: '2026-07-10', disponible: true }] },
    })).toEqual({ '2026-07-10': { fecha: '2026-07-10', disponible: true } });
  });

  it('builds slots, detects collisions and suggests barbers', async () => {
    expect(buildPreviewSlotsFromResponse({
      data: {
        hora_inicio: '09:00',
        hora_fin: '11:00',
        horarios: [{ hora: '09:00' }, { hora: '10:00' }],
      },
    })).toEqual(expect.arrayContaining([
      { hora: '09:00', disponible: true },
      { hora: '09:30', disponible: false },
      { hora: '10:00', disponible: true },
    ]));

    expect(findBookingBlockCollision({
      blocks: [{ index: 0, idBarbero: 'b-1', selectedDate: '2026-07-10', selectedTime: '09:00' }],
      barberId: 'b-1',
      dateKey: '2026-07-10',
      timeKey: '09:00',
      ignoreIndex: 1,
    })).toMatchObject({ index: 0 });

    await expect(buildBarberSlotSuggestions({
      barbers: [{ id_empleado: 'b-1' }, { id_empleado: 'b-2', nombre_completo: 'Luis' }],
      excludedBarberId: 'b-1',
      timeKey: '09:00',
      fetchSlotsForBarber: async () => [{ hora: '09:00', disponible: true }],
    })).resolves.toEqual([{ idBarbero: 'b-2', nombreBarbero: 'Luis' }]);
  });
});
