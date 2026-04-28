import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronDown, Clock3, Plus, Scissors, UserRound, Package, Tag, X } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { DayButton, ServiceCard, SlotButton } from './PublicBookingBlocks.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import {
  WEEK_DAYS,
  buildCalendarCells,
  formatCurrencyHnl,
  formatDurationHuman,
  formatFriendlyDate,
  formatMonth,
  formatTime12Hour,
} from './bookingUtils.js';

const LANDING_EASE = [0.25, 0.46, 0.45, 0.94];
const SLOT_TIME_PERIODS = [
  { key: 'manana', label: 'Mañana' },
  { key: 'tarde', label: 'Tarde' },
  { key: 'noche', label: 'Noche' },
];

function getSlotPeriodKey(timeKey) {
  const normalized = String(timeKey || '').trim();
  const match = normalized.match(/^(\d{2}):(\d{2})/);
  if (!match) return 'noche';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'noche';
  const totalMinutes = (hour * 60) + minute;
  if (totalMinutes >= 6 * 60 && totalMinutes < 12 * 60) return 'manana';
  if (totalMinutes >= 12 * 60 && totalMinutes < 18 * 60) return 'tarde';
  return 'noche';
}

function toMinutes(timeKey) {
  const match = String(timeKey || '').trim().match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}

function overlapByMinutes(leftStart, leftDuration, rightStart, rightDuration) {
  const leftMinutes = toMinutes(leftStart);
  const rightMinutes = toMinutes(rightStart);
  const leftDur = Number(leftDuration || 0);
  const rightDur = Number(rightDuration || 0);
  if (leftMinutes == null || rightMinutes == null || leftDur <= 0 || rightDur <= 0) return false;
  return leftMinutes < (rightMinutes + rightDur) && rightMinutes < (leftMinutes + leftDur);
}

function normalizePromotionDateKey(value) {
  // JK: Lee fechas tipo YYYY-MM-DD o ISO sin depender de conversiones por timezone.
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatPromotionDate(value) {
  const dateKey = normalizePromotionDateKey(value);
  if (!dateKey) return '';
  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

function formatPromotionVigencyLabel(promotion) {
  // JK: Resume vigencia en formato visual legible para cards de promociones en agendamiento.
  const fromDate = formatPromotionDate(promotion?.vigencia_desde);
  const toDate = formatPromotionDate(promotion?.vigencia_hasta);
  const fromHour = formatTime12Hour(promotion?.vigencia_hora_desde || '');
  const toHour = formatTime12Hour(promotion?.vigencia_hora_hasta || '');

  const dateLabel = fromDate && toDate
    ? `${fromDate} - ${toDate}`
    : fromDate
      ? `Desde ${fromDate}`
      : toDate
        ? `Hasta ${toDate}`
        : '';

  const hourLabel = fromHour && toHour
    ? `${fromHour} - ${toHour}`
    : fromHour
      ? `Desde ${fromHour}`
      : toHour
        ? `Hasta ${toHour}`
        : '';

  if (dateLabel && hourLabel) return `${dateLabel} · ${hourLabel}`;
  return dateLabel || hourLabel;
}

function formatPromotionBenefitLabel(promotion) {
  // JK: Estandariza etiqueta corta de beneficio para distinguir porcentaje, monto fijo y 2x1.
  const mechanic = String(promotion?.mecanica || '').trim().toLowerCase();
  const value = Number(promotion?.valor_descuento);
  if (mechanic === 'porcentaje' && Number.isFinite(value) && value > 0) {
    const normalized = value % 1 === 0 ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
    return `${normalized}% OFF`;
  }
  if (mechanic === 'monto_fijo' && Number.isFinite(value) && value > 0) {
    const normalized = value % 1 === 0 ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
    return `L ${normalized} OFF`;
  }
  if (mechanic === 'dos_por_uno') {
    return '2x1';
  }
  return 'PROMO';
}

function resolvePromotionTargetLabel(promotion) {
  const appliesTo = String(promotion?.aplica_a || '').trim().toLowerCase();
  if (appliesTo === 'paquete') {
    return String(promotion?.paquete_objetivo_nombre || 'paquete objetivo').trim();
  }
  return String(promotion?.servicio_objetivo_nombre || 'servicio objetivo').trim();
}

function BookingBlocksSummary({
  bookingBlocksSummary,
  totalToPay,
  totalEstimatedPromotionDiscountHnl,
  totalEstimatedToPay,
}) {
  const completedBlocks = bookingBlocksSummary.filter((block) => block.isComplete);
  const hasAnyPromotionSelected = bookingBlocksSummary.some((block) => Boolean(block.selectedPromotion));
  const hasAnyPendingTwoByOne = bookingBlocksSummary.some(
    (block) => Boolean(block.selectedPromotion) && Boolean(block.promocion_requiere_calculo_final)
  );
  const safeEstimatedDiscount = Math.max(0, Number(totalEstimatedPromotionDiscountHnl || 0));

  return (
    <div className="citas-surface p-4 public-booking-group-summary">
      <h3 className="citas-side-title">Resumen de citas</h3>

      {completedBlocks.length === 0 ? (
        <p className="citas-selected-date mt-2">
          Aún no hay bloques completos. Selecciona servicio, fecha y hora para titular o acompañantes.
        </p>
      ) : (
        <div className="public-booking-summary-grid mt-3">
          {completedBlocks.map((block) => (
            <article key={block.id} className="public-booking-summary-card">
              <header className="public-booking-summary-head">
                <span className="public-booking-summary-alias">{block.alias}</span>
                <span className="public-booking-summary-total">{formatCurrencyHnl(block.total_hnl)}</span>
              </header>
              <div className="citas-selected-date">{block.barbero?.nombre_completo || 'Sin barbero'}</div>
              <div className="citas-selected-date">
                {block.selection_type === 'package'
                  ? `Paquete: ${block.selectedPackage?.nombre_paquete || 'Sin paquete'}`
                  : block.selectedServices.map((service) => service.nombre_servicio).join(', ')}
              </div>
              <div className="citas-selected-date">
                {formatFriendlyDate(block.selectedDate)} - {formatTime12Hour(block.selectedTime)}
              </div>
              {block.selectedPromotion ? (
                <div className="citas-selected-date">
                  Promoción seleccionada: {block.selectedPromotion.titulo || 'Promoción seleccionada'}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <div className="citas-services-summary-row mt-3">
        {hasAnyPromotionSelected ? (
          <div className="public-booking-promo-summary">
            {/* // JK: Presentación de resumen en filas etiqueta/valor para mejorar legibilidad visual. */}
            <div className="public-booking-promo-summary-row">
              <span className="public-booking-promo-summary-label">Subtotal servicios:</span>
              <strong className="public-booking-promo-summary-value">{formatCurrencyHnl(totalToPay)}</strong>
            </div>
            {hasAnyPendingTwoByOne && safeEstimatedDiscount <= 0 ? (
              <div className="public-booking-promo-summary-row">
                <span className="public-booking-promo-summary-label">Descuento estimado:</span>
                <strong className="public-booking-promo-summary-value">Aplicación final pendiente en pago.</strong>
              </div>
            ) : (
              <div className="public-booking-promo-summary-row">
                <span className="public-booking-promo-summary-label">Descuento estimado:</span>
                <strong className="public-booking-promo-summary-value">-{formatCurrencyHnl(safeEstimatedDiscount)}</strong>
              </div>
            )}
            <div className="public-booking-promo-summary-row public-booking-promo-summary-row-total">
              <span className="public-booking-promo-summary-label">Total estimado:</span>
              <strong className="public-booking-promo-summary-value">{formatCurrencyHnl(totalEstimatedToPay)}</strong>
            </div>
            <small>El descuento será aplicado y confirmado en el pago final.</small>
            {hasAnyPendingTwoByOne ? (
              <small>Hay promociones 2x1 pendientes de confirmación final en pago.</small>
            ) : null}
          </div>
        ) : (
          <span>Total servicios: {formatCurrencyHnl(totalToPay)}</span>
        )}
      </div>
    </div>
  );
}

export default function PublicBookingAgendaStep() {
  const {
    activeBlock,
    activeBlockIndex,
    addCompanionBlock,
    consumePendingCompanionFocus,
    allBlocksComplete,
    allowCompanions,
    availabilityError,
    availabilityLoading,
    availabilityMap,
    barbers,
    bookingBlocks,
    bookingBlocksSummary,
    removeCompanionBlock,
    canAddCompanionBlock,
    canGoPrevMonth,
    fetchAvailability,
    fieldErrors,
    goToConfirm,
    isPastSlotForToday,
    minBookingDateKey,
    onSelectDay,
    onSelectTime,
    promotions,
    promotionsLoading,
    clearSelectedPromotion,
    selectSuggestedBarber,
    selectPromotion,
    selectedDate,
    selectedPackage,
    selectedPackageId,
    selectedPromotion,
    selectedPromotionId,
    selectedBranchId,
    selectPackage,
    selectedServicesDurationSum,
    selectedBlockTotalMinutes,
    selectedServices,
    titularSelectedDate,
    selectedTime,
    serviceIds,
    services,
    packages,
    packagesLoading,
    pendingCompanionFocusId,
    servicesAtEnd,
    servicesCanScroll,
    servicesLoading,
    servicesScrollRef,
    setActiveBlock,
    setMonth,
    slotConflict,
    slotSuggestions,
    slotSuggestionsLoading,
    slots,
    slotsLoading,
    syncServicesScrollState,
    toggleService,
    totalEstimatedPromotionDiscountHnl,
    totalEstimatedToPay,
    totalToPay,
    updateActiveBlockBarber,
    updateActiveBlockContact,
    currentMonth,
    selectedBarber,
  } = usePublicBookingFlow();

  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);
  const canGoToConfirm = Boolean(allBlocksComplete);
  const selectedServicesCount = selectedServices.length + (selectedPackage ? 1 : 0);
  const hasSelectedDate = Boolean(selectedDate);
  const slotsSectionRef = useRef(null);
  const contactCardRef = useRef(null);
  const contactNameInputRef = useRef(null);
  const activeContactName = String(activeBlock?.contactName || '');
  const activeContactEmail = String(activeBlock?.contactEmail || '');
  const activeContactPhone = String(activeBlock?.contactPhone || '');
  const fieldErrorKey = (blockIndex, field) => `${blockIndex}:${field}`;
  const activeNameError = fieldErrors?.[fieldErrorKey(activeBlockIndex, 'contactName')] || '';
  const activeEmailError = fieldErrors?.[fieldErrorKey(activeBlockIndex, 'contactEmail')] || '';
  const activePhoneError = fieldErrors?.[fieldErrorKey(activeBlockIndex, 'contactPhone')] || '';
  const contactNameRequiredMessage = activeBlockIndex === 0
    ? 'Ingresa el nombre del titular para continuar con la selección de servicios.'
    : 'Ingresa el nombre del acompañante antes de elegir servicios.';
  const canSelectServices = Boolean(activeContactName.trim());
  const [catalogTab, setCatalogTab] = useState('services');
  const activeBlockSummary = useMemo(
    () => bookingBlocksSummary.find((block) => block.index === activeBlockIndex) || null,
    [activeBlockIndex, bookingBlocksSummary]
  );
  const selectedServiceIdsSet = useMemo(
    () => new Set(serviceIds),
    [serviceIds]
  );
  const promotionsForCards = useMemo(() => {
    // JK: Calcula estado visual/seleccionable de cada promo sin alterar la lógica de guardado del flujo.
    const list = Array.isArray(promotions) ? promotions : [];
    return list.map((promotion) => {
      const promotionId = String(promotion?.id_promocion || '').trim();
      const appliesTo = String(promotion?.aplica_a || '').trim().toLowerCase();
      const targetServiceId = String(promotion?.id_servicio_objetivo || '').trim();
      const targetPackageId = String(promotion?.id_paquete_objetivo || '').trim();
      const targetLabel = resolvePromotionTargetLabel(promotion);
      const targetSelected = appliesTo === 'paquete'
        ? Boolean(targetPackageId && selectedPackageId && selectedPackageId === targetPackageId)
        : Boolean(targetServiceId && selectedServiceIdsSet.has(targetServiceId));
      const benefitLabel = formatPromotionBenefitLabel(promotion);
      const vigencyLabel = formatPromotionVigencyLabel(promotion);
      const disabledByBranch = !selectedBranchId;
      const disabledByContact = !canSelectServices;
      const canSelect = !disabledByBranch && !disabledByContact && targetSelected;
      let disabledReason = '';
      if (disabledByBranch) {
        disabledReason = 'Selecciona una sucursal para ver promociones aplicables.';
      } else if (disabledByContact) {
        disabledReason = contactNameRequiredMessage;
      } else if (!targetSelected) {
        disabledReason = `Requiere seleccionar ${targetLabel}`;
      }

      return {
        ...promotion,
        promotionId,
        benefitLabel,
        targetLabel,
        vigencyLabel,
        canSelect,
        disabledReason,
        isSelected: selectedPromotionId === promotionId,
      };
    });
  }, [
    canSelectServices,
    contactNameRequiredMessage,
    promotions,
    selectedBranchId,
    selectedPackageId,
    selectedPromotionId,
    selectedServiceIdsSet,
  ]);
  const activeBlockEstimatedDiscount = Math.max(
    0,
    Number(activeBlockSummary?.promocion_descuento_estimado_hnl || 0)
  );
  const activeBlockNeedsFinalCalculation = Boolean(activeBlockSummary?.promocion_requiere_calculo_final);
  const safeEstimatedDiscountGlobal = Math.max(0, Number(totalEstimatedPromotionDiscountHnl || 0));
  const visibleEstimatedDiscount = Math.max(activeBlockEstimatedDiscount, safeEstimatedDiscountGlobal);
  const [preferredSlotPeriod, setPreferredSlotPeriod] = useState('manana');
  const availableSlotsByPeriod = useMemo(() => {
    const grouped = {
      manana: [],
      tarde: [],
      noche: [],
    };
    (Array.isArray(slots) ? slots : []).forEach((slot) => {
      if (!slot?.disponible) return;
      if (selectedDate && isPastSlotForToday(selectedDate, slot?.hora)) return;
      const key = getSlotPeriodKey(slot?.hora);
      grouped[key].push(slot);
    });
    return grouped;
  }, [isPastSlotForToday, selectedDate, slots]);
  const totalAvailableSlots = useMemo(
    () => SLOT_TIME_PERIODS.reduce((total, period) => total + (availableSlotsByPeriod[period.key] || []).length, 0),
    [availableSlotsByPeriod]
  );
  const activeSlotPeriod = useMemo(() => {
    if ((availableSlotsByPeriod[preferredSlotPeriod] || []).length > 0) return preferredSlotPeriod;
    const firstWithAvailable = SLOT_TIME_PERIODS.find((period) => (availableSlotsByPeriod[period.key] || []).length > 0);
    return firstWithAvailable ? firstWithAvailable.key : 'manana';
  }, [availableSlotsByPeriod, preferredSlotPeriod]);
  const currentPeriodSlots = availableSlotsByPeriod[activeSlotPeriod] || [];
  const titularBlock = bookingBlocksSummary[0] || null;
  const getSlotRestriction = useMemo(() => {
    return (slot) => {
      if (!slot?.hora) return { disabled: true, variant: 'muted', reason: 'Horario inválido' };
      if (activeBlockIndex <= 0) return { disabled: false, variant: 'default', reason: '' };
      if (!selectedDate || !activeBlock?.idBarbero) {
        return { disabled: true, variant: 'muted', reason: 'Selecciona barbero y fecha heredada' };
      }

      if (
        titularBlock
        && titularBlock.selectedDate === selectedDate
        && titularBlock.idBarbero === activeBlock.idBarbero
        && titularBlock.selectedTime === slot.hora
      ) {
        return { disabled: true, variant: 'danger', reason: 'Hora del titular (mismo barbero)' };
      }

      const conflictingBlock = bookingBlocksSummary.find((block) =>
        block.index !== activeBlockIndex
        && block.idBarbero === activeBlock.idBarbero
        && block.selectedDate === selectedDate
        && overlapByMinutes(slot.hora, selectedBlockTotalMinutes, block.selectedTime, block.duracion_bloque_min)
      );
      if (conflictingBlock) {
        return {
          disabled: true,
          variant: 'muted',
          reason: `Solapa con ${conflictingBlock.alias || `integrante ${conflictingBlock.index + 1}`}`,
        };
      }
      return { disabled: false, variant: 'default', reason: '' };
    };
  }, [activeBlock, activeBlockIndex, bookingBlocksSummary, selectedBlockTotalMinutes, selectedDate, titularBlock]);

  useEffect(() => {
    syncServicesScrollState();
    const scroller = servicesScrollRef.current;
    if (!scroller) return undefined;
    const onScroll = () => syncServicesScrollState();
    scroller.addEventListener('scroll', onScroll);
    window.addEventListener('resize', syncServicesScrollState);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', syncServicesScrollState);
    };
  }, [bookingBlocks.length, services.length, servicesScrollRef, syncServicesScrollState]);

  useEffect(() => {
    if (!selectedDate || !slotsSectionRef.current) return;
    slotsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedDate]);

  useEffect(() => {
    if (!pendingCompanionFocusId) return;
    if (activeBlockIndex <= 0) return;
    if (!activeBlock?.id || activeBlock.id !== pendingCompanionFocusId) return;

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      contactCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      contactNameInputRef.current?.focus({ preventScroll: true });
      consumePendingCompanionFocus(pendingCompanionFocusId);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    activeBlock?.id,
    activeBlockIndex,
    consumePendingCompanionFocus,
    pendingCompanionFocusId,
  ]);

  if ((servicesLoading || packagesLoading) && services.length === 0 && packages.length === 0) {
    return (
      <div className="citas-surface p-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (services.length === 0 && packages.length === 0) {
    return (
      <EmptyState
        icon={Scissors}
        title="Sin servicios ni paquetes disponibles"
        description={selectedBarber
          ? `No hay opciones agendables configuradas para ${selectedBarber.nombre_completo}.`
          : 'No hay opciones agendables activas para esta sucursal.'}
      />
    );
  }

  return (
    <>
      {availabilityError ? <ErrorBanner message={availabilityError} onRetry={fetchAvailability} /> : null}

      <div className="citas-agenda-layout public-booking-agenda-stack">
        <motion.div
          className="citas-surface p-4 citas-services-step public-booking-services-surface"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: LANDING_EASE }}
        >
          <div className="public-booking-services-head">
            <h3 className="citas-side-title">Servicios</h3>
            {selectedServicesCount > 0 ? (
              <span className="public-booking-services-count" aria-label={`Servicios seleccionados: ${selectedServicesCount}`}>
                {selectedServicesCount}
              </span>
            ) : null}
          </div>

          <div className="public-booking-block-stepper mt-2">
            <div className="citas-stepper">
              {bookingBlocks.map((block, index) => (
                <div key={block.id} className={`public-booking-step-chip ${index === activeBlockIndex ? 'is-active' : ''}`.trim()}>
                  <button
                    type="button"
                    className={`citas-step-btn ${index === activeBlockIndex ? 'is-active' : ''}`.trim()}
                    onClick={() => setActiveBlock(index)}
                  >
                    {block.alias}
                  </button>
                  {index > 0 ? (
                    <button
                      type="button"
                      className="public-booking-step-remove"
                      aria-label={`Eliminar ${block.alias}`}
                      onClick={() => removeCompanionBlock(block.id)}
                    >
                      <X size={13} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="public-booking-active-block-row">
            <div className="public-booking-active-block-label">
              <UserRound size={14} />
              <span>Configurando: {activeBlock?.alias || 'Titular'}</span>
            </div>
            <select
              className="citas-inline-select public-booking-active-barber-select"
              value={activeBlock?.idBarbero || ''}
              onChange={(event) => updateActiveBlockBarber(event.target.value)}
            >
              {activeBlockIndex > 0 ? (
                <option value="">Sin preferencia (asignación automática)</option>
              ) : null}
              {barbers.map((barber) => (
                <option key={barber.id_empleado} value={barber.id_empleado}>
                  {barber.nombre_completo}
                </option>
              ))}
            </select>
          </div>

          <div className="public-booking-contact-card" ref={contactCardRef}>
            <div className="public-booking-form-grid">
              <div className="public-booking-form-row">
                <label className="mf-label" htmlFor="booking-contact-name">
                  {activeBlockIndex === 0 ? 'Nombre del titular *' : 'Nombre del acompañante *'}
                </label>
                <input
                  id="booking-contact-name"
                  ref={contactNameInputRef}
                  type="text"
                  className={`mf-input ${activeNameError ? 'is-invalid' : ''}`.trim()}
                  value={activeContactName}
                  onChange={(event) => updateActiveBlockContact({ contactName: event.target.value })}
                  placeholder={activeBlockIndex === 0 ? 'Ej. Carlos Ramírez' : 'Ej. José López'}
                />
                {activeNameError ? <p className="public-booking-field-error">{activeNameError}</p> : null}
                {activeBlockIndex > 0 ? (
                  <p className="citas-selected-date">
                    Este nombre se usa para llamarle correctamente en la barbería y evitar confusiones.
                  </p>
                ) : null}
              </div>
              <div className="public-booking-form-row">
                <label className="mf-label" htmlFor="booking-contact-email">
                  {activeBlockIndex === 0 ? 'Correo del titular *' : 'Correo del acompañante *'}
                </label>
                <input
                  id="booking-contact-email"
                  type="email"
                  className={`mf-input ${activeEmailError ? 'is-invalid' : ''}`.trim()}
                  value={activeContactEmail}
                  onChange={(event) => updateActiveBlockContact({ contactEmail: event.target.value })}
                  placeholder={activeBlockIndex === 0 ? 'titular@correo.com' : 'acompanante@correo.com'}
                />
                {activeEmailError ? <p className="public-booking-field-error">{activeEmailError}</p> : null}
                {activeBlockIndex === 0 && !activeEmailError ? (
                  <p className="citas-selected-date">
                    Si este correo ya está registrado, el sistema te pedirá iniciar sesión para continuar.
                  </p>
                ) : null}
                {activeBlockIndex > 0 ? (
                  <p className="citas-selected-date">
                    Enviaremos la confirmación y detalles de cita a este correo.
                  </p>
                ) : null}
              </div>
            </div>
            {activeBlockIndex === 0 ? (
              <div className="public-booking-form-row mt-2">
                <label className="mf-label" htmlFor="booking-contact-phone">
                  Teléfono del titular *
                </label>
                <input
                  id="booking-contact-phone"
                  type="tel"
                  className={`mf-input ${activePhoneError ? 'is-invalid' : ''}`.trim()}
                  value={activeContactPhone}
                  onChange={(event) => updateActiveBlockContact({ contactPhone: event.target.value })}
                  placeholder="Ej. +504 9999-9999"
                />
                {activePhoneError ? <p className="public-booking-field-error">{activePhoneError}</p> : null}
                <p className="citas-selected-date">
                  Lo usaremos para validación y avisos importantes de la reserva.
                </p>
              </div>
            ) : null}
          </div>

          {!canSelectServices ? (
            <p className="citas-selected-date">{contactNameRequiredMessage}</p>
          ) : null}

          <div className="public-booking-selection-tabs">
            <Button
              type="button"
              variant={catalogTab === 'services' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCatalogTab('services')}
            >
              Servicios
            </Button>
            <Button
              type="button"
              variant={catalogTab === 'packages' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCatalogTab('packages')}
            >
              Paquetes
            </Button>
            <Button
              type="button"
              variant={catalogTab === 'promotions' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCatalogTab('promotions')}
            >
              Promociones
            </Button>
          </div>

          <div className="citas-services-scroll scrollbar-hide" ref={servicesScrollRef}>
            {catalogTab === 'services' ? (
              <div className="citas-services-grid">
                {services.map((service) => (
                  <ServiceCard
                    key={service.id_servicio}
                    service={service}
                    isSelected={serviceIds.includes(service.id_servicio)}
                    disabled={!canSelectServices}
                    onToggle={() => toggleService(service.id_servicio)}
                  />
                ))}
              </div>
            ) : null}
            {catalogTab === 'packages' ? (
              <div className="citas-services-grid">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id_paquete}
                    type="button"
                    className={`citas-service-card ${selectedPackageId === pkg.id_paquete ? 'is-selected' : ''}`}
                    disabled={!canSelectServices}
                    onClick={() => selectPackage(pkg.id_paquete)}
                  >
                    <div className="citas-service-name">{pkg.nombre_paquete || 'Paquete'}</div>
                    <div className="citas-service-meta">
                      <Package size={14} />
                      <span>{Array.isArray(pkg.items) ? `${pkg.items.length} servicios` : 'Paquete'}</span>
                    </div>
                    <div className="citas-service-meta">
                      <span>{formatCurrencyHnl(pkg?.precio_hnl || 0)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
            {catalogTab === 'promotions' ? (
              promotionsLoading && promotionsForCards.length === 0 ? (
                <LoadingSpinner />
              ) : (
                <div className="citas-services-grid public-booking-promotions-grid">
                  {promotionsForCards.map((promotion) => (
                    <button
                      key={promotion.promotionId}
                      type="button"
                      className={`citas-service-card public-booking-promo-card ${promotion.isSelected ? 'is-selected' : ''} ${promotion.canSelect ? '' : 'is-disabled'}`.trim()}
                      disabled={!promotion.canSelect}
                      aria-pressed={promotion.isSelected}
                      title={!promotion.canSelect ? promotion.disabledReason : undefined}
                      onClick={() => selectPromotion(promotion.promotionId)}
                    >
                      <div className="public-booking-promo-head">
                        <span className="public-booking-promo-badge">
                          <Tag size={12} />
                          PROMO
                        </span>
                        <span className="public-booking-promo-benefit">{promotion.benefitLabel}</span>
                      </div>
                      <div className="citas-service-name">{promotion.titulo || 'Promoción'}</div>
                      {promotion.subtitulo ? (
                        <p className="public-booking-promo-subtitle">{promotion.subtitulo}</p>
                      ) : null}
                      <p className="public-booking-promo-target">Aplica a: {promotion.targetLabel}</p>
                      {promotion.vigencyLabel ? (
                        <p className="public-booking-promo-vigency">Vigencia: {promotion.vigencyLabel}</p>
                      ) : null}
                      {!promotion.canSelect ? (
                        <p className="public-booking-promo-requirement">{promotion.disabledReason}</p>
                      ) : null}
                      {promotion.isSelected ? (
                        <p className="public-booking-promo-selected">Promoción seleccionada</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              )
            ) : null}
            {catalogTab === 'packages' && packages.length === 0 ? (
              <p className="citas-selected-date mt-2">No hay paquetes disponibles para esta sucursal.</p>
            ) : null}
            {catalogTab === 'promotions' && !promotionsLoading && promotionsForCards.length === 0 ? (
              <p className="citas-selected-date mt-2">No hay promociones disponibles para esta sucursal.</p>
            ) : null}
            {catalogTab === 'promotions' && selectedPromotion ? (
              <div className="public-booking-actions is-inline mt-2">
                <p className="citas-selected-date">Promoción seleccionada: {selectedPromotion.titulo || 'Promoción seleccionada'}</p>
                <Button type="button" variant="outline" size="sm" onClick={clearSelectedPromotion}>
                  Quitar promoción
                </Button>
              </div>
            ) : null}
          </div>

          {servicesCanScroll && !servicesAtEnd ? (
            <button
              type="button"
              className="citas-services-scroll-hint"
              onClick={() => {
                const scroller = servicesScrollRef.current;
                if (!scroller) return;
                scroller.scrollBy({ top: 170, behavior: 'smooth' });
              }}
              aria-label="Ver mas servicios"
            >
              <ChevronDown size={16} />
            </button>
          ) : null}

          <div className="citas-services-summary-row mt-3">
            {selectedPromotion ? (
              <div className="public-booking-promo-summary">
                {/* // JK: Resumen principal con jerarquía visual consistente para promociones seleccionadas. */}
                <div className="public-booking-promo-summary-row">
                  <span className="public-booking-promo-summary-label">Subtotal servicios:</span>
                  <strong className="public-booking-promo-summary-value">{formatCurrencyHnl(totalToPay)}</strong>
                </div>
                <div className="public-booking-promo-summary-row">
                  <span className="public-booking-promo-summary-label">Promoción seleccionada:</span>
                  <strong className="public-booking-promo-summary-value">{selectedPromotion.titulo || 'Promoción'}</strong>
                </div>
                {activeBlockNeedsFinalCalculation ? (
                  <div className="public-booking-promo-summary-row">
                    <span className="public-booking-promo-summary-label">Descuento estimado:</span>
                    <strong className="public-booking-promo-summary-value">Aplicación final pendiente en pago.</strong>
                  </div>
                ) : (
                  <div className="public-booking-promo-summary-row">
                    <span className="public-booking-promo-summary-label">Descuento estimado:</span>
                    <strong className="public-booking-promo-summary-value">-{formatCurrencyHnl(visibleEstimatedDiscount)}</strong>
                  </div>
                )}
                <div className="public-booking-promo-summary-row public-booking-promo-summary-row-total">
                  <span className="public-booking-promo-summary-label">Total estimado:</span>
                  <strong className="public-booking-promo-summary-value">{formatCurrencyHnl(totalEstimatedToPay)}</strong>
                </div>
                <small>El descuento será aplicado y confirmado en el pago final.</small>
              </div>
            ) : (
              <span>Total servicios: {formatCurrencyHnl(totalToPay)}</span>
            )}
          </div>
        </motion.div>

        <motion.div
          className="citas-surface public-booking-calendar-surface"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: LANDING_EASE }}
        >
          <div className="citas-calendar-head public-booking-calendar-head">
            <h3 className="citas-side-title">Fechas Disponibles</h3>
            {availabilityLoading ? (
              <span className="public-booking-calendar-refresh" aria-live="polite">
                Actualizando disponibilidad...
              </span>
            ) : null}
          </div>

          {activeBlockIndex === 0 ? (
            <>
              <div className="citas-calendar-head" style={{ paddingTop: '0' }}>
                <button
                  type="button"
                  className="citas-nav-round"
                  onClick={() => setMonth(-1)}
                  aria-label="Mes anterior"
                  disabled={!canGoPrevMonth}
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="citas-calendar-month">{formatMonth(currentMonth)}</div>
                <button type="button" className="citas-nav-round" onClick={() => setMonth(1)} aria-label="Mes siguiente">
                  <ArrowRight size={16} />
                </button>
              </div>

              <div className="citas-calendar-grid">
                <div className="citas-weekdays">
                  {WEEK_DAYS.map((day) => (
                    <div key={day} className="citas-weekday">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="citas-days">
                  {calendarCells.map((cell) => (
                    <DayButton
                      key={cell.key}
                      cell={cell}
                      dayInfo={availabilityMap[cell.key]}
                      minDateKey={minBookingDateKey}
                      selectedDate={selectedDate}
                      onSelect={(dateKey, enabled) => onSelectDay(dateKey, enabled)}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="public-booking-inherited-date-banner">
              {titularSelectedDate
                ? `Este acompañante usará la fecha del titular: ${formatFriendlyDate(titularSelectedDate)}.`
                : 'Selecciona primero la fecha del titular para habilitar los horarios del acompañante.'}
            </div>
          )}
        </motion.div>

        <AnimatePresence initial={false}>
          {hasSelectedDate ? (
            <motion.div
              ref={slotsSectionRef}
              key={`${activeBlock?.id || 'block'}-${selectedDate}`}
              className="citas-surface public-booking-slots-surface"
              initial={{ opacity: 0, y: 20, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.985 }}
              transition={{ duration: 0.45, ease: LANDING_EASE }}
            >
              <div className="citas-side-panel">
                <h3 className="citas-side-title">Horarios disponibles</h3>
                <p className="citas-selected-date">
                  Fecha seleccionada: {formatFriendlyDate(selectedDate)}
                </p>
                <div className="public-booking-slot-summary">
                  <span>Duración estimada de la cita: {formatDurationHuman(selectedServicesDurationSum)}</span>
                  <span>Selecciona una hora disponible para continuar con tu reserva.</span>
                </div>
                {selectedPackage ? (
                  <p className="citas-selected-date">
                    Paquete seleccionado: {selectedPackage.nombre_paquete}
                  </p>
                ) : null}

                {slotConflict ? (
                  <div className="public-booking-slot-conflict">
                    <p>
                      {slotConflict.conflictingAlias || 'Otro integrante'} ya tiene este barbero en{' '}
                      {formatTime12Hour(slotConflict.timeKey)}.
                    </p>
                    {slotSuggestionsLoading ? (
                      <p className="citas-selected-date">Buscando barberos disponibles para la misma hora...</p>
                    ) : null}
                    {!slotSuggestionsLoading && slotSuggestions.length > 0 ? (
                      <div className="public-booking-slot-suggestions">
                        {slotSuggestions.map((suggestion) => (
                          <Button
                            key={suggestion.idBarbero}
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => selectSuggestedBarber(suggestion.idBarbero)}
                          >
                            Cambiar a {suggestion.nombreBarbero}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                    {!slotSuggestionsLoading && slotSuggestions.length === 0 ? (
                      <p className="citas-selected-date">No hay otro barbero disponible para esta hora. Elige otra hora.</p>
                    ) : null}
                  </div>
                ) : null}

                {slotsLoading ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    <div className="public-booking-time-period-tabs">
                      {SLOT_TIME_PERIODS.map((period) => (
                        <button
                          key={period.key}
                          type="button"
                          className={`public-booking-time-period-tab ${activeSlotPeriod === period.key ? 'is-active' : ''}`}
                          onClick={() => setPreferredSlotPeriod(period.key)}
                        >
                          <span>{period.label}</span>
                          <span className="public-booking-time-period-count">{(availableSlotsByPeriod[period.key] || []).length}</span>
                        </button>
                      ))}
                    </div>

                    <div className="public-booking-time-blocks-shell">
                      {totalAvailableSlots === 0 ? (
                        <div className="public-booking-period-empty">
                          <p className="text-sm font-semibold text-[var(--mf-text)]">
                            No hay horarios disponibles para este día.
                          </p>
                          <p className="text-sm text-[var(--mf-text-2)]">Prueba con otra fecha para ver más opciones.</p>
                        </div>
                      ) : (
                        <div className="public-booking-time-block-list">
                          {currentPeriodSlots.length > 0 ? (
                            currentPeriodSlots.map((slot) => {
                              const restriction = getSlotRestriction(slot);
                              return (
                                <SlotButton
                                  key={slot.hora}
                                  slot={slot}
                                  selectedTime={selectedTime}
                                  onSelect={onSelectTime}
                                  disabled={restriction.disabled}
                                  variant={restriction.variant}
                                  helperText={restriction.reason}
                                />
                              );
                            })
                          ) : (
                            <div className="public-booking-period-empty">
                              <p className="text-sm font-semibold text-[var(--mf-text)]">
                                No hay horarios disponibles en {SLOT_TIME_PERIODS.find((period) => period.key === activeSlotPeriod)?.label || 'esta franja'}.
                              </p>
                              <p className="text-sm text-[var(--mf-text-2)]">Prueba con otra franja del día.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="public-booking-slot-hint">
                  <Clock3 size={14} />
                  <span>Selecciona una hora para habilitar la pantalla de confirmación.</span>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <BookingBlocksSummary
          bookingBlocksSummary={bookingBlocksSummary}
          totalToPay={totalToPay}
          totalEstimatedPromotionDiscountHnl={totalEstimatedPromotionDiscountHnl}
          totalEstimatedToPay={totalEstimatedToPay}
        />

        <motion.div
          className="public-booking-actions public-booking-agenda-cta"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: LANDING_EASE }}
        >
          <Button className="gap-2" onClick={goToConfirm} disabled={!canGoToConfirm}>
            Continuar a resumen
            <ArrowRight size={15} />
          </Button>
        </motion.div>

        <motion.div
          className="public-booking-actions public-booking-agenda-secondary-cta"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease: LANDING_EASE }}
        >
          <Button
            variant="outline"
            className="gap-2"
            onClick={addCompanionBlock}
            disabled={!allowCompanions || !canAddCompanionBlock}
          >
            <Plus size={15} />
            {!allowCompanions
              ? 'Acompañantes no habilitados'
              : canAddCompanionBlock
                ? 'Añadir acompañante'
                : 'Límite de 4 acompañantes alcanzado'}
          </Button>
        </motion.div>
      </div>
    </>
  );
}




