import { describe, expect, test } from 'vitest';
import { buildPeriodSlotModels } from '../utils/bookingSlotModels.js';
import { buildCuratedSlots } from '../utils/bookingDates.js';

const slot = hora => ({ hora, disponible: true });
const list = hours => hours.map(slot);
const model = (period, options = {}) => buildPeriodSlotModels({
  selectedDate: '2026-10-14',
  slots: list(['08:00', '08:05', '08:10', '08:15', '08:30', '09:00', '09:30']),
  slotsCurated: { manana: period },
  ...options,
}).manana;
const hours = result => result.visibleSlots.map(s => s.hora);
const curated = () => ({ recommended: slot('08:00'), alternatives: list(['08:30', '09:00', '09:30']), overflow: list(['10:00', '10:30']) });

describe('public agenda preserves backend curated ranking', () => {
  test('raw earlier options do not replace backend alternatives', () => {
    expect(hours(model(curated()))).toEqual(['08:00', '08:30', '09:00', '09:30']);
  });
  test('backend recommended wins even if raw starts earlier', () => {
    expect(model({ recommended: slot('08:30'), alternatives: list(['09:30', '09:00']) }).recommended.hora).toBe('08:30');
  });
  test('filtered alternative is filled from overflow before raw', () => {
    const c = curated();
    c.alternatives[1].disponible = false;
    expect(hours(model(c))).toEqual(['08:00', '08:30', '09:30', '10:00']);
  });
  test('past recommended promotes next curated alternative, preserving relative rank', () => {
    expect(hours(model(curated(), { isPastSlotForToday: (_date, hora) => hora === '08:00' }))).toEqual(['08:30', '09:00', '09:30', '10:00']);
  });
  test('missing recommended tries alternatives then overflow then raw', () => {
    expect(hours(model({ alternatives: list(['09:30']), overflow: list(['10:30', '10:00']) }))).toEqual(['09:30', '10:30', '10:00', '08:00']);
    expect(model({ overflow: list(['10:30']) }).recommended.hora).toBe('10:30');
  });
  test('legacy response without curated preserves chronological fallback', () => {
    const raw = list(['09:30', '08:15', '08:00', '08:05']);
    expect(hours(model(null, { slots: raw, slotsCurated: undefined }))).toEqual(['08:00', '08:05', '08:15', '09:30']);
    const mapped = buildCuratedSlots({ horarios: raw, duracionTotalMin: 15 });
    expect(hours(model(null, { slots: raw, slotsCurated: mapped }))).toEqual(['08:00', '08:05', '08:15', '09:30']);
  });
  test('duplicates across all pools never appear twice', () => {
    expect(hours(model({ recommended: slot('08:00'), alternatives: list(['08:00', '09:30', '09:30']), overflow: list(['09:30', '10:00']) }))).toEqual(['08:00', '09:30', '10:00', '08:05']);
  });
  test('nonchronological alternatives and overflow retain backend order without mutation', () => {
    const c = { recommended: slot('08:30'), alternatives: list(['10:30', '09:00']), overflow: list(['11:00', '10:00']) };
    const before = JSON.stringify(c);
    expect(hours(model(c))).toEqual(['08:30', '10:30', '09:00', '11:00']);
    expect(JSON.stringify(c)).toBe(before);
  });
  test('invalid and wrong-period curated slots are excluded before filling', () => {
    const result = model({ recommended: slot('12:30'), alternatives: list(['99:99', '08:30', '18:00', 'invalid']), overflow: list(['09:00']) });
    expect(hours(result)).toEqual(['08:30', '09:00', '08:00', '08:05']);
  });
  test('all three periods preserve their curated ranking through response adapter', () => {
    const raw = list(['08:00', '08:15', '12:30', '12:45', '18:00', '18:05']);
    const payload = {
      manana: { recommended: slot('08:00'), alternatives: list(['08:30', '09:00', '09:30']) },
      tarde: { recommended: slot('12:30'), alternatives: list(['13:00', '13:30', '14:00']) },
      noche: { recommended: slot('18:00'), alternatives: list(['18:30', '19:00', '19:30']) },
    };
    const result = buildPeriodSlotModels({ slots: raw, slotsCurated: buildCuratedSlots({ horariosCurados: payload, horarios: raw, duracionTotalMin: 15 }) });
    expect(hours(result.manana)).toEqual(['08:00', '08:30', '09:00', '09:30']);
    expect(hours(result.tarde)).toEqual(['12:30', '13:00', '13:30', '14:00']);
    expect(hours(result.noche)).toEqual(['18:00', '18:30', '19:00', '19:30']);
    expect(Object.values(result).every(p => p.total === p.visibleSlots.length && p.total <= 4)).toBe(true);
  });
});
