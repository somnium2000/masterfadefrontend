import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clock3,
  Loader2,
  Plus,
  Scissors,
  UserRound,
  Package,
  Tag,
  X,
} from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { DayButton, ServiceCard, SlotButton } from './PublicBookingBlocks.jsx';
import { usePublicBookingFlow } from './BookingFlowContext.jsx';
import {
  WEEK_DAYS,
  buildFullName,
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

function sortSlotsByTime(slots = []) {
  return [...slots].sort((left, right) => {
    const leftMin = toMinutes(left?.hora);
    const rightMin = toMinutes(right?.hora);
    if (leftMin == null && rightMin == null) return 0;
    if (leftMin == null) return 1;
    if (rightMin == null) return -1;
    return leftMin - rightMin;
  });
}

function isRenderableSlot(slot, selectedDate, isPastSlotForToday) {
  if (!slot?.disponible) return false;
  if (selectedDate && isPastSlotForToday(selectedDate, slot?.hora)) return false;
  return Boolean(slot?.hora);
}

function pushUniqueSlots(target, candidates, seen, selectedDate, isPastSlotForToday) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  list.forEach((slot) => {
    if (!isRenderableSlot(slot, selectedDate, isPastSlotForToday)) return;
    const key = String(slot?.hora || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    target.push(slot);
  });
}

const BookingBlocksSummary = memo(function BookingBlocksSummary({
  bookingBlocksSummary,
  totalToPay,
  totalEstimatedPromotionDiscountHnl,
  totalEstimatedToPay,
}) {
  const completedBlocks = bookingBlocksSummary.filter((block) => block.isComplete);
  const hasAnyPromotionSelected = bookingBlocksSummary.some(
    (block) => Array.isArray(block.promotionIds) && block.promotionIds.length > 0
  );
  const hasAnyPendingTwoByOne = bookingBlocksSummary.some(
    (block) => (Array.isArray(block.promotionIds) && block.promotionIds.length > 0)
      && Boolean(block.promocion_requiere_calculo_final)
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
                  : Array.from(
                    new Map(
                      (Array.isArray(block.selectedServices) ? block.selectedServices : [])
                        .map((service) => [String(service?.id_servicio || '').trim(), service])
                        .filter(([serviceId]) => Boolean(serviceId))
                    ).values()
                  ).map((service) => {
                    const baseName = String(service?.nombre_servicio || '').trim() || 'Servicio';
                    if (service?.coveredByReward) return `${baseName} (Recompensa cortesía)`;
                    return service?.coveredByPlan ? `${baseName} (Cubierto por tu plan)` : baseName;
                  }).join(', ')}
              </div>
              <div className="citas-selected-date">
                {formatFriendlyDate(block.selectedDate)} - {formatTime12Hour(block.selectedTime)}
              </div>
              {Array.isArray(block.selectedPromotions) && block.selectedPromotions.length > 0 ? (
                <div className="citas-selected-date">
                  Promociones: {block.selectedPromotions
                    .map((promotion) => String(promotion?.titulo || '').trim() || 'Promoción')
                    .join(', ')}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <div className="citas-services-summary-row mt-3">
        {hasAnyPromotionSelected ? (
          <div className="public-booking-promo-summary">
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
});

export default function PublicBookingAgendaStep() {
  const {
    activeBlock,
    activeBlockContactState,
    activeBlockIndex,
    addCompanionBlock,
    consumePendingCompanionFocus,
    consumePendingFieldFocus,
    allowCompanions,
    maxCompanions,
    maxPromotionsPerBooking,
    availabilityError,
    availabilityLoading,
    availabilityMap,
    barbers,
    bookingBlocks,
    bookingBlocksSummary,
    blockedServiceIds,
    membershipLockedServiceIdsForTitular,
    membershipUxMessage,
    membershipCompanionNotice,
    profileIncompleteState,
    profileFieldLabels,
    goToClienteProfile,
    rewardModeActive,
    rewardServiceId,
    rewardServiceName,
    rewardBranchName,
    rewardBranchMismatch,
    cancelRewardRedemptionUsage,
    cancelBookingFlow,
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
    promotionsLoadError,
    promotionsLoading,
    clearSelectedPromotion,
    selectSuggestedBarber,
    selectPromotion,
    selectedDate,
    selectedPackage,
    selectedPackageId,
    selectedPromotionIds,
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
    pendingFieldFocus,
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
    slotsCurated,
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
    titularState,
    holdSubmitting,
  } = usePublicBookingFlow();

  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);

  const selectedServiceIdsSet = useMemo(
    () => new Set((Array.isArray(selectedServices) ? selectedServices : []).map((service) => String(service?.id_servicio || '').trim()).filter(Boolean)),
    [selectedServices]
  );

  const selectedServicesCount = useMemo(() => {
    const totalServiceIds = new Set(selectedServiceIdsSet);
    if (activeBlockIndex === 0) {
      (Array.isArray(membershipLockedServiceIdsForTitular) ? membershipLockedServiceIdsForTitular : []).forEach((serviceId) => {
        const normalizedId = String(serviceId || '').trim();
        if (normalizedId) totalServiceIds.add(normalizedId);
      });
      if (rewardModeActive && activeBlockIndex === 0) {
        const rewardId = String(rewardServiceId || '').trim();
        if (rewardId) totalServiceIds.add(rewardId);
      }
    }
    return totalServiceIds.size + (selectedPackage ? 1 : 0);
  }, [
    activeBlockIndex,
    membershipLockedServiceIdsForTitular,
    rewardModeActive,
    rewardServiceId,
    selectedPackage,
    selectedServiceIdsSet,
  ]);

  const hasValidSelectionForCalendar = selectedServicesCount > 0;

  const blockedServiceIdsSet = useMemo(
    () => new Set((Array.isArray(blockedServiceIds) ? blockedServiceIds : []).map((id) => String(id || '').trim()).filter(Boolean)),
    [blockedServiceIds]
  );

  const membershipLockedServiceIdsSet = useMemo(
    () => new Set((Array.isArray(membershipLockedServiceIdsForTitular) ? membershipLockedServiceIdsForTitular : []).map((id) => String(id || '').trim()).filter(Boolean)),
    [membershipLockedServiceIdsForTitular]
  );

  const visibleServices = useMemo(() => {
    const deduped = new Map();
    (Array.isArray(services) ? services : []).forEach((service) => {
      const serviceId = String(service?.id_servicio || '').trim();
      if (!serviceId || deduped.has(serviceId)) return;
      deduped.set(serviceId, service);
    });
    return Array.from(deduped.values());
  }, [services]);

  const hasSelectedDate = Boolean(selectedDate);
  const slotsSectionRef = useRef(null);
  const contactCardRef = useRef(null);
  const contactNameInputRef = useRef(null);
  const contactEmailInputRef = useRef(null);

  const activeContactFirstName = String(activeBlock?.contactFirstName || '');
  const activeContactLastName = String(activeBlock?.contactLastName || '');
  const activeContactEmail = String(activeBlock?.contactEmail || '');
  const activeContactPhone = String(activeBlock?.contactPhone || '');

  const fieldErrorKey = (blockIndex, field) => `${blockIndex}:${field}`;
  const activeFirstNameError = fieldErrors?.[fieldErrorKey(activeBlockIndex, 'contactFirstName')]
    || fieldErrors?.[fieldErrorKey(activeBlockIndex, 'contactName')]
    || '';
  const activeLastNameError = fieldErrors?.[fieldErrorKey(activeBlockIndex, 'contactLastName')] || '';
  const activeEmailError = fieldErrors?.[fieldErrorKey(activeBlockIndex, 'contactEmail')] || '';
  const activePhoneError = fieldErrors?.[fieldErrorKey(activeBlockIndex, 'contactPhone')] || '';

  const isTitularBlock = activeBlockIndex === 0;
  const titularMissingFields = new Set(Array.isArray(titularState?.missingFields) ? titularState.missingFields : []);
  const isAuthenticatedTitular = Boolean(isTitularBlock && titularState?.isAuthenticated);
  const showTitularIdentityOnly = Boolean(isAuthenticatedTitular);
  const profileIncompleteMessage = String(profileIncompleteState?.message || '').trim();
  const profileMissingLabels = useMemo(() => {
    const source = Array.isArray(profileIncompleteState?.missingFields) ? profileIncompleteState.missingFields : [];
    const labelsMap = profileFieldLabels && typeof profileFieldLabels === 'object'
      ? profileFieldLabels
      : {};
    return source
      .map((field) => String(labelsMap?.[field] || field || '').trim())
      .filter(Boolean);
  }, [profileFieldLabels, profileIncompleteState?.missingFields]);

  const showFirstNameInput = !isTitularBlock
    || !isAuthenticatedTitular
    || titularMissingFields.has('nombres')
    || !activeContactFirstName;
  const showLastNameInput = !isTitularBlock
    || !isAuthenticatedTitular
    || titularMissingFields.has('apellidos')
    || !activeContactLastName;
  const showEmailInput = !isTitularBlock
    || !isAuthenticatedTitular
    || !activeContactEmail;
  const showPhoneInput = !isTitularBlock
    || !isAuthenticatedTitular
    || titularMissingFields.has('telefono_principal')
    || !activeContactPhone;

  const titularDisplayName = buildFullName(titularState?.profile?.nombres, titularState?.profile?.apellidos)
    || String(activeBlockContactState?.fullName || '').trim();

  const contactNameRequiredMessage = activeBlockIndex === 0
    ? (isAuthenticatedTitular
      ? 'Completa los datos faltantes del titular antes de elegir servicios.'
      : 'Ingresa al menos el nombre del titular para continuar con la selección de servicios.')
    : 'Ingresa nombre y apellido del acompañante antes de elegir servicios.';

  const canSelectServices = Boolean(activeBlockContactState?.fullName);
  const rewardForTitularActive = Boolean(rewardModeActive && activeBlockIndex === 0);

  const [catalogTab, setCatalogTab] = useState('services');
  const effectiveCatalogTab = rewardForTitularActive ? 'services' : catalogTab;

  const activeBlockSummary = useMemo(
    () => bookingBlocksSummary.find((block) => block.index === activeBlockIndex) || null,
    [activeBlockIndex, bookingBlocksSummary]
  );

  const selectedServiceIdsForPromotionSet = useMemo(
    () => new Set(serviceIds),
    [serviceIds]
  );
  const selectedPromotionIdsSet = useMemo(
    () => new Set(Array.isArray(selectedPromotionIds) ? selectedPromotionIds : []),
    [selectedPromotionIds]
  );
  const selectedPromotionCount = selectedPromotionIdsSet.size;
  const canSelectMorePromotions = selectedPromotionCount < maxPromotionsPerBooking;

  const promotionsForCards = useMemo(() => {
    const list = Array.isArray(promotions) ? promotions : [];
    return list.map((promotion) => {
      const promotionId = String(promotion?.id_promocion || '').trim();
      const appliesTo = String(promotion?.aplica_a || '').trim().toLowerCase();
      const targetServiceId = String(promotion?.id_servicio_objetivo || '').trim();
      const targetPackageId = String(promotion?.id_paquete_objetivo || '').trim();
      const targetLabel = resolvePromotionTargetLabel(promotion);
      const targetSelected = appliesTo === 'paquete'
        ? Boolean(targetPackageId && selectedPackageId && selectedPackageId === targetPackageId)
        : Boolean(targetServiceId && selectedServiceIdsForPromotionSet.has(targetServiceId));
      const benefitLabel = formatPromotionBenefitLabel(promotion);
      const vigencyLabel = formatPromotionVigencyLabel(promotion);
      const disabledByBranch = !selectedBranchId;
      const isSelected = selectedPromotionIdsSet.has(promotionId);
      const disabledByReward = rewardModeActive;
      const disabledByLimit = !isSelected && !canSelectMorePromotions;
      const canSelect = isSelected
        || (!disabledByBranch && !disabledByReward && !disabledByLimit && targetSelected);

      let disabledReason = '';
      if (isSelected) {
        disabledReason = '';
      } else if (disabledByBranch) {
        disabledReason = 'Selecciona una sucursal para ver promociones aplicables.';
      } else if (disabledByReward) {
        disabledReason = 'El canje seleccionado no puede combinarse con promociones para esta reserva.';
      } else if (disabledByLimit) {
        disabledReason = `Puedes seleccionar hasta ${maxPromotionsPerBooking} promociones por reserva.`;
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
        isSelected,
      };
    });
  }, [
    canSelectMorePromotions,
    maxPromotionsPerBooking,
    promotions,
    rewardModeActive,
    selectedBranchId,
    selectedPackageId,
    selectedPromotionIdsSet,
    selectedServiceIdsForPromotionSet,
  ]);
  const selectedPromotionsForBlock = useMemo(
    () => promotionsForCards.filter((promotion) => promotion.isSelected),
    [promotionsForCards]
  );
  const selectedPromotionTitles = useMemo(() => {
    const promotionById = new Map(
      promotionsForCards.map((promotion) => [promotion.promotionId, promotion])
    );
    return (Array.isArray(selectedPromotionIds) ? selectedPromotionIds : [])
      .map((promotionId) => promotionById.get(promotionId))
      .filter(Boolean)
      .map((promotion) => String(promotion?.titulo || '').trim() || 'Promoción');
  }, [promotionsForCards, selectedPromotionIds]);

  const activeBlockEstimatedDiscount = Math.max(
    0,
    Number(activeBlockSummary?.promocion_descuento_estimado_hnl || 0)
  );
  const activeBlockNeedsFinalCalculation = Boolean(activeBlockSummary?.promocion_requiere_calculo_final);
  const safeEstimatedDiscountGlobal = Math.max(0, Number(totalEstimatedPromotionDiscountHnl || 0));
  const visibleEstimatedDiscount = Math.max(activeBlockEstimatedDiscount, safeEstimatedDiscountGlobal);

  const [preferredSlotPeriod, setPreferredSlotPeriod] = useState('manana');
  const periodSlotModels = useMemo(() => {
    const baseByPeriod = {
      manana: [],
      tarde: [],
      noche: [],
    };

    (Array.isArray(slots) ? slots : []).forEach((slot) => {
      if (!slot?.disponible) return;
      if (selectedDate && isPastSlotForToday(selectedDate, slot?.hora)) return;
      const key = getSlotPeriodKey(slot?.hora);
      baseByPeriod[key].push(slot);
    });

    Object.keys(baseByPeriod).forEach((periodKey) => {
      baseByPeriod[periodKey] = sortSlotsByTime(baseByPeriod[periodKey]);
    });

    const models = {};
    SLOT_TIME_PERIODS.forEach((period) => {
      const periodKey = period.key;
      const fallbackSlots = baseByPeriod[periodKey] || [];
      const curatedPeriod = slotsCurated?.[periodKey] || null;
      const seen = new Set();

      const curatedRecommended = [];
      pushUniqueSlots(curatedRecommended, curatedPeriod?.recommended, seen, selectedDate, isPastSlotForToday);

      const curatedAlternatives = [];
      pushUniqueSlots(
        curatedAlternatives,
        Array.isArray(curatedPeriod?.alternatives) ? curatedPeriod.alternatives : [],
        seen,
        selectedDate,
        isPastSlotForToday
      );

      const fallbackUnique = [];
      pushUniqueSlots(fallbackUnique, fallbackSlots, seen, selectedDate, isPastSlotForToday);
      fallbackUnique.sort((left, right) => {
        const leftMin = toMinutes(left?.hora);
        const rightMin = toMinutes(right?.hora);
        if (leftMin == null && rightMin == null) return 0;
        if (leftMin == null) return 1;
        if (rightMin == null) return -1;
        return leftMin - rightMin;
      });

      const recommendedPool = sortSlotsByTime([...curatedRecommended, ...fallbackUnique]);
      const recommended = recommendedPool[0] || null;
      const alternativesRaw = sortSlotsByTime([
        ...curatedAlternatives,
        ...(recommended ? fallbackUnique.filter((slot) => slot.hora !== recommended.hora) : fallbackUnique),
      ]);
      const alternatives = alternativesRaw
        .filter((slot) => slot && slot.hora !== recommended?.hora)
        .slice(0, 3);
      const visibleSlots = [recommended, ...alternatives]
        .filter(Boolean)
        .filter((slot, index, list) => list.findIndex((candidate) => candidate?.hora === slot?.hora) === index);
      const total = visibleSlots.length;

      models[periodKey] = {
        recommended,
        alternatives,
        total,
        visibleSlots,
      };
    });

    return models;
  }, [isPastSlotForToday, selectedDate, slots, slotsCurated]);

  const totalAvailableSlots = useMemo(
    () => SLOT_TIME_PERIODS.reduce((total, period) => total + Number(periodSlotModels?.[period.key]?.total || 0), 0),
    [periodSlotModels]
  );

  const activeSlotPeriod = useMemo(() => {
    if (Number(periodSlotModels?.[preferredSlotPeriod]?.total || 0) > 0) return preferredSlotPeriod;
    const firstWithAvailable = SLOT_TIME_PERIODS.find((period) => Number(periodSlotModels?.[period.key]?.total || 0) > 0);
    return firstWithAvailable ? firstWithAvailable.key : 'manana';
  }, [periodSlotModels, preferredSlotPeriod]);

  const activePeriodModel = periodSlotModels?.[activeSlotPeriod] || {
    recommended: null,
    alternatives: [],
    total: 0,
    visibleSlots: [],
  };
  const currentPeriodSlots = activePeriodModel.visibleSlots;

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

  useLayoutEffect(() => {
    if (!pendingCompanionFocusId) return;
    if (activeBlockIndex <= 0) return;
    if (!activeBlock?.id || activeBlock.id !== pendingCompanionFocusId) return;

    let cancelled = false;
    let innerRafId = 0;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      innerRafId = requestAnimationFrame(() => {
        if (cancelled) return;
        contactCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        contactNameInputRef.current?.focus({ preventScroll: true });
        consumePendingCompanionFocus(pendingCompanionFocusId);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (innerRafId) cancelAnimationFrame(innerRafId);
    };
  }, [
    activeBlock?.id,
    activeBlockIndex,
    consumePendingCompanionFocus,
    pendingCompanionFocusId,
  ]);

  useLayoutEffect(() => {
    if (!pendingFieldFocus?.blockId || !pendingFieldFocus?.field) return;
    if (!activeBlock?.id || activeBlock.id !== pendingFieldFocus.blockId) return;

    let cancelled = false;
    let innerRafId = 0;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      innerRafId = requestAnimationFrame(() => {
        if (cancelled) return;
        const focusTarget = pendingFieldFocus.field === 'contactEmail'
          ? contactEmailInputRef.current
          : contactNameInputRef.current;
        contactCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        focusTarget?.focus({ preventScroll: true });
        consumePendingFieldFocus(pendingFieldFocus.requestId);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (innerRafId) cancelAnimationFrame(innerRafId);
    };
  }, [
    activeBlock?.id,
    consumePendingFieldFocus,
    pendingFieldFocus,
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

      {rewardModeActive ? (
        <div className="citas-surface p-4 border border-emerald-400/35 bg-emerald-500/10">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-200">
            <Scissors size={15} /> Recompensa cortesía activa
          </p>
          <p className="mt-2 text-sm text-emerald-100">
            Servicio bloqueado para titular: <strong>{rewardServiceName || 'Servicio de recompensa'}</strong>.
          </p>
          {rewardBranchMismatch ? (
            <p className="mt-1 text-sm text-amber-100">
              Esta recompensa pertenece a {rewardBranchName || 'otra sucursal'}. Cambia a esa sucursal para usarla.
            </p>
          ) : null}
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={cancelRewardRedemptionUsage}
            >
              <X size={13} />
              Cancelar uso de recompensa
            </Button>
          </div>
        </div>
      ) : null}

      {membershipUxMessage ? (
        <div className="citas-surface p-4 border border-amber-400/35 bg-amber-500/10">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle size={15} /> Aviso de cobertura de plan
          </p>
          <p className="mt-2 text-sm text-amber-100">{membershipUxMessage}</p>
          {membershipCompanionNotice ? (
            <p className="mt-2 text-sm text-amber-100">{membershipCompanionNotice}</p>
          ) : null}
        </div>
      ) : null}

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
            {showTitularIdentityOnly ? (
              <div className="space-y-2">
                <p className="citas-selected-date">
                  Agendando como: <strong>{titularDisplayName || 'Titular autenticado'}</strong>
                </p>
                {titularState?.hasFullProfile ? (
                  <p className="citas-selected-date">Agendarás esta cita con tu perfil de cliente.</p>
                ) : (
                  <>
                    <p className="public-booking-field-error">
                      {profileIncompleteMessage || 'Completa tu perfil antes de agendar una cita.'}
                    </p>
                    {profileMissingLabels.length > 0 ? (
                      <p className="citas-selected-date">
                        Campos faltantes: {profileMissingLabels.join(', ')}.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={goToClienteProfile}
                    >
                      Completar perfil
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="public-booking-form-grid">
                  {showFirstNameInput ? (
                    <div className="public-booking-form-row">
                      <label className="mf-label" htmlFor="booking-contact-first-name">
                        {activeBlockIndex === 0 ? 'Nombres *' : 'Nombres del acompañante *'}
                      </label>
                      <input
                        id="booking-contact-first-name"
                        ref={contactNameInputRef}
                        type="text"
                        inputMode="text"
                        maxLength={20}
                        autoComplete="given-name"
                        className={`mf-input ${activeFirstNameError ? 'is-invalid' : ''}`.trim()}
                        value={activeContactFirstName}
                        onChange={(event) => updateActiveBlockContact({ contactFirstName: event.target.value })}
                        placeholder={activeBlockIndex === 0 ? 'Ej. Carlos' : 'Ej. José'}
                      />
                      {activeFirstNameError ? <p className="public-booking-field-error">{activeFirstNameError}</p> : null}
                    </div>
                  ) : null}
                  {showLastNameInput ? (
                    <div className="public-booking-form-row">
                      <label className="mf-label" htmlFor="booking-contact-last-name">
                        {activeBlockIndex === 0 ? 'Apellidos *' : 'Apellidos del acompañante *'}
                      </label>
                      <input
                        id="booking-contact-last-name"
                        type="text"
                        inputMode="text"
                        maxLength={20}
                        autoComplete="family-name"
                        className={`mf-input ${activeLastNameError ? 'is-invalid' : ''}`.trim()}
                        value={activeContactLastName}
                        onChange={(event) => updateActiveBlockContact({ contactLastName: event.target.value })}
                        placeholder={activeBlockIndex === 0 ? 'Ej. Ramírez' : 'Ej. López'}
                      />
                      {activeLastNameError ? <p className="public-booking-field-error">{activeLastNameError}</p> : null}
                    </div>
                  ) : null}
                  {showEmailInput ? (
                    <div className="public-booking-form-row">
                      <label className="mf-label" htmlFor="booking-contact-email">
                        {activeBlockIndex === 0 ? 'Correo del titular *' : 'Correo del acompañante (opcional)'}
                      </label>
                      <input
                        id="booking-contact-email"
                        ref={contactEmailInputRef}
                        type="email"
                        className={`mf-input ${activeEmailError ? 'is-invalid' : ''}`.trim()}
                        value={activeContactEmail}
                        onChange={(event) => updateActiveBlockContact({ contactEmail: event.target.value })}
                        placeholder={activeBlockIndex === 0 ? 'titular@correo.com' : 'acompanante@correo.com'}
                      />
                      {activeEmailError ? <p className="public-booking-field-error">{activeEmailError}</p> : null}
                    </div>
                  ) : null}
                  {showPhoneInput ? (
                    <div className="public-booking-form-row">
                      <label className="mf-label" htmlFor="booking-contact-phone">
                        {activeBlockIndex === 0 ? 'Teléfono del titular *' : 'Teléfono del acompañante (opcional)'}
                      </label>
                      <input
                        id="booking-contact-phone"
                        type="tel"
                        inputMode="tel"
                        maxLength={24}
                        className={`mf-input ${activePhoneError ? 'is-invalid' : ''}`.trim()}
                        value={activeContactPhone}
                        onChange={(event) => updateActiveBlockContact({ contactPhone: event.target.value })}
                        placeholder="Ej. +504 9999-9999"
                      />
                      {activePhoneError ? <p className="public-booking-field-error">{activePhoneError}</p> : null}
                    </div>
                  ) : null}
                </div>
                {activeBlockIndex > 0 ? (
                  <p className="citas-selected-date">
                    Para acompañantes, nombres y apellidos son obligatorios. Correo y teléfono son opcionales.
                  </p>
                ) : null}
              </>
            )}
          </div>

          {!canSelectServices ? (
            <p className="citas-selected-date">{contactNameRequiredMessage}</p>
          ) : null}

          <div className="public-booking-selection-tabs">
            <Button
              type="button"
              variant={effectiveCatalogTab === 'services' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCatalogTab('services')}
            >
              Servicios
            </Button>
            <Button
              type="button"
              variant={effectiveCatalogTab === 'packages' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCatalogTab('packages')}
              disabled={rewardForTitularActive}
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
            {effectiveCatalogTab === 'services' ? (
              <div className="citas-services-grid">
                {visibleServices.map((service) => (
                  (() => {
                    const serviceId = String(service?.id_servicio || '').trim();
                    const coveredByPlan = activeBlockIndex === 0 && membershipLockedServiceIdsSet.has(serviceId);
                    const coveredByReward = activeBlockIndex === 0
                      && rewardForTitularActive
                      && serviceId === String(rewardServiceId || '').trim();
                    const blockedByPackage = blockedServiceIdsSet.has(serviceId);
                    const isBlocked = canSelectServices && (coveredByPlan || blockedByPackage || coveredByReward);
                    const blockedReason = coveredByReward
                      ? 'Este servicio está bloqueado por recompensa cortesía.'
                      : coveredByPlan
                        ? 'Este servicio está cubierto por tu plan y no se puede quitar.'
                        : (blockedByPackage ? 'Ese servicio ya lo incluye el paquete seleccionado' : '');
                    const blockedLabel = coveredByReward
                      ? 'Recompensa cortesía'
                      : coveredByPlan
                        ? 'Cubierto por tu plan'
                        : (blockedByPackage ? 'Incluido en paquete' : '');

                    return (
                      <ServiceCard
                        key={serviceId}
                        service={service}
                        isSelected={serviceIds.includes(service.id_servicio)}
                        blocked={isBlocked}
                        blockedReason={blockedReason}
                        blockedLabel={blockedLabel}
                        coveredByPlan={coveredByPlan || coveredByReward}
                        disabled={!canSelectServices}
                        onToggle={toggleService}
                      />
                    );
                  })()
                ))}
              </div>
            ) : null}

            {catalogTab === 'packages' ? (
              <div className="citas-services-grid">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id_paquete}
                    type="button"
                    className={`citas-service-card public-booking-package-card ${selectedPackageId === pkg.id_paquete ? 'is-selected' : ''}`}
                    disabled={!canSelectServices}
                    onClick={() => selectPackage(pkg.id_paquete)}
                  >
                    <div className="public-booking-package-head">
                      <div className="citas-service-name">{pkg.nombre_paquete || 'Paquete'}</div>
                      <p className="public-booking-package-description">
                        {String(pkg?.descripcion || '').trim() || 'Incluye una combinación de servicios del catálogo.'}
                      </p>
                    </div>
                    <div className="public-booking-package-items">
                      {(Array.isArray(pkg.items) ? pkg.items : []).slice(0, 6).map((item, index) => {
                        const itemName = String(item?.nombre_servicio || '').trim() || 'Servicio';
                        const qty = Math.max(1, Number(item?.cantidad || 1));
                        return (
                          <div key={`${pkg.id_paquete}-item-${index}`} className="public-booking-package-item">
                            <Package size={12} />
                            <span>{qty > 1 ? `${itemName} x${qty}` : itemName}</span>
                          </div>
                        );
                      })}
                      {Array.isArray(pkg.items) && pkg.items.length > 6 ? (
                        <div className="public-booking-package-item public-booking-package-item--more">
                          + {pkg.items.length - 6} servicios más
                        </div>
                      ) : null}
                    </div>
                    <div className="public-booking-package-footer">
                      <span className="public-booking-package-price">{formatCurrencyHnl(pkg?.precio_hnl || 0)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {catalogTab === 'promotions' ? (
              promotionsLoading && promotionsForCards.length === 0 ? (
                <LoadingSpinner />
              ) : (
                <>
                  <div className="public-booking-actions is-inline mt-2">
                    <p className="citas-selected-date">
                      Promociones seleccionadas: {selectedPromotionCount}/{maxPromotionsPerBooking}
                    </p>
                  </div>
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
                </>
              )
            ) : null}

            {effectiveCatalogTab === 'packages' && packages.length === 0 ? (
              <p className="citas-selected-date mt-2">No hay paquetes disponibles para esta sucursal.</p>
            ) : null}

            {catalogTab === 'promotions' && !promotionsLoading && promotionsForCards.length === 0 ? (
              <p className="citas-selected-date mt-2">
                {promotionsLoadError || 'No hay promociones aplicables para esta selección.'}
              </p>
            ) : null}

            {catalogTab === 'promotions' && selectedPromotionsForBlock.length > 0 ? (
              <div className="public-booking-actions is-inline mt-2">
                <p className="citas-selected-date">
                  Promociones activas: {selectedPromotionTitles.join(', ')}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={clearSelectedPromotion}>
                  Quitar promociones
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
            {selectedPromotionIds.length > 0 ? (
              <div className="public-booking-promo-summary">
                <div className="public-booking-promo-summary-row">
                  <span className="public-booking-promo-summary-label">Subtotal servicios:</span>
                  <strong className="public-booking-promo-summary-value">{formatCurrencyHnl(totalToPay)}</strong>
                </div>
                <div className="public-booking-promo-summary-row">
                  <span className="public-booking-promo-summary-label">Promociones seleccionadas:</span>
                  <strong className="public-booking-promo-summary-value">{selectedPromotionIds.length}</strong>
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

          {!hasValidSelectionForCalendar ? (
            <div className="public-booking-inherited-date-banner">
              Selecciona al menos un servicio para habilitar el calendario.
            </div>
          ) : null}

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
                      isSelected={selectedDate === cell.key}
                      onSelect={onSelectDay}
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
                          <span className="public-booking-time-period-count">{Number(periodSlotModels?.[period.key]?.total || 0)}</span>
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
                            <>
                              {activePeriodModel.recommended ? (
                                <section className="public-booking-curated-section">
                                  <p className="public-booking-curated-title">Recomendado</p>
                                  {(() => {
                                    const restriction = getSlotRestriction(activePeriodModel.recommended);
                                    return (
                                      <SlotButton
                                        key={`recommended-${activePeriodModel.recommended.hora}`}
                                        slot={activePeriodModel.recommended}
                                        isSelected={selectedTime === activePeriodModel.recommended.hora}
                                        onSelect={onSelectTime}
                                        disabled={restriction.disabled}
                                        variant={restriction.variant}
                                        helperText={restriction.reason}
                                      />
                                    );
                                  })()}
                                </section>
                              ) : null}

                              {activePeriodModel.alternatives.length > 0 ? (
                                <section className="public-booking-curated-section">
                                  <p className="public-booking-curated-title">Alternativas</p>
                                  {activePeriodModel.alternatives.map((slot) => {
                                    const restriction = getSlotRestriction(slot);
                                    return (
                                      <SlotButton
                                        key={`alternative-${slot.hora}`}
                                        slot={slot}
                                        isSelected={selectedTime === slot.hora}
                                        onSelect={onSelectTime}
                                        disabled={restriction.disabled}
                                        variant={restriction.variant}
                                        helperText={restriction.reason}
                                      />
                                    );
                                  })}
                                </section>
                              ) : null}
                            </>
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
          <Button
            className="gap-2 public-booking-agenda-action-button"
            onClick={() => {
              void goToConfirm();
            }}
            disabled={holdSubmitting}
          >
            {holdSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {holdSubmitting ? 'Preparando resumen...' : 'Continuar a resumen'}
            <ArrowRight size={15} />
          </Button>
        </motion.div>

        <motion.div
          className="public-booking-actions public-booking-agenda-secondary-cta flex-col"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease: LANDING_EASE }}
        >
          <Button
            variant="outline"
            className="gap-2 public-booking-agenda-action-button"
            onClick={addCompanionBlock}
            disabled={!allowCompanions || !canAddCompanionBlock}
          >
            <Plus size={15} />
            {!allowCompanions
              ? 'Acompañantes no habilitados'
              : canAddCompanionBlock
                ? 'Añadir acompañante'
                : `Límite de ${maxCompanions} acompañantes alcanzado`}
          </Button>
          <Button
            variant="outline"
            className="gap-2 public-booking-agenda-action-button"
            onClick={() => {
              void cancelBookingFlow('agenda');
            }}
          >
            Cancelar
          </Button>
        </motion.div>
      </div>
    </>
  );
}
