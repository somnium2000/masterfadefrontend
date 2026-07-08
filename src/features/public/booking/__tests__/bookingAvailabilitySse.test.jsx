// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useBookingAvailability from '../hooks/useBookingAvailability.js';

const BRANCH_A = '21355bf5-3ebc-4c7f-b16a-19e2ba2fe041';
const BARBER_A = '4215e004-67ff-41d2-b56f-4849f9aaa75a';
const BARBER_B = '30b4e154-e3f7-40e2-b3ee-2f23d432b0b0';

const apiMock = vi.hoisted(() => ({
  listPublicAgendaDisponibilidad: vi.fn(),
  listPublicAgendaHorarios: vi.fn(),
}));

vi.mock('../publicBookingApi.js', () => apiMock);

function renderAvailabilityHook(overrides = {}) {
  return renderHook(() => useBookingAvailability({
    selectedBranchId: BRANCH_A,
    activeBlockBarberId: BARBER_A,
    effectiveSelectionType: 'services',
    effectiveSelectedServiceIdsForAgenda: ['svc-1'],
    selectedPackageId: '',
    selectedDate: '2026-07-03',
    selectedTime: '09:00',
    monthRange: { from: '2026-07-01', to: '2026-07-31' },
    selectionCacheKey: 'services|svc-1',
    bookingBlocksFingerprint: 'fp',
    minBookingDateKey: '2026-07-03',
    holdResult: null,
    effectiveActiveBlockIndex: 0,
    updateBlockAtIndex: vi.fn(),
    setAvailabilityError: vi.fn(),
    notifyError: vi.fn(),
    ...overrides,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.listPublicAgendaDisponibilidad.mockReset();
  apiMock.listPublicAgendaHorarios.mockReset();
  apiMock.listPublicAgendaDisponibilidad.mockResolvedValue({
    ok: true,
    data: {
      disponibilidad: [{
        fecha: '2026-07-03',
        disponible: true,
        barberos_disponibles: 1,
        primer_horario_disponible: '09:30',
      }],
    },
  });
  apiMock.listPublicAgendaHorarios.mockResolvedValue({
    ok: true,
    data: {
      horarios: [{ hora: '09:30', disponible: true }],
      duracion_total_min: 50,
      buffer_total_min: 0,
    },
  });
});

describe('useBookingAvailability invalidacion SSE', () => {
  test('refresca solo la fecha afectada y horarios del selectedDate', async () => {
    const { result } = renderAvailabilityHook();

    await act(async () => {
      await result.current.invalidateAvailabilityScope({
        branchId: BRANCH_A,
        barberId: BARBER_A,
        dateFrom: '2026-07-03',
        dateTo: '2026-07-03',
        reason: 'hold_created',
      });
    });

    expect(apiMock.listPublicAgendaDisponibilidad).toHaveBeenCalledWith(
      expect.objectContaining({
        id_sucursal: BRANCH_A,
        id_barbero: BARBER_A,
        fecha_desde: '2026-07-03',
        fecha_hasta: '2026-07-03',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(apiMock.listPublicAgendaHorarios).toHaveBeenCalledWith(
      expect.objectContaining({ fecha: '2026-07-03' }),
      expect.any(Object)
    );
  });

  test('ignora evento de otro barbero cuando hay barbero explicito', async () => {
    const { result } = renderAvailabilityHook();

    await act(async () => {
      await result.current.invalidateAvailabilityScope({
        branchId: BRANCH_A,
        barberId: BARBER_B,
        dateFrom: '2026-07-03',
        dateTo: '2026-07-03',
        reason: 'hold_created',
      });
    });

    expect(apiMock.listPublicAgendaDisponibilidad).not.toHaveBeenCalled();
    expect(apiMock.listPublicAgendaHorarios).not.toHaveBeenCalled();
  });

  test('procesa evento de cualquier barbero en autoasignacion', async () => {
    const { result } = renderAvailabilityHook({ activeBlockBarberId: '' });

    await act(async () => {
      await result.current.invalidateAvailabilityScope({
        branchId: BRANCH_A,
        barberId: BARBER_B,
        dateFrom: '2026-07-03',
        dateTo: '2026-07-03',
        reason: 'hold_created',
      });
    });

    expect(apiMock.listPublicAgendaDisponibilidad).toHaveBeenCalledTimes(1);
  });

  test('slot perdido notifica despues de confirmar que ya no esta disponible', async () => {
    const onSelectedSlotUnavailable = vi.fn();
    apiMock.listPublicAgendaHorarios.mockResolvedValueOnce({
      ok: true,
      data: {
        horarios: [{ hora: '09:30', disponible: true }],
        duracion_total_min: 50,
        buffer_total_min: 0,
      },
    });
    const { result } = renderAvailabilityHook({ onSelectedSlotUnavailable });

    await act(async () => {
      await result.current.invalidateAvailabilityScope({
        branchId: BRANCH_A,
        barberId: BARBER_A,
        dateFrom: '2026-07-03',
        dateTo: '2026-07-03',
        startAt: '2026-07-03T15:00:00.000Z',
        endAt: '2026-07-03T15:50:00.000Z',
        reason: 'hold_created',
      });
    });

    expect(onSelectedSlotUnavailable).toHaveBeenCalledTimes(1);
  });
});
