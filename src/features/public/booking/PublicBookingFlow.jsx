import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowLeft, House } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  createClienteCitaHold,
  createPublicCitaHold,
  createPublicPaymentIntent,
  getPublicPaymentStatus,
  completePublicMockPayment,
  getClienteMembershipEstado,
  getPublicBookingContext,
  listPublicAgendaBarberos,
  listPublicAgendaDisponibilidad,
  listPublicAgendaHorarios,
  listPublicAgendaPromociones,
  listPublicCatalogPaquetes,
  listPublicCatalogServicios,
} from './publicBookingApi.js';
import {
  MAX_COMPANIONS,
  addMinutesToTimeKey,
  extractMessage,
  getCurrentTimeKeyInTimeZone,
  getTodayDateKeyInTimeZone,
  normalizePhone,
  timeKeyToMinutes,
  toDateKey,
  toLocalDateTimeWithOffset,
  toMonthStartFromDateKey,
} from './bookingUtils.js';
import '../../admin/pages/AdminCitasPage.css';
import './PublicBookingFlow.css';
import usePublicAgendaRealtime from './usePublicAgendaRealtime.js';

const EMPTY_CONTEXT = {
  sucursales: [],
  parametros: {},
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLOT_GRID_STEP_MINUTES = 5;

const PublicBookingContext = createContext(null);

export function PublicBookingProvider({ value, children }) {
  return <PublicBookingContext.Provider value={value}>{children}</PublicBookingContext.Provider>;
}

function readBooleanParam(parametros, key, fallback) {
  const value = parametros?.[key];
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && typeof value.valor_booleano === 'boolean') {
    return value.valor_booleano;
  }
  return fallback;
}

function readNumberParam(parametros, key, fallback) {
  const value = parametros?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && Number.isFinite(Number(value.valor_numero))) {
    return Number(value.valor_numero);
  }
  return fallback;
}

function buildDefaultSlots() {
  return [];
}

function normalizeHourMinute(value) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function toPromotionNumber(value) {
  // JK: Centraliza la conversión numérica de descuentos para evitar NaN en cálculos visuales.
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evaluatePromotionForBlock({ block, promotion, servicesById, packagesById }) {
  // JK: Determina si una promoción es seleccionable para el bloque activo y calcula descuento estimado solo visual.
  if (!promotion) {
    return {
      canSelect: false,
      isTargetSelected: false,
      disabledReason: '',
      targetName: '',
      targetPrice: 0,
      estimatedDiscount: 0,
      requiresFinalCalculation: false,
    };
  }

  const appliesTo = String(promotion?.aplica_a || '').trim().toLowerCase();
  const mechanic = String(promotion?.mecanica || '').trim().toLowerCase();
  const targetServiceId = String(promotion?.id_servicio_objetivo || '').trim();
  const targetPackageId = String(promotion?.id_paquete_objetivo || '').trim();
  const selectedServiceIds = Array.isArray(block?.serviceIds) ? block.serviceIds : [];
  const selectedPackageId = String(block?.packageId || '').trim();
  const targetService = targetServiceId ? servicesById.get(targetServiceId) || null : null;
  const targetPackage = targetPackageId ? packagesById.get(targetPackageId) || null : null;

  let isTargetSelected = false;
  let targetName = '';
  let targetPrice = 0;
  if (appliesTo === 'servicio') {
    isTargetSelected = Boolean(targetServiceId && selectedServiceIds.includes(targetServiceId));
    targetName = String(targetService?.nombre_servicio || promotion?.servicio_objetivo_nombre || 'servicio').trim();
    targetPrice = toPromotionNumber(targetService?.precio_hnl);
  } else if (appliesTo === 'paquete') {
    isTargetSelected = Boolean(targetPackageId && selectedPackageId && selectedPackageId === targetPackageId);
    targetName = String(targetPackage?.nombre_paquete || promotion?.paquete_objetivo_nombre || 'paquete').trim();
    targetPrice = toPromotionNumber(targetPackage?.precio_hnl);
  }

  const discountValue = toPromotionNumber(promotion?.valor_descuento);
  let estimatedDiscount = 0;
  let requiresFinalCalculation = false;
  if (isTargetSelected) {
    if (mechanic === 'porcentaje') {
      estimatedDiscount = (targetPrice * discountValue) / 100;
    } else if (mechanic === 'monto_fijo') {
      estimatedDiscount = Math.min(targetPrice, discountValue);
    } else if (mechanic === 'dos_por_uno') {
      requiresFinalCalculation = true;
      estimatedDiscount = 0;
    }
  }

  const safeDiscount = Number.isFinite(estimatedDiscount) ? Math.max(0, Math.min(estimatedDiscount, targetPrice)) : 0;
  const disabledReason = isTargetSelected
    ? ''
    : `Requiere seleccionar ${targetName || (appliesTo === 'paquete' ? 'el paquete objetivo' : 'el servicio objetivo')}`;

  return {
    canSelect: isTargetSelected,
    isTargetSelected,
    disabledReason,
    targetName,
    targetPrice,
    estimatedDiscount: safeDiscount,
    requiresFinalCalculation,
  };
}

function isValidEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized);
}

function hasLetters(value) {
  return /[A-Za-z]/.test(String(value || ''));
}

function isValidPhoneStrict(value) {
  const raw = String(value || '').trim();
  if (!raw || hasLetters(raw)) return false;
  return normalizePhone(raw).length >= 8;
}

function buildDynamicSlots({
  horarios,
  duracionTotalMin,
}) {
  const list = Array.isArray(horarios) ? horarios : [];
  const fallbackVisibleDurationMinutes = Math.max(Number(duracionTotalMin || 0), 0);
  return list
    .map((slot) => {
      const hora = normalizeHourMinute(slot?.hora);
      if (!hora) return null;
      const visibleDurationMinutes = Math.max(
        Number(slot?.duracion_visible_min ?? fallbackVisibleDurationMinutes),
        0
      );
      const horaFinVisible = normalizeHourMinute(slot?.hora_fin_visible)
        || addMinutesToTimeKey(hora, visibleDurationMinutes)
        || hora;
      return {
        hora,
        horaFin: horaFinVisible,
        disponible: Boolean(slot?.disponible ?? true),
        duracionVisibleMin: visibleDurationMinutes,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftMin = timeKeyToMinutes(left.hora) ?? 0;
      const rightMin = timeKeyToMinutes(right.hora) ?? 0;
      return leftMin - rightMin;
    });
}

function createBlockId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `blk-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function areServiceIdsEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function normalizeBookingBlock(block, index) {
  const fallbackAlias = index === 0 ? 'Titular' : `Acompañante ${index}`;
  const nextServiceIds = Array.isArray(block?.serviceIds)
    ? Array.from(new Set(block.serviceIds.map((id) => String(id || '').trim()).filter(Boolean)))
    : [];
  // JK: Mantiene una única promoción seleccionada por bloque sin acoplarla al payload final de pago.
  const promotionId = String(block?.promotionId || '').trim();
  const contactName = String(block?.contactName || '').trim();
  const resolvedAlias = contactName || String(block?.alias || '').trim() || fallbackAlias;

  const hasPackage = Boolean(String(block?.packageId || '').trim());
  const requestedType = String(block?.selectionType || '').trim().toLowerCase();
  let normalizedSelectionType = 'services';
  if (requestedType === 'mixed' || (hasPackage && nextServiceIds.length > 0)) {
    normalizedSelectionType = 'mixed';
  } else if (requestedType === 'package' || hasPackage) {
    normalizedSelectionType = 'package';
  }

  return {
    id: String(block?.id || '').trim() || createBlockId(),
    alias: resolvedAlias,
    idBarbero: String(block?.idBarbero || '').trim(),
    selectionType: normalizedSelectionType,
    packageId: String(block?.packageId || '').trim(),
    serviceIds: nextServiceIds,
    promotionId,
    selectedDate: String(block?.selectedDate || '').trim(),
    selectedTime: String(block?.selectedTime || '').trim(),
    contactName,
    contactEmail: String(block?.contactEmail || '').trim(),
    contactPhone: String(block?.contactPhone || '').trim(),
  };
}

function areBlocksEqual(left, right) {
  if (!left || !right) return false;
  return left.id === right.id
    && left.alias === right.alias
    && left.idBarbero === right.idBarbero
    && left.selectionType === right.selectionType
    && left.packageId === right.packageId
    && left.promotionId === right.promotionId
    && left.selectedDate === right.selectedDate
    && left.selectedTime === right.selectedTime
    && left.contactName === right.contactName
    && left.contactEmail === right.contactEmail
    && left.contactPhone === right.contactPhone
    && areServiceIdsEqual(left.serviceIds, right.serviceIds);
}

function rangesOverlap(leftStart, leftDurationMin, rightStart, rightDurationMin) {
  const leftMinutes = timeKeyToMinutes(leftStart);
  const rightMinutes = timeKeyToMinutes(rightStart);
  const safeLeftDuration = Number(leftDurationMin || 0);
  const safeRightDuration = Number(rightDurationMin || 0);
  if (leftMinutes == null || rightMinutes == null || safeLeftDuration <= 0 || safeRightDuration <= 0) {
    return false;
  }
  const leftEnd = leftMinutes + safeLeftDuration;
  const rightEnd = rightMinutes + safeRightDuration;
  return leftMinutes < rightEnd && rightMinutes < leftEnd;
}

function createBookingBlock({ alias = '', idBarbero = '' } = {}) {
  return normalizeBookingBlock(
    {
      id: createBlockId(),
      alias,
      idBarbero,
      selectionType: 'services',
      packageId: '',
      serviceIds: [],
      // JK: Se inicializa vacío para que promociones sea opcional durante la fase 2A.
      promotionId: '',
      selectedDate: '',
      selectedTime: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
    },
    alias === 'Titular' ? 0 : 1
  );
}

export function usePublicBookingFlow() {
  const context = useContext(PublicBookingContext);
  if (!context) {
    throw new Error('usePublicBookingFlow debe usarse dentro de PublicBookingFlow.');
  }
  return context;
}

export default function PublicBookingFlow() {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { isAuthenticated, roles } = useAuth();
  const canUseClienteHold = Boolean(isAuthenticated && Array.isArray(roles) && roles.includes('cliente'));

  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [contextData, setContextData] = useState(EMPTY_CONTEXT);

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [barbersLoading, setBarbersLoading] = useState(false);
  const [barbersRefreshing, setBarbersRefreshing] = useState(false);
  const [barbers, setBarbers] = useState([]);

  const [servicesLoading, setServicesLoading] = useState(false);
  const [services, setServices] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packages, setPackages] = useState([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotions, setPromotions] = useState([]);

  const [bookingBlocks, setBookingBlocks] = useState(() => [createBookingBlock({ alias: 'Titular' })]);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [pendingCompanionFocusId, setPendingCompanionFocusId] = useState('');

  const [minBookingDateKey] = useState(() => getTodayDateKeyInTimeZone());
  const minBookingMonth = useMemo(
    () => toMonthStartFromDateKey(minBookingDateKey) || new Date(),
    [minBookingDateKey]
  );

  const [currentMonth, setCurrentMonth] = useState(() => {
    const monthStart = toMonthStartFromDateKey(getTodayDateKeyInTimeZone());
    if (monthStart) return monthStart;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState(() => buildDefaultSlots());
  const [slotMetrics, setSlotMetrics] = useState({ duracionTotalMin: 0, bufferTotalMin: 0 });
  const [slotConflict, setSlotConflict] = useState(null);
  const [slotSuggestions, setSlotSuggestions] = useState([]);
  const [slotSuggestionsLoading, setSlotSuggestionsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [authRequiredModal, setAuthRequiredModal] = useState({ open: false, email: '' });

  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdResult, setHoldResult] = useState(null);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [holdCountdownStartedAt, setHoldCountdownStartedAt] = useState(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

  const availabilityAbortRef = useRef(null);
  const slotsAbortRef = useRef(null);
  const branchDataRequestSeqRef = useRef(0);
  const availabilityRequestSeqRef = useRef(0);
  const slotsRequestSeqRef = useRef(0);
  const slotSuggestionRequestSeqRef = useRef(0);
  const availabilityCacheRef = useRef(new Map());
  const slotsCacheRef = useRef(new Map());
  const servicesScrollRef = useRef(null);
  const barbersCountRef = useRef(0);
  const servicesCountRef = useRef(0);
  const packagesCountRef = useRef(0);
  const promotionsCountRef = useRef(0);
  const selectedTimeRef = useRef('');
  // AM: Evita reaplicar propuesta automática del plan varias veces sobre la misma combinación de sucursal/servicios.
  const membershipPrefillKeysRef = useRef(new Set());
  const [servicesCanScroll, setServicesCanScroll] = useState(false);
  const [servicesAtEnd, setServicesAtEnd] = useState(true);

  const effectiveActiveBlockIndex = bookingBlocks[activeBlockIndex]
    ? activeBlockIndex
    : 0;

  const activeBlock = bookingBlocks[effectiveActiveBlockIndex] || null;
  const selectedBarberId = bookingBlocks[0]?.idBarbero || '';

  const activeBlockBarberId = activeBlock?.idBarbero || '';
  const selectionType = activeBlock?.selectionType || 'services';
  const selectedPackageId = activeBlock?.packageId || '';
  const serviceIds = useMemo(
    () => (Array.isArray(activeBlock?.serviceIds) ? activeBlock.serviceIds : []),
    [activeBlock]
  );
  const selectedDate = activeBlock?.selectedDate || '';
  const selectedTime = activeBlock?.selectedTime || '';
  const titularSelectedDate = bookingBlocks[0]?.selectedDate || '';

  const canGoPrevMonth = useMemo(() => {
    const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const minMonthStart = new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1);
    return currentMonthStart.getTime() > minMonthStart.getTime();
  }, [currentMonth, minBookingMonth]);

  const allowCompanions = useMemo(
    () => readBooleanParam(contextData?.parametros, 'permitir_acompanantes', false),
    [contextData?.parametros]
  );
  const paymentRequired = useMemo(
    () => readBooleanParam(contextData?.parametros, 'pago_total_obligatorio', true),
    [contextData?.parametros]
  );
  const simulationNoPayment = useMemo(
    () => readBooleanParam(contextData?.parametros, 'simulacion_sin_pago', true),
    [contextData?.parametros]
  );
  const holdDurationMin = useMemo(
    () => readNumberParam(contextData?.parametros, 'hold_duracion_min', 5),
    [contextData?.parametros]
  );
  const configuredPrepTime = useMemo(
    () => readNumberParam(contextData?.parametros, 'agenda_buffer_global_min', 0),
    [contextData?.parametros]
  );

  const branchList = useMemo(
    () => (Array.isArray(contextData?.sucursales) ? contextData.sucursales : []),
    [contextData?.sucursales]
  );

  const selectedBranch = useMemo(
    () => branchList.find((branch) => branch.id_sucursal === selectedBranchId) || null,
    [branchList, selectedBranchId]
  );

  const barbersById = useMemo(() => {
    const map = new Map();
    (Array.isArray(barbers) ? barbers : []).forEach((barber) => {
      if (!barber?.id_empleado) return;
      map.set(barber.id_empleado, barber);
    });
    return map;
  }, [barbers]);

  useEffect(() => {
    barbersCountRef.current = Array.isArray(barbers) ? barbers.length : 0;
  }, [barbers]);

  useEffect(() => {
    servicesCountRef.current = Array.isArray(services) ? services.length : 0;
  }, [services]);

  useEffect(() => {
    packagesCountRef.current = Array.isArray(packages) ? packages.length : 0;
  }, [packages]);

  useEffect(() => {
    // JK: Guarda el tamaño actual para decidir si mostrar loading completo o refresco suave.
    promotionsCountRef.current = Array.isArray(promotions) ? promotions.length : 0;
  }, [promotions]);

  useEffect(() => {
    selectedTimeRef.current = selectedTime;
  }, [selectedTime]);

  const selectedBarber = useMemo(
    () => barbersById.get(activeBlockBarberId) || null,
    [activeBlockBarberId, barbersById]
  );

  const servicesById = useMemo(() => {
    const map = new Map();
    (Array.isArray(services) ? services : []).forEach((service) => {
      if (!service?.id_servicio) return;
      map.set(service.id_servicio, service);
    });
    return map;
  }, [services]);

  const packagesById = useMemo(() => {
    const map = new Map();
    (Array.isArray(packages) ? packages : []).forEach((pkg) => {
      if (!pkg?.id_paquete) return;
      map.set(pkg.id_paquete, pkg);
    });
    return map;
  }, [packages]);

  const promotionsById = useMemo(() => {
    // JK: Facilita búsquedas rápidas de promoción para selección y autolimpieza por bloque.
    const map = new Map();
    (Array.isArray(promotions) ? promotions : []).forEach((promotion) => {
      const promotionId = String(promotion?.id_promocion || '').trim();
      if (!promotionId) return;
      map.set(promotionId, promotion);
    });
    return map;
  }, [promotions]);

  const selectedServices = useMemo(
    () => serviceIds.map((id) => servicesById.get(id)).filter(Boolean),
    [serviceIds, servicesById]
  );
  const selectedPackage = useMemo(
    () => packagesById.get(selectedPackageId) || null,
    [packagesById, selectedPackageId]
  );
  const selectedPromotionId = useMemo(
    () => String(activeBlock?.promotionId || '').trim(),
    [activeBlock?.promotionId]
  );
  const selectedPromotion = useMemo(
    () => promotionsById.get(selectedPromotionId) || null,
    [promotionsById, selectedPromotionId]
  );
  const effectiveSelectionType = useMemo(() => {
    if (selectedPackage && selectedServices.length > 0) return 'mixed';
    if (selectedPackage) return 'package';
    return 'services';
  }, [selectedPackage, selectedServices.length]);
  const rawSelectedServicesDurationSum = useMemo(
    () => {
      const packageDuration = Array.isArray(selectedPackage?.items)
        ? selectedPackage.items.reduce((total, item) => {
          const service = servicesById.get(item?.id_servicio);
          const qty = Math.max(1, Number(item?.cantidad || 1));
          return total + (Number(service?.duracion_min || 0) * qty);
        }, 0)
        : 0;
      const servicesDuration = selectedServices.reduce((total, service) => total + Number(service?.duracion_min || 0), 0);
      return packageDuration + servicesDuration;
    },
    [selectedPackage, servicesById, selectedServices]
  );
  const selectedServicesDurationSum = useMemo(
    () => (slotMetrics.duracionTotalMin > 0 ? slotMetrics.duracionTotalMin : rawSelectedServicesDurationSum),
    [rawSelectedServicesDurationSum, slotMetrics.duracionTotalMin]
  );
  const barberPrepTime = useMemo(
    () => (slotMetrics.bufferTotalMin > 0 ? slotMetrics.bufferTotalMin : ((selectedServices.length > 0 || selectedPackage) ? configuredPrepTime : 0)),
    [configuredPrepTime, selectedServices.length, selectedPackage, slotMetrics.bufferTotalMin]
  );
  const selectedBlockTotalMinutes = useMemo(
    () => (selectedServices.length > 0 || selectedPackage) ? selectedServicesDurationSum + barberPrepTime : 0,
    [barberPrepTime, selectedPackage, selectedServices, selectedServicesDurationSum]
  );
  const selectionCacheKey = useMemo(
    () => `type:${effectiveSelectionType}|package:${selectedPackageId || ''}|services:${serviceIds.join(',')}`,
    [effectiveSelectionType, selectedPackageId, serviceIds]
  );

  const bookingBlocksSummary = useMemo(
    () =>
      bookingBlocks.map((block, index) => {
        const blockServices = block.serviceIds.map((serviceId) => servicesById.get(serviceId)).filter(Boolean);
        const blockPackage = packagesById.get(block.packageId) || null;
        const blockSelectionType = blockPackage && blockServices.length > 0
          ? 'mixed'
          : blockPackage
            ? 'package'
            : 'services';
        const packageTotal = Number(blockPackage?.precio_hnl || 0);
        const servicesTotal = blockServices.reduce((total, service) => total + Number(service?.precio_hnl || 0), 0);
        const blockTotal = packageTotal + servicesTotal;
        const packageDurationMin = Array.isArray(blockPackage?.items)
          ? blockPackage.items.reduce((total, item) => {
            const service = servicesById.get(item?.id_servicio);
            const qty = Math.max(1, Number(item?.cantidad || 1));
            return total + (Number(service?.duracion_min || 0) * qty);
          }, 0)
          : 0;
        const serviceDurationMin = packageDurationMin
          + blockServices.reduce((total, service) => total + Number(service?.duracion_min || 0), 0);
        const blockHasSelection = Boolean(blockPackage) || blockServices.length > 0;
        const blockBufferMin = blockHasSelection ? barberPrepTime : 0;
        const selectedPromotionIdInBlock = String(block?.promotionId || '').trim();
        const blockPromotion = selectedPromotionIdInBlock ? promotionsById.get(selectedPromotionIdInBlock) || null : null;
        const promotionEvaluation = evaluatePromotionForBlock({
          block,
          promotion: blockPromotion,
          servicesById,
          packagesById,
        });
        const estimatedPromotionDiscount = promotionEvaluation.canSelect
          ? promotionEvaluation.estimatedDiscount
          : 0;
        return {
          ...block,
          index,
          alias: block.alias || (index === 0 ? 'Titular' : `Acompañante ${index}`),
          barbero: barbersById.get(block.idBarbero) || null,
          selection_type: blockSelectionType,
          selectedPackage: blockPackage,
          selectedServices: blockServices,
          total_hnl: blockTotal,
          // JK: Muestra promoción seleccionada y descuento estimado sin modificar payload de hold/pago.
          selectedPromotion: blockPromotion,
          promocion_id: selectedPromotionIdInBlock || null,
          promocion_objetivo_seleccionado: promotionEvaluation.isTargetSelected,
          promocion_objetivo_nombre: promotionEvaluation.targetName || null,
          promocion_descuento_estimado_hnl: estimatedPromotionDiscount,
          promocion_requiere_calculo_final: promotionEvaluation.requiresFinalCalculation,
          total_estimado_hnl: Math.max(0, blockTotal - estimatedPromotionDiscount),
          duracion_servicios_min: serviceDurationMin,
          buffer_total_min: blockBufferMin,
          duracion_bloque_min: serviceDurationMin + blockBufferMin,
          isComplete: Boolean(
            String(block.contactName || '').trim()
              && isValidEmail(block.contactEmail)
              && (index > 0 || isValidPhoneStrict(block.contactPhone))
              && block.idBarbero
              && blockHasSelection
              && block.selectedDate
              && block.selectedTime
          ),
        };
      }),
    [barberPrepTime, bookingBlocks, servicesById, barbersById, packagesById, promotionsById]
  );

  const totalToPay = useMemo(
    () => bookingBlocksSummary.reduce((total, block) => total + Number(block.total_hnl || 0), 0),
    [bookingBlocksSummary]
  );
  const totalEstimatedPromotionDiscountHnl = useMemo(
    () => bookingBlocksSummary.reduce((total, block) => total + Number(block.promocion_descuento_estimado_hnl || 0), 0),
    [bookingBlocksSummary]
  );
  const totalEstimatedToPay = useMemo(
    () => Math.max(0, totalToPay - totalEstimatedPromotionDiscountHnl),
    [totalEstimatedPromotionDiscountHnl, totalToPay]
  );

  const hasBlockingGroupConflict = useCallback((block) => {
    if (!block?.idBarbero || !block?.selectedDate || !block?.selectedTime || Number(block?.duracion_bloque_min || 0) <= 0) {
      return false;
    }
    if (
      block.index > 0
      && bookingBlocksSummary[0]
      && bookingBlocksSummary[0].idBarbero === block.idBarbero
      && bookingBlocksSummary[0].selectedDate === block.selectedDate
      && bookingBlocksSummary[0].selectedTime === block.selectedTime
    ) {
      return true;
    }
    return bookingBlocksSummary.some((candidate) =>
      candidate.id !== block.id
      && candidate.idBarbero === block.idBarbero
      && candidate.selectedDate === block.selectedDate
      && rangesOverlap(
        block.selectedTime,
        block.duracion_bloque_min,
        candidate.selectedTime,
        candidate.duracion_bloque_min
      )
    );
  }, [bookingBlocksSummary]);

  const allBlocksComplete = useMemo(
    () => bookingBlocksSummary.length > 0
      && bookingBlocksSummary.every((block) => block.isComplete && !hasBlockingGroupConflict(block)),
    [bookingBlocksSummary, hasBlockingGroupConflict]
  );
  const holdExpiresAtIso = useMemo(() => {
    if (holdResult?.expires_at) return holdResult.expires_at;
    if (!holdCountdownStartedAt) return null;
    return new Date(holdCountdownStartedAt + holdDurationMin * 60 * 1000).toISOString();
  }, [holdCountdownStartedAt, holdDurationMin, holdResult?.expires_at]);
  const holdRemainingMs = useMemo(() => {
    if (!holdExpiresAtIso) return null;
    const expiresAt = new Date(holdExpiresAtIso);
    if (Number.isNaN(expiresAt.getTime())) return null;
    return Math.max(expiresAt.getTime() - countdownNow, 0);
  }, [holdExpiresAtIso, countdownNow]);
  const holdExpired = holdRemainingMs != null && holdRemainingMs <= 0;

  const canAddCompanionBlock = useMemo(
    () => bookingBlocks.length < (MAX_COMPANIONS + 1),
    [bookingBlocks.length]
  );

  const monthRange = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const from = toDateKey(new Date(year, month, 1));
    const to = toDateKey(new Date(year, month + 1, 0));
    return { from, to };
  }, [currentMonth]);

  const isPastSlotForToday = useCallback((dateKey, timeKey) => {
    if (!dateKey || !timeKey) return false;
    if (dateKey !== minBookingDateKey) return false;
    return String(timeKey).slice(0, 5) < getCurrentTimeKeyInTimeZone();
  }, [minBookingDateKey]);

  const clearSlotConflict = useCallback(() => {
    setSlotConflict(null);
    setSlotSuggestions([]);
    setSlotSuggestionsLoading(false);
  }, []);

  const buildFieldErrorKey = useCallback((blockIndex, field) => `${Math.max(Number(blockIndex || 0), 0)}:${String(field || '')}`, []);

  const setFieldError = useCallback((blockIndex, field, message) => {
    const key = buildFieldErrorKey(blockIndex, field);
    setFieldErrors((prev) => ({
      ...prev,
      [key]: String(message || '').trim() || 'Dato inválido',
    }));
  }, [buildFieldErrorKey]);

  const resetAvailabilityViewState = useCallback((options = {}) => {
    const { clearError = true } = options;
    setSlots(buildDefaultSlots());
    if (clearError) {
      setAvailabilityError('');
    }
    clearSlotConflict();
  }, [clearSlotConflict]);

  const clearRequestState = useCallback(() => {
    if (availabilityAbortRef.current) availabilityAbortRef.current.abort();
    if (slotsAbortRef.current) slotsAbortRef.current.abort();
    availabilityCacheRef.current.clear();
    slotsCacheRef.current.clear();
    setAvailabilityMap({});
    setFieldErrors({});
    resetAvailabilityViewState();
  }, [resetAvailabilityViewState]);

  const resetFlowForBranchChange = useCallback(() => {
    setBookingBlocks([createBookingBlock({ alias: 'Titular' })]);
    setActiveBlockIndex(0);
    setPendingCompanionFocusId('');
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
    setHoldCountdownStartedAt(null);
    setCurrentMonth(new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1));
    clearRequestState();
  }, [clearRequestState, minBookingMonth]);

  const syncServicesScrollState = useCallback(() => {
    const scroller = servicesScrollRef.current;
    if (!scroller) {
      setServicesCanScroll(false);
      setServicesAtEnd(true);
      return;
    }

    const canScroll = scroller.scrollHeight > scroller.clientHeight + 2;
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    setServicesCanScroll(canScroll);
    setServicesAtEnd(atEnd);
  }, []);

  const updateBlockAtIndex = useCallback((index, updater) => {
    setBookingBlocks((prev) => {
      if (!prev[index]) return prev;
      const currentBlock = prev[index];
      const nextRaw = typeof updater === 'function'
        ? updater(currentBlock)
        : { ...currentBlock, ...updater };
      const nextBlock = normalizeBookingBlock(nextRaw, index);

      if (areBlocksEqual(currentBlock, nextBlock)) {
        return prev;
      }

      const nextBlocks = [...prev];
      nextBlocks[index] = nextBlock;
      return nextBlocks;
    });
  }, []);

  const fetchContext = useCallback(async () => {
    setContextLoading(true);
    setContextError('');
    try {
      const response = await getPublicBookingContext();
      const payload = response?.data ?? response;
      const nextContext = {
        sucursales: Array.isArray(payload?.sucursales) ? payload.sucursales : [],
        parametros: payload?.parametros || {},
      };
      setContextData(nextContext);
    } catch (err) {
      setContextError(extractMessage(err));
    } finally {
      setContextLoading(false);
    }
  }, []);

  const fetchBranchData = useCallback(async () => {
    if (!selectedBranchId) {
      setBarbers([]);
      setServices([]);
      setPackages([]);
      setPromotions([]);
      setBarbersRefreshing(false);
      setPackagesLoading(false);
      setPromotionsLoading(false);
      return;
    }

    const requestSeq = branchDataRequestSeqRef.current + 1;
    branchDataRequestSeqRef.current = requestSeq;
    const hasExistingBarbers = barbersCountRef.current > 0;
    const hasExistingCatalog = servicesCountRef.current > 0 || packagesCountRef.current > 0;
    const hasExistingPromotions = promotionsCountRef.current > 0;
    setBarbersLoading(!hasExistingBarbers);
    setBarbersRefreshing(hasExistingBarbers);
    setServicesLoading(!hasExistingCatalog);
    setPackagesLoading(!hasExistingCatalog);
    setPromotionsLoading(!hasExistingPromotions);
    setAvailabilityError('');

    try {
      const barbersResponse = await listPublicAgendaBarberos({ id_sucursal: selectedBranchId });
      if (requestSeq !== branchDataRequestSeqRef.current) return;

      const barbersPayload = barbersResponse?.data ?? barbersResponse;
      const nextBarbers = Array.isArray(barbersPayload?.barberos) ? barbersPayload.barberos : [];
      const validBarberIds = new Set(nextBarbers.map((barber) => barber.id_empleado));
      const fallbackBarberId = nextBarbers[0]?.id_empleado || '';
      const scopedBarberId = activeBlockBarberId && validBarberIds.has(activeBlockBarberId)
        ? activeBlockBarberId
        : '';

      const [servicesResponse, packagesResponse, promotionsResponse] = await Promise.all([
        listPublicCatalogServicios({
          id_sucursal: selectedBranchId,
          id_barbero: scopedBarberId || undefined,
        }),
        listPublicCatalogPaquetes({
          id_sucursal: selectedBranchId,
          id_barbero: scopedBarberId || undefined,
        }),
        listPublicAgendaPromociones({
          id_sucursal: selectedBranchId,
        }),
      ]);
      if (requestSeq !== branchDataRequestSeqRef.current) return;

      const servicesPayload = servicesResponse?.data ?? servicesResponse;
      const nextServices = Array.isArray(servicesPayload?.servicios)
        ? servicesPayload.servicios.filter(
          (service) => service?.activo !== false && service?.agendable && !service?.servicio_informativo
        )
          : [];
      const validServiceIds = new Set(nextServices.map((service) => service.id_servicio));
      const packagesPayload = packagesResponse?.data ?? packagesResponse;
      const nextPackages = Array.isArray(packagesPayload?.paquetes)
        ? packagesPayload.paquetes
        : [];
      const validPackageIds = new Set(nextPackages.map((pkg) => pkg.id_paquete));
      const promotionsPayload = promotionsResponse?.data ?? promotionsResponse;
      const nextPromotions = Array.isArray(promotionsPayload?.promociones)
        ? promotionsPayload.promociones
        : [];
      const validPromotionIds = new Set(nextPromotions.map((promotion) => String(promotion?.id_promocion || '').trim()).filter(Boolean));

      setBarbers(nextBarbers);
      setServices(nextServices);
      setPackages(nextPackages);
      setPromotions(nextPromotions);

      setBookingBlocks((prev) => {
        const sourceBlocks = prev.length > 0
          ? prev
          : [createBookingBlock({ alias: 'Titular', idBarbero: fallbackBarberId })];

        let hasChanges = false;
        const normalizedSource = sourceBlocks.map((block, index) => normalizeBookingBlock(block, index));

        const nextBlocks = normalizedSource.map((block) => {
          const nextBarberId = validBarberIds.has(block.idBarbero)
            ? block.idBarbero
            : fallbackBarberId;
          const nextServiceIds = block.serviceIds.filter((serviceId) => validServiceIds.has(serviceId));
          const nextPackageId = validPackageIds.has(block.packageId)
            ? block.packageId
            : '';
          const nextPromotionId = validPromotionIds.has(block.promotionId)
            ? block.promotionId
            : '';
          const normalizedSelectionType = nextPackageId && nextServiceIds.length > 0
            ? 'mixed'
            : nextPackageId
              ? 'package'
              : 'services';

          if (
            block.idBarbero === nextBarberId
            && areServiceIdsEqual(block.serviceIds, nextServiceIds)
            && block.selectionType === normalizedSelectionType
            && block.packageId === nextPackageId
            && block.promotionId === nextPromotionId
          ) {
            return block;
          }

          hasChanges = true;
          return {
            ...block,
            idBarbero: nextBarberId,
            selectionType: normalizedSelectionType,
            packageId: nextPackageId,
            serviceIds: nextServiceIds,
            promotionId: nextPromotionId,
            selectedDate: '',
            selectedTime: '',
          };
        });

        return hasChanges ? nextBlocks : normalizedSource;
      });
    } catch (err) {
      if (requestSeq !== branchDataRequestSeqRef.current) return;
      const message = extractMessage(err);
      setAvailabilityError(message);
      notifications.error(message, { dedupeKey: 'public-booking-branch-data-error' });
    } finally {
      if (requestSeq === branchDataRequestSeqRef.current) {
        setBarbersLoading(false);
        setBarbersRefreshing(false);
        setServicesLoading(false);
        setPackagesLoading(false);
        setPromotionsLoading(false);
      }
    }
  }, [activeBlockBarberId, notifications, selectedBranchId]);

  const fetchAvailability = useCallback(async () => {
    const hasSelection = Boolean(selectedPackageId) || serviceIds.length > 0;
    if (!selectedBranchId || !hasSelection) {
      setAvailabilityMap({});
      setAvailabilityLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId || 'auto', selectionCacheKey, monthRange.from, monthRange.to].join('|');
    const cached = availabilityCacheRef.current.get(cacheKey);
    if (cached) {
      setAvailabilityMap(cached);
      setAvailabilityError('');

      const shouldValidateSelectedDate = selectedDate >= monthRange.from && selectedDate <= monthRange.to;
      if (selectedDate && (selectedDate < minBookingDateKey || (shouldValidateSelectedDate && !cached[selectedDate]?.disponible))) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedDate: '',
          selectedTime: '',
        }));
      }
      return;
    }

    if (availabilityAbortRef.current) {
      availabilityAbortRef.current.abort();
    }

    const controller = new AbortController();
    availabilityAbortRef.current = controller;
    const requestSeq = availabilityRequestSeqRef.current + 1;
    availabilityRequestSeqRef.current = requestSeq;

    setAvailabilityLoading(true);
    setAvailabilityError('');

    try {
      const response = await listPublicAgendaDisponibilidad(
        {
          id_sucursal: selectedBranchId,
          id_barbero: activeBlockBarberId || undefined,
          selection_type: effectiveSelectionType,
          servicios: serviceIds.length > 0 ? serviceIds.join(',') : undefined,
          id_paquete: selectedPackageId || undefined,
          fecha_desde: monthRange.from,
          fecha_hasta: monthRange.to,
        },
        { signal: controller.signal }
      );

      if (requestSeq !== availabilityRequestSeqRef.current) return;

      const payload = response?.data ?? response;
      const list = Array.isArray(payload?.disponibilidad) ? payload.disponibilidad : [];
      const nextMap = list.reduce((acc, item) => {
        if (!item?.fecha) return acc;
        acc[item.fecha] = item;
        return acc;
      }, {});

      availabilityCacheRef.current.set(cacheKey, nextMap);
      setAvailabilityMap(nextMap);

      const shouldValidateSelectedDate = selectedDate >= monthRange.from && selectedDate <= monthRange.to;
      if (selectedDate && (selectedDate < minBookingDateKey || (shouldValidateSelectedDate && !nextMap[selectedDate]?.disponible))) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedDate: '',
          selectedTime: '',
        }));
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (requestSeq !== availabilityRequestSeqRef.current) return;
      const message = extractMessage(err);
      setAvailabilityError(message);
    } finally {
      if (requestSeq === availabilityRequestSeqRef.current) {
        setAvailabilityLoading(false);
      }
    }
  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    minBookingDateKey,
    monthRange.from,
    monthRange.to,
    selectedBranchId,
    selectedDate,
    selectionCacheKey,
    effectiveSelectionType,
    selectedPackageId,
    serviceIds,
    updateBlockAtIndex,
  ]);

  const fetchSlots = useCallback(async () => {
    const hasSelection = Boolean(selectedPackageId) || serviceIds.length > 0;
    if (!selectedBranchId || !hasSelection || !selectedDate) {
      setSlots(buildDefaultSlots());
      setSlotMetrics({ duracionTotalMin: 0, bufferTotalMin: 0 });
      setSlotsLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId || 'auto', selectionCacheKey, selectedDate].join('|');
    const cached = slotsCacheRef.current.get(cacheKey);
    if (cached) {
      setSlots(cached.slots);
      setSlotMetrics(cached.metrics);
      return;
    }

    if (slotsAbortRef.current) {
      slotsAbortRef.current.abort();
    }

    const controller = new AbortController();
    slotsAbortRef.current = controller;
    const requestSeq = slotsRequestSeqRef.current + 1;
    slotsRequestSeqRef.current = requestSeq;
    setSlotsLoading(true);

    try {
      const response = await listPublicAgendaHorarios(
        {
          id_sucursal: selectedBranchId,
          id_barbero: activeBlockBarberId || undefined,
          selection_type: effectiveSelectionType,
          servicios: serviceIds.length > 0 ? serviceIds.join(',') : undefined,
          id_paquete: selectedPackageId || undefined,
          fecha: selectedDate,
        },
        { signal: controller.signal }
      );

      if (requestSeq !== slotsRequestSeqRef.current) return;

      const payload = response?.data ?? response;
      const mapped = buildDynamicSlots({
        horarios: payload?.horarios,
        duracionTotalMin: payload?.duracion_total_min,
      });
      const metrics = {
        duracionTotalMin: Number(payload?.duracion_total_min || 0),
        bufferTotalMin: Number(payload?.buffer_total_min || 0),
      };

      slotsCacheRef.current.set(cacheKey, { slots: mapped, metrics });
      setSlots(mapped);
      setSlotMetrics(metrics);

      const currentSelectedTime = selectedTimeRef.current;
      if (currentSelectedTime && !mapped.some((slot) => slot.hora === currentSelectedTime && slot.disponible)) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedTime: '',
        }));
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (requestSeq !== slotsRequestSeqRef.current) return;
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-slots-error' });
    } finally {
      if (requestSeq === slotsRequestSeqRef.current) {
        setSlotsLoading(false);
      }
    }
  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    notifications,
    selectedBranchId,
    selectedDate,
    selectionCacheKey,
    effectiveSelectionType,
    selectedPackageId,
    serviceIds,
    updateBlockAtIndex,
  ]);

  const fetchSlotsForBarber = useCallback(async ({
    barberId,
    dateKey,
    selectionTypeValue,
    servicesCsvValue,
    packageIdValue,
  }) => {
    const hasSelection = Boolean(packageIdValue) || Boolean(servicesCsvValue);
    if (!selectedBranchId || !barberId || !dateKey || !hasSelection) {
      return buildDefaultSlots();
    }

    const selectionKey = `type:${selectionTypeValue}|package:${packageIdValue || ''}|services:${servicesCsvValue || ''}`;
    const cacheKey = [selectedBranchId, barberId, selectionKey, dateKey].join('|');
    const cached = slotsCacheRef.current.get(cacheKey);
    if (cached) return cached.slots;

    const response = await listPublicAgendaHorarios({
      id_sucursal: selectedBranchId,
      id_barbero: barberId,
      selection_type: selectionTypeValue,
      servicios: servicesCsvValue || undefined,
      id_paquete: packageIdValue || undefined,
      fecha: dateKey,
    });

    const payload = response?.data ?? response;
    const mapped = buildDynamicSlots({
      horarios: payload?.horarios,
      duracionTotalMin: payload?.duracion_total_min,
    });
    slotsCacheRef.current.set(cacheKey, {
      slots: mapped,
      metrics: {
        duracionTotalMin: Number(payload?.duracion_total_min || 0),
        bufferTotalMin: Number(payload?.buffer_total_min || 0),
      },
    });
    return mapped;
  }, [selectedBranchId]);

  const findBlockCollision = useCallback((barberId, dateKey, timeKey, durationMinutes, ignoreIndex) => {
    if (!barberId || !dateKey || !timeKey || Number(durationMinutes || 0) <= 0) return null;
    return bookingBlocksSummary.find((block) =>
      block.index !== ignoreIndex
      && block.idBarbero === barberId
      && block.selectedDate === dateKey
      && rangesOverlap(timeKey, durationMinutes, block.selectedTime, block.duracion_bloque_min)) || null;
  }, [bookingBlocksSummary]);

  const loadSlotSuggestions = useCallback(async ({
    barberId,
    dateKey,
    timeKey,
    selectionTypeValue,
    servicesCsvValue,
    packageIdValue,
  }) => {
    const hasSelection = Boolean(packageIdValue) || Boolean(servicesCsvValue);
    if (!barberId || !dateKey || !timeKey || !hasSelection) {
      setSlotSuggestions([]);
      setSlotSuggestionsLoading(false);
      return;
    }

    const barberCandidates = (Array.isArray(barbers) ? barbers : [])
      .filter((barber) => barber?.id_empleado && barber.id_empleado !== barberId);
    if (!barberCandidates.length) {
      setSlotSuggestions([]);
      setSlotSuggestionsLoading(false);
      return;
    }

    const requestSeq = slotSuggestionRequestSeqRef.current + 1;
    slotSuggestionRequestSeqRef.current = requestSeq;
    setSlotSuggestionsLoading(true);
    setSlotSuggestions([]);

    try {
      const results = await Promise.all(
        barberCandidates.map(async (barber) => {
          try {
            const barberSlots = await fetchSlotsForBarber({
              barberId: barber.id_empleado,
              dateKey,
              selectionTypeValue,
              servicesCsvValue,
              packageIdValue,
            });
            const isAvailable = barberSlots.some((slot) => slot.hora === timeKey && slot.disponible);
            if (!isAvailable) return null;
            return {
              idBarbero: barber.id_empleado,
              nombreBarbero: barber.nombre_completo || 'Barbero',
            };
          } catch {
            return null;
          }
        })
      );

      if (requestSeq !== slotSuggestionRequestSeqRef.current) return;
      setSlotSuggestions(results.filter(Boolean));
    } finally {
      if (requestSeq === slotSuggestionRequestSeqRef.current) {
        setSlotSuggestionsLoading(false);
      }
    }
  }, [barbers, fetchSlotsForBarber]);

  const invalidateAgendaCaches = useCallback(() => {
    availabilityCacheRef.current.clear();
    slotsCacheRef.current.clear();
  }, []);

  const refreshRealtimeAgenda = useCallback(() => {
    invalidateAgendaCaches();
    void fetchAvailability();
    if (selectedDate) {
      void fetchSlots();
    }
  }, [fetchAvailability, fetchSlots, invalidateAgendaCaches, selectedDate]);

  usePublicAgendaRealtime({
    barberId: activeBlockBarberId,
    dateKey: selectedDate,
    enabled: Boolean(selectedBranchId && activeBlockBarberId && (selectedPackageId || serviceIds.length > 0)),
    onInvalidate: refreshRealtimeAgenda,
  });

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    if (!branchList.length) {
      setSelectedBranchId('');
      return;
    }

    setSelectedBranchId((prev) =>
      branchList.some((branch) => branch.id_sucursal === prev) ? prev : branchList[0]?.id_sucursal || ''
    );
  }, [branchList]);

  useEffect(() => {
    void fetchBranchData();
  }, [fetchBranchData]);

  useEffect(() => {
    if (!canUseClienteHold) return;
    if (!selectedBranchId) return;
    const titular = bookingBlocks[0];
    if (titular?.selectionType === 'package') return;
    if (!titular || Array.isArray(titular.serviceIds) && titular.serviceIds.length > 0) return;
    const availableServices = Array.isArray(services) ? services : [];
    if (availableServices.length === 0) return;

    const prefillKey = `${selectedBranchId}:${availableServices.map((service) => service?.id_servicio).filter(Boolean).join(",")}`;
    if (membershipPrefillKeysRef.current.has(prefillKey)) return;

    let cancelled = false;
    // AM: Propone automáticamente el primer servicio cubierto por plan para el titular sin forzar selección múltiple.
    (async () => {
      try {
        const response = await getClienteMembershipEstado();
        if (cancelled) return;
        const payload = response?.data ?? response;
        const remanentes = Array.isArray(payload?.plan_activo?.remanentes?.servicios)
          ? payload.plan_activo.remanentes.servicios
          : [];
        const coveredServiceIds = remanentes
          .filter((item) => Number(item?.restante || 0) > 0)
          .map((item) => String(item?.id_servicio || "").trim())
          .filter(Boolean);
        if (coveredServiceIds.length === 0) {
          membershipPrefillKeysRef.current.add(prefillKey);
          return;
        }

        const availableServiceIds = new Set(availableServices.map((item) => String(item?.id_servicio || "").trim()).filter(Boolean));
        const suggestedId = coveredServiceIds.find((serviceId) => availableServiceIds.has(serviceId));
        if (!suggestedId) {
          membershipPrefillKeysRef.current.add(prefillKey);
          return;
        }

        setBookingBlocks((prev) => {
          const base = Array.isArray(prev) && prev.length > 0 ? prev : [createBookingBlock({ alias: "Titular" })];
          const currentTitular = normalizeBookingBlock(base[0], 0);
          if (Array.isArray(currentTitular.serviceIds) && currentTitular.serviceIds.length > 0) return prev;
          const nextTitular = normalizeBookingBlock(
            {
              ...currentTitular,
              selectionType: "services",
              packageId: "",
              serviceIds: [suggestedId],
              selectedTime: "",
            },
            0
          );
          const next = [...base];
          next[0] = nextTitular;
          return next;
        });

        membershipPrefillKeysRef.current.add(prefillKey);
        notifications.info("Seleccionamos automáticamente un servicio cubierto por tu plan para agilizar tu reserva.", {
          dedupeKey: "public-booking-membership-prefill",
        });
      } catch {
        // AM: Fallback silencioso; el flujo de booking debe continuar sin depender de membresía.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingBlocks, canUseClienteHold, notifications, selectedBranchId, services]);

  useEffect(() => {
    if (!selectedBranchId) return;
    void fetchAvailability();
  }, [fetchAvailability, selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) return;
    void fetchSlots();
  }, [fetchSlots, selectedBranchId]);

  useEffect(() => {
    return () => {
      if (availabilityAbortRef.current) availabilityAbortRef.current.abort();
      if (slotsAbortRef.current) slotsAbortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (bookingBlocks[activeBlockIndex]) return;
    setActiveBlockIndex(0);
  }, [activeBlockIndex, bookingBlocks]);

  useEffect(() => {
    clearSlotConflict();
  }, [activeBlockBarberId, clearSlotConflict, effectiveActiveBlockIndex, selectedDate, selectionCacheKey]);

  useEffect(() => {
    setBookingBlocks((prev) => {
      let changed = false;
      const nextBlocks = prev.map((block, index) => {
        if (!block?.selectedDate || block.selectedDate >= minBookingDateKey) {
          return block;
        }
        changed = true;
        return normalizeBookingBlock(
          {
            ...block,
            selectedDate: '',
            selectedTime: '',
          },
          index
        );
      });
      return changed ? nextBlocks : prev;
    });
  }, [minBookingDateKey]);

  useEffect(() => {
    const nextTitularDate = String(titularSelectedDate || '').trim();
    setBookingBlocks((prev) => {
      let changed = false;
      const next = prev.map((block, index) => {
        if (index === 0) return block;
        if (block.selectedDate === nextTitularDate) return block;
        changed = true;
        return normalizeBookingBlock(
          {
            ...block,
            selectedDate: nextTitularDate,
            selectedTime: '',
          },
          index
        );
      });
      return changed ? next : prev;
    });
  }, [titularSelectedDate]);

  useEffect(() => {
    // JK: Si cambia catálogo o selección objetivo, remueve promociones que ya no aplican para evitar estados engañosos.
    setBookingBlocks((prev) => {
      let changed = false;
      const nextBlocks = prev.map((block) => {
        const currentPromotionId = String(block?.promotionId || '').trim();
        if (!currentPromotionId) return block;
        const promotion = promotionsById.get(currentPromotionId);
        if (!promotion) {
          changed = true;
          return { ...block, promotionId: '' };
        }
        const evaluation = evaluatePromotionForBlock({
          block,
          promotion,
          servicesById,
          packagesById,
        });
        if (evaluation.canSelect) return block;
        changed = true;
        return { ...block, promotionId: '' };
      });
      return changed ? nextBlocks : prev;
    });
  }, [bookingBlocks, packagesById, promotionsById, servicesById]);

  useEffect(() => {
    if (!selectedDate || !selectedTime) return;
    if (!isPastSlotForToday(selectedDate, selectedTime)) return;
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      selectedTime: '',
    }));
  }, [
    effectiveActiveBlockIndex,
    isPastSlotForToday,
    selectedDate,
    selectedTime,
    updateBlockAtIndex,
  ]);

  useEffect(() => {
    if (effectiveActiveBlockIndex <= 0) return;
    if (!activeBlockBarberId || !selectedDate || !selectedTime) return;
    const hasConflict = bookingBlocksSummary.some((block) =>
      block.index !== effectiveActiveBlockIndex
      && block.idBarbero === activeBlockBarberId
      && block.selectedDate === selectedDate
      && rangesOverlap(selectedTime, selectedBlockTotalMinutes, block.selectedTime, block.duracion_bloque_min)
    );
    if (!hasConflict) return;
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      selectedTime: '',
    }));
  }, [
    activeBlockBarberId,
    bookingBlocksSummary,
    effectiveActiveBlockIndex,
    selectedBlockTotalMinutes,
    selectedDate,
    selectedTime,
    updateBlockAtIndex,
  ]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/confirmar')) return;
    if (!selectedBranchId || !selectedBarberId) {
      navigate('/agendar/barberos', { replace: true });
      return;
    }
    if (!allBlocksComplete) {
      navigate('/agendar/agenda', { replace: true });
    }
  }, [location.pathname, navigate, selectedBranchId, selectedBarberId, allBlocksComplete]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/pagar')) return;
    if (!holdResult) {
      navigate('/agendar/confirmar', { replace: true });
      return;
    }
    if (paymentResult?.booking_confirmed) {
      navigate('/agendar/exito', { replace: true });
    }
  }, [holdResult, location.pathname, navigate, paymentResult?.booking_confirmed]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/agenda')) return;
    if (!selectedBranchId || !selectedBarberId) {
      navigate('/agendar/barberos', { replace: true });
    }
  }, [location.pathname, navigate, selectedBarberId, selectedBranchId]);

  useEffect(() => {
    if (paymentResult?.booking_confirmed && location.pathname !== '/agendar/exito') {
      navigate('/agendar/exito', { replace: true });
    }
  }, [location.pathname, navigate, paymentResult?.booking_confirmed]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/exito')) return;
    if (!paymentResult?.booking_confirmed) {
      navigate('/agendar/barberos', { replace: true });
    }
  }, [location.pathname, navigate, paymentResult?.booking_confirmed]);

  useEffect(() => {
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
    if (!allBlocksComplete) {
      setHoldCountdownStartedAt(null);
      return;
    }
    setHoldCountdownStartedAt(Date.now());
  }, [selectedBranchId, bookingBlocks, allBlocksComplete]);

  useEffect(() => {
    if (!holdExpiresAtIso) return undefined;
    setCountdownNow(Date.now());
    const intervalId = setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, [holdExpiresAtIso]);

  const selectBranch = useCallback(
    (nextBranchId) => {
      if (!nextBranchId || nextBranchId === selectedBranchId) return;
      resetFlowForBranchChange();
      setSelectedBranchId(nextBranchId);
      navigate('/agendar/barberos');
    },
    [navigate, resetFlowForBranchChange, selectedBranchId]
  );

  const selectBarber = useCallback((barberId) => {
    if (!barberId) return;
    clearRequestState();
    setActiveBlockIndex(0);
    updateBlockAtIndex(0, (currentBlock) => ({
      ...currentBlock,
      idBarbero: barberId,
      selectionType: 'services',
      selectedDate: '',
      selectedTime: '',
    }));
    navigate('/agendar/agenda');
  }, [clearRequestState, navigate, updateBlockAtIndex]);

  const setActiveBlock = useCallback((nextIndex) => {
    const parsed = Number(nextIndex);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(bookingBlocks.length - 1, Math.trunc(parsed)));
    setActiveBlockIndex(clamped);
    resetAvailabilityViewState();
  }, [bookingBlocks.length, resetAvailabilityViewState]);

  const addCompanionBlock = useCallback(() => {
    let createdBlockId = '';
    setBookingBlocks((prev) => {
      if (prev.length >= (MAX_COMPANIONS + 1)) return prev;
      const source = prev.length > 0 ? prev : [createBookingBlock({ alias: 'Titular' })];
      const companionNumber = source.length;
      const inheritedBarberId = source[effectiveActiveBlockIndex]?.idBarbero || source[0]?.idBarbero || '';
      const inheritedDate = source[0]?.selectedDate || '';
      const nextBlock = normalizeBookingBlock(
        {
          ...createBookingBlock({
            alias: `Acompañante ${companionNumber}`,
            idBarbero: inheritedBarberId,
          }),
          selectedDate: inheritedDate,
          selectedTime: '',
        },
        companionNumber
      );
      createdBlockId = nextBlock.id;
      const nextBlocks = [...source, nextBlock];
      setActiveBlockIndex(nextBlocks.length - 1);
      return nextBlocks;
    });
    if (createdBlockId) {
      setPendingCompanionFocusId(createdBlockId);
    }
    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState]);

  const consumePendingCompanionFocus = useCallback((blockId) => {
    const normalizedId = String(blockId || '').trim();
    setPendingCompanionFocusId((current) => {
      if (!current) return '';
      if (!normalizedId || current === normalizedId) return '';
      return current;
    });
  }, []);

  const removeCompanionBlock = useCallback((blockId) => {
    const normalizedId = String(blockId || '').trim();
    if (!normalizedId) return;
    let removedIndex = -1;
    setBookingBlocks((prev) => {
      if (prev.length <= 1) return prev;
      const targetIndex = prev.findIndex((item, index) => index > 0 && item.id === normalizedId);
      if (targetIndex < 1) return prev;
      removedIndex = targetIndex;
      const nextRaw = prev.filter((item) => item.id !== normalizedId);
      const nextBlocks = nextRaw.map((item, index) => normalizeBookingBlock({
        ...item,
        alias: index === 0 ? 'Titular' : (item.contactName || `Acompañante ${index}`),
      }, index));
      setActiveBlockIndex((current) => {
        if (current > targetIndex) return current - 1;
        if (current === targetIndex) return Math.max(0, current - 1);
        return current;
      });
      return nextBlocks;
    });
    if (removedIndex > 0) {
      setFieldErrors((prev) => {
        const next = {};
        Object.entries(prev).forEach(([key, value]) => {
          const [rawIndex, field] = key.split(':');
          const parsedIndex = Number(rawIndex);
          if (!Number.isFinite(parsedIndex)) return;
          if (parsedIndex === removedIndex) return;
          const newIndex = parsedIndex > removedIndex ? parsedIndex - 1 : parsedIndex;
          next[`${newIndex}:${field}`] = value;
        });
        return next;
      });
    }
    clearSlotConflict();
    resetAvailabilityViewState();
  }, [clearSlotConflict, resetAvailabilityViewState]);

  const goToAgenda = useCallback(() => {
    if (holdResult) return;
    if (!selectedBranchId || !selectedBarberId) return;
    navigate('/agendar/agenda');
  }, [
    holdResult,
    selectedBranchId,
    selectedBarberId,
    navigate,
  ]);

  const goToBarberos = useCallback(() => {
    if (holdResult) return;
    navigate('/agendar/barberos');
  }, [holdResult, navigate]);

  const goToConfirm = useCallback(() => {
    if (holdResult) return;
    if (!allBlocksComplete) return;
    navigate('/agendar/confirmar');
  }, [allBlocksComplete, holdResult, navigate]);

  const completeBookingFlow = useCallback(() => {
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
    setHoldCountdownStartedAt(null);
    resetFlowForBranchChange();
    navigate('/', { replace: true });
  }, [navigate, resetFlowForBranchChange]);

  const closeAuthRequiredModal = useCallback(() => {
    setAuthRequiredModal({ open: false, email: '' });
  }, []);

  const openAuthRequiredModal = useCallback((email) => {
    setAuthRequiredModal({
      open: true,
      email: String(email || '').trim().toLowerCase(),
    });
  }, []);

  const goToLoginForBooking = useCallback(() => {
    const nextTarget = '/agendar/barberos';
    const params = new URLSearchParams();
    params.set('next', nextTarget);
    params.set('intent', 'agendar');
    navigate(`/login?${params.toString()}`);
    closeAuthRequiredModal();
  }, [closeAuthRequiredModal, navigate]);

  const toggleService = useCallback((serviceId) => {
    if (!serviceId) return;
    const currentBlock = bookingBlocks[effectiveActiveBlockIndex];
    const contactName = String(currentBlock?.contactName || '').trim();
    if (!contactName) {
      notifications.warning(
        effectiveActiveBlockIndex === 0
          ? 'Completa el nombre del titular antes de elegir servicios.'
          : 'Completa el nombre del acompañante antes de elegir servicios.',
        { dedupeKey: 'public-booking-contact-name-required' }
      );
      return;
    }

    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const normalizedCurrent = normalizeBookingBlock(currentBlock, effectiveActiveBlockIndex);
      const exists = currentBlock.serviceIds.includes(serviceId);
      const nextServiceIds = exists
        ? currentBlock.serviceIds.filter((id) => id !== serviceId)
        : [...currentBlock.serviceIds, serviceId];

      return {
        ...normalizedCurrent,
        selectionType: normalizedCurrent.packageId ? 'mixed' : 'services',
        serviceIds: nextServiceIds,
        selectedDate: (nextServiceIds.length > 0 || normalizedCurrent.packageId) ? currentBlock.selectedDate : '',
        selectedTime: '',
      };
    });

    resetAvailabilityViewState();
  }, [bookingBlocks, effectiveActiveBlockIndex, notifications, resetAvailabilityViewState, updateBlockAtIndex]);

  const selectSelectionType = useCallback((nextType) => {
    const normalizedType = String(nextType || '').trim().toLowerCase() === 'package' ? 'package' : 'services';
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const normalizedCurrent = normalizeBookingBlock(currentBlock, effectiveActiveBlockIndex);
      if (normalizedType === 'services' && normalizedCurrent.packageId && normalizedCurrent.serviceIds.length > 0) {
        return { ...normalizedCurrent, selectionType: 'mixed' };
      }
      if (normalizedCurrent.selectionType === normalizedType) {
        return normalizedCurrent;
      }
      return {
        ...normalizedCurrent,
        selectionType: normalizedType,
        selectedDate: '',
        selectedTime: '',
      };
    });
    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState, updateBlockAtIndex]);

  const selectPackage = useCallback((packageId) => {
    const normalizedId = String(packageId || '').trim();
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const normalizedCurrent = normalizeBookingBlock(currentBlock, effectiveActiveBlockIndex);
      const nextPackageId = normalizedCurrent.packageId === normalizedId ? '' : normalizedId;
      const nextType = nextPackageId && normalizedCurrent.serviceIds.length > 0
        ? 'mixed'
        : nextPackageId
          ? 'package'
          : 'services';
      return {
        ...normalizedCurrent,
        selectionType: nextType,
        packageId: nextPackageId,
        selectedDate: (nextPackageId || normalizedCurrent.serviceIds.length > 0) ? currentBlock.selectedDate : '',
        selectedTime: '',
      };
    });
    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState, updateBlockAtIndex]);

  const selectPromotion = useCallback((promotionId) => {
    if (!selectedBranchId) {
      notifications.warning('Selecciona una sucursal antes de elegir una promoción.', {
        dedupeKey: 'public-booking-promotion-branch-required',
      });
      return;
    }

    const normalizedPromotionId = String(promotionId || '').trim();
    if (!normalizedPromotionId) {
      updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
        ...currentBlock,
        promotionId: '',
      }));
      return;
    }

    const promotion = promotionsById.get(normalizedPromotionId) || null;
    if (!promotion) return;
    const currentBlock = bookingBlocks[effectiveActiveBlockIndex];
    if (!currentBlock) return;
    const evaluation = evaluatePromotionForBlock({
      block: currentBlock,
      promotion,
      servicesById,
      packagesById,
    });
    if (!evaluation.canSelect) {
      notifications.warning(evaluation.disabledReason || 'Esta promoción no aplica a la selección actual.', {
        dedupeKey: 'public-booking-promotion-target-required',
      });
      return;
    }

    updateBlockAtIndex(effectiveActiveBlockIndex, (activeCurrentBlock) => {
      const currentPromotionId = String(activeCurrentBlock?.promotionId || '').trim();
      return {
        ...activeCurrentBlock,
        promotionId: currentPromotionId === normalizedPromotionId ? '' : normalizedPromotionId,
      };
    });
  }, [
    bookingBlocks,
    effectiveActiveBlockIndex,
    notifications,
    packagesById,
    promotionsById,
    selectedBranchId,
    servicesById,
    updateBlockAtIndex,
  ]);

  const clearSelectedPromotion = useCallback(() => {
    // JK: Acción explícita para quitar promoción sin alterar servicios ni paquete ya seleccionados.
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      promotionId: '',
    }));
  }, [effectiveActiveBlockIndex, updateBlockAtIndex]);

  const updateActiveBlockBarber = useCallback((barberId) => {
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      idBarbero: String(barberId || '').trim(),
      selectedDate: currentBlock.selectedDate || '',
      selectedTime: '',
    }));

    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState, updateBlockAtIndex]);

  const updateActiveBlockContact = useCallback((patch) => {
    const normalizedPatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactPhone')) {
      normalizedPatch.contactPhone = String(normalizedPatch.contactPhone || '').replace(/[^\d+\s()-]/g, '').slice(0, 24);
    }
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const next = {
        ...currentBlock,
        ...normalizedPatch,
      };
      const normalizedName = String(next.contactName || '').trim();
      next.alias = normalizedName || (effectiveActiveBlockIndex === 0 ? 'Titular' : `Acompañante ${effectiveActiveBlockIndex}`);
      return next;
    });
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactName')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactName')];
        return next;
      });
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactEmail')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactEmail')];
        return next;
      });
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactPhone')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactPhone')];
        return next;
      });
    }
  }, [buildFieldErrorKey, effectiveActiveBlockIndex, updateBlockAtIndex]);

  const selectSuggestedBarber = useCallback((barberId) => {
    const nextBarberId = String(barberId || '').trim();
    if (!nextBarberId) return;

    const preservedDate = slotConflict?.dateKey || selectedDate;
    const preservedTime = slotConflict?.timeKey || '';

    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      idBarbero: nextBarberId,
      selectedDate: preservedDate,
      selectedTime: preservedTime,
    }));

    resetAvailabilityViewState();
  }, [
    effectiveActiveBlockIndex,
    resetAvailabilityViewState,
    selectedDate,
    slotConflict,
    updateBlockAtIndex,
  ]);

  const setMonth = useCallback((delta) => {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    const minMonthStart = new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1);
    if (nextMonth.getTime() < minMonthStart.getTime()) return;
    setCurrentMonth(nextMonth);
  }, [currentMonth, minBookingMonth]);

  const onSelectDay = useCallback((dateKey, enabled) => {
    if (effectiveActiveBlockIndex > 0) return;
    if (!enabled || dateKey < minBookingDateKey) return;

    setBookingBlocks((prev) => {
      const currentBlock = prev[effectiveActiveBlockIndex];
      if (!currentBlock) return prev;

      const nextBlocks = [...prev];
      nextBlocks[effectiveActiveBlockIndex] = normalizeBookingBlock(
        { ...currentBlock, selectedDate: dateKey, selectedTime: '' },
        effectiveActiveBlockIndex
      );

      return nextBlocks;
    });

    clearSlotConflict();
  }, [clearSlotConflict, effectiveActiveBlockIndex, minBookingDateKey]);

  const onSelectTime = useCallback(async (time, enabled) => {
    if (!enabled) return;
    const nextTime = String(time || '').trim().slice(0, 5);
    if (!nextTime || !selectedDate || !activeBlockBarberId) return;

    if (isPastSlotForToday(selectedDate, nextTime)) {
      notifications.warning('No puedes agendar en una hora pasada para hoy.', {
        dedupeKey: 'public-booking-past-time-blocked',
      });
      return;
    }

    const conflictingBlock = findBlockCollision(
      activeBlockBarberId,
      selectedDate,
      nextTime,
      selectedBlockTotalMinutes,
      effectiveActiveBlockIndex
    );

    if (conflictingBlock) {
      setSlotConflict({
        dateKey: selectedDate,
        timeKey: nextTime,
        barberId: activeBlockBarberId,
        conflictingAlias: conflictingBlock.alias || `Integrante ${conflictingBlock.index + 1}`,
      });
      notifications.warning('Ese bloque se solapa con otra reserva del grupo para el mismo barbero.', {
        dedupeKey: 'public-booking-duplicate-barber-slot',
      });
      await loadSlotSuggestions({
        barberId: activeBlockBarberId,
        dateKey: selectedDate,
        timeKey: nextTime,
        selectionTypeValue: effectiveSelectionType,
        servicesCsvValue: serviceIds.join(','),
        packageIdValue: selectedPackageId,
      });
      return;
    }

    clearSlotConflict();
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      selectedTime: nextTime,
    }));
  }, [
    activeBlockBarberId,
    clearSlotConflict,
    effectiveActiveBlockIndex,
    findBlockCollision,
    isPastSlotForToday,
    loadSlotSuggestions,
    notifications,
    selectedDate,
    selectedBlockTotalMinutes,
    effectiveSelectionType,
    selectedPackageId,
    serviceIds,
    updateBlockAtIndex,
  ]);

  const submitHold = useCallback(async () => {
    if (!selectedBranchId || !selectedBarberId) {
      notifications.warning('Debes seleccionar sucursal y barbero.', { dedupeKey: 'public-booking-hold-context' });
      navigate('/agendar/barberos');
      return false;
    }
    if (holdExpired) {
      notifications.warning('El tiempo de confirmación expiró. Reintentaremos con la misma hora si sigue disponible.', {
        dedupeKey: 'public-booking-hold-expired-before-submit',
      });
    }
    const blocksToSubmit = bookingBlocksSummary.filter((block) =>
      Boolean(block.selectedPackage) || block.selectedServices.length > 0
    );
    if (blocksToSubmit.length === 0 || !allBlocksComplete) {
      notifications.warning('Completa servicios, fecha y hora en todos los bloques antes de confirmar.', {
        dedupeKey: 'public-booking-blocks-required',
      });
      navigate('/agendar/agenda');
      return false;
    }
    const nextFieldErrors = {};
    const titularBlock = bookingBlocks[0] || null;
    const titularNombre = String(titularBlock?.contactName || '').trim();
    const titularEmail = String(titularBlock?.contactEmail || '').trim().toLowerCase();
    const titularTelefono = String(titularBlock?.contactPhone || '').trim();
    if (!titularNombre) {
      nextFieldErrors[buildFieldErrorKey(0, 'contactName')] = 'El nombre del titular es obligatorio.';
      notifications.warning('Debes ingresar el nombre del titular antes de confirmar.', {
        dedupeKey: 'public-booking-holder-name-required',
      });
      setActiveBlockIndex(0);
      navigate('/agendar/agenda');
      setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
      return false;
    }
    if (!isValidEmail(titularEmail)) {
      nextFieldErrors[buildFieldErrorKey(0, 'contactEmail')] = 'Ingresa un correo válido del titular.';
      notifications.warning('Debes ingresar un correo válido del titular antes de confirmar.', {
        dedupeKey: 'public-booking-holder-email-required',
      });
      setActiveBlockIndex(0);
      navigate('/agendar/agenda');
      setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
      return false;
    }
    if (hasLetters(titularTelefono) || normalizePhone(titularTelefono).length < 8) {
      nextFieldErrors[buildFieldErrorKey(0, 'contactPhone')] = hasLetters(titularTelefono)
        ? 'El teléfono no admite letras.'
        : 'Ingresa un teléfono válido del titular.';
      notifications.warning('Debes ingresar un teléfono válido del titular antes de confirmar.', {
        dedupeKey: 'public-booking-holder-phone-required',
      });
      setActiveBlockIndex(0);
      navigate('/agendar/agenda');
      setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
      return false;
    }
    for (let index = 1; index < bookingBlocks.length; index += 1) {
      const companion = bookingBlocks[index];
      const companionName = String(companion?.contactName || '').trim();
      const companionEmail = String(companion?.contactEmail || '').trim().toLowerCase();
      if (!companionName) {
        nextFieldErrors[buildFieldErrorKey(index, 'contactName')] = 'El nombre del acompañante es obligatorio.';
        notifications.warning('Cada acompañante debe tener nombre antes de confirmar.', {
          dedupeKey: 'public-booking-companion-name-required-submit',
        });
        setActiveBlockIndex(index);
        navigate('/agendar/agenda');
        setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
        return false;
      }
      if (!isValidEmail(companionEmail)) {
        nextFieldErrors[buildFieldErrorKey(index, 'contactEmail')] = 'El correo del acompañante es obligatorio y debe ser válido.';
        notifications.warning('Cada acompañante debe tener un correo válido antes de confirmar.', {
          dedupeKey: 'public-booking-companion-email-required-submit',
        });
        setActiveBlockIndex(index);
        navigate('/agendar/agenda');
        setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
        return false;
      }
    }
    setFieldErrors({});
    const selectedSlotMap = new Map();
    const resolvedBarberByBlockId = new Map();
    let autoAssignedCompanion = false;
    for (const block of blocksToSubmit) {
      if (isPastSlotForToday(block.selectedDate, block.selectedTime)) {
        notifications.warning('No puedes confirmar una cita en hora pasada para hoy.', {
          dedupeKey: 'public-booking-submit-past-time',
        });
        setActiveBlockIndex(block.index);
        navigate('/agendar/agenda');
        return false;
      }
      if (block.idBarbero) {
        const collisionKey = `${block.idBarbero}|${block.selectedDate}`;
        const previous = (selectedSlotMap.get(collisionKey) || []).find((candidate) =>
          rangesOverlap(
            block.selectedTime,
            block.duracion_bloque_min,
            candidate.selectedTime,
            candidate.duracion_bloque_min
          )
        );
        if (previous) {
          if (block.index > 0) {
            resolvedBarberByBlockId.set(block.id, null);
            autoAssignedCompanion = true;
            continue;
          }
          setSlotConflict({
            dateKey: block.selectedDate,
            timeKey: block.selectedTime,
            barberId: block.idBarbero,
            conflictingAlias: previous.alias || 'Integrante',
          });
          notifications.warning('Hay integrantes con bloques que se solapan para el mismo barbero. Debes cambiar uno de ellos.', {
            dedupeKey: 'public-booking-submit-duplicate-slot',
          });
          setActiveBlockIndex(block.index);
          navigate('/agendar/agenda');
          await loadSlotSuggestions({
            barberId: block.idBarbero,
            dateKey: block.selectedDate,
            timeKey: block.selectedTime,
            selectionTypeValue: block.selection_type,
            servicesCsvValue: Array.isArray(block.serviceIds) ? block.serviceIds.join(',') : '',
            packageIdValue: block.selectedPackage?.id_paquete || '',
            });
          return false;
        }
        const currentEntries = selectedSlotMap.get(collisionKey) || [];
        currentEntries.push(block);
        selectedSlotMap.set(collisionKey, currentEntries);
        resolvedBarberByBlockId.set(block.id, block.idBarbero);
      } else {
        resolvedBarberByBlockId.set(block.id, null);
        if (block.index > 0) autoAssignedCompanion = true;
      }
    }
    if (autoAssignedCompanion) {
      notifications.info('Uno o más acompañantes serán asignados automáticamente con barbero disponible en ese horario.', {
        dedupeKey: 'public-booking-autoassign-companion-info',
      });
    }
    const integrantes = [];
    for (const block of blocksToSubmit) {
      const fechaInicio = toLocalDateTimeWithOffset(block.selectedDate, block.selectedTime);
      if (!fechaInicio) {
        notifications.error('No se pudo construir la fecha y hora de una de las citas del grupo.', {
          dedupeKey: 'public-booking-datetime-invalid',
        });
        return false;
      }
        integrantes.push({
          orden_integrante: block.index + 1,
          alias: block.contactName || block.alias,
          id_barbero: resolvedBarberByBlockId.has(block.id)
            ? resolvedBarberByBlockId.get(block.id)
            : (block.idBarbero || null),
          selection_type: block.selection_type,
          id_paquete: ['package', 'mixed'].includes(block.selection_type) ? (block.selectedPackage?.id_paquete || null) : null,
          contacto: {
            nombre: String(block.contactName || block.alias || '').trim(),
            email: String(block.contactEmail || '').trim().toLowerCase() || null,
            telefono: String(block.contactPhone || '').trim() || null,
          },
          fecha_inicio: fechaInicio,
          servicios: ['services', 'mixed'].includes(block.selection_type) ? block.selectedServices.map((service) => ({
            id_servicio: service.id_servicio,
          })) : [],
        });
      }
    setHoldSubmitting(true);
    try {
      const holdPayload = {
        id_sucursal: selectedBranchId,
        titular: {
          nombre: titularNombre,
          email: titularEmail,
          telefono: normalizePhone(titularTelefono),
        },
        integrantes,
      };
      const response = canUseClienteHold
        ? await createClienteCitaHold(holdPayload)
        : await createPublicCitaHold(holdPayload);
      const payload = response?.data ?? response;
      setHoldResult(payload);
      return true;
    } catch (err) {
      const apiError = err?.data?.error || err?.error || {};
      const detailField = String(apiError?.details?.field || '').trim();
      const detailIndexRaw = apiError?.details?.blockIndex;
      const detailIndex = Number.isFinite(Number(detailIndexRaw)) ? Number(detailIndexRaw) : null;
      const conflictCode = String(apiError?.code || '').trim().toUpperCase();
      const conflictReason = String(apiError?.reason || '').trim().toUpperCase();
      if (detailField) {
        const mappedIndex = detailField.startsWith('titular.')
          ? 0
          : (detailIndex != null ? detailIndex : effectiveActiveBlockIndex);
        const mappedField = detailField.includes('telefono')
          ? 'contactPhone'
          : detailField.includes('email')
            ? 'contactEmail'
            : detailField.includes('nombre')
              ? 'contactName'
              : null;
        if (mappedField) {
          setFieldError(mappedIndex, mappedField, extractMessage(err));
          setActiveBlockIndex(mappedIndex);
          navigate('/agendar/agenda');
        }
      }
      if (err?.status === 409 && conflictCode === 'PUBLIC_CITAS_HOLD_CONFLICT') {
        const shouldClearSelectedTime = conflictReason === 'AGENDA_SLOT_NOT_AVAILABLE'
          || conflictReason === 'AGENDA_AUTOASSIGN_NOT_AVAILABLE';
        notifications.warning(
          'La hora seleccionada ya no está disponible. Selecciona una hora distinta para continuar.',
          { dedupeKey: 'public-booking-hold-conflict' }
        );
        invalidateAgendaCaches();
        if (shouldClearSelectedTime) {
          updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
            ...currentBlock,
            selectedTime: '',
          }));
        }
        navigate('/agendar/agenda');
        void fetchSlots();
        void fetchAvailability();
      } else if (conflictCode === 'PUBLIC_CITAS_EMAIL_IN_USE') {
        const normalizedEmail = String(apiError?.details?.email || titularEmail || '').trim().toLowerCase();
        setFieldError(
          0,
          'contactEmail',
          'Este correo ya tiene una cuenta activa. Inicia sesión para continuar con la reserva.'
        );
        setActiveBlockIndex(0);
        navigate('/agendar/agenda');
        notifications.warning(
          'Este correo ya está registrado. Por seguridad, debes iniciar sesión para poder agendar.',
          { dedupeKey: 'public-booking-email-registered-login-required' }
        );
        openAuthRequiredModal(normalizedEmail);
      } else if (err?.status === 409) {
        notifications.warning('No pudimos confirmar esta reserva en este momento. Verifica los datos e inténtalo nuevamente.', {
          dedupeKey: 'public-booking-hold-conflict-generic',
        });
      } else {
        notifications.error(extractMessage(err), { dedupeKey: 'public-booking-hold-error' });
      }
      return false;
    } finally {
      setHoldSubmitting(false);
    }
  }, [
    allBlocksComplete,
    buildFieldErrorKey,
    bookingBlocks,
    bookingBlocksSummary,
    effectiveActiveBlockIndex,
    fetchAvailability,
    fetchSlots,
    holdExpired,
    isPastSlotForToday,
    invalidateAgendaCaches,
    canUseClienteHold,
    loadSlotSuggestions,
    navigate,
    notifications,
    openAuthRequiredModal,
    selectedBarberId,
    selectedBranchId,
    setFieldError,
    updateBlockAtIndex,
  ]);

  const goToPayment = useCallback(() => {
    if (!holdResult) return;
    if (paymentResult?.booking_confirmed) return;
    navigate('/agendar/pagar');
  }, [holdResult, navigate, paymentResult?.booking_confirmed]);

  const createPaymentIntentForHold = useCallback(async () => {
    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    const titularEmail = String(bookingBlocks[0]?.contactEmail || '').trim().toLowerCase();
    if (!groupId || !isValidEmail(titularEmail)) {
      notifications.error('No se pudo iniciar el pago porque faltan datos del titular.', {
        dedupeKey: 'public-booking-payment-context-missing',
      });
      return null;
    }
    try {
      const response = await createPublicPaymentIntent({
        id_grupo_cita: groupId,
        titular_email: titularEmail,
        nombre_apellido: String(bookingBlocks[0]?.contactName || '').trim() || null,
        telefono: normalizePhone(bookingBlocks[0]?.contactPhone || '') || null,
      });
      const payload = response?.data ?? response;
      setPaymentIntent(payload);
      return payload;
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-intent-error' });
      return null;
    }
  }, [bookingBlocks, holdResult?.id_grupo_cita, notifications]);

  const refreshPaymentStatus = useCallback(async () => {
    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    const intentId = String(paymentIntent?.id_intent || '').trim();
    const titularEmail = String(bookingBlocks[0]?.contactEmail || '').trim().toLowerCase();
    if (!groupId || !intentId || !isValidEmail(titularEmail)) return null;
    try {
      const response = await getPublicPaymentStatus({
        id_grupo_cita: groupId,
        id_intent: intentId,
        titular_email: titularEmail,
      });
      const payload = response?.data ?? response;
      setPaymentResult(payload);
      return payload;
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-status-error' });
      return null;
    }
  }, [bookingBlocks, holdResult?.id_grupo_cita, notifications, paymentIntent?.id_intent]);

  const completeMockPayment = useCallback(async () => {
    const intentId = String(paymentIntent?.id_intent || '').trim();
    const titularEmail = String(bookingBlocks[0]?.contactEmail || '').trim().toLowerCase();
    if (!intentId || !isValidEmail(titularEmail)) return false;
    try {
      await completePublicMockPayment({
        id_intent: intentId,
        titular_email: titularEmail,
        status: 'paid',
      });
      const status = await refreshPaymentStatus();
      return Boolean(status?.booking_confirmed);
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-complete-error' });
      return false;
    }
  }, [bookingBlocks, notifications, paymentIntent?.id_intent, refreshPaymentStatus]);

  const startCheckout = useCallback(async () => {
    if (paymentResult?.booking_confirmed) return true;
    let resolvedHold = holdResult;
    if (!resolvedHold) {
      const ok = await submitHold();
      if (!ok) return false;
      resolvedHold = true;
    }
    if (!resolvedHold) return false;
    navigate('/agendar/pagar');
    return true;
  }, [holdResult, navigate, paymentResult?.booking_confirmed, submitHold]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/pagar')) return;
    if (!holdResult || paymentIntent?.id_intent) return;
    void createPaymentIntentForHold();
  }, [createPaymentIntentForHold, holdResult, location.pathname, paymentIntent?.id_intent]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/pagar')) return undefined;
    if (!paymentIntent?.id_intent) return undefined;
    void refreshPaymentStatus();
    const intervalId = setInterval(() => {
      void refreshPaymentStatus();
    }, 4000);
    return () => clearInterval(intervalId);
  }, [location.pathname, paymentIntent?.id_intent, refreshPaymentStatus]);

  const contextValue = useMemo(
    () => ({
      mode: 'public',
      activeBlock,
      activeBlockIndex: effectiveActiveBlockIndex,
      addCompanionBlock,
      consumePendingCompanionFocus,
      allBlocksComplete,
      allowCompanions,
      availabilityError,
      availabilityLoading,
      availabilityMap,
      barbers,
      barbersLoading,
      barbersRefreshing,
      barberPrepTime,
      bookingBlocks,
      bookingBlocksSummary,
      branchList,
      canAddCompanionBlock,
      canGoPrevMonth,
      contextData,
      currentMonth,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      goToPayment,
      completeBookingFlow,
      createPaymentIntentForHold,
      refreshPaymentStatus,
      completeMockPayment,
      startCheckout,
      holdDurationMin,
      holdExpiresAtIso,
      holdRemainingMs,
      holdExpired,
      holdResult,
      paymentIntent,
      paymentResult,
      pendingCompanionFocusId,
      holdSubmitting,
      isPastSlotForToday,
      maxCompanions: MAX_COMPANIONS,
      minBookingDateKey,
      titularSelectedDate,
      monthRange,
      onSelectDay,
      onSelectTime,
      paymentRequired,
      simulationNoPayment,
      selectedBarber,
      selectedBarberId,
      selectedBlockTotalMinutes,
      selectedBranch,
      selectedBranchId,
      selectedDate,
      selectionType,
      selectedPackage,
      selectedPackageId,
      selectedPromotion,
      selectedPromotionId,
      selectedServicesDurationSum,
      selectedServices,
      selectedTime,
      serviceIds,
      services,
      packages,
      promotions,
      packagesLoading,
      promotionsLoading,
      removeCompanionBlock,
      servicesAtEnd,
      servicesCanScroll,
      servicesLoading,
      servicesScrollRef,
      setActiveBlock,
      setMonth,
      selectPackage,
      selectPromotion,
      selectSelectionType,
      selectSuggestedBarber,
      slotConflict,
      slotSuggestions,
      slotSuggestionsLoading,
      slots,
      slotsLoading,
      slotGridStepMinutes: SLOT_GRID_STEP_MINUTES,
      submitHold,
      syncServicesScrollState,
      toggleService,
      clearSelectedPromotion,
      totalEstimatedPromotionDiscountHnl,
      totalEstimatedToPay,
      totalToPay,
      updateActiveBlockBarber,
      updateActiveBlockContact,
      selectBarber,
      selectBranch,
      fetchAvailability,
      fieldErrors,
    }),
    [
      activeBlock,
      effectiveActiveBlockIndex,
      addCompanionBlock,
      consumePendingCompanionFocus,
      allBlocksComplete,
      allowCompanions,
      availabilityError,
      availabilityLoading,
      availabilityMap,
      barbers,
      barbersLoading,
      barbersRefreshing,
      barberPrepTime,
      bookingBlocks,
      bookingBlocksSummary,
      branchList,
      canAddCompanionBlock,
      canGoPrevMonth,
      contextData,
      currentMonth,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      goToPayment,
      completeBookingFlow,
      createPaymentIntentForHold,
      refreshPaymentStatus,
      completeMockPayment,
      startCheckout,
      holdDurationMin,
      holdExpiresAtIso,
      holdRemainingMs,
      holdExpired,
      holdResult,
      paymentIntent,
      paymentResult,
      pendingCompanionFocusId,
      holdSubmitting,
      isPastSlotForToday,
      minBookingDateKey,
      titularSelectedDate,
      monthRange,
      onSelectDay,
      onSelectTime,
      paymentRequired,
      simulationNoPayment,
      selectedBarber,
      selectedBarberId,
      selectedBlockTotalMinutes,
      selectedBranch,
      selectedBranchId,
      selectedDate,
      selectionType,
      selectedPackage,
      selectedPackageId,
      selectedPromotion,
      selectedPromotionId,
      selectedServicesDurationSum,
      selectedServices,
      selectedTime,
      serviceIds,
      services,
      packages,
      promotions,
      packagesLoading,
      promotionsLoading,
      removeCompanionBlock,
      servicesAtEnd,
      servicesCanScroll,
      servicesLoading,
      setActiveBlock,
      setMonth,
      selectPackage,
      selectPromotion,
      selectSelectionType,
      selectSuggestedBarber,
      slotConflict,
      slotSuggestions,
      slotSuggestionsLoading,
      slots,
      slotsLoading,
      submitHold,
      syncServicesScrollState,
      toggleService,
      clearSelectedPromotion,
      totalEstimatedPromotionDiscountHnl,
      totalEstimatedToPay,
      totalToPay,
      updateActiveBlockBarber,
      updateActiveBlockContact,
      selectBarber,
      selectBranch,
      fetchAvailability,
      fieldErrors,
    ]
  );

  if (location.pathname === '/agendar') {
    return <Navigate to="/agendar/barberos" replace />;
  }

  const showTopbarBackToBarberos = location.pathname.startsWith('/agendar/agenda');
  const isClienteSession = isAuthenticated && Array.isArray(roles) && roles.includes('cliente');
  const homePath = isClienteSession ? '/home/cliente' : '/';
  const homeLabel = 'Inicio MasterFade';

  return (
    <div className="public-booking-page mf-page-gradient min-h-screen">
      <div className="public-booking-shell">
        <header className="public-booking-topbar">
          <div className="public-booking-topbar-left">
            <Link to={homePath} className="public-booking-home">
              <House size={16} />
              <span>{homeLabel}</span>
            </Link>
            {showTopbarBackToBarberos ? (
              <Button
                variant="outline"
                size="sm"
                className="public-booking-topbar-back gap-2"
                onClick={goToBarberos}
              >
                <ArrowLeft size={15} />
                Volver a barberos
              </Button>
            ) : null}
          </div>
          <ThemeSwitcher showLabel={false} />
        </header>

        {contextLoading ? (
          <div className="public-booking-loading">
            <LoadingSpinner />
          </div>
        ) : null}

        {contextError ? (
          <div className="public-booking-error">
            <ErrorBanner message={contextError} onRetry={fetchContext} />
          </div>
        ) : null}

        {!contextLoading && !contextError ? (
          <main className="mf-page citas-page public-booking-main">
            <PublicBookingProvider value={contextValue}>
              <Outlet />
            </PublicBookingProvider>
          </main>
        ) : null}

        <Dialog
          open={authRequiredModal.open}
          onOpenChange={(open) => {
            if (!open) closeAuthRequiredModal();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Correo registrado: inicia sesión para agendar</DialogTitle>
              <DialogDescription>
                {authRequiredModal.email
                  ? `El correo ${authRequiredModal.email} ya pertenece a una cuenta activa en MasterFade.`
                  : 'Este correo ya pertenece a una cuenta activa en MasterFade.'}{' '}
                Para proteger la identidad del titular y evitar suplantación, debes iniciar sesión antes de continuar.
              </DialogDescription>
            </DialogHeader>
            <div className="citas-selected-date">
              Qué hacer ahora:
              <br />
              1. Inicia sesión con ese correo.
              <br />
              2. Regresa al flujo de agendamiento.
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeAuthRequiredModal}>
                Revisar datos
              </Button>
              <Button type="button" onClick={goToLoginForBooking}>
                Ir a iniciar sesión
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
