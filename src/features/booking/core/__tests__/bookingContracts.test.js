import { describe, expect, it } from 'vitest';
import {
  applyBookingSelectionChange,
  normalizeBookingActor,
  normalizeBookingAvailabilityQuery,
  normalizeBookingCreationRequest,
  normalizeBookingCreationResult,
  normalizeBookingParticipant,
  normalizeBookingSelection,
} from '../bookingModels.js';
import {
  hasParticipantScheduleConflict,
  validateBookingCreationRequest,
} from '../bookingValidators.js';
import previewBookingAdapter from '../../adapters/previewBookingAdapter.js';

describe('booking canonical contracts', () => {
  it('normalizes guest, customer and preview actors', () => {
    expect(normalizeBookingActor({ type: 'guest' })).toMatchObject({ type: 'guest', isAuthenticated: false });
    expect(normalizeBookingActor({ type: 'customer', customerId: 'c1', personId: 'p1', userId: 'u1' })).toMatchObject({
      type: 'customer',
      isAuthenticated: true,
      customerId: 'c1',
      personId: 'p1',
      userId: 'u1',
    });
    expect(normalizeBookingActor({ type: 'preview', isAuthenticated: true })).toMatchObject({
      type: 'preview',
      isAuthenticated: false,
    });
  });

  it('normalizes titular and companion participants with contact data', () => {
    expect(normalizeBookingParticipant({
      id: 'titular',
      order: 1,
      contact: { firstName: 'Ana', lastName: 'Lopez', email: 'ANA@MAIL.COM', phone: '99999999' },
      idBarbero: 'barber-1',
      serviceIds: ['svc-1'],
      selectedDate: '2026-07-10',
      selectedTime: '10:00',
    }, 0)).toMatchObject({
      id: 'titular',
      role: 'titular',
      alias: 'Ana Lopez',
      barberId: 'barber-1',
      contact: { email: 'ana@mail.com' },
    });

    expect(normalizeBookingParticipant({
      order: 2,
      alias: 'Hermano',
      id_barbero: 'barber-2',
      selectedServiceIdsEffective: ['svc-2'],
    }, 1)).toMatchObject({
      order: 2,
      role: 'acompanante',
      alias: 'Hermano',
      barberId: 'barber-2',
    });
  });

  it('normalizes services, package and mixed selections', () => {
    expect(normalizeBookingSelection({ serviceIds: ['svc-1'] })).toMatchObject({
      selectionType: 'services',
      packageId: null,
      serviceIds: ['svc-1'],
      isComplete: true,
    });
    expect(normalizeBookingSelection({ packageId: 'pkg-1' })).toMatchObject({
      selectionType: 'package',
      packageId: 'pkg-1',
      serviceIds: [],
      isComplete: true,
    });
    expect(normalizeBookingSelection({ packageId: 'pkg-1', serviceIds: ['svc-extra'] })).toMatchObject({
      selectionType: 'mixed',
      packageId: 'pkg-1',
      serviceIds: ['svc-extra'],
    });
  });

  it('deduplicates services and removes services included in the package', () => {
    const selection = normalizeBookingSelection({
      packageId: 'pkg-1',
      serviceIds: ['svc-1', 'svc-1', 'svc-2'],
      selectedPackage: { id_paquete: 'pkg-1', items: [{ id_servicio: 'svc-2' }] },
    });
    expect(selection.selectionType).toBe('mixed');
    expect(selection.serviceIds).toEqual(['svc-1']);
    expect(selection.includedServiceIds).toEqual(['svc-2']);
  });

  it('detects incomplete selections, dates and times through validation', () => {
    const request = normalizeBookingCreationRequest({
      actor: { type: 'guest' },
      branchId: '',
      participants: [{ serviceIds: [], selectedDate: '', selectedTime: '' }],
    });
    const validation = validateBookingCreationRequest(request);
    expect(validation.ok).toBe(false);
    expect(validation.errors.map((error) => error.code)).toContain('BOOKING_BRANCH_REQUIRED');
    expect(validation.errors.map((error) => error.code)).toContain('BOOKING_TIME_REQUIRED');
  });

  it('normalizes availability queries independently of HTTP params', () => {
    expect(normalizeBookingAvailabilityQuery({
      id_sucursal: 'branch',
      id_barbero: 'barber',
      selection_type: 'services',
      servicios: ['svc-1', 'svc-1'],
      fecha_desde: '2026-07-01',
      fecha_hasta: '2026-07-31',
      fecha: '2026-07-10',
    })).toMatchObject({
      branchId: 'branch',
      barberId: 'barber',
      serviceIds: ['svc-1'],
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      date: '2026-07-10',
    });
  });

  it('normalizes creation result totals and blocks', () => {
    expect(normalizeBookingCreationResult({
      request_id: 'request-1',
      id_grupo_cita: 'group-1',
      estado_grupo_codigo: 'activo',
      expires_at: '2026-07-10T10:05:00.000Z',
      monto_total_hnl: '200.125',
      descuento_total_hnl: '25',
      total_pagar_hnl: '175',
      bloques: [{ id_cita: 'cita-1' }],
    })).toMatchObject({
      requestId: 'request-1',
      groupId: 'group-1',
      subtotalHnl: 200.13,
      discountTotalHnl: 25,
      totalPayableHnl: 175,
      extrasPayableHnl: 175,
      blocks: [{ id_cita: 'cita-1' }],
    });
  });

  it('detects same barber and same time conflict', () => {
    const participants = [
      normalizeBookingParticipant({ idBarbero: 'barber-1', selectedDate: '2026-07-10', selectedTime: '10:00', serviceIds: ['svc-1'] }, 0),
      normalizeBookingParticipant({ idBarbero: 'barber-1', selectedDate: '2026-07-10', selectedTime: '10:00', serviceIds: ['svc-2'] }, 1),
    ];
    expect(hasParticipantScheduleConflict(participants)).toBe(true);
  });

  it('normalizes one, two and four companions without losing order', () => {
    const request = normalizeBookingCreationRequest({
      actor: { type: 'preview' },
      branchId: 'branch-1',
      participants: Array.from({ length: 5 }, (_, index) => ({
        id: `p-${index + 1}`,
        order: index + 1,
        idBarbero: `barber-${index + 1}`,
        serviceIds: ['svc-1'],
        selectedDate: '2026-07-10',
        selectedTime: `1${index}:00`,
      })),
    });
    expect(request.participants).toHaveLength(5);
    expect(request.participants[0].role).toBe('titular');
    expect(request.participants.slice(1).every((participant) => participant.role === 'acompanante')).toBe(true);
    expect(request.participants.map((participant) => participant.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves date and clears time only when a selection change invalidates availability', () => {
    const base = normalizeBookingParticipant({
      id: 'p-1',
      idBarbero: 'barber-1',
      serviceIds: ['svc-1'],
      selectedDate: '2026-07-10',
      selectedTime: '10:00',
    }, 0);
    expect(applyBookingSelectionChange(base, {
      serviceIds: ['svc-1', 'svc-2'],
      availabilityStillValid: true,
    })).toMatchObject({
      selectedDate: '2026-07-10',
      selectedTime: '10:00',
      serviceIds: ['svc-1', 'svc-2'],
    });
    expect(applyBookingSelectionChange(base, {
      packageId: 'pkg-1',
      serviceIds: [],
      availabilityStillValid: false,
    })).toMatchObject({
      selectedDate: '2026-07-10',
      selectedTime: '',
      selectionType: 'package',
    });
  });

  it('preview adapter never writes to backend and returns a simulated result', async () => {
    expect(previewBookingAdapter.writesBackend).toBe(false);
    const result = await previewBookingAdapter.createHold({ totalHnl: 300, blocks: [{ orden_integrante: 1 }] });
    expect(result.groupStatus).toBe('simulado');
    expect(result.totalPayableHnl).toBe(300);
  });
});
