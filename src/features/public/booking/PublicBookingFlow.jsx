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
  confirmClienteCitaHoldWithoutPayment,
  createPublicCitaHold,
  createPublicPaymentIntent,
  getPublicPaymentStatus,
  completePublicMockPayment,
  getClienteMembershipEstado,
  getPublicBookingContext,
  releasePublicCitaHold,
  validatePublicTitularForBooking,
  listPublicAgendaBarberos,
  listPublicAgendaDisponibilidad,
  listPublicAgendaHorarios,
  listPublicAgendaPromociones,
  listPublicCatalogPaquetes,
  listPublicCatalogServicios,
} from './publicBookingApi.js';
import {
  buildFullName,
  MAX_COMPANIONS,
  MAX_PROMOTIONS_PER_BOOKING,
  addMinutesToTimeKey,
  buildAppointmentSelectionSummary,
  extractMessage,
  getTitularState,
  getCurrentTimeKeyInTimeZone,
  mapPublicBookingErrorMessage,
  getTodayDateKeyInTimeZone,
  normalizeEmail,
  normalizePromotionIds,
  normalizePhone,
  normalizePersonName,
  splitFullName,
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
const REWARD_BOOKING_CONTEXT_STORAGE_KEY = 'mf_reward_redeem_context_v1';

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evaluatePromotionForBlock({ block, promotion, servicesById, packagesById }) {
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

function readRewardBookingContext() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(REWARD_BOOKING_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const canjeContextToken = String(
      parsed?.canje_context_token
      || parsed?.id_points_tx_canje
      || ''
    ).trim();
    const idServicioCanje = String(parsed?.id_servicio_canje || '').trim();
    const idSucursal = String(parsed?.id_sucursal || '').trim();
    if (!canjeContextToken || !idServicioCanje || !idSucursal) return null;
    return {
      canje_context_token: canjeContextToken,
      id_points_tx_canje: canjeContextToken,
      id_servicio_canje: idServicioCanje,
      servicio_nombre: String(parsed?.servicio_nombre || 'Servicio de recompensa').trim() || 'Servicio de recompensa',
      id_sucursal: idSucursal,
      created_at: String(parsed?.created_at || '').trim() || null,
    };
  } catch {
    return null;
  }
}

function persistRewardBookingContext(context) {
  if (typeof window === 'undefined') return;
  if (!context || typeof context !== 'object') {
    window.sessionStorage.removeItem(REWARD_BOOKING_CONTEXT_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(REWARD_BOOKING_CONTEXT_STORAGE_KEY, JSON.stringify(context));
}

function buildDynamicSlots({
  horarios,
  duracionTotalMin,
}) {
  const list = Array.isArray(horarios) ? horarios : [];
  const fallbackVisibleDurationMinutes = Math.max(Number(duracionTotalMin || 0), 0);
  return list
    .map((slot) => mapDynamicSlot(slot, fallbackVisibleDurationMinutes))
    .filter(Boolean)
    .sort((left, right) => {
      const leftMin = timeKeyToMinutes(left.hora) ?? 0;
      const rightMin = timeKeyToMinutes(right.hora) ?? 0;
      return leftMin - rightMin;
    });
}

function mapDynamicSlot(slot, fallbackVisibleDurationMinutes = 0) {
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
}

function createEmptyCuratedSlots() {
  return {
    manana: {
      recommended: null,
      alternatives: [],
      overflow: [],
      has_more: false,
      total: 0,
    },
    tarde: {
      recommended: null,
      alternatives: [],
      overflow: [],
      has_more: false,
      total: 0,
    },
    noche: {
      recommended: null,
      alternatives: [],
      overflow: [],
      has_more: false,
      total: 0,
    },
  };
}

function mapCuratedPeriod(rawPeriod, fallbackVisibleDurationMinutes) {
  const recommended = mapDynamicSlot(rawPeriod?.recommended, fallbackVisibleDurationMinutes);
  const alternatives = (Array.isArray(rawPeriod?.alternatives) ? rawPeriod.alternatives : [])
    .map((slot) => mapDynamicSlot(slot, fallbackVisibleDurationMinutes))
    .filter(Boolean);
  const overflow = (Array.isArray(rawPeriod?.overflow) ? rawPeriod.overflow : [])
    .map((slot) => mapDynamicSlot(slot, fallbackVisibleDurationMinutes))
    .filter(Boolean);
  const total = Number(rawPeriod?.total ?? (
    (recommended ? 1 : 0) + alternatives.length + overflow.length
  ));
  return {
    recommended,
    alternatives,
    overflow,
    has_more: Boolean(rawPeriod?.has_more ?? overflow.length > 0),
    total: Number.isFinite(total) ? total : 0,
  };
}

function buildCuratedSlots({
  horariosCurados,
  horarios,
  duracionTotalMin,
}) {
  const fallbackVisibleDurationMinutes = Math.max(Number(duracionTotalMin || 0), 0);
  const safeCurated = horariosCurados && typeof horariosCurados === 'object'
    ? horariosCurados
    : null;

  if (safeCurated) {
    const base = createEmptyCuratedSlots();
    Object.keys(base).forEach((periodKey) => {
      base[periodKey] = mapCuratedPeriod(safeCurated?.[periodKey], fallbackVisibleDurationMinutes);
    });
    return base;
  }

  const mapped = buildDynamicSlots({ horarios, duracionTotalMin });
  const grouped = {
    manana: [],
    tarde: [],
    noche: [],
  };
  mapped.forEach((slot) => {
    const minutes = timeKeyToMinutes(slot?.hora);
    if (minutes == null) return;
    if (minutes >= 6 * 60 && minutes < 12 * 60) {
      grouped.manana.push(slot);
      return;
    }
    if (minutes >= 12 * 60 && minutes < 18 * 60) {
      grouped.tarde.push(slot);
      return;
    }
    grouped.noche.push(slot);
  });

  const fallbackCurated = createEmptyCuratedSlots();
  Object.keys(grouped).forEach((periodKey) => {
    const ordered = grouped[periodKey];
    const recommended = ordered[0] || null;
    const alternatives = ordered.slice(1, 4);
    const overflow = ordered.slice(4);
    fallbackCurated[periodKey] = {
      recommended,
      alternatives,
      overflow,
      has_more: overflow.length > 0,
      total: ordered.length,
    };
  });
  return fallbackCurated;
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
  const promotionIds = normalizePromotionIds(block?.promotionIds, block?.promotionId);
  const promotionId = promotionIds[0] || '';

  const splitLegacyName = splitFullName(block?.contactName || '');
  const contactFirstName = normalizePersonName(block?.contactFirstName || splitLegacyName.firstName || '');
  const contactLastName = normalizePersonName(block?.contactLastName || splitLegacyName.lastName || '');
  const contactName = buildFullName(contactFirstName, contactLastName) || normalizePersonName(block?.contactName || '');
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
    promotionIds,
    selectedDate: String(block?.selectedDate || '').trim(),
    selectedTime: String(block?.selectedTime || '').trim(),
    selectedDateTime: String(block?.selectedDateTime || '').trim(),
    contactFirstName,
    contactLastName,
    contactName,
    contactEmail: normalizeEmail(block?.contactEmail || ''),
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
    && areServiceIdsEqual(left.promotionIds, right.promotionIds)
    && left.selectedDate === right.selectedDate
    && left.selectedTime === right.selectedTime
    && left.selectedDateTime === right.selectedDateTime
    && left.contactFirstName === right.contactFirstName
    && left.contactLastName === right.contactLastName
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
      promotionId: '',
      promotionIds: [],
      selectedDate: '',
      selectedTime: '',
      selectedDateTime: '',
      contactFirstName: '',
      contactLastName: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
    },
    alias === 'Titular' ? 0 : 1
  );
}

function normalizeMembershipServiceId(value) {
  return String(value || '').trim();
}

function getMembershipBenefitItems(planActivo) {
  if (!planActivo || typeof planActivo !== 'object') return [];
  const benefitSources = [
    planActivo?.beneficios_snapshot,
    planActivo?.plan_snapshot?.beneficios,
    planActivo?.beneficios,
  ];
  for (const source of benefitSources) {
    if (!source) continue;
    if (Array.isArray(source)) return source;
    if (Array.isArray(source?.items)) return source.items;
    if (Array.isArray(source?.servicios) || Array.isArray(source?.cortesias)) {
      return [
        ...(Array.isArray(source?.servicios) ? source.servicios : []),
        ...(Array.isArray(source?.cortesias) ? source.cortesias : []),
      ];
    }
  }
  return [];
}

function extractPlanIncludedServiceIds(planActivo) {
  const items = getMembershipBenefitItems(planActivo);
  return Array.from(
    new Set(
      items
        .filter((item) => String(item?.tipo || '').trim().toLowerCase() === 'servicio')
        .map((item) => normalizeMembershipServiceId(item?.id_servicio))
        .filter(Boolean)
    )
  );
}

function extractPlanRemainingServiceIds(planActivo) {
  const remanentes = Array.isArray(planActivo?.remanentes?.servicios)
    ? planActivo.remanentes.servicios
    : [];
  return Array.from(
    new Set(
      remanentes
        .filter((item) => Number(item?.restante || 0) > 0)
        .map((item) => normalizeMembershipServiceId(item?.id_servicio))
        .filter(Boolean)
    )
  );
}

function extractConfirmedAppointments(payload) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  if (Array.isArray(safePayload?.citas_confirmadas)) return safePayload.citas_confirmadas;
  if (Array.isArray(safePayload?.citas)) return safePayload.citas;
  if (Array.isArray(safePayload?.data?.citas_confirmadas)) return safePayload.data.citas_confirmadas;
  if (Array.isArray(safePayload?.data?.citas)) return safePayload.data.citas;
  if (Array.isArray(safePayload?.confirmation?.citas_confirmadas)) return safePayload.confirmation.citas_confirmadas;
  if (Array.isArray(safePayload?.confirmation?.citas)) return safePayload.confirmation.citas;
  return [];
}

function extractBookingCode(payload) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const candidates = [
    safePayload?.codigo_cita,
    safePayload?.data?.codigo_cita,
    safePayload?.confirmation?.codigo_cita,
    safePayload?.confirmation?.data?.codigo_cita,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }
  const citasConfirmadas = extractConfirmedAppointments(safePayload);
  for (const cita of citasConfirmadas) {
    const normalized = String(cita?.codigo_cita || '').trim();
    if (normalized) return normalized;
  }
  return '';
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
  const notifyError = notifications.error;
  const { isAuthenticated, roles, user } = useAuth();
  const canUseClienteHold = Boolean(isAuthenticated && Array.isArray(roles) && roles.includes('cliente'));
  const titularState = useMemo(
    () => getTitularState(canUseClienteHold ? user : null),
    [canUseClienteHold, user]
  );

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
  const [promotionsLoadError, setPromotionsLoadError] = useState('');

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
  const [slotsCurated, setSlotsCurated] = useState(() => createEmptyCuratedSlots());
  const [slotMetrics, setSlotMetrics] = useState({ duracionTotalMin: 0, bufferTotalMin: 0 });
  const [slotConflict, setSlotConflict] = useState(null);
  const [slotSuggestions, setSlotSuggestions] = useState([]);
  const [slotSuggestionsLoading, setSlotSuggestionsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [authRequiredModal, setAuthRequiredModal] = useState({ open: false, email: '' });
  const [profilePersistModal, setProfilePersistModal] = useState({ open: false, kind: '' });

  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdResult, setHoldResult] = useState(null);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [bookingSuccessResult, setBookingSuccessResult] = useState(null);
  const [rewardBookingContext, setRewardBookingContext] = useState(() => readRewardBookingContext());
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [membershipStateData, setMembershipStateData] = useState(null);
  const [membershipBranchNotice, setMembershipBranchNotice] = useState('');

  const availabilityAbortRef = useRef(null);
  const slotsAbortRef = useRef(null);
  const branchDataRequestSeqRef = useRef(0);
  const availabilityRequestSeqRef = useRef(0);
  const slotsRequestSeqRef = useRef(0);
  const slotSuggestionRequestSeqRef = useRef(0);
  const availabilityCacheRef = useRef(new Map());
  const slotsCacheRef = useRef(new Map());
  const servicesScrollRef = useRef(null);
  const profilePersistResolveRef = useRef(null);
  const barbersCountRef = useRef(0);
  const servicesCountRef = useRef(0);
  const packagesCountRef = useRef(0);
  const promotionsCountRef = useRef(0);
  const selectedTimeRef = useRef('');
  const membershipBranchNoticeRef = useRef('');
  const rewardPreparedShownRef = useRef(false);
  const rewardUnavailableShownRef = useRef(false);
const rewardDiscountInfoShownRef = useRef(false);
const lastHoldFingerprintRef = useRef('');
const holderProfileHydratedRef = useRef(false);
const paymentAutoBootstrapAttemptRef = useRef('');
const paymentStatusAbortRef = useRef(null);
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

  useEffect(() => {
    if (!titularState.isAuthenticated) {
      holderProfileHydratedRef.current = false;
      return;
    }
    if (holderProfileHydratedRef.current) return;
    setBookingBlocks((prev) => {
      const source = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createBookingBlock({ alias: 'Titular' })];
      const currentTitular = normalizeBookingBlock(source[0], 0);
      const nextFirstName = currentTitular.contactFirstName || titularState.profile.nombres || '';
      const nextLastName = currentTitular.contactLastName || titularState.profile.apellidos || '';
      const nextEmail = currentTitular.contactEmail || titularState.profile.email || '';
      const nextPhone = currentTitular.contactPhone || titularState.profile.telefono_principal || '';
      const nextTitular = normalizeBookingBlock(
        {
          ...currentTitular,
          contactFirstName: nextFirstName,
          contactLastName: nextLastName,
          contactEmail: nextEmail,
          contactPhone: nextPhone,
        },
        0
      );
      holderProfileHydratedRef.current = true;
      if (areBlocksEqual(currentTitular, nextTitular)) return prev;
      const next = [...source];
      next[0] = nextTitular;
      return next;
    });
  }, [
    titularState.isAuthenticated,
    titularState.profile.apellidos,
    titularState.profile.email,
    titularState.profile.nombres,
    titularState.profile.telefono_principal,
  ]);

  const canGoPrevMonth = useMemo(() => {
    const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const minMonthStart = new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1);
    return currentMonthStart.getTime() > minMonthStart.getTime();
  }, [currentMonth, minBookingMonth]);

  const maxCompanions = useMemo(
    () => Math.max(
      0,
      Math.trunc(
        readNumberParam(
          contextData?.parametros,
          'agendamiento_max_acompanantes',
          readNumberParam(contextData?.parametros, 'max_acompanantes', MAX_COMPANIONS)
        )
      )
    ),
    [contextData?.parametros]
  );
  const allowCompanions = useMemo(
    () => readBooleanParam(contextData?.parametros, 'permitir_acompanantes', maxCompanions > 0),
    [contextData?.parametros, maxCompanions]
  );
  const maxPromotionsPerBooking = useMemo(
    () => Math.max(
      1,
      Math.trunc(
        readNumberParam(
          contextData?.parametros,
          'agendamiento_max_promociones_por_reserva',
          MAX_PROMOTIONS_PER_BOOKING
        )
      )
    ),
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
  const branchNameById = useMemo(() => {
    const map = new Map();
    (Array.isArray(branchList) ? branchList : []).forEach((branch) => {
      const branchId = String(branch?.id_sucursal || '').trim();
      if (!branchId) return;
      map.set(branchId, String(branch?.nombre_sucursal || '').trim() || 'Sucursal');
    });
    return map;
  }, [branchList]);

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
    promotionsCountRef.current = Array.isArray(promotions) ? promotions.length : 0;
  }, [promotions]);

  useEffect(() => {
    selectedTimeRef.current = selectedTime;
  }, [selectedTime]);

  const selectedBarber = useMemo(
    () => barbersById.get(activeBlockBarberId) || null,
    [activeBlockBarberId, barbersById]
  );

  const membershipActivePlans = useMemo(() => {
    const fromArray = Array.isArray(membershipStateData?.planes_activos)
      ? membershipStateData.planes_activos
      : [];
    const fallbackPlan = membershipStateData?.plan_activo && typeof membershipStateData.plan_activo === 'object'
      ? [membershipStateData.plan_activo]
      : [];
    const source = fromArray.length > 0 ? fromArray : fallbackPlan;
    const deduped = new Map();
    source.forEach((plan) => {
      if (!plan || typeof plan !== 'object') return;
      const subscriptionId = String(plan?.id_suscripcion || '').trim();
      const branchId = String(plan?.id_sucursal_contratada || '').trim();
      if (!subscriptionId || !branchId || deduped.has(subscriptionId)) return;
      const statusCode = String(
        plan?.estado_visible
        || plan?.estado_suscripcion_codigo
        || membershipStateData?.estado_plan
        || ''
      ).trim().toLowerCase();
      const isOperational = statusCode === 'activa' || statusCode === 'pendiente_renovacion';
      if (!isOperational) return;
      deduped.set(subscriptionId, plan);
    });
    return Array.from(deduped.values());
  }, [membershipStateData]);

  const activeMembershipPlan = useMemo(
    () => membershipActivePlans.find((plan) => String(plan?.id_sucursal_contratada || '').trim() === selectedBranchId) || null,
    [membershipActivePlans, selectedBranchId]
  );
  const hasOperationalMembership = membershipActivePlans.length > 0;
  const activeMembershipPlanInOtherBranch = useMemo(
    () => membershipActivePlans.find((plan) => String(plan?.id_sucursal_contratada || '').trim() !== selectedBranchId) || null,
    [membershipActivePlans, selectedBranchId]
  );
  const activeMembershipOtherBranchName = useMemo(() => {
    if (!activeMembershipPlanInOtherBranch) return '';
    const otherBranchId = String(activeMembershipPlanInOtherBranch?.id_sucursal_contratada || '').trim();
    if (!otherBranchId) return '';
    return (
      branchNameById.get(otherBranchId)
      || String(activeMembershipPlanInOtherBranch?.sucursal_nombre || '').trim()
      || 'tu sucursal de plan'
    );
  }, [activeMembershipPlanInOtherBranch, branchNameById]);
  const selectedBranchName = selectedBranch
    ? (String(selectedBranch?.nombre_sucursal || '').trim() || 'esta sucursal')
    : 'esta sucursal';

  const rewardModeActive = Boolean(
    canUseClienteHold
    && rewardBookingContext
    && String(rewardBookingContext?.canje_context_token || rewardBookingContext?.id_points_tx_canje || '').trim()
    && String(rewardBookingContext?.id_servicio_canje || '').trim()
  );
  const rewardServiceId = rewardModeActive
    ? String(rewardBookingContext?.id_servicio_canje || '').trim()
    : '';
  const rewardBranchId = rewardModeActive
    ? String(rewardBookingContext?.id_sucursal || '').trim()
    : '';
  const rewardServiceName = rewardModeActive
    ? String(rewardBookingContext?.servicio_nombre || 'Servicio de recompensa').trim() || 'Servicio de recompensa'
    : '';
  const rewardBranchName = rewardBranchId
    ? (branchNameById.get(rewardBranchId) || (rewardBranchId === selectedBranchId ? selectedBranchName : 'sucursal de canje'))
    : '';
  const rewardBranchMismatch = Boolean(rewardModeActive && rewardBranchId && selectedBranchId && rewardBranchId !== selectedBranchId);

  const availableServiceIdSet = useMemo(
    () => new Set((Array.isArray(services) ? services : []).map((service) => String(service?.id_servicio || '').trim()).filter(Boolean)),
    [services]
  );

  const membershipCoveredServiceIds = useMemo(() => {
    if (!activeMembershipPlan) return [];
    const remainingIds = extractPlanRemainingServiceIds(activeMembershipPlan);
    const candidateIds = remainingIds.length > 0
      ? remainingIds
      : extractPlanIncludedServiceIds(activeMembershipPlan);
    return candidateIds.filter((serviceId) => availableServiceIdSet.has(serviceId));
  }, [activeMembershipPlan, availableServiceIdSet]);

  const membershipLockedServiceIdsForTitular = useMemo(
    () => (rewardModeActive ? [] : (selectedBranchId && selectedBarberId ? membershipCoveredServiceIds : [])),
    [membershipCoveredServiceIds, rewardModeActive, selectedBarberId, selectedBranchId]
  );
  const rewardLockedServiceIdsForTitular = useMemo(
    () => (rewardModeActive && rewardServiceId ? [rewardServiceId] : []),
    [rewardModeActive, rewardServiceId]
  );

  const activeSelectionSummary = useMemo(
    () => buildAppointmentSelectionSummary({
      selectedPackage: selectedPackageId,
      selectedServices: serviceIds,
      packages,
      services,
    }),
    [packages, selectedPackageId, serviceIds, services]
  );

  const selectedPackage = activeSelectionSummary.selectedPackage;
  const selectedServices = activeSelectionSummary.selectedServicesEffective;
  const selectedServiceIdsEffective = activeSelectionSummary.selectedServiceIdsEffective;

  const activeBlockMembershipServiceIdsForAgenda = useMemo(
    () => (
      effectiveActiveBlockIndex === 0
        ? [...membershipLockedServiceIdsForTitular, ...rewardLockedServiceIdsForTitular]
        : []
    ),
    [effectiveActiveBlockIndex, membershipLockedServiceIdsForTitular, rewardLockedServiceIdsForTitular]
  );
  const effectiveSelectedServiceIdsForAgenda = useMemo(
    () => Array.from(new Set([
      ...selectedServiceIdsEffective,
      ...activeBlockMembershipServiceIdsForAgenda,
    ])),
    [activeBlockMembershipServiceIdsForAgenda, selectedServiceIdsEffective]
  );

  const blockedServiceIds = activeSelectionSummary.blockedServiceIds;
  const activeBlockMembershipLockedIds = useMemo(
    () => (
      effectiveActiveBlockIndex === 0
        ? [...membershipLockedServiceIdsForTitular, ...rewardLockedServiceIdsForTitular]
        : []
    ),
    [effectiveActiveBlockIndex, membershipLockedServiceIdsForTitular, rewardLockedServiceIdsForTitular]
  );
  const includedServiceIdsFromPackage = activeSelectionSummary.includedServiceIdsFromPackage;

  const blockedServiceIdSet = useMemo(
    () => new Set([
      ...blockedServiceIds.map((id) => String(id || '').trim()).filter(Boolean),
      ...activeBlockMembershipLockedIds,
    ]),
    [activeBlockMembershipLockedIds, blockedServiceIds]
  );
  const membershipLockedServiceIdSet = useMemo(
    () => new Set(activeBlockMembershipLockedIds),
    [activeBlockMembershipLockedIds]
  );
  const rewardLockedServiceIdSet = useMemo(
    () => new Set(effectiveActiveBlockIndex === 0 ? rewardLockedServiceIdsForTitular : []),
    [effectiveActiveBlockIndex, rewardLockedServiceIdsForTitular]
  );

  const servicesById = useMemo(() => {
    const map = new Map();
    (Array.isArray(services) ? services : []).forEach((service) => {
      const serviceId = String(service?.id_servicio || '').trim();
      if (!serviceId) return;
      map.set(serviceId, service);
    });
    return map;
  }, [services]);

  const packagesById = useMemo(() => {
    const map = new Map();
    (Array.isArray(packages) ? packages : []).forEach((pkg) => {
      const packageId = String(pkg?.id_paquete || '').trim();
      if (!packageId) return;
      map.set(packageId, pkg);
    });
    return map;
  }, [packages]);

  const promotionsById = useMemo(() => {
    const map = new Map();
    (Array.isArray(promotions) ? promotions : []).forEach((promotion) => {
      const promotionId = String(promotion?.id_promocion || '').trim();
      if (!promotionId) return;
      map.set(promotionId, promotion);
    });
    return map;
  }, [promotions]);

  const selectedPromotionIds = useMemo(
    () => normalizePromotionIds(activeBlock?.promotionIds, activeBlock?.promotionId),
    [activeBlock?.promotionId, activeBlock?.promotionIds]
  );
  const selectedPromotionId = useMemo(
    () => selectedPromotionIds[0] || '',
    [selectedPromotionIds]
  );
  const selectedPromotion = useMemo(
    () => promotionsById.get(selectedPromotionId) || null,
    [promotionsById, selectedPromotionId]
  );
  const selectedPromotions = useMemo(
    () => selectedPromotionIds
      .map((promotionId) => promotionsById.get(promotionId) || null)
      .filter(Boolean),
    [promotionsById, selectedPromotionIds]
  );

  const effectiveSelectionType = useMemo(() => {
    if (selectedPackage && selectedServices.length > 0) return 'mixed';
    if (selectedPackage) return 'package';
    return 'services';
  }, [selectedPackage, selectedServices.length]);

  const rawSelectedServicesDurationSum = useMemo(
    () => Number(activeSelectionSummary.totalDurationMin || 0),
    [activeSelectionSummary.totalDurationMin]
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
    () => `type:${effectiveSelectionType}|package:${selectedPackageId || ''}|services:${effectiveSelectedServiceIdsForAgenda.join(',')}`,
    [effectiveSelectionType, selectedPackageId, effectiveSelectedServiceIdsForAgenda]
  );

  const isValidOptionalEmail = useCallback((value) => {
    const normalized = normalizeEmail(value);
    return !normalized || isValidEmail(normalized);
  }, []);

  const isValidOptionalPhone = useCallback((value) => {
    const raw = String(value || '').trim();
    if (!raw) return true;
    if (hasLetters(raw)) return false;
    return normalizePhone(raw).length >= 8;
  }, []);

  const resolveBlockContactState = useCallback((rawBlock, index) => {
    const block = normalizeBookingBlock(rawBlock || {}, index);
    const firstName = normalizePersonName(block.contactFirstName || '');
    const lastName = normalizePersonName(block.contactLastName || '');
    const fallbackName = normalizePersonName(block.contactName || '');
    const joinedName = buildFullName(firstName, lastName);
    const email = normalizeEmail(block.contactEmail || '');
    const phoneRaw = String(block.contactPhone || '').trim();

    const errors = {};
    const isTitular = index === 0;
    if (isTitular && titularState.isAuthenticated) {
      const needsNombres = titularState.missingFields.includes('nombres');
      const needsApellidos = titularState.missingFields.includes('apellidos');
      const needsPhone = titularState.missingFields.includes('telefono_principal');

      const effectiveFirstName = titularState.profile.nombres || firstName;
      const effectiveLastName = titularState.profile.apellidos || lastName;
      const effectiveName = buildFullName(effectiveFirstName, effectiveLastName) || fallbackName;
      const effectiveEmail = normalizeEmail(titularState.profile.email || email);
      const effectivePhoneRaw = titularState.profile.telefono_principal || phoneRaw;
      const effectivePhone = normalizePhone(effectivePhoneRaw);

      if (needsNombres && !firstName) {
        errors.contactFirstName = 'Completa tu nombre para continuar.';
      }
      if (needsApellidos && !lastName) {
        errors.contactLastName = 'Completa tu apellido para continuar.';
      }
      if (!effectiveName) {
        errors.contactFirstName = errors.contactFirstName || 'Completa tus datos para continuar.';
      }
      if (!isValidEmail(effectiveEmail)) {
        errors.contactEmail = 'No pudimos validar el correo de tu cuenta. Vuelve a iniciar sesión.';
      }
      if (needsPhone && !phoneRaw) {
        errors.contactPhone = 'Ingresa un teléfono válido para continuar.';
      } else if (needsPhone && !isValidOptionalPhone(phoneRaw)) {
        errors.contactPhone = hasLetters(phoneRaw)
          ? 'El teléfono no admite letras.'
          : 'Ingresa un teléfono válido para continuar.';
      }

      return {
        isTitular: true,
        shouldRenderForm: !titularState.hasFullProfile,
        requiresMissingFields: titularState.missingFields,
        firstName: effectiveFirstName,
        lastName: effectiveLastName,
        fullName: effectiveName,
        email: effectiveEmail,
        phone: effectivePhone,
        isValid: Object.keys(errors).length === 0 && Boolean(effectiveName) && Boolean(effectiveEmail),
        errors,
      };
    }

    if (isTitular) {
      const fullName = joinedName || fallbackName;
      if (!fullName) {
        errors.contactFirstName = 'El nombre del titular es obligatorio.';
      }
      if (!isValidEmail(email)) {
        errors.contactEmail = 'Ingresa un correo válido del titular.';
      }
      if (!phoneRaw || !isValidOptionalPhone(phoneRaw)) {
        errors.contactPhone = phoneRaw && hasLetters(phoneRaw)
          ? 'El teléfono no admite letras.'
          : 'Ingresa un teléfono válido del titular.';
      }
      return {
        isTitular: true,
        shouldRenderForm: true,
        requiresMissingFields: ['nombres', 'telefono_principal'],
        firstName,
        lastName,
        fullName,
        email,
        phone: normalizePhone(phoneRaw),
        isValid: Object.keys(errors).length === 0,
        errors,
      };
    }

    const fullName = joinedName || fallbackName;
    if (!firstName) {
      errors.contactFirstName = 'El nombre del acompañante es obligatorio.';
    }
    if (!lastName) {
      errors.contactLastName = 'El apellido del acompañante es obligatorio.';
    }
    if (!fullName) {
      errors.contactFirstName = errors.contactFirstName || 'Completa nombre y apellido del acompañante.';
    }
    if (!isValidOptionalEmail(email)) {
      errors.contactEmail = 'Si ingresas correo del acompañante, debe ser válido.';
    }
    if (!isValidOptionalPhone(phoneRaw)) {
      errors.contactPhone = hasLetters(phoneRaw)
        ? 'El teléfono del acompañante no admite letras.'
        : 'El teléfono del acompañante debe ser válido.';
    }

    return {
      isTitular: false,
      shouldRenderForm: true,
      requiresMissingFields: ['nombres', 'apellidos'],
      firstName,
      lastName,
      fullName,
      email,
      phone: normalizePhone(phoneRaw),
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }, [isValidOptionalPhone, isValidOptionalEmail, titularState]);

  const bookingBlocksSummary = useMemo(
    () =>
      bookingBlocks.map((block, index) => {
        const contactState = resolveBlockContactState(block, index);
        const summary = buildAppointmentSelectionSummary({
          selectedPackage: block.packageId,
          selectedServices: block.serviceIds,
          packages,
          services,
        });
        const membershipCoveredSet = index === 0
          ? new Set(membershipLockedServiceIdsForTitular)
          : new Set();
        const rewardCoveredSet = index === 0
          ? new Set(rewardLockedServiceIdsForTitular)
          : new Set();
        const blockServicesById = new Map();

        summary.selectedServicesEffective.forEach((service) => {
          const serviceId = String(service?.id_servicio || '').trim();
          if (!serviceId || blockServicesById.has(serviceId)) return;
          const isCoveredByPlan = membershipCoveredSet.has(serviceId);
          const isCoveredByReward = rewardCoveredSet.has(serviceId);
          blockServicesById.set(serviceId, {
            ...service,
            coveredByPlan: isCoveredByPlan,
            coveredByReward: isCoveredByReward,
            lockedByPlan: isCoveredByPlan,
            lockedByReward: isCoveredByReward,
            source: isCoveredByReward ? 'reward' : (isCoveredByPlan ? 'membership' : 'extra'),
          });
        });

        if (index === 0 && (membershipCoveredSet.size > 0 || rewardCoveredSet.size > 0)) {
          const mergedCoveredIds = new Set([
            ...membershipCoveredSet,
            ...rewardCoveredSet,
          ]);
          mergedCoveredIds.forEach((serviceId) => {
            if (!serviceId || blockServicesById.has(serviceId)) return;
            const serviceCatalog = servicesById.get(serviceId);
            const isCoveredByPlan = membershipCoveredSet.has(serviceId);
            const isCoveredByReward = rewardCoveredSet.has(serviceId);
            blockServicesById.set(serviceId, {
              ...serviceCatalog,
              id_servicio: serviceId,
              nombre_servicio: String(serviceCatalog?.nombre_servicio || serviceCatalog?.nombre || 'Servicio').trim() || 'Servicio',
              precio_hnl: Number(serviceCatalog?.precio_hnl || 0),
              coveredByPlan: isCoveredByPlan,
              coveredByReward: isCoveredByReward,
              lockedByPlan: isCoveredByPlan,
              lockedByReward: isCoveredByReward,
              source: isCoveredByReward ? 'reward' : 'membership',
            });
          });
        }

        const blockServices = Array.from(blockServicesById.values());
        const blockPackage = summary.selectedPackage;
        const blockSelectionType = blockPackage && blockServices.length > 0
          ? 'mixed'
          : blockPackage
            ? 'package'
            : 'services';
        const blockTotal = Number(summary.totalPrice || 0);
        const serviceDurationMin = Number(summary.totalDurationMin || 0);
        const blockHasSelection = Boolean(blockPackage) || blockServices.length > 0;
        const blockBufferMin = blockHasSelection ? barberPrepTime : 0;

        const selectedPromotionIdsInBlock = normalizePromotionIds(block?.promotionIds, block?.promotionId)
          .slice(0, maxPromotionsPerBooking);
        const selectedPromotionsInBlock = selectedPromotionIdsInBlock
          .map((promotionId) => promotionsById.get(promotionId) || null)
          .filter(Boolean);
        const promotionEvaluations = selectedPromotionsInBlock.map((promotion) => evaluatePromotionForBlock({
          block,
          promotion,
          servicesById,
          packagesById,
        }));
        const estimatedPromotionDiscount = Math.max(
          0,
          Math.min(
            blockTotal,
            promotionEvaluations.reduce(
              (sum, evaluation) => sum + (evaluation.canSelect ? Number(evaluation.estimatedDiscount || 0) : 0),
              0
            )
          )
        );
        const firstPromotionEvaluation = promotionEvaluations[0] || null;
        const selectedPromotionIdInBlock = selectedPromotionIdsInBlock[0] || '';
        const blockPromotion = selectedPromotionsInBlock[0] || null;

        return {
          ...block,
          index,
          alias: contactState.fullName || block.alias || (index === 0 ? 'Titular' : `Acompañante ${index}`),
          barbero: barbersById.get(block.idBarbero) || null,
          selection_type: blockSelectionType,
          selectedPackage: blockPackage,
          selectedServices: blockServices,
          selectedServiceIdsEffective: Array.from(new Set([
            ...(Array.isArray(summary.selectedServiceIdsEffective) ? summary.selectedServiceIdsEffective : []),
            ...(index === 0 ? membershipLockedServiceIdsForTitular : []),
            ...(index === 0 ? rewardLockedServiceIdsForTitular : []),
          ])),
          blockedServiceIds: summary.blockedServiceIds,
          includedServiceIdsFromPackage: summary.includedServiceIdsFromPackage,
          selectionConflicts: summary.conflicts,
          total_hnl: blockTotal,
          selectedPromotion: blockPromotion,
          selectedPromotions: selectedPromotionsInBlock,
          promotionIds: selectedPromotionIdsInBlock,
          promocion_id: selectedPromotionIdInBlock || null,
          promocion_objetivo_seleccionado: firstPromotionEvaluation?.isTargetSelected || false,
          promocion_objetivo_nombre: firstPromotionEvaluation?.targetName || null,
          promocion_descuento_estimado_hnl: estimatedPromotionDiscount,
          promocion_requiere_calculo_final: promotionEvaluations.some((evaluation) => Boolean(evaluation.requiresFinalCalculation)),
          total_estimado_hnl: Math.max(0, blockTotal - estimatedPromotionDiscount),
          duracion_servicios_min: serviceDurationMin,
          buffer_total_min: blockBufferMin,
          duracion_bloque_min: serviceDurationMin + blockBufferMin,
          contactResolved: contactState,
          isComplete: Boolean(
            contactState.isValid
              && block.idBarbero
              && blockHasSelection
              && block.selectedDate
              && block.selectedTime
          ),
        };
      }),
    [
      barberPrepTime,
      bookingBlocks,
      services,
      servicesById,
      packages,
      packagesById,
      promotionsById,
      maxPromotionsPerBooking,
      barbersById,
      membershipLockedServiceIdsForTitular,
      rewardLockedServiceIdsForTitular,
      resolveBlockContactState,
    ]
  );

  const activeBlockContactState = useMemo(
    () => resolveBlockContactState(activeBlock, effectiveActiveBlockIndex),
    [activeBlock, effectiveActiveBlockIndex, resolveBlockContactState]
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
  const bookingSelectionFingerprint = useMemo(
    () => JSON.stringify(
      bookingBlocksSummary.map((block) => ({
        id: block.id,
        idBarbero: block.idBarbero,
        selectedDate: block.selectedDate,
        selectedTime: block.selectedTime,
        selectedDateTime: block.selectedDateTime,
        selection_type: block.selection_type,
        packageId: block.selectedPackage?.id_paquete || '',
        serviceIds: Array.isArray(block.selectedServiceIdsEffective) ? block.selectedServiceIdsEffective : [],
        promotionIds: Array.isArray(block.promotionIds) ? block.promotionIds : [],
      }))
    ),
    [bookingBlocksSummary]
  );

  const holdPricing = useMemo(() => {
    if (!holdResult || typeof holdResult !== 'object') return null;

    const subtotal = Number(holdResult?.subtotal_hnl ?? holdResult?.monto_total_hnl ?? 0);
    const coveredByPlan = Number(
      holdResult?.membresia?.cubierto_por_plan_hnl
      ?? 0
    );
    const coveredByReward = Number(
      holdResult?.recompensa?.cubierto_hnl
      ?? 0
    );
    const coveredTotal = Number(
      holdResult?.descuento_total_hnl
      ?? (coveredByPlan + coveredByReward)
    );
    const total = Number(holdResult?.total_pagar_hnl ?? holdResult?.monto_pendiente_hnl ?? 0);
    const extras = Number(
      holdResult?.recompensa?.extras_a_pagar_hnl
      ?? holdResult?.membresia?.extras_a_pagar_hnl
      ?? holdResult?.monto_pendiente_hnl
      ?? total
    );

    return {
      source: 'hold',
      subtotal_hnl: Number.isFinite(subtotal) ? subtotal : 0,
      cubierto_por_plan_hnl: Number.isFinite(coveredByPlan) ? coveredByPlan : 0,
      cubierto_por_recompensa_hnl: Number.isFinite(coveredByReward) ? coveredByReward : 0,
      cubierto_total_hnl: Number.isFinite(coveredTotal) ? coveredTotal : 0,
      extras_a_pagar_hnl: Number.isFinite(extras) ? extras : 0,
      total_pagar_hnl: Number.isFinite(total) ? total : 0,
      recompensa_aplicada: Boolean(holdResult?.recompensa?.aplicada),
      recompensa_servicio_nombre: String(holdResult?.recompensa?.servicio_nombre || '').trim(),
      recompensa_mensaje: String(holdResult?.recompensa?.mensaje || '').trim(),
    };
  }, [holdResult]);
  const holdTotalToPay = useMemo(
    () => Number(holdPricing?.total_pagar_hnl ?? holdResult?.total_pagar_hnl ?? 0),
    [holdPricing, holdResult?.total_pagar_hnl]
  );

  const canConfirmWithoutPayment = Boolean(
    canUseClienteHold
    && holdResult
    && String(holdResult?.id_grupo_cita || '').trim()
    && holdTotalToPay === 0
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

  const blocksToSubmitSummary = useMemo(
    () => bookingBlocksSummary.filter((block) =>
      Boolean(block?.selectedPackage)
      || (Array.isArray(block?.selectedServices) && block.selectedServices.length > 0)
    ),
    [bookingBlocksSummary]
  );

  const allBlocksComplete = useMemo(
    () => blocksToSubmitSummary.length > 0
      && blocksToSubmitSummary.every((block) => block.isComplete && !hasBlockingGroupConflict(block)),
    [blocksToSubmitSummary, hasBlockingGroupConflict]
  );
  const bookingBlockingReason = useMemo(() => {
    if (!Array.isArray(blocksToSubmitSummary) || blocksToSubmitSummary.length === 0) {
      return 'Agrega al menos un bloque de cita.';
    }

    const firstInvalidContact = blocksToSubmitSummary.find((block) => !block?.contactResolved?.isValid);
    if (firstInvalidContact) {
      const label = firstInvalidContact.index === 0
        ? 'titular'
        : `acompañante ${firstInvalidContact.index}`;
      if (!firstInvalidContact?.contactResolved?.fullName) {
        return `El ${label} no tiene nombre completo.`;
      }
      return `Completa los datos del ${label}.`;
    }

    const firstMissingService = blocksToSubmitSummary.find((block) =>
      !block?.selectedPackage && (!Array.isArray(block?.selectedServices) || block.selectedServices.length === 0)
    );
    if (firstMissingService) {
      return firstMissingService.index === 0
        ? 'El titular no tiene servicio o paquete seleccionado.'
        : `El acompañante ${firstMissingService.index} no tiene servicio seleccionado.`;
    }

    const firstMissingBarber = blocksToSubmitSummary.find((block) => !block?.idBarbero);
    if (firstMissingBarber) {
      return firstMissingBarber.index === 0
        ? 'El titular no tiene barbero seleccionado.'
        : `El acompañante ${firstMissingBarber.index} no tiene barbero seleccionado.`;
    }

    const firstMissingDate = blocksToSubmitSummary.find((block) => !block?.selectedDate);
    if (firstMissingDate) {
      return firstMissingDate.index === 0
        ? 'El titular no tiene fecha seleccionada.'
        : `El acompañante ${firstMissingDate.index} no tiene fecha seleccionada.`;
    }

    const firstMissingTime = blocksToSubmitSummary.find((block) => !block?.selectedTime);
    if (firstMissingTime) {
      return firstMissingTime.index === 0
        ? 'El titular no tiene horario seleccionado.'
        : `El acompañante ${firstMissingTime.index} no tiene horario seleccionado.`;
    }

    const firstConflict = blocksToSubmitSummary.find((block) => hasBlockingGroupConflict(block));
    if (firstConflict) {
      return firstConflict.index === 0
        ? 'El horario del titular se solapa con otro integrante.'
        : `El horario del acompañante ${firstConflict.index} se solapa con otro integrante.`;
    }

    return '';
  }, [blocksToSubmitSummary, hasBlockingGroupConflict]);
  const holdExpiresAtIso = useMemo(() => {
    if (holdResult?.expires_at) return holdResult.expires_at;
    if (paymentIntent?.expires_at) return paymentIntent.expires_at;
    return null;
  }, [holdResult?.expires_at, paymentIntent?.expires_at]);
  const holdRemainingMs = useMemo(() => {
    if (!holdExpiresAtIso) return null;
    const expiresAt = new Date(holdExpiresAtIso);
    if (Number.isNaN(expiresAt.getTime())) return null;
    return Math.max(expiresAt.getTime() - countdownNow, 0);
  }, [holdExpiresAtIso, countdownNow]);
  const holdExpired = holdRemainingMs != null && holdRemainingMs <= 0;

  const canAddCompanionBlock = useMemo(
    () => allowCompanions && bookingBlocks.length < (maxCompanions + 1),
    [allowCompanions, bookingBlocks.length, maxCompanions]
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
    setSlotsCurated(createEmptyCuratedSlots());
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
    setMembershipBranchNotice('');
    membershipBranchNoticeRef.current = '';
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
    setBookingSuccessResult(null);
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
      setPromotionsLoadError('');
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
    setPromotionsLoadError('');
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

      setBarbers(nextBarbers);
      setBarbersLoading(false);
      setBarbersRefreshing(false);

      const [servicesResult, packagesResult, promotionsResult] = await Promise.allSettled([
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

      let nextServices = [];
      let validServiceIds = new Set();
      if (servicesResult.status === 'fulfilled') {
        const servicesResponse = servicesResult.value;
        const servicesPayload = servicesResponse?.data ?? servicesResponse;
        const rawServices = Array.isArray(servicesPayload?.servicios)
          ? servicesPayload.servicios.filter(
            (service) => service?.activo !== false && service?.agendable && !service?.servicio_informativo
          )
          : [];
        const dedupedServicesMap = new Map();
        rawServices.forEach((service) => {
          const serviceId = String(service?.id_servicio || '').trim();
          if (!serviceId || dedupedServicesMap.has(serviceId)) return;
          dedupedServicesMap.set(serviceId, service);
        });
        nextServices = Array.from(dedupedServicesMap.values());
        validServiceIds = new Set(nextServices.map((service) => service.id_servicio));
      }

      let nextPackages = [];
      let validPackageIds = new Set();
      if (packagesResult.status === 'fulfilled') {
        const packagesResponse = packagesResult.value;
        const packagesPayload = packagesResponse?.data ?? packagesResponse;
        nextPackages = Array.isArray(packagesPayload?.paquetes)
          ? packagesPayload.paquetes
          : [];
        validPackageIds = new Set(nextPackages.map((pkg) => pkg.id_paquete));
      }

      const nextPromotions = promotionsResult.status === 'fulfilled'
        ? (() => {
          const promotionsResponse = promotionsResult.value;
          const promotionsPayload = promotionsResponse?.data ?? promotionsResponse;
          return Array.isArray(promotionsPayload?.promociones)
            ? promotionsPayload.promociones
            : [];
        })()
        : [];
      const validPromotionIds = new Set(nextPromotions.map((promotion) => String(promotion?.id_promocion || '').trim()).filter(Boolean));
      if (promotionsResult.status !== 'fulfilled') {
        setPromotionsLoadError('No se pudieron cargar promociones en este momento. Puedes continuar sin promociones.');
      }
      if (servicesResult.status !== 'fulfilled' || packagesResult.status !== 'fulfilled') {
        setAvailabilityError('No se pudo cargar el catálogo completo de esta sucursal en este momento. Puedes reintentar.');
      }

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
          const nextServiceIdsRaw = block.serviceIds.filter((serviceId) => validServiceIds.has(serviceId));
          const nextPackageId = validPackageIds.has(block.packageId)
            ? block.packageId
            : '';
          const nextPromotionIds = normalizePromotionIds(block.promotionIds, block.promotionId)
            .filter((id) => validPromotionIds.has(id))
            .slice(0, maxPromotionsPerBooking);
          const nextPromotionId = nextPromotionIds[0] || '';

          const nextPackage = nextPackageId
            ? nextPackages.find((pkg) => pkg?.id_paquete === nextPackageId) || null
            : null;
          const includedByPackage = new Set(
            (Array.isArray(nextPackage?.items) ? nextPackage.items : [])
              .map((item) => String(item?.id_servicio || '').trim())
              .filter(Boolean)
          );
          const nextServiceIds = nextServiceIdsRaw.filter((serviceId) => !includedByPackage.has(serviceId));

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
            && areServiceIdsEqual(block.promotionIds, nextPromotionIds)
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
            promotionIds: nextPromotionIds,
            selectedDate: '',
            selectedTime: '',
            selectedDateTime: '',
          };
        });

        return hasChanges ? nextBlocks : normalizedSource;
      });
    } catch (err) {
      if (requestSeq !== branchDataRequestSeqRef.current) return;
      const status = Number(err?.status || 0);
      const message = status >= 500
        ? 'No se pudo cargar la agenda de esta sucursal en este momento. Puedes reintentar o cambiar de sucursal.'
        : extractMessage(err);
      setBarbers([]);
      setAvailabilityError(message);
      notifyError(message, { dedupeKey: 'public-booking-branch-data-error' });
    } finally {
      if (requestSeq === branchDataRequestSeqRef.current) {
        setBarbersLoading(false);
        setBarbersRefreshing(false);
        setServicesLoading(false);
        setPackagesLoading(false);
        setPromotionsLoading(false);
      }
    }
  }, [activeBlockBarberId, maxPromotionsPerBooking, notifyError, selectedBranchId]);

  const fetchAvailability = useCallback(async () => {
    const hasSelection = Boolean(selectedPackageId) || effectiveSelectedServiceIdsForAgenda.length > 0;
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
      if (
        !holdResult
        && selectedDate
        && (selectedDate < minBookingDateKey || (shouldValidateSelectedDate && !cached[selectedDate]?.disponible))
      ) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedDate: '',
          selectedTime: '',
          selectedDateTime: '',
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
          servicios: effectiveSelectedServiceIdsForAgenda.length > 0 ? effectiveSelectedServiceIdsForAgenda.join(',') : undefined,
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
      if (
        !holdResult
        && selectedDate
        && (selectedDate < minBookingDateKey || (shouldValidateSelectedDate && !nextMap[selectedDate]?.disponible))
      ) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedDate: '',
          selectedTime: '',
          selectedDateTime: '',
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
    holdResult,
    selectionCacheKey,
    effectiveSelectionType,
    effectiveSelectedServiceIdsForAgenda,
    selectedPackageId,
    updateBlockAtIndex,
  ]);

  const fetchSlots = useCallback(async () => {
    const hasSelection = Boolean(selectedPackageId) || effectiveSelectedServiceIdsForAgenda.length > 0;
    if (!selectedBranchId || !hasSelection || !selectedDate) {
      setSlots(buildDefaultSlots());
      setSlotsCurated(createEmptyCuratedSlots());
      setSlotMetrics({ duracionTotalMin: 0, bufferTotalMin: 0 });
      setSlotsLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId || 'auto', selectionCacheKey, selectedDate].join('|');
    const cached = slotsCacheRef.current.get(cacheKey);
    if (cached) {
      setSlots(cached.slots);
      setSlotsCurated(cached.curated || createEmptyCuratedSlots());
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
          servicios: effectiveSelectedServiceIdsForAgenda.length > 0 ? effectiveSelectedServiceIdsForAgenda.join(',') : undefined,
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
      const curated = buildCuratedSlots({
        horariosCurados: payload?.horarios_curados,
        horarios: payload?.horarios,
        duracionTotalMin: payload?.duracion_total_min,
      });
      const metrics = {
        duracionTotalMin: Number(payload?.duracion_total_min || 0),
        bufferTotalMin: Number(payload?.buffer_total_min || 0),
      };

      slotsCacheRef.current.set(cacheKey, { slots: mapped, curated, metrics });
      setSlots(mapped);
      setSlotsCurated(curated);
      setSlotMetrics(metrics);

      const currentSelectedTime = selectedTimeRef.current;
      if (currentSelectedTime && !mapped.some((slot) => slot.hora === currentSelectedTime && slot.disponible)) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedTime: '',
          selectedDateTime: '',
        }));
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (requestSeq !== slotsRequestSeqRef.current) return;
      notifyError(extractMessage(err), { dedupeKey: 'public-booking-slots-error' });
    } finally {
      if (requestSeq === slotsRequestSeqRef.current) {
        setSlotsLoading(false);
      }
    }
  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    notifyError,
    selectedBranchId,
    selectedDate,
    selectionCacheKey,
    effectiveSelectionType,
    effectiveSelectedServiceIdsForAgenda,
    selectedPackageId,
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

  const clearSelectedTimes = useCallback((options = {}) => {
    const { onlyIndex = null } = options;
    setBookingBlocks((prev) => prev.map((block, index) => {
      if (onlyIndex != null && index !== onlyIndex) return block;
      if (!block?.selectedTime) return block;
      return normalizeBookingBlock(
        {
          ...block,
          selectedTime: '',
          selectedDateTime: '',
        },
        index
      );
    }));
  }, []);

  const recoverToAgendaForReselection = useCallback((message, options = {}) => {
    const fallbackIndex = Number.isInteger(effectiveActiveBlockIndex) ? effectiveActiveBlockIndex : 0;
    const { onlyIndex = null, dedupeKey = 'public-booking-reselect-hours', keepOtherTimes = true } = options;
    const normalizedOnlyIndex = Number.isInteger(onlyIndex) && onlyIndex >= 0
      ? onlyIndex
      : (keepOtherTimes ? fallbackIndex : null);
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
    setBookingSuccessResult(null);
    clearSelectedTimes({ onlyIndex: normalizedOnlyIndex });
    invalidateAgendaCaches();
    notifications.warning(
      String(message || 'El horario ya no está disponible. Selecciona una nueva hora para continuar.'),
      { dedupeKey }
    );
    navigate('/agendar/agenda', { replace: true });
    void fetchAvailability();
    void fetchSlots();
  }, [
    effectiveActiveBlockIndex,
    clearSelectedTimes,
    fetchAvailability,
    fetchSlots,
    invalidateAgendaCaches,
    navigate,
    notifications,
  ]);

  usePublicAgendaRealtime({
    barberId: activeBlockBarberId,
    dateKey: selectedDate,
    enabled: Boolean(
      location.pathname.startsWith('/agendar/agenda')
      && selectedBranchId
      && activeBlockBarberId
      && (selectedPackageId || selectedServiceIdsEffective.length > 0)
    ),
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
    if (!canUseClienteHold) {
      setMembershipStateData(null);
      setMembershipBranchNotice('');
      membershipBranchNoticeRef.current = '';
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await getClienteMembershipEstado();
        if (cancelled) return;
        const payload = response?.data ?? response;
        setMembershipStateData(payload && typeof payload === 'object' ? payload : null);
      } catch {
        if (cancelled) return;
        setMembershipStateData(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canUseClienteHold]);

  useEffect(() => {
    if (!rewardModeActive) {
      persistRewardBookingContext(null);
      rewardPreparedShownRef.current = false;
      rewardUnavailableShownRef.current = false;
      rewardDiscountInfoShownRef.current = false;
      return;
    }
    persistRewardBookingContext(rewardBookingContext);
  }, [rewardBookingContext, rewardModeActive]);

  useEffect(() => {
    if (!rewardModeActive) return;
    rewardPreparedShownRef.current = false;
    rewardUnavailableShownRef.current = false;
    rewardDiscountInfoShownRef.current = false;
  }, [rewardBookingContext?.canje_context_token, rewardModeActive]);

  useEffect(() => {
    if (!rewardModeActive || !rewardBranchId) return;
    if (!branchList.some((branch) => branch.id_sucursal === rewardBranchId)) return;
    if (selectedBranchId === rewardBranchId) return;
    setSelectedBranchId(rewardBranchId);
  }, [branchList, rewardBranchId, rewardModeActive, selectedBranchId]);

  useEffect(() => {
    if (!rewardModeActive || !selectedBranchId || !selectedBarberId || !rewardServiceId) return;
    if (selectedBranchId !== rewardBranchId) return;
    setBookingBlocks((prev) => {
      const source = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createBookingBlock({ alias: 'Titular' })];
      const titular = normalizeBookingBlock(source[0], 0);
      const mergedServiceIds = Array.from(new Set([
        rewardServiceId,
        ...(Array.isArray(titular.serviceIds) ? titular.serviceIds : []),
      ]));
      const nextType = titular.packageId && mergedServiceIds.length > 0 ? 'mixed' : 'services';
      if (areServiceIdsEqual(titular.serviceIds, mergedServiceIds) && titular.selectionType === nextType) {
        return prev;
      }
      const next = [...source];
      next[0] = normalizeBookingBlock(
        {
          ...titular,
          selectionType: nextType,
          serviceIds: mergedServiceIds,
          selectedTime: '',
          selectedDateTime: '',
        },
        0
      );
      return next;
    });
  }, [rewardBranchId, rewardModeActive, rewardServiceId, selectedBarberId, selectedBranchId]);

  useEffect(() => {
    if (!rewardModeActive) return;
    let clearedAnyPromotion = false;
    setBookingBlocks((prev) => {
      let changed = false;
      const nextBlocks = prev.map((block) => {
        const currentPromotionIds = normalizePromotionIds(block?.promotionIds, block?.promotionId);
        if (!currentPromotionIds.length) return block;
        changed = true;
        clearedAnyPromotion = true;
        return {
          ...block,
          promotionId: '',
          promotionIds: [],
        };
      });
      return changed ? nextBlocks : prev;
    });
    if (clearedAnyPromotion) {
      notifications.info(
        mapPublicBookingErrorMessage(
          'REDEEM_NOT_APPLICABLE',
          'El canje seleccionado no puede combinarse con promociones para esta reserva.'
        ),
        { dedupeKey: 'public-booking-redeem-cleared-promotions' }
      );
    }
  }, [notifications, rewardModeActive]);

  useEffect(() => {
    if (!rewardModeActive) return;
    if (!rewardServiceId) return;
    if (!selectedBranchId || selectedBranchId !== rewardBranchId) return;
    if (servicesLoading) return;
    if (!Array.isArray(services) || services.length === 0) return;
    if (availableServiceIdSet.has(rewardServiceId)) return;
    if (rewardUnavailableShownRef.current) return;
    rewardUnavailableShownRef.current = true;
    notifications.warning('El servicio de recompensa no está disponible en esta sucursal. Elige la sucursal de tu canje o cancela el uso de recompensa.', {
      dedupeKey: 'public-booking-reward-service-unavailable',
    });
  }, [
    availableServiceIdSet,
    notifications,
    rewardBranchId,
    rewardModeActive,
    rewardServiceId,
    selectedBranchId,
    services,
    servicesLoading,
  ]);

  useEffect(() => {
    if (!canUseClienteHold || !selectedBranchId || !selectedBarberId) return;
    if (rewardModeActive) {
      if (membershipBranchNotice || membershipBranchNoticeRef.current) {
        setMembershipBranchNotice('');
        membershipBranchNoticeRef.current = '';
      }
      return;
    }

    if (!activeMembershipPlan) {
      if (hasOperationalMembership && activeMembershipOtherBranchName) {
        const notice = `Tu plan activo pertenece a ${activeMembershipOtherBranchName}. Si agendas en ${selectedBranchName}, esta cita no será cubierta por tu plan y deberás pagar el total.`;
        setMembershipBranchNotice(notice);
        if (membershipBranchNoticeRef.current !== notice) {
          notifications.info(notice, { dedupeKey: 'public-booking-membership-branch-mismatch' });
          membershipBranchNoticeRef.current = notice;
        }
        return;
      }
      if (membershipBranchNotice || membershipBranchNoticeRef.current) {
        setMembershipBranchNotice('');
        membershipBranchNoticeRef.current = '';
      }
      return;
    }

    if (membershipBranchNotice) {
      setMembershipBranchNotice('');
      membershipBranchNoticeRef.current = '';
    }

    if (membershipLockedServiceIdsForTitular.length === 0) return;

    setBookingBlocks((prev) => {
      const source = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createBookingBlock({ alias: 'Titular' })];
      const currentTitular = normalizeBookingBlock(source[0], 0);
      const mergedServiceIds = Array.from(new Set([
        ...membershipLockedServiceIdsForTitular,
        ...(Array.isArray(currentTitular.serviceIds) ? currentTitular.serviceIds : []),
      ]));
      const nextSelectionType = currentTitular.packageId && mergedServiceIds.length > 0
        ? 'mixed'
        : 'services';
      if (
        areServiceIdsEqual(currentTitular.serviceIds, mergedServiceIds)
        && currentTitular.selectionType === nextSelectionType
      ) {
        return prev;
      }
      const next = [...source];
      next[0] = normalizeBookingBlock(
        {
          ...currentTitular,
          selectionType: nextSelectionType,
          serviceIds: mergedServiceIds,
          selectedTime: '',
          selectedDateTime: '',
        },
        0
      );
      return next;
    });
  }, [
    activeMembershipPlan,
    activeMembershipOtherBranchName,
    canUseClienteHold,
    hasOperationalMembership,
    membershipBranchNotice,
    membershipLockedServiceIdsForTitular,
    rewardModeActive,
    notifications,
    selectedBarberId,
    selectedBranchId,
    selectedBranchName,
  ]);

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
            selectedDateTime: '',
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
            selectedDateTime: '',
          },
          index
        );
      });
      return changed ? next : prev;
    });
  }, [titularSelectedDate]);

  useEffect(() => {
    setBookingBlocks((prev) => {
      let changed = false;
      const nextBlocks = prev.map((block) => {
        const currentPromotionIds = normalizePromotionIds(block?.promotionIds, block?.promotionId)
          .slice(0, maxPromotionsPerBooking);
        if (!currentPromotionIds.length) {
          if (!block?.promotionId && (!Array.isArray(block?.promotionIds) || block.promotionIds.length === 0)) return block;
          changed = true;
          return { ...block, promotionId: '', promotionIds: [] };
        }
        const validPromotionIds = currentPromotionIds.filter((promotionId) => {
          const promotion = promotionsById.get(promotionId);
          if (!promotion) return false;
          const evaluation = evaluatePromotionForBlock({
            block,
            promotion,
            servicesById,
            packagesById,
          });
          return evaluation.canSelect;
        });
        const nextPromotionId = validPromotionIds[0] || '';
        if (
          nextPromotionId === String(block?.promotionId || '').trim()
          && areServiceIdsEqual(validPromotionIds, block?.promotionIds || [])
        ) {
          return block;
        }
        changed = true;
        return {
          ...block,
          promotionId: nextPromotionId,
          promotionIds: validPromotionIds,
        };
      });
      return changed ? nextBlocks : prev;
    });
  }, [bookingBlocks, maxPromotionsPerBooking, packagesById, promotionsById, servicesById]);

  useEffect(() => {
    if (!selectedDate || !selectedTime) return;
    if (!isPastSlotForToday(selectedDate, selectedTime)) return;
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      selectedTime: '',
      selectedDateTime: '',
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
      selectedDateTime: '',
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
    if (!allBlocksComplete) {
      navigate('/agendar/agenda', { replace: true });
      return;
    }
    if (paymentResult?.booking_confirmed) {
      navigate('/agendar/exito', { replace: true });
    }
  }, [allBlocksComplete, location.pathname, navigate, paymentResult?.booking_confirmed]);

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
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
  }, [selectedBranchId, bookingBlocks]);

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
      if (rewardModeActive && rewardBranchId && nextBranchId !== rewardBranchId) {
        notifications.warning('Esta recompensa solo puede usarse en la sucursal donde se preparó el canje.', {
          dedupeKey: 'public-booking-reward-branch-mismatch',
        });
        return;
      }
      resetFlowForBranchChange();
      setSelectedBranchId(nextBranchId);
      navigate('/agendar/barberos');
    },
    [navigate, notifications, resetFlowForBranchChange, rewardBranchId, rewardModeActive, selectedBranchId]
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
      selectedDateTime: '',
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
      if (!allowCompanions || prev.length >= (maxCompanions + 1)) return prev;
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
          selectedDateTime: '',
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
  }, [allowCompanions, effectiveActiveBlockIndex, maxCompanions, resetAvailabilityViewState]);

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
    if (!selectedBranchId || !selectedBarberId) return;
    navigate('/agendar/agenda');
  }, [
    selectedBranchId,
    selectedBarberId,
    navigate,
  ]);

  const goToBarberos = useCallback(() => {
    if (holdResult) return;
    navigate('/agendar/barberos');
  }, [holdResult, navigate]);

  const cancelBookingFlow = useCallback(async () => {
    const confirmed = window.confirm('¿Seguro que deseas cancelar el agendamiento? Se perderán los datos seleccionados.');
    if (!confirmed) return false;

    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    if (groupId) {
      try {
        await releasePublicCitaHold(groupId);
      } catch {
        notifications.warning('No se pudo liberar la reserva temporal en este momento, pero se canceló el flujo local.', {
          dedupeKey: 'public-booking-release-hold-warning',
        });
      }
    }

    persistRewardBookingContext(null);
    setRewardBookingContext(null);
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
    setBookingSuccessResult(null);
    setContextError('');
    setAvailabilityError('');
    setFieldErrors({});
    setPendingCompanionFocusId('');
    setBookingBlocks([createBookingBlock({ alias: 'Titular' })]);
    setActiveBlockIndex(0);
    setCurrentMonth(new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1));
    holderProfileHydratedRef.current = false;
    invalidateAgendaCaches();
    setSlots(buildDefaultSlots());
    setSlotsCurated(createEmptyCuratedSlots());
    setAvailabilityMap({});
    setSlotConflict(null);
    setSlotSuggestions([]);
    navigate('/', { replace: true });
    return true;
  }, [holdResult?.id_grupo_cita, minBookingMonth, navigate, notifications, invalidateAgendaCaches]);

  const cancelRewardRedemptionUsage = useCallback(() => {
    if (!rewardModeActive) return;
    setRewardBookingContext(null);
    persistRewardBookingContext(null);
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
    setBookingBlocks((prev) => {
      const source = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createBookingBlock({ alias: 'Titular' })];
      const titular = normalizeBookingBlock(source[0], 0);
      const nextServiceIds = (Array.isArray(titular.serviceIds) ? titular.serviceIds : [])
        .filter((serviceId) => String(serviceId || '').trim() !== rewardServiceId);
      const nextSelectionType = titular.packageId
        ? (nextServiceIds.length > 0 ? 'mixed' : 'package')
        : 'services';
      const next = [...source];
      next[0] = normalizeBookingBlock(
        {
          ...titular,
          selectionType: nextSelectionType,
          serviceIds: nextServiceIds,
          selectedTime: '',
          selectedDateTime: '',
        },
        0
      );
      return next;
    });
    notifications.info('Cancelaste el uso de la recompensa. Puedes agendar normalmente.', {
      dedupeKey: 'public-booking-reward-cancelled',
    });
  }, [notifications, rewardModeActive, rewardServiceId]);

  const completeBookingFlow = useCallback(() => {
    persistRewardBookingContext(null);
    setRewardBookingContext(null);
    setHoldResult(null);
    setPaymentIntent(null);
    setPaymentResult(null);
    setBookingSuccessResult(null);
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

  const resolveProfilePersistModal = useCallback((shouldPersist) => {
    const resolver = profilePersistResolveRef.current;
    profilePersistResolveRef.current = null;
    setProfilePersistModal({ open: false, kind: '' });
    if (typeof resolver === 'function') {
      resolver(Boolean(shouldPersist));
    }
  }, []);

  const requestProfilePersistDecision = useCallback((kind) => new Promise((resolve) => {
    profilePersistResolveRef.current = resolve;
    setProfilePersistModal({
      open: true,
      kind: String(kind || '').trim(),
    });
  }), []);

  const toggleService = useCallback((serviceId) => {
    if (!serviceId) return;
    const normalizedServiceId = String(serviceId || '').trim();
    if (!normalizedServiceId) return;
    const currentBlock = bookingBlocks[effectiveActiveBlockIndex];
    const contactState = resolveBlockContactState(currentBlock, effectiveActiveBlockIndex);
    if (!contactState.fullName) {
      notifications.warning(
        effectiveActiveBlockIndex === 0
          ? (titularState.isAuthenticated
            ? 'Completa los datos faltantes del titular antes de elegir servicios.'
            : 'Completa el nombre del titular antes de elegir servicios.')
          : 'Completa nombre y apellido del acompañante antes de elegir servicios.',
        { dedupeKey: 'public-booking-contact-name-required' }
      );
      return;
    }
    if (blockedServiceIdSet.has(normalizedServiceId)) {
      if (rewardLockedServiceIdSet.has(normalizedServiceId)) {
        notifications.info('Este servicio está marcado como recompensa cortesía y no se puede quitar.', {
          dedupeKey: `public-booking-reward-service-locked-${normalizedServiceId}`,
        });
      } else if (membershipLockedServiceIdSet.has(normalizedServiceId)) {
        notifications.info('Este servicio está cubierto por tu plan y no se puede quitar.', {
          dedupeKey: `public-booking-membership-service-locked-${normalizedServiceId}`,
        });
      } else {
        notifications.info('Ese servicio ya lo incluye el paquete seleccionado', {
          dedupeKey: `public-booking-service-included-${normalizedServiceId}`,
        });
      }
      return;
    }

    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const normalizedCurrent = normalizeBookingBlock(currentBlock, effectiveActiveBlockIndex);
      const exists = currentBlock.serviceIds.includes(normalizedServiceId);
      const nextServiceIds = exists
        ? currentBlock.serviceIds.filter((id) => id !== normalizedServiceId)
        : [...currentBlock.serviceIds, normalizedServiceId];

      return {
        ...normalizedCurrent,
        selectionType: normalizedCurrent.packageId ? 'mixed' : 'services',
        serviceIds: nextServiceIds,
        selectedDate: (nextServiceIds.length > 0 || normalizedCurrent.packageId) ? currentBlock.selectedDate : '',
        selectedTime: '',
        selectedDateTime: '',
      };
    });

    resetAvailabilityViewState();
  }, [
    blockedServiceIdSet,
    bookingBlocks,
    effectiveActiveBlockIndex,
    membershipLockedServiceIdSet,
    rewardLockedServiceIdSet,
    notifications,
    resetAvailabilityViewState,
    resolveBlockContactState,
    titularState.isAuthenticated,
    updateBlockAtIndex,
  ]);

  const selectSelectionType = useCallback((nextType) => {
    const normalizedType = String(nextType || '').trim().toLowerCase() === 'package' ? 'package' : 'services';
    if (rewardModeActive && effectiveActiveBlockIndex === 0 && normalizedType === 'package') {
      notifications.info('La recompensa cortesía se aplica sobre un servicio individual del titular.', {
        dedupeKey: 'public-booking-reward-package-disabled',
      });
      return;
    }
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
        selectedDateTime: '',
      };
    });
    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, notifications, resetAvailabilityViewState, rewardModeActive, updateBlockAtIndex]);

  const selectPackage = useCallback((packageId) => {
    if (rewardModeActive && effectiveActiveBlockIndex === 0) {
      notifications.info('La recompensa cortesía no puede combinarse con paquetes en esta fase.', {
        dedupeKey: 'public-booking-reward-package-select-disabled',
      });
      return;
    }
    const normalizedId = String(packageId || '').trim();
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const normalizedCurrent = normalizeBookingBlock(currentBlock, effectiveActiveBlockIndex);
      const nextPackageId = normalizedCurrent.packageId === normalizedId ? '' : normalizedId;
      const selectedPackageEntity = nextPackageId ? packagesById.get(nextPackageId) : null;
      const includedServiceIds = new Set(
        (Array.isArray(selectedPackageEntity?.items) ? selectedPackageEntity.items : [])
          .map((item) => String(item?.id_servicio || '').trim())
          .filter(Boolean)
      );
      const nextServiceIds = nextPackageId
        ? normalizedCurrent.serviceIds.filter((serviceId) => !includedServiceIds.has(serviceId))
        : normalizedCurrent.serviceIds;
      const nextType = nextPackageId && nextServiceIds.length > 0
        ? 'mixed'
        : nextPackageId
          ? 'package'
          : 'services';
      return {
        ...normalizedCurrent,
        selectionType: nextType,
        packageId: nextPackageId,
        serviceIds: nextServiceIds,
        selectedDate: (nextPackageId || nextServiceIds.length > 0) ? currentBlock.selectedDate : '',
        selectedTime: '',
        selectedDateTime: '',
      };
    });
    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, notifications, packagesById, resetAvailabilityViewState, rewardModeActive, updateBlockAtIndex]);

  const selectPromotion = useCallback((promotionId) => {
    if (!selectedBranchId) {
      notifications.warning('Selecciona una sucursal antes de elegir una promoción.', {
        dedupeKey: 'public-booking-promotion-branch-required',
      });
      return;
    }
    if (rewardModeActive) {
      notifications.warning(
        mapPublicBookingErrorMessage(
          'REDEEM_NOT_APPLICABLE',
          'El canje seleccionado no puede combinarse con promociones para esta reserva.'
        ),
        { dedupeKey: 'public-booking-redeem-promotion-not-allowed' }
      );
      return;
    }

    const normalizedPromotionId = String(promotionId || '').trim();
    if (!normalizedPromotionId) {
      updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
        ...currentBlock,
        promotionId: '',
        promotionIds: [],
      }));
      return;
    }

    const promotion = promotionsById.get(normalizedPromotionId) || null;
    if (!promotion) return;
    const currentBlock = bookingBlocks[effectiveActiveBlockIndex];
    if (!currentBlock) return;
    const currentPromotionIds = normalizePromotionIds(currentBlock?.promotionIds, currentBlock?.promotionId);
    const alreadySelectedInCurrentBlock = currentPromotionIds.includes(normalizedPromotionId);
    if (alreadySelectedInCurrentBlock) {
      updateBlockAtIndex(effectiveActiveBlockIndex, (activeCurrentBlock) => {
        const normalizedCurrentPromotionIds = normalizePromotionIds(
          activeCurrentBlock?.promotionIds,
          activeCurrentBlock?.promotionId
        );
        const nextPromotionIds = normalizedCurrentPromotionIds
          .filter((promotionIdInBlock) => promotionIdInBlock !== normalizedPromotionId);
        return {
          ...activeCurrentBlock,
          promotionId: nextPromotionIds[0] || '',
          promotionIds: nextPromotionIds,
        };
      });
      return;
    }
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

    const selectedPromotionIdsAcrossBooking = new Set();
    bookingBlocks.forEach((bookingBlock, bookingBlockIndex) => {
      if (bookingBlockIndex === effectiveActiveBlockIndex) return;
      normalizePromotionIds(bookingBlock?.promotionIds, bookingBlock?.promotionId)
        .forEach((promotionIdInBlock) => selectedPromotionIdsAcrossBooking.add(promotionIdInBlock));
    });
    const nextPromotionIdsCurrentBlock = [...currentPromotionIds, normalizedPromotionId];
    const nextPromotionIdsAcrossBooking = new Set([
      ...selectedPromotionIdsAcrossBooking,
      ...nextPromotionIdsCurrentBlock,
    ]);
    if (nextPromotionIdsAcrossBooking.size > maxPromotionsPerBooking) {
      notifications.warning(mapPublicBookingErrorMessage('MAX_PROMOTIONS_EXCEEDED'), {
        dedupeKey: 'public-booking-max-promotions-select',
      });
      return;
    }

    updateBlockAtIndex(effectiveActiveBlockIndex, (activeCurrentBlock) => {
      const normalizedCurrentPromotionIds = normalizePromotionIds(
        activeCurrentBlock?.promotionIds,
        activeCurrentBlock?.promotionId
      );
      const nextPromotionIds = normalizedCurrentPromotionIds.includes(normalizedPromotionId)
        ? normalizedCurrentPromotionIds.filter((promotionIdInBlock) => promotionIdInBlock !== normalizedPromotionId)
        : [...normalizedCurrentPromotionIds, normalizedPromotionId];
      return {
        ...activeCurrentBlock,
        promotionId: nextPromotionIds[0] || '',
        promotionIds: nextPromotionIds.slice(0, maxPromotionsPerBooking),
      };
    });
  }, [
    bookingBlocks,
    effectiveActiveBlockIndex,
    maxPromotionsPerBooking,
    notifications,
    packagesById,
    promotionsById,
    rewardModeActive,
    selectedBranchId,
    servicesById,
    updateBlockAtIndex,
  ]);

  const clearSelectedPromotion = useCallback(() => {
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      promotionId: '',
      promotionIds: [],
    }));
  }, [effectiveActiveBlockIndex, updateBlockAtIndex]);

  const updateActiveBlockBarber = useCallback((barberId) => {
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      idBarbero: String(barberId || '').trim(),
      selectedDate: currentBlock.selectedDate || '',
      selectedTime: '',
      selectedDateTime: '',
    }));

    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState, updateBlockAtIndex]);

  const updateActiveBlockContact = useCallback((patch) => {
    const normalizedPatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactPhone')) {
      normalizedPatch.contactPhone = String(normalizedPatch.contactPhone || '').replace(/[^\d+\s()-]/g, '').slice(0, 24);
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactEmail')) {
      normalizedPatch.contactEmail = normalizeEmail(normalizedPatch.contactEmail || '');
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactFirstName')) {
      normalizedPatch.contactFirstName = normalizePersonName(normalizedPatch.contactFirstName || '');
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactLastName')) {
      normalizedPatch.contactLastName = normalizePersonName(normalizedPatch.contactLastName || '');
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactName')) {
      const split = splitFullName(normalizedPatch.contactName || '');
      normalizedPatch.contactFirstName = split.firstName;
      normalizedPatch.contactLastName = split.lastName;
      normalizedPatch.contactName = buildFullName(split.firstName, split.lastName) || normalizePersonName(normalizedPatch.contactName || '');
    }
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const next = {
        ...currentBlock,
        ...normalizedPatch,
      };
      const normalizedName = buildFullName(next.contactFirstName, next.contactLastName)
        || normalizePersonName(next.contactName || '');
      next.contactName = normalizedName;
      next.alias = normalizedName || (effectiveActiveBlockIndex === 0 ? 'Titular' : `Acompañante ${effectiveActiveBlockIndex}`);
      return next;
    });
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactName')
      || Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactFirstName')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactFirstName')];
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactName')];
        return next;
      });
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactLastName')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactLastName')];
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
      selectedDateTime: toLocalDateTimeWithOffset(preservedDate, preservedTime) || '',
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
        { ...currentBlock, selectedDate: dateKey, selectedTime: '', selectedDateTime: '' },
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
        servicesCsvValue: effectiveSelectedServiceIdsForAgenda.join(','),
        packageIdValue: selectedPackageId,
      });
      return;
    }

    clearSlotConflict();
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      selectedTime: nextTime,
      selectedDateTime: toLocalDateTimeWithOffset(selectedDate, nextTime) || '',
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
    effectiveSelectedServiceIdsForAgenda,
    selectedPackageId,
    updateBlockAtIndex,
  ]);

  const submitHold = useCallback(async () => {
    if (!selectedBranchId || !selectedBarberId) {
      notifications.warning('Debes seleccionar sucursal y barbero.', { dedupeKey: 'public-booking-hold-context' });
      navigate('/agendar/barberos');
      return false;
    }
    const blocksToSubmit = blocksToSubmitSummary;
    if (blocksToSubmit.length === 0) {
      notifications.warning('Completa servicios, fecha y hora en todos los bloques antes de confirmar.', {
        dedupeKey: 'public-booking-blocks-required',
      });
      navigate('/agendar/agenda');
      return false;
    }
    const localSelectionConflict = blocksToSubmit.find(
      (block) => Array.isArray(block?.selectionConflicts) && block.selectionConflicts.length > 0
    );
    if (localSelectionConflict) {
      const firstConflictCode = String(localSelectionConflict.selectionConflicts[0]?.code || '').trim().toUpperCase();
      notifications.warning(
        mapPublicBookingErrorMessage(firstConflictCode, 'Revisa la selección de servicios y paquete antes de continuar.'),
        { dedupeKey: `public-booking-local-selection-conflict-${firstConflictCode || 'unknown'}` }
      );
      setActiveBlockIndex(Math.max(0, Number(localSelectionConflict.index || 0)));
      navigate('/agendar/agenda');
      return false;
    }
    const requestedPromotionIds = new Set();
    blocksToSubmit.forEach((block) => {
      const blockPromotionIds = normalizePromotionIds(block?.promotionIds, block?.promotionId);
      blockPromotionIds.forEach((id) => requestedPromotionIds.add(id));
    });
    if (rewardModeActive && requestedPromotionIds.size > 0) {
      notifications.warning(
        mapPublicBookingErrorMessage(
          'REDEEM_NOT_APPLICABLE',
          'El canje seleccionado no puede combinarse con promociones para esta reserva.'
        ),
        { dedupeKey: 'public-booking-redeem-and-promotions-not-allowed' }
      );
      navigate('/agendar/agenda');
      return false;
    }
    if (requestedPromotionIds.size > maxPromotionsPerBooking) {
      notifications.warning(mapPublicBookingErrorMessage('MAX_PROMOTIONS_EXCEEDED'), {
        dedupeKey: 'public-booking-promotions-max-before-submit',
      });
      navigate('/agendar/agenda');
      return false;
    }

    const nextFieldErrors = {};
    const titularBlock = bookingBlocks[0] || null;
    const normalizedTitularBlock = normalizeBookingBlock(titularBlock, 0);
    const titularContactState = resolveBlockContactState(normalizedTitularBlock, 0);
    const titularNombre = titularContactState.fullName;
    const titularEmail = titularContactState.email;
    const titularTelefono = titularContactState.phone;
    const titularMissingData = [];
    if (!titularNombre) {
      titularMissingData.push('nombre');
      nextFieldErrors[buildFieldErrorKey(0, 'contactFirstName')] = 'Ingresa el nombre del titular.';
    }
    if (!titularEmail) {
      titularMissingData.push('correo');
      nextFieldErrors[buildFieldErrorKey(0, 'contactEmail')] = 'Ingresa el correo del titular.';
    }
    if (!titularTelefono) {
      titularMissingData.push('telefono');
      nextFieldErrors[buildFieldErrorKey(0, 'contactPhone')] = 'Ingresa el telefono del titular.';
    }
    if (titularMissingData.length > 0) {
      notifications.warning(
        titularState.isAuthenticated
          ? 'Completa los datos faltantes del titular para continuar.'
          : 'Completa nombre, correo y telefono del titular antes de confirmar.',
        {
          dedupeKey: 'public-booking-holder-data-required',
        }
      );
      setActiveBlockIndex(0);
      navigate('/agendar/agenda');
      setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
      return false;
    }
    for (const companion of blocksToSubmit.filter((block) => Number(block?.index) > 0)) {
      const companionContact = companion?.contactResolved || resolveBlockContactState(companion, companion.index);
      if (!companionContact.fullName) {
        nextFieldErrors[buildFieldErrorKey(companion.index, 'contactFirstName')] = 'Completa nombre y apellido del acompanante.';
        nextFieldErrors[buildFieldErrorKey(companion.index, 'contactLastName')] = 'Completa nombre y apellido del acompanante.';
        notifications.warning('Cada acompañante debe tener nombre y apellido válidos para confirmar.', {
          dedupeKey: 'public-booking-companion-data-required-submit',
        });
        setActiveBlockIndex(companion.index);
        navigate('/agendar/agenda');
        setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
        return false;
      }
      if (canUseClienteHold && titularState.isAuthenticated) {
        const companionEmail = normalizeEmail(companionContact.email || '');
        const holderEmail = normalizeEmail(titularEmail || '');
        if (companionEmail && holderEmail && companionEmail === holderEmail) {
          setFieldError(companion.index, 'contactEmail', mapPublicBookingErrorMessage('AUTHENTICATED_USER_CANNOT_BE_COMPANION'));
          notifications.warning(mapPublicBookingErrorMessage('AUTHENTICATED_USER_CANNOT_BE_COMPANION'), {
            dedupeKey: 'public-booking-companion-same-auth-user',
          });
          setActiveBlockIndex(companion.index);
          navigate('/agendar/agenda');
          return false;
        }
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
            servicesCsvValue: Array.isArray(block.selectedServiceIdsEffective) ? block.selectedServiceIdsEffective.join(',') : '',
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
      const preservedFechaInicio = String(block?.selectedDateTime || '').trim();
      const expectedPrefix = `${String(block?.selectedDate || '').trim()}T${String(block?.selectedTime || '').trim()}`;
      const fechaInicioNormalizada = (preservedFechaInicio && expectedPrefix && preservedFechaInicio.startsWith(expectedPrefix))
        ? preservedFechaInicio
        : fechaInicio;
      if (!fechaInicioNormalizada) {
        notifications.error('No se pudo construir la fecha y hora de una de las citas del grupo.', {
          dedupeKey: 'public-booking-datetime-invalid',
        });
        return false;
      }
      const blockContactState = resolveBlockContactState(block, block.index);
      const blockPromotionIds = normalizePromotionIds(block?.promotionIds, block?.promotionId);
      const integrantePayload = {
        orden_integrante: block.index + 1,
        alias: blockContactState.fullName || block.alias,
        rol_integrante_codigo: block.index === 0 ? 'titular' : 'acompanante',
        id_barbero: resolvedBarberByBlockId.has(block.id)
          ? resolvedBarberByBlockId.get(block.id)
          : (block.idBarbero || null),
        selection_type: block.selection_type,
        id_paquete: ['package', 'mixed'].includes(block.selection_type) ? (block.selectedPackage?.id_paquete || null) : null,
        fecha_inicio: fechaInicioNormalizada,
        servicios: ['services', 'mixed'].includes(block.selection_type) ? block.selectedServices.map((service) => ({
          id_servicio: service.id_servicio,
        })) : [],
      };
      if (blockPromotionIds.length > 0) {
        integrantePayload.promotionIds = blockPromotionIds;
        integrantePayload.promotionId = blockPromotionIds[0] || null;
      }
      if (!canUseClienteHold) {
        integrantePayload.contacto = {
          nombre: String(blockContactState.fullName || block.alias || '').trim(),
          nombres: String(blockContactState.firstName || '').trim() || null,
          apellidos: String(blockContactState.lastName || '').trim() || null,
          email: String(blockContactState.email || '').trim().toLowerCase() || null,
          telefono: String(blockContactState.phone || '').trim() || null,
        };
      }
      integrantes.push(integrantePayload);
    }

    let guardarNombresApellidos = false;
    let guardarTelefono = false;
    if (canUseClienteHold && titularState.isAuthenticated) {
      const puedeGuardarNombres = (
        (titularState.missingFields.includes('nombres') && normalizedTitularBlock.contactFirstName)
        || (titularState.missingFields.includes('apellidos') && normalizedTitularBlock.contactLastName)
      );
      const puedeGuardarTelefono = titularState.missingFields.includes('telefono_principal')
        && normalizePhone(normalizedTitularBlock.contactPhone || '').length >= 8;

      if (puedeGuardarNombres) {
        guardarNombresApellidos = await requestProfilePersistDecision('nombres_apellidos');
      }
      if (puedeGuardarTelefono) {
        guardarTelefono = await requestProfilePersistDecision('telefono');
      }
    }

    setHoldSubmitting(true);
    try {
      const holdPayload = {
        id_sucursal: selectedBranchId,
        integrantes,
      };
      if (rewardModeActive && rewardBookingContext?.canje_context_token) {
        holdPayload.canje_context_token = rewardBookingContext.canje_context_token;
      }
      if (canUseClienteHold) {
        holdPayload.titular = {
          nombres: normalizedTitularBlock.contactFirstName || null,
          apellidos: normalizedTitularBlock.contactLastName || null,
          telefono: titularState.missingFields.includes('telefono_principal')
            ? (normalizePhone(normalizedTitularBlock.contactPhone || '') || null)
            : null,
          guardar_nombres_apellidos: guardarNombresApellidos,
          guardar_telefono: guardarTelefono,
        };
      } else {
        holdPayload.titular = {
          nombre: titularNombre,
          email: titularEmail,
          telefono: normalizePhone(titularTelefono),
        };
      }
      const response = canUseClienteHold
        ? await createClienteCitaHold(holdPayload)
        : await createPublicCitaHold(holdPayload);
      const payload = response?.data ?? response;
      setHoldResult(payload);
      return payload;
    } catch (err) {
      const apiError = err?.data?.error || err?.error || {};
      const detailField = String(apiError?.details?.field || '').trim();
      const detailIndexRaw = apiError?.details?.blockIndex;
      const detailOrderRaw = apiError?.details?.orden_integrante;
      const detailOrder = Number.isFinite(Number(detailOrderRaw)) ? Number(detailOrderRaw) : null;
      const detailIndex = Number.isFinite(Number(detailIndexRaw))
        ? Number(detailIndexRaw)
        : (detailOrder != null ? Math.max(0, detailOrder - 1) : null);
      const conflictCode = String(apiError?.code || '').trim().toUpperCase();
      const conflictReason = String(apiError?.reason || '').trim().toUpperCase();
      const safeConflictMessage = mapPublicBookingErrorMessage(conflictCode, extractMessage(err));
      const fallbackConflictIndex = Number.isInteger(effectiveActiveBlockIndex) ? effectiveActiveBlockIndex : 0;
      const affectedIndex = detailIndex != null ? Math.max(0, Math.trunc(detailIndex)) : fallbackConflictIndex;
      const affectedSummaryBlock = bookingBlocksSummary[affectedIndex] || null;
      const affectedLabel = affectedIndex === 0
        ? 'titular'
        : (affectedSummaryBlock?.alias || `Acompañante ${affectedIndex}`);

      if (detailField) {
        const mappedIndex = detailField.startsWith('titular.')
          ? 0
          : (detailIndex != null ? detailIndex : effectiveActiveBlockIndex);
        const mappedField = detailField.includes('telefono')
          ? 'contactPhone'
          : detailField.includes('email')
            ? 'contactEmail'
            : detailField.includes('apellidos')
              ? 'contactLastName'
              : detailField.includes('nombres')
                ? 'contactFirstName'
                : detailField.includes('nombre')
                  ? 'contactFirstName'
                  : null;
        if (mappedField) {
          setFieldError(mappedIndex, mappedField, safeConflictMessage);
          setActiveBlockIndex(mappedIndex);
          navigate('/agendar/agenda');
        }
      }

      if (conflictCode === 'PUBLIC_CITAS_EMAIL_IN_USE' || conflictCode === 'EMAIL_BELONGS_TO_ACTIVE_USER') {
        const normalizedEmail = String(apiError?.details?.email || titularEmail || '').trim().toLowerCase();
        const emailErrorIndex = detailIndex != null ? Math.max(0, Math.trunc(detailIndex)) : 0;
        const detailRole = String(apiError?.details?.rol_integrante_codigo || '').trim().toLowerCase();
        const detailOrder = Number(apiError?.details?.orden_integrante);
        const isTitularConflict = detailRole === 'titular' || emailErrorIndex === 0;
        const companionNumber = Number.isInteger(detailOrder) && detailOrder > 1
          ? detailOrder - 1
          : Math.max(1, emailErrorIndex);
        const emailLabel = normalizedEmail || 'correo no identificado';
        const conflictMessage = isTitularConflict
          ? `El correo del titular, ${emailLabel}, pertenece a un usuario activo. Debes iniciar sesión para continuar.`
          : `El correo del acompañante ${companionNumber}, ${emailLabel}, pertenece a un usuario activo. Debe iniciar sesión o usar otro correo.`;
        setFieldError(emailErrorIndex, 'contactEmail', mapPublicBookingErrorMessage(conflictCode));
        setActiveBlockIndex(emailErrorIndex);
        navigate('/agendar/agenda');
        notifications.warning(conflictMessage, { dedupeKey: 'public-booking-email-registered-login-required' });
        openAuthRequiredModal(normalizedEmail);
      } else if (conflictCode === 'SERVICE_ALREADY_INCLUDED_IN_PACKAGE') {
        notifications.warning(safeConflictMessage, {
          dedupeKey: 'public-booking-service-included-backend',
        });
        navigate('/agendar/agenda');
      } else if (conflictCode === 'ONLY_ONE_PACKAGE_ALLOWED') {
        notifications.warning(safeConflictMessage, {
          dedupeKey: 'public-booking-only-one-package-backend',
        });
        navigate('/agendar/agenda');
      } else if (
        conflictCode === 'AUTHENTICATED_HOLDER_MISMATCH'
        || conflictCode === 'AUTHENTICATED_USER_CANNOT_BE_COMPANION'
        || conflictCode === 'BOOKING_AUTH_CONTEXT_INVALID'
        || conflictCode === 'PACKAGE_NOT_AVAILABLE'
        || conflictCode === 'MIXED_SELECTION_NOT_ALLOWED'
        || conflictCode === 'DUPLICATED_SERVICE_SELECTION'
        || conflictCode === 'EMPTY_BOOKING_SELECTION'
        || conflictCode === 'MAX_COMPANIONS_EXCEEDED'
        || conflictCode === 'MAX_PROMOTIONS_EXCEEDED'
        || conflictCode === 'PROMOTION_NOT_APPLICABLE'
        || conflictCode === 'PROMOTION_DUPLICATES_SELECTED_ITEM'
        || conflictCode === 'PROMOTION_NOT_STACKABLE'
        || conflictCode === 'PROMOTION_EXPIRED'
        || conflictCode === 'PROMOTION_NOT_ACTIVE'
        || conflictCode === 'PROMOTION_BRANCH_NOT_ALLOWED'
        || conflictCode === 'PROMOTION_BARBER_NOT_ALLOWED'
        || conflictCode === 'PROMOTION_SCHEDULE_NOT_ALLOWED'
        || conflictCode === 'BOOKING_PROMOTION_APPLICATION_FAILED'
        || conflictCode === 'REDEEM_NOT_APPLICABLE'
        || conflictCode === 'REDEEM_CONTEXT_INVALID'
        || conflictCode === 'REDEEM_TRANSACTION_NOT_FOUND'
        || conflictCode === 'REDEEM_NOT_OWNED_BY_USER'
        || conflictCode === 'REDEEM_EXPIRED'
        || conflictCode === 'REDEEM_TRANSACTION_ALREADY_USED'
        || conflictCode === 'REDEEM_AMOUNT_INVALID'
        || conflictCode === 'REDEEM_APPLICATION_FAILED'
        || conflictCode === 'BOOKING_REDEEM_CONSISTENCY_FAILED'
        || conflictCode === 'BOOKING_RECEIPT_CREATION_FAILED'
        || conflictCode === 'BOOKING_CREATION_FAILED'
      ) {
        notifications.warning(safeConflictMessage, {
          dedupeKey: `public-booking-safe-error-${conflictCode || 'unknown'}`,
        });
        navigate('/agendar/agenda');
      } else if (err?.status === 409) {
        const isHoldConflict = conflictCode === 'PUBLIC_CITAS_HOLD_CONFLICT'
          || conflictCode === 'CITAS_HOLD_CONFLICT'
          || conflictCode === 'CITA_HOLD_CONFLICTO'
          || conflictCode === 'SLOT_NOT_AVAILABLE'
          || conflictReason.startsWith('AGENDA_');
        if (isHoldConflict) {
          const shouldClearSelectedTime = conflictReason === 'AGENDA_SLOT_NOT_AVAILABLE'
            || conflictReason === 'AGENDA_AUTOASSIGN_NOT_AVAILABLE';
          const affectedIndex = detailIndex != null
            ? Math.max(0, Math.trunc(detailIndex))
            : fallbackConflictIndex;
          const isSameBarberConflict = conflictReason === 'AGENDA_INTERNAL_GROUP_CONFLICT';
          const conflictMessage = isSameBarberConflict
            ? `${affectedLabel} usa el mismo barbero en un horario que se cruza. Selecciona una hora posterior o cambia de barbero.`
            : `El horario seleccionado para ${affectedLabel} ya no está disponible.`;
          recoverToAgendaForReselection(
            conflictMessage,
            {
              onlyIndex: shouldClearSelectedTime ? affectedIndex : affectedIndex,
              keepOtherTimes: true,
              dedupeKey: 'public-booking-hold-conflict',
            }
          );
        } else {
          notifications.warning(safeConflictMessage, {
            dedupeKey: 'public-booking-hold-conflict-generic',
          });
        }
      } else {
        notifications.error(safeConflictMessage, { dedupeKey: 'public-booking-hold-error' });
      }
      return false;
    } finally {
      setHoldSubmitting(false);
    }
  }, [
    buildFieldErrorKey,
    bookingBlocks,
    bookingBlocksSummary,
    blocksToSubmitSummary,
    effectiveActiveBlockIndex,
    canUseClienteHold,
    isPastSlotForToday,
    loadSlotSuggestions,
    navigate,
    notifications,
    openAuthRequiredModal,
    maxPromotionsPerBooking,
    requestProfilePersistDecision,
    recoverToAgendaForReselection,
    resolveBlockContactState,
    rewardBookingContext,
    rewardModeActive,
    selectedBarberId,
    selectedBranchId,
    setFieldError,
    titularState.isAuthenticated,
    titularState.missingFields,
  ]);

  useEffect(() => {
    if (!holdResult) {
      lastHoldFingerprintRef.current = '';
      return;
    }
    if (!lastHoldFingerprintRef.current) {
      lastHoldFingerprintRef.current = bookingSelectionFingerprint;
      return;
    }
    if (lastHoldFingerprintRef.current !== bookingSelectionFingerprint) {
      setHoldResult(null);
      setPaymentIntent(null);
      setPaymentResult(null);
      setBookingSuccessResult(null);
      lastHoldFingerprintRef.current = '';
    }
  }, [bookingSelectionFingerprint, holdResult]);

  const goToConfirm = useCallback(async () => {
    if (holdSubmitting) return false;
    if (!allBlocksComplete) {
      notifications.warning(bookingBlockingReason || 'Completa servicios, fecha y hora antes de continuar a resumen.', {
        dedupeKey: 'public-booking-confirm-requires-complete-blocks',
      });
      return false;
    }
    if (!canUseClienteHold) {
      const titularBlock = normalizeBookingBlock(bookingBlocks[0] || null, 0);
      const titularContactState = resolveBlockContactState(titularBlock, 0);
      const titularNombre = String(titularContactState.fullName || '').trim();
      const titularEmail = String(titularContactState.email || '').trim().toLowerCase();
      const titularTelefono = String(titularContactState.phone || '').trim();
      try {
        await validatePublicTitularForBooking({
          titular: {
            nombre: titularNombre,
            email: titularEmail,
            telefono: titularTelefono,
          },
        });
      } catch (err) {
        const apiError = err?.data?.error || err?.error || {};
        const conflictCode = String(apiError?.code || '').trim().toUpperCase();
        if (conflictCode === 'PUBLIC_CITAS_EMAIL_IN_USE' || conflictCode === 'EMAIL_BELONGS_TO_ACTIVE_USER') {
          setFieldError(0, 'contactEmail', mapPublicBookingErrorMessage(conflictCode));
          setActiveBlockIndex(0);
          navigate('/agendar/agenda');
          notifications.warning(
            `El correo del titular, ${titularEmail || 'correo no identificado'}, pertenece a un usuario activo. Debes iniciar sesión para continuar.`,
            { dedupeKey: 'public-booking-email-registered-login-required-preconfirm' }
          );
          openAuthRequiredModal(titularEmail);
          return false;
        }
        notifications.warning(extractMessage(err), {
          dedupeKey: 'public-booking-validate-titular-before-confirm',
        });
        return false;
      }
    }
    navigate('/agendar/confirmar');
    return true;
  }, [
    allBlocksComplete,
    bookingBlockingReason,
    holdSubmitting,
    canUseClienteHold,
    bookingBlocks,
    resolveBlockContactState,
    navigate,
    notifications,
    setFieldError,
    setActiveBlockIndex,
    openAuthRequiredModal,
  ]);

  const goToPayment = useCallback(() => {
    if (!allBlocksComplete) return;
    if (paymentResult?.booking_confirmed) return;
    navigate('/agendar/pagar');
  }, [allBlocksComplete, navigate, paymentResult?.booking_confirmed]);

  const shouldRecoverFromPaymentError = useCallback((rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();
    return code === 'PUBLIC_PAGOS_HOLD_EXPIRED'
      || code === 'PUBLIC_PAGOS_GROUP_STATE_INVALID'
      || code === 'PUBLIC_PAGOS_GROUP_NOT_FOUND'
      || code === 'PUBLIC_PAGOS_INTENT_NOT_FOUND';
  }, []);

  const createPaymentIntentForHold = useCallback(async () => {
    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    const titularContact = resolveBlockContactState(bookingBlocks[0], 0);
    const titularEmail = String(titularContact.email || '').trim().toLowerCase();
    if (!groupId) {
      notifications.warning('Estamos reservando tu horario. Espera un momento e inténtalo nuevamente.', {
        dedupeKey: 'public-booking-hold-creating-for-payment',
      });
      return null;
    }
    if (Number(holdResult?.total_pagar_hnl || 0) <= 0) {
      notifications.warning('Esta reserva no requiere pago. Confírmala directamente.', {
        dedupeKey: 'public-booking-payment-not-required',
      });
      navigate('/agendar/confirmar');
      return null;
    }
    if (!isValidEmail(titularEmail)) {
      notifications.error('No se pudo iniciar el pago porque faltan datos del titular.', {
        dedupeKey: 'public-booking-payment-context-missing',
      });
      return null;
    }
    try {
      const response = await createPublicPaymentIntent({
        id_grupo_cita: groupId,
        titular_email: titularEmail,
        nombre_apellido: String(titularContact.fullName || '').trim() || null,
        telefono: normalizePhone(titularContact.phone || '') || null,
      });
      const payload = response?.data ?? response;
      setPaymentIntent(payload);
      if (payload?.expires_at) {
        setHoldResult((current) => (current ? { ...current, expires_at: payload.expires_at } : current));
      }
      return payload;
    } catch (err) {
      const apiError = err?.data?.error || err?.error || {};
      const errorCode = String(apiError?.code || '').trim().toUpperCase();
      if (err?.status === 409 && shouldRecoverFromPaymentError(errorCode)) {
        recoverToAgendaForReselection(
          'El horario seleccionado dejó de estar disponible durante el pago. Elige una nueva hora para continuar.',
          { dedupeKey: 'public-booking-payment-recover-create-intent' }
        );
        return null;
      }
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-intent-error' });
      return null;
    }
  }, [
    bookingBlocks,
    holdResult?.id_grupo_cita,
    notifications,
    resolveBlockContactState,
    recoverToAgendaForReselection,
    shouldRecoverFromPaymentError,
    navigate,
    holdResult?.total_pagar_hnl,
  ]);

  const confirmHoldWithoutPayment = useCallback(async (options = {}) => {
    const explicitGroupId = String(options?.idGrupoCita || '').trim();
    const groupId = explicitGroupId || String(holdResult?.id_grupo_cita || '').trim();
    const allowConfirmedGroupWithBalance = options?.allowConfirmedGroupWithBalance === true;
    const totalToPay = Number(
      options?.totalPagarHnl
      ?? holdResult?.total_pagar_hnl
      ?? 0
    );
    const rewardContextToken = String(
      rewardBookingContext?.canje_context_token
      || rewardBookingContext?.id_points_tx_canje
      || ''
    ).trim();
    const requestTimeoutMs = 20000;
    const requestController = typeof AbortController !== 'undefined'
      ? new AbortController()
      : null;
    let timeoutId = null;
    if (requestController) {
      timeoutId = setTimeout(() => {
        try {
          requestController.abort('confirm_hold_timeout');
        } catch {
          // no-op
        }
      }, requestTimeoutMs);
    }
    if (!canUseClienteHold) {
      notifications.warning('Debes iniciar sesión como cliente para confirmar sin pago.', {
        dedupeKey: 'public-booking-confirm-no-payment-auth-required',
      });
      if (timeoutId) clearTimeout(timeoutId);
      return false;
    }
    if (!groupId) {
      notifications.error('No encontramos una reserva válida para confirmar.', {
        dedupeKey: 'public-booking-confirm-no-payment-group-missing',
      });
      if (timeoutId) clearTimeout(timeoutId);
      return false;
    }
    if (totalToPay > 0 && !allowConfirmedGroupWithBalance) {
      notifications.warning('Esta reserva tiene saldo pendiente. Debes continuar al pago.', {
        dedupeKey: 'public-booking-confirm-no-payment-pending-balance',
      });
      if (timeoutId) clearTimeout(timeoutId);
      return false;
    }
    try {
      const confirmPayload = rewardContextToken
        ? { canje_context_token: rewardContextToken }
        : {};
      const response = await confirmClienteCitaHoldWithoutPayment(
        groupId,
        confirmPayload,
        requestController
          ? { signal: requestController.signal }
          : {}
      );
      const envelope = response && typeof response === 'object' ? response : {};
      const payloadRaw = envelope?.data && typeof envelope.data === 'object'
        ? envelope.data
        : envelope;
      const payload = payloadRaw && typeof payloadRaw === 'object' ? payloadRaw : {};
      const confirmedFlag = payload?.confirmado_sin_pago === true
        || payload?.ya_confirmadas === true;
      const okFlag = envelope?.ok === true
        || envelope?.success === true
        || confirmedFlag;
      if (!okFlag) {
        notifications.error('No se pudo confirmar la cita. Intenta nuevamente.', {
          dedupeKey: 'public-booking-confirm-no-payment-invalid-response',
        });
        return false;
      }
      const citasConfirmadas = extractConfirmedAppointments(payload);
      const codigoCita = String(payload?.codigo_cita || '').trim() || extractBookingCode(payload);
      const rewardApplied = payload?.recompensa_utilizada?.aplicada === true
        || payload?.recompensa_utilizada?.ya_aplicada === true;
      const rewardMessage = rewardApplied
        ? String(payload?.recompensa_utilizada?.mensaje || 'Recompensa utilizada. Se descontaron 10 puntos de tu ruta.').trim()
        : '';
      setPaymentResult((current) => ({
        ...(current && typeof current === 'object' ? current : {}),
        booking_confirmed: true,
        confirmation: payload,
        codigo_cita: codigoCita || current?.codigo_cita,
        citas_confirmadas: citasConfirmadas.length > 0 ? citasConfirmadas : current?.citas_confirmadas,
      }));
      setBookingSuccessResult({
        source: rewardApplied ? 'reward_no_payment' : 'membership_no_payment',
        confirmation: payload,
        codigo_cita: codigoCita,
        citas_confirmadas: Array.isArray(payload?.citas_confirmadas)
          ? payload.citas_confirmadas
          : citasConfirmadas,
        estado_pago: rewardApplied
          ? (rewardMessage || 'Recompensa utilizada')
          : 'cubierto_por_plan',
        total_pagado_hnl: 0,
        recompensa_utilizada: payload?.recompensa_utilizada || null,
        created_at: new Date().toISOString(),
      });
      notifications.success('Cita confirmada exitosamente.', {
        dedupeKey: 'public-booking-confirm-no-payment-success',
      });
      if (rewardApplied) {
        notifications.info(rewardMessage || 'Recompensa utilizada. Se descontaron 10 puntos de tu ruta.', {
          dedupeKey: 'public-booking-reward-confirmed-success',
        });
      }
      if (!options?.skipNavigate) {
        navigate('/agendar/exito');
      }
      return true;
    } catch (err) {
      if (err?.status === 409) {
        const errorCode = String(err?.data?.error?.code || '').trim().toUpperCase();
        if (errorCode === 'POINTS_REDEEM_INSUFFICIENT_BALANCE_CONFIRM') {
          notifications.error('No tienes saldo suficiente para confirmar esta recompensa. Recarga puntos y vuelve a intentarlo.', {
            dedupeKey: 'public-booking-reward-insufficient-on-confirm',
          });
        } else {
          notifications.warning('Esta reserva tiene saldo pendiente. Debes continuar al pago.', {
            dedupeKey: 'public-booking-confirm-no-payment-pending-balance-409',
          });
        }
        return false;
      }
      if (err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted')) {
        notifications.error('La confirmación tardó demasiado. Intenta nuevamente.', {
          dedupeKey: 'public-booking-confirm-no-payment-timeout',
        });
        return false;
      }
      notifications.error(extractMessage(err), {
        dedupeKey: 'public-booking-confirm-no-payment-error',
      });
      return false;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, [canUseClienteHold, holdResult, navigate, notifications, rewardBookingContext]);

  const refreshPaymentStatus = useCallback(async () => {
    if (!location.pathname.startsWith('/agendar/pagar')) return null;
    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    const intentId = String(paymentIntent?.id_intent || '').trim();
    const titularContact = resolveBlockContactState(bookingBlocks[0], 0);
    const titularEmail = String(titularContact.email || '').trim().toLowerCase();
    if (!groupId || !intentId || !isValidEmail(titularEmail)) return null;

    if (paymentStatusAbortRef.current) {
      paymentStatusAbortRef.current.abort('payment_status_refresh_replaced');
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    paymentStatusAbortRef.current = controller;

    try {
      const response = await getPublicPaymentStatus({
        id_grupo_cita: groupId,
        id_intent: intentId,
        titular_email: titularEmail,
      }, {
        signal: controller?.signal,
      });
      const payload = response?.data ?? response;
      let rewardFinalization = null;
      if (payload?.booking_confirmed && rewardModeActive) {
        const rewardContextToken = String(
          rewardBookingContext?.canje_context_token
          || rewardBookingContext?.id_points_tx_canje
          || ''
        ).trim();
        if (rewardContextToken) {
          try {
            const confirmResponse = await confirmClienteCitaHoldWithoutPayment(groupId, {
              canje_context_token: rewardContextToken,
            });
            const confirmEnvelope = confirmResponse && typeof confirmResponse === 'object' ? confirmResponse : {};
            const confirmPayloadRaw = confirmEnvelope?.data && typeof confirmEnvelope.data === 'object'
              ? confirmEnvelope.data
              : confirmEnvelope;
            const confirmPayload = confirmPayloadRaw && typeof confirmPayloadRaw === 'object'
              ? confirmPayloadRaw
              : {};
            rewardFinalization = confirmPayload?.recompensa_utilizada || null;
            const rewardApplied = rewardFinalization?.aplicada === true || rewardFinalization?.ya_aplicada === true;
            if (rewardApplied) {
              notifications.info(
                String(rewardFinalization?.mensaje || 'Recompensa utilizada. Se descontaron 10 puntos de tu ruta.'),
                { dedupeKey: 'public-booking-reward-finalized-after-payment' }
              );
            }
          } catch (confirmError) {
            const errorCode = String(confirmError?.data?.error?.code || '').trim().toUpperCase();
            if (errorCode === 'POINTS_REDEEM_INSUFFICIENT_BALANCE_CONFIRM') {
              notifications.error('No tienes saldo suficiente para aplicar la recompensa en la confirmación final.', {
                dedupeKey: 'public-booking-reward-insufficient-after-payment',
              });
            } else {
              notifications.error(extractMessage(confirmError), {
                dedupeKey: 'public-booking-reward-finalization-error',
              });
            }
            return null;
          }
        }
      }
      setPaymentResult(payload);
      if (payload?.booking_confirmed) {
        const citasConfirmadas = extractConfirmedAppointments(payload);
        const codigoCita = extractBookingCode(payload);
        const totalPagado = Number(payload?.monto_hnl ?? payload?.total_pagado_hnl ?? holdResult?.total_pagar_hnl ?? 0);
        const rewardApplied = rewardFinalization?.aplicada === true || rewardFinalization?.ya_aplicada === true;
        const rewardMessage = rewardApplied
          ? String(rewardFinalization?.mensaje || 'Recompensa utilizada. Se descontaron 10 puntos de tu ruta.').trim()
          : '';
        setBookingSuccessResult({
          source: 'payment',
          paymentResult: payload,
          codigo_cita: codigoCita,
          citas_confirmadas: citasConfirmadas,
          estado_pago: rewardApplied
            ? (rewardMessage || 'Recompensa utilizada')
            : (String(payload?.estado_intent_codigo || '').trim() || 'pagado'),
          total_pagado_hnl: Number.isFinite(totalPagado) ? totalPagado : 0,
          recompensa_utilizada: rewardFinalization,
          created_at: new Date().toISOString(),
        });
      }
      const intentState = String(payload?.estado_intent_codigo || '').trim().toLowerCase();
      if (!payload?.booking_confirmed && (intentState === 'expirado' || intentState === 'fallido')) {
        recoverToAgendaForReselection(
          'No fue posible completar el pago con el horario reservado. Elige una nueva hora para continuar.',
          { dedupeKey: 'public-booking-payment-recover-status-terminal' }
        );
        return null;
      }
      return payload;
    } catch (err) {
      if (err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted')) {
        return null;
      }
      const apiError = err?.data?.error || err?.error || {};
      const errorCode = String(apiError?.code || '').trim().toUpperCase();
      if (shouldRecoverFromPaymentError(errorCode)) {
        recoverToAgendaForReselection(
          'Tu reserva temporal ya no está disponible. Selecciona un nuevo horario para continuar.',
          { dedupeKey: 'public-booking-payment-recover-status-error' }
        );
        return null;
      }
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-status-error' });
      return null;
    } finally {
      if (paymentStatusAbortRef.current === controller) {
        paymentStatusAbortRef.current = null;
      }
    }
  }, [
    bookingBlocks,
    holdResult?.id_grupo_cita,
    holdResult?.total_pagar_hnl,
    location.pathname,
    notifications,
    paymentIntent?.id_intent,
    rewardBookingContext,
    rewardModeActive,
    resolveBlockContactState,
    recoverToAgendaForReselection,
    shouldRecoverFromPaymentError,
  ]);

  const completeMockPayment = useCallback(async () => {
    const intentId = String(paymentIntent?.id_intent || '').trim();
    const titularContact = resolveBlockContactState(bookingBlocks[0], 0);
    const titularEmail = String(titularContact.email || '').trim().toLowerCase();
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
  }, [bookingBlocks, notifications, paymentIntent?.id_intent, refreshPaymentStatus, resolveBlockContactState]);

  const startCheckout = useCallback(async () => {
    if (paymentResult?.booking_confirmed) return true;
    if (!allBlocksComplete) {
      notifications.warning('Completa servicios, fecha y hora en todos los bloques antes de continuar al pago.', {
        dedupeKey: 'public-booking-checkout-requires-complete-blocks',
      });
      navigate('/agendar/agenda');
      return false;
    }
    if (holdResult && Number(holdResult?.total_pagar_hnl || 0) === 0) {
      notifications.warning('Tu reserva no requiere pago. Confirma la cita desde el resumen.', {
        dedupeKey: 'public-booking-checkout-hold-total-zero',
      });
      navigate('/agendar/confirmar');
      return false;
    }
    navigate('/agendar/pagar');
    return true;
  }, [allBlocksComplete, holdResult, navigate, notifications, paymentResult?.booking_confirmed]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/pagar')) {
      paymentAutoBootstrapAttemptRef.current = '';
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/pagar')) return;
    if (paymentResult?.booking_confirmed) return;

    let cancelled = false;
    const attemptKey = `${location.pathname}|${bookingSelectionFingerprint}`;
    async function bootstrapCheckout() {
      if (!allBlocksComplete) return;
      if (!holdResult) {
        if (paymentAutoBootstrapAttemptRef.current === attemptKey) return;
        paymentAutoBootstrapAttemptRef.current = attemptKey;
        const ok = await submitHold();
        if (!ok || cancelled) return;
        return;
      }
      if (Number(holdResult?.total_pagar_hnl || 0) <= 0) {
        navigate('/agendar/confirmar', { replace: true });
        return;
      }
      if (paymentIntent?.id_intent) return;
      await createPaymentIntentForHold();
    }

    void bootstrapCheckout();
    return () => {
      cancelled = true;
    };
  }, [
    allBlocksComplete,
    bookingSelectionFingerprint,
    createPaymentIntentForHold,
    holdResult,
    holdResult?.total_pagar_hnl,
    location.pathname,
    navigate,
    paymentIntent?.id_intent,
    paymentResult?.booking_confirmed,
    submitHold,
  ]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/pagar')) return;
    if (paymentResult?.booking_confirmed) return;
    if (!holdResult || !holdExpired) return;
    recoverToAgendaForReselection(
      'El tiempo de reserva expiró. Selecciona una nueva hora para continuar.',
      { dedupeKey: 'public-booking-payment-recover-hold-expired' }
    );
  }, [
    holdExpired,
    holdResult,
    location.pathname,
    paymentResult?.booking_confirmed,
    recoverToAgendaForReselection,
  ]);

  useEffect(() => {
    if (location.pathname.startsWith('/agendar/pagar')) return;
    if (paymentStatusAbortRef.current) {
      paymentStatusAbortRef.current.abort('payment_screen_left');
      paymentStatusAbortRef.current = null;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/pagar')) return undefined;
    if (!paymentIntent?.id_intent) return undefined;
    void refreshPaymentStatus();
    const intervalId = setInterval(() => {
      void refreshPaymentStatus();
    }, 4000);
    return () => {
      clearInterval(intervalId);
      if (paymentStatusAbortRef.current) {
        paymentStatusAbortRef.current.abort('payment_polling_cleanup');
        paymentStatusAbortRef.current = null;
      }
    };
  }, [location.pathname, paymentIntent?.id_intent, refreshPaymentStatus]);

  const contextValue = useMemo(
    () => ({
      mode: 'public',
      activeBlock,
      activeBlockContactState,
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
      bookingBlockingReason,
      blockedServiceIds,
      membershipLockedServiceIdsForTitular,
      membershipBranchNotice,
      rewardModeActive,
      rewardServiceId,
      rewardServiceName,
      rewardBranchId,
      rewardBranchName,
      rewardBranchMismatch,
      cancelRewardRedemptionUsage,
      cancelBookingFlow,
      branchList,
      canAddCompanionBlock,
      canUseClienteHold,
      canGoPrevMonth,
      contextData,
      currentMonth,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      goToPayment,
      completeBookingFlow,
      createPaymentIntentForHold,
      confirmHoldWithoutPayment,
      refreshPaymentStatus,
      completeMockPayment,
      startCheckout,
      holdDurationMin,
      holdExpiresAtIso,
      holdRemainingMs,
      holdExpired,
      holdResult,
      holdPricing,
      holdTotalToPay,
      paymentIntent,
      paymentResult,
      bookingSuccessResult,
      pendingCompanionFocusId,
      holdSubmitting,
      isPastSlotForToday,
      maxCompanions,
      maxPromotionsPerBooking,
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
      selectedServiceIdsEffective,
      selectedPackage,
      selectedPackageId,
      selectedPromotion,
      selectedPromotions,
      selectedPromotionId,
      selectedPromotionIds,
      includedServiceIdsFromPackage,
      selectedServicesDurationSum,
      selectedServices,
      selectedTime,
      serviceIds,
      services,
      titularState,
      packages,
      promotions,
      packagesLoading,
      promotionsLoading,
      promotionsLoadError,
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
      slotsCurated,
      slotsLoading,
      slotGridStepMinutes: SLOT_GRID_STEP_MINUTES,
      submitHold,
      syncServicesScrollState,
      toggleService,
      clearSelectedPromotion,
      totalEstimatedPromotionDiscountHnl,
      totalEstimatedToPay,
      totalToPay,
      canConfirmWithoutPayment,
      updateActiveBlockBarber,
      updateActiveBlockContact,
      selectBarber,
      selectBranch,
      fetchAvailability,
      fieldErrors,
    }),
    [
      activeBlock,
      activeBlockContactState,
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
      bookingBlockingReason,
      blockedServiceIds,
      membershipLockedServiceIdsForTitular,
      membershipBranchNotice,
      rewardModeActive,
      rewardServiceId,
      rewardServiceName,
      rewardBranchId,
      rewardBranchName,
      rewardBranchMismatch,
      cancelRewardRedemptionUsage,
      cancelBookingFlow,
      branchList,
      canAddCompanionBlock,
      canUseClienteHold,
      canGoPrevMonth,
      contextData,
      currentMonth,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      goToPayment,
      completeBookingFlow,
      createPaymentIntentForHold,
      confirmHoldWithoutPayment,
      refreshPaymentStatus,
      completeMockPayment,
      startCheckout,
      holdDurationMin,
      holdExpiresAtIso,
      holdRemainingMs,
      holdExpired,
      holdResult,
      holdPricing,
      holdTotalToPay,
      paymentIntent,
      paymentResult,
      bookingSuccessResult,
      pendingCompanionFocusId,
      holdSubmitting,
      isPastSlotForToday,
      maxCompanions,
      maxPromotionsPerBooking,
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
      selectedServiceIdsEffective,
      selectedPackage,
      selectedPackageId,
      selectedPromotion,
      selectedPromotions,
      selectedPromotionId,
      selectedPromotionIds,
      includedServiceIdsFromPackage,
      selectedServicesDurationSum,
      selectedServices,
      selectedTime,
      serviceIds,
      services,
      titularState,
      packages,
      promotions,
      packagesLoading,
      promotionsLoading,
      promotionsLoadError,
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
      slotsCurated,
      slotsLoading,
      submitHold,
      syncServicesScrollState,
      toggleService,
      clearSelectedPromotion,
      totalEstimatedPromotionDiscountHnl,
      totalEstimatedToPay,
      totalToPay,
      canConfirmWithoutPayment,
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
  const showBranchDataErrorBanner = Boolean(
    location.pathname.startsWith('/agendar/barberos')
    && availabilityError
    && !barbersLoading
  );

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
            {showBranchDataErrorBanner ? (
              <div className="public-booking-error">
                <ErrorBanner message={availabilityError} onRetry={fetchBranchData} />
              </div>
            ) : null}
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

        <Dialog
          open={profilePersistModal.open}
          onOpenChange={(open) => {
            if (!open) resolveProfilePersistModal(false);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Deseas guardar estos datos en tu perfil?</DialogTitle>
              <DialogDescription>
                {profilePersistModal.kind === 'telefono'
                  ? 'Para completar tu reserva necesitamos un número de contacto. Lo usaremos únicamente para comunicarnos contigo si ocurre algún imprevisto relacionado con tu cita. ¿Deseas guardarlo en tu perfil para futuras reservas?'
                  : 'Para completar tu reserva necesitamos que tus datos estén correctos. Esto nos ayuda a identificar tu cita y comunicarnos contigo correctamente. ¿Deseas guardar estos datos en tu perfil?'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => resolveProfilePersistModal(false)}
              >
                Usar solo en esta reserva
              </Button>
              <Button type="button" onClick={() => resolveProfilePersistModal(true)}>
                Sí, guardar en perfil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}


