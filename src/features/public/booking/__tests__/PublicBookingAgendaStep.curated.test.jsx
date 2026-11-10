// @vitest-environment jsdom
import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PublicBookingAgendaStep from '../PublicBookingAgendaStep.jsx';

const context = vi.hoisted(() => ({ current: null }));
vi.mock('../BookingFlowContext.jsx', () => ({ usePublicBookingFlow: () => context.current }));
const slot = hora => ({ hora, horaFin: hora, disponible: true, duracionVisibleMin: 15 });
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() }));
afterAll(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
  else delete HTMLElement.prototype.scrollIntoView;
});

beforeEach(() => {
  const service = { id_servicio: 'service', nombre_servicio: 'QA', precio_hnl: 5, duracion_min: 15 };
  const block = { id: 'titular', idBarbero: 'barber', contactFirstName: 'QA' };
  context.current = {
    activeBlock: block, activeBlockIndex: 0, activeBlockContactState: {},
    bookingBlocks: [block], bookingBlocksSummary: [],
    services: [service], selectedServices: [service], serviceIds: ['service'], packages: [],
    selectedPromotionIds: [], promotions: [], barbers: [], slots: ['08:00', '08:05', '08:15', '08:30'].map(slot),
    slotsCurated: { manana: { recommended: slot('08:30'), alternatives: ['09:30', '09:00', '10:00'].map(slot) } },
    selectedDate: '2026-10-14', selectedTime: '08:30', currentMonth: new Date(2026, 9, 1),
    availabilityMap: {}, selectedBlockTotalMinutes: 15, selectedServicesDurationSum: 15,
    fieldErrors: {}, servicesScrollRef: { current: null }, syncServicesScrollState: vi.fn(),
    isPastSlotForToday: () => false, onSelectTime: vi.fn(), titularState: {},
    slotSuggestions: [], allowCompanions: true, canAddCompanionBlock: true, maxCompanions: 2,
    addCompanionBlock: vi.fn(), setMonth: vi.fn(), onSelectDay: vi.fn(), fetchAvailability: vi.fn(),
    canGoPrevMonth: true, selectedBranchId: 'branch', maxPromotionsPerBooking: 2,
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('real agenda renders ranked options, preserves selected state and selection callback', () => {
  const { container } = render(<PublicBookingAgendaStep />);
  const buttons = [...container.querySelectorAll('.public-booking-time-block')];
  expect(buttons.map(b => b.textContent)).toEqual([
    expect.stringContaining('8:30 AM'), expect.stringContaining('9:30 AM'),
    expect.stringContaining('9:00 AM'), expect.stringContaining('10:00 AM'),
  ]);
  expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(buttons[1]);
  expect(context.current.onSelectTime).toHaveBeenCalledWith('09:30', true);
  fireEvent.click(screen.getByRole('button', { name: /Añadir acompañante/ }));
  expect(context.current.addCompanionBlock).toHaveBeenCalledTimes(1);
});

test('companion slots keep titular/overlap restrictions without re-ranking', () => {
  const flow = context.current;
  flow.activeBlockIndex = 1;
  flow.activeBlock = { id: 'companion', idBarbero: 'barber', contactFirstName: 'QA' };
  flow.bookingBlocks = [...flow.bookingBlocks, flow.activeBlock];
  flow.bookingBlocksSummary = [{ index: 0, alias: 'Titular', idBarbero: 'barber', selectedDate: flow.selectedDate, selectedTime: '08:30', duracion_bloque_min: 15 }];
  flow.slotsCurated.manana.alternatives = ['08:35', '09:30', '09:00'].map(slot);
  const { container } = render(<PublicBookingAgendaStep />);
  const buttons = [...container.querySelectorAll('.public-booking-time-block')];
  expect(buttons[0].disabled).toBe(true);
  expect(buttons[1].disabled).toBe(true);
  expect(buttons[2].disabled).toBe(false);
  fireEvent.click(buttons[0]);
  expect(flow.onSelectTime).not.toHaveBeenCalled();
  fireEvent.click(buttons[2]);
  expect(flow.onSelectTime).toHaveBeenCalledWith('09:30', true);
});

test('promotion card stays selectable without prior services when its target exists', () => {
  const flow = context.current;
  flow.selectedServices = [];
  flow.serviceIds = [];
  flow.selectPromotion = vi.fn();
  flow.promotions = [{
    id_promocion: 'promotion',
    titulo: 'Promo directa',
    aplica_a: 'servicio',
    mecanica: 'porcentaje',
    valor_descuento: 10,
    id_servicio_objetivo: 'service',
    servicio_objetivo_nombre: 'QA',
  }];

  render(<PublicBookingAgendaStep />);
  fireEvent.click(screen.getByRole('button', { name: 'Promociones' }));
  const promotionCard = screen.getByRole('button', { name: /Promo directa/ });
  expect(promotionCard.disabled).toBe(false);
  fireEvent.click(promotionCard);
  expect(flow.selectPromotion).toHaveBeenCalledWith('promotion');
});

test('unavailable promotion target disables the card without changing selection', () => {
  const flow = context.current;
  flow.selectPromotion = vi.fn();
  flow.promotions = [{
    id_promocion: 'promotion-missing',
    titulo: 'Promo no disponible',
    aplica_a: 'servicio',
    id_servicio_objetivo: 'missing',
    servicio_objetivo_nombre: 'Servicio ausente',
  }];

  render(<PublicBookingAgendaStep />);
  fireEvent.click(screen.getByRole('button', { name: 'Promociones' }));
  const promotionCard = screen.getByRole('button', { name: /Promo no disponible/ });
  expect(promotionCard.disabled).toBe(true);
  expect(promotionCard.getAttribute('title')).toContain('no está disponible');
  fireEvent.click(promotionCard);
  expect(flow.selectPromotion).not.toHaveBeenCalled();
});

test.each([
  ['light', 1280],
  ['dark', 390],
])('calendar loading uses branded spinner and blocks dates in %s mode at %ipx', (theme, width) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  context.current.availabilityLoading = true;

  const { container } = render(<PublicBookingAgendaStep />);
  expect(screen.getByText('Buscando fechas disponibles...')).toBeTruthy();
  expect(screen.getByAltText('Masterfade cargando')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mes anterior' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Mes siguiente' }).disabled).toBe(true);
  expect(container.querySelectorAll('.citas-day-btn')).toHaveLength(0);
});

test('calendar restores dates, handles month navigation and preserves retry error', () => {
  const flow = context.current;
  flow.availabilityLoading = false;
  flow.availabilityError = 'No pudimos cargar las fechas.';
  flow.availabilityMap = {
    '2026-10-14': {
      disponible: true,
      primer_horario_disponible: '08:00',
      barberos_disponibles: 1,
    },
  };

  render(<PublicBookingAgendaStep />);
  expect(screen.queryByText('Buscando fechas disponibles...')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('No pudimos cargar las fechas.');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(flow.fetchAvailability).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
  expect(flow.setMonth).toHaveBeenCalledWith(1);
  fireEvent.click(screen.getByRole('button', { name: '2026-10-14 disponible' }));
  expect(flow.onSelectDay).toHaveBeenCalledWith('2026-10-14', true);
});
