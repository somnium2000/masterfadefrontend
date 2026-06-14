import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  validatePublicBookingContacts,
} from './publicBookingApi.js';
import {
  buildAuthenticatedHoldPayload,
  buildConfirmWithoutPaymentPayload,
  buildCreatePaymentIntentPayload,
  buildPublicHoldPayload,
} from './bookingPayloadBuilders.js';
import {
  resolveActiveBookingBlock,
  resolveBookingTotals,
  resolveConfirmWithoutPaymentState,
  resolveHoldCountdownState,
  resolveHoldPricing,
  resolveHoldTotalToPay,
  resolveItemsById,
  resolveRequestedPromotionIds,
  resolveSelectedPromotions,
} from './bookingFlowSelectors.js';
import {
  BOOKING_COMPANION_ALIAS_PREFIX,
  BOOKING_HOLDER_ALIAS,
  REWARD_BOOKING_CONTEXT_STORAGE_KEY,
  SLOT_GRID_STEP_MINUTES,
} from './constants/bookingDefaults.js';
import { BOOKING_ROUTES } from './constants/bookingRoutes.js';
import {
  getBookingBlockOccupiedRange,
  rangesOverlap,
} from './utils/bookingDates.js';
import {
  areBlocksEqual,
  areServiceIdsEqual,
  createBookingBlock,
  evaluatePromotionForBlock,
  extractBookingCode,
  extractConfirmedAppointments,
  extractPlanIncludedServiceIds,
  extractPlanRemainingServiceIds,
  normalizeBookingBlock,
} from './utils/bookingMappers.js';
import { buildBookingSelectionFingerprint } from './utils/bookingPayloads.js';
import {
  hasLetters,
  isValidEmail,
  readBooleanParam,
  readNumberParam,
} from './utils/bookingValidators.js';
import {
  buildFullName,
  countPhoneDigits,
  MAX_COMPANIONS,
  MAX_PROMOTIONS_PER_BOOKING,
  buildAppointmentSelectionSummary,
  extractMessage,
  getCurrentTimeKeyInTimeZone,
  mapPublicBookingErrorMessage,
  getTodayDateKeyInTimeZone,
  normalizeEmail,
  normalizePromotionIds,
  normalizePhone,
  normalizePersonName,
  toDateKey,
  toLocalDateTimeWithOffset,
  toMonthStartFromDateKey,
} from './bookingUtils.js';
import '../../admin/pages/AdminCitasPage.css';
import './PublicBookingFlow.css';
import usePublicAgendaPolling from './usePublicAgendaPolling.js';
import useBookingMode from './hooks/useBookingMode.js';
import useBookingCatalogs from './hooks/useBookingCatalogs.js';
import useBookingAvailability from './hooks/useBookingAvailability.js';
import useBookingCompanions from './hooks/useBookingCompanions.js';
import useBookingHold from './hooks/useBookingHold.js';
import useBookingPayment from './hooks/useBookingPayment.js';
import useBookingWizardNavigation from './hooks/useBookingWizardNavigation.js';
import BookingLayout from './components/BookingLayout.jsx';
import BookingErrorState from './components/BookingErrorState.jsx';
import { PublicBookingProvider } from './BookingFlowContext.jsx';

export { PublicBookingProvider, usePublicBookingFlow } from './BookingFlowContext.jsx';

const CONTACT_ERROR_FIELD_ORDER = ['contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone'];
const PROFILE_FIELD_LABELS = Object.freeze({
  nombres: 'Nombre',
  apellidos: 'Apellido',
  telefono_principal: 'TelÃ©fono',
  correo_principal: 'Correo',
});

function getContactValidationFeedback(contactState, blockIndex) {
  const errors = contactState?.errors || {};
  const field = CONTACT_ERROR_FIELD_ORDER.find((key) => String(errors?.[key] || '').trim());
  if (!field) return null;
  const isTitular = Number(blockIndex || 0) === 0;
  const fallbackMessage = isTitular
    ? 'Completa los datos del titular.'
    : 'Completa los datos del acompaÃƒÂ±ante.';
  return {
    field,
    message: String(errors[field] || '').trim() || fallbackMessage,
  };
}

function isPublicHoldRateLimitError(error, conflictCode = '') {
  const normalizedCode = String(conflictCode || '').trim().toUpperCase();
  if (error?.status === 429 || normalizedCode === 'TOO_MANY_REQUESTS') {
    return true;
  }
  const message = extractMessage(error);
  return /demasiadas solicitudes|too many requests|rate limit/i.test(String(message || '').trim());
}

function toSafeBlockIndex(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function resolveBookingDetailBlockIndex(details) {
  const directIndex = toSafeBlockIndex(details?.blockIndex);
  if (directIndex != null) return directIndex;

  const field = String(details?.field || '').trim();
  const fieldMatch = field.match(/integrantes\[(\d+)\]/i);
  if (fieldMatch) {
    const fieldIndex = toSafeBlockIndex(fieldMatch[1]);
    if (fieldIndex != null) return fieldIndex;
  }

  const order = Number(details?.orden_integrante);
  if (Number.isInteger(order) && order > 0) return order - 1;
  return null;
}

function mapBookingDetailFieldToContactField(field) {
  const normalizedField = String(field || '').trim().toLowerCase();
  if (!normalizedField) return null;
  if (normalizedField.includes('telefono') || normalizedField.includes('phone')) return 'contactPhone';
  if (normalizedField.includes('email') || normalizedField.includes('correo')) return 'contactEmail';
  if (normalizedField.includes('apellidos') || normalizedField.includes('last_name')) return 'contactLastName';
  if (normalizedField.includes('nombres') || normalizedField.includes('first_name')) return 'contactFirstName';
  if (normalizedField.includes('nombre')) return 'contactFirstName';
  return null;
}

function resolveEmailConflictBlockIndex(details) {
  const detailIndex = resolveBookingDetailBlockIndex(details);
  if (detailIndex != null) return detailIndex;

  const field = String(details?.field || '').trim().toLowerCase();
  if (field.includes('titular.email')) return 0;
  return null;
}

function buildActiveUserEmailFeedback({ details, blockIndex, bookingBlocksSummary, fallbackEmail = '' } = {}) {
  const safeIndex = Math.max(0, Math.trunc(Number(blockIndex || 0)));
  const detailRole = String(details?.rol_integrante_codigo || '').trim().toLowerCase();
  const isTitular = detailRole ? detailRole === 'titular' : safeIndex === 0;
  const summaryBlock = Array.isArray(bookingBlocksSummary) ? bookingBlocksSummary[safeIndex] : null;
  const alias = String(
    details?.alias
    || summaryBlock?.alias
    || (isTitular ? BOOKING_HOLDER_ALIAS : `${BOOKING_COMPANION_ALIAS_PREFIX} ${safeIndex}`)
  ).trim();
  const email = String(details?.email || fallbackEmail || '').trim().toLowerCase();
  const message = isTitular
    ? 'Este correo ya pertenece a una cuenta activa. Inicia sesi\u00f3n para continuar.'
    : `El correo de ${alias || `${BOOKING_COMPANION_ALIAS_PREFIX} ${safeIndex}`} pertenece a una cuenta activa. Ese acompa\u00f1ante debe iniciar sesi\u00f3n o usar otro correo.`;

  return {
    alias,
    email,
    isTitular,
    message,
  };
}

function normalizeContactEmailConflict(rawConflict) {
  const conflictIndex = resolveBookingDetailBlockIndex(rawConflict);
  if (conflictIndex == null) return null;
  const mappedField = mapBookingDetailFieldToContactField(rawConflict?.field || 'contactEmail') || 'contactEmail';
  const message = String(rawConflict?.message || '').trim() || 'Corrige el correo para continuar.';
  return {
    blockIndex: conflictIndex,
    field: mappedField,
    message,
    code: String(rawConflict?.code || '').trim().toUpperCase(),
    email: String(rawConflict?.email || '').trim().toLowerCase(),
    rol_integrante_codigo: String(rawConflict?.rol_integrante_codigo || '').trim().toLowerCase(),
  };
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

function readPendingPaymentResumeContext() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem('mf_pending_payment_context_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const groupId = String(parsed?.id_grupo_cita || '').trim();
    const intentId = String(parsed?.id_intent || parsed?.payment_intent?.id_intent || '').trim();
    const titularEmail = String(parsed?.titular_email || '').trim().toLowerCase();
    if (!groupId || !intentId) return null;
    return {
      id_grupo_cita: groupId,
      id_intent: intentId,
      titular_email: titularEmail,
    };
  } catch {
    return null;
  }
}

export default function PublicBookingFlow() {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const notifyError = notifications.error;
  const {
    mode: bookingMode,
    isAuthenticatedBooking: canUseClienteHold,
    titularFromSession: titularState,
  } = useBookingMode();

  const [bookingBlocks, setBookingBlocks] = useState(() => [createBookingBlock({ alias: BOOKING_HOLDER_ALIAS })]);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [pendingCompanionFocusId, setPendingCompanionFocusId] = useState('');
  const [pendingFieldFocus, setPendingFieldFocus] = useState(null);

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
  const [slotConflict, setSlotConflict] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [authRequiredModal, setAuthRequiredModal] = useState({ open: false, email: '' });
  const [profilePersistModal, setProfilePersistModal] = useState({ open: false, kind: '' });
  const [cancelBookingModal, setCancelBookingModal] = useState({ open: false, source: '' });
  const [cancelBookingProcessing, setCancelBookingProcessing] = useState(false);
  const [profileIncompleteState, setProfileIncompleteState] = useState({ message: '', missingFields: [] });

  const [rewardBookingContext, setRewardBookingContext] = useState(() => readRewardBookingContext());
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [membershipBranchNotice, setMembershipBranchNotice] = useState('');

  const servicesScrollRef = useRef(null);
  const profilePersistResolveRef = useRef(null);
  const membershipBranchNoticeRef = useRef('');
  const rewardPreparedShownRef = useRef(false);
  const rewardUnavailableShownRef = useRef(false);
const rewardDiscountInfoShownRef = useRef(false);
const holdSelectionFingerprintRef = useRef('');
const holderProfileHydratedRef = useRef(false);
const paymentAutoBootstrapAttemptRef = useRef('');
const paymentReturnStatusCheckRef = useRef('');
const invalidHoldSelectionFingerprintRef = useRef('');
const agendaAutoLoadKeyRef = useRef('');
  const [servicesCanScroll, setServicesCanScroll] = useState(false);
  const [servicesAtEnd, setServicesAtEnd] = useState(true);

  const goToClienteProfile = useCallback(() => {
    navigate('/home/cliente/perfil');
  }, [navigate]);

  const setProfileIncompleteFromBackend = useCallback((errorEnvelope = {}) => {
    const sourceMessage = String(errorEnvelope?.message || '').trim();
    const message = sourceMessage || 'Completa tu perfil antes de agendar una cita.';
    const rawMissing = Array.isArray(errorEnvelope?.details?.missing_fields)
      ? errorEnvelope.details.missing_fields
      : [];
    const normalizedMissing = rawMissing
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
    const uniqueMissing = Array.from(new Set(normalizedMissing));
    setProfileIncompleteState({ message, missingFields: uniqueMissing });
  }, []);

  const activeBookingBlockState = useMemo(
    () => resolveActiveBookingBlock({ bookingBlocks, activeBlockIndex }),
    [activeBlockIndex, bookingBlocks]
  );
  const {
    effectiveActiveBlockIndex,
    activeBlock,
    selectedBarberId,
    activeBlockBarberId,
    selectionType,
    selectedPackageId,
    serviceIds,
    selectedDate,
    selectedTime,
    titularSelectedDate,
  } = activeBookingBlockState;
  const pendingResumeContext = useMemo(() => {
    const searchParams = new URLSearchParams(location.search || '');
    const queryGroupId = String(searchParams.get('id_grupo_cita') || '').trim();
    const queryIntentId = String(searchParams.get('id_intent') || '').trim();
    const stored = readPendingPaymentResumeContext();
    const groupId = queryGroupId || String(stored?.id_grupo_cita || '').trim();
    const intentId = queryIntentId || String(stored?.id_intent || '').trim();
    if (!groupId || !intentId) return null;
    return {
      id_grupo_cita: groupId,
      id_intent: intentId,
      titular_email: String(stored?.titular_email || '').trim().toLowerCase(),
    };
  }, [location.search]);
  const isPendingPaymentResumeRoute = location.pathname.startsWith(BOOKING_ROUTES.payment) && Boolean(pendingResumeContext?.id_grupo_cita && pendingResumeContext?.id_intent);
  const {
    contextLoading,
    contextError,
    setContextError,
    contextData,
    selectedBranchId,
    setSelectedBranchId,
    branchList,
    barbersLoading,
    barbersRefreshing,
    barbers,
    servicesLoading,
    services,
    packagesLoading,
    packages,
    promotionsLoading,
    promotions,
    promotionsLoadError,
    membershipStateData,
    fetchContext,
    fetchBranchData,
    abortBranchData,
  } = useBookingCatalogs({
    canUseClienteHold,
    activeBlockBarberId,
    setBookingBlocks,
    setAvailabilityError,
    notifyError,
  });

  useEffect(() => {
    if (!titularState.isAuthenticated) {
      holderProfileHydratedRef.current = false;
      return;
    }
    if (holderProfileHydratedRef.current) return;
    setBookingBlocks((prev) => {
      const source = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createBookingBlock({ alias: BOOKING_HOLDER_ALIAS })];
      const currentTitular = normalizeBookingBlock(source[0], 0);
      const nextFirstName = currentTitular.contactFirstName
        || (currentTitular.contactFirstNameDirty ? '' : titularState.profile.nombres || '');
      const nextLastName = currentTitular.contactLastName
        || (currentTitular.contactLastNameDirty ? '' : titularState.profile.apellidos || '');
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
    () => readBooleanParam(contextData?.parametros, 'simulacion_sin_pago', false),
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
      // AM: FASE 2E - Operativa solo si estÃ¡ estrictamente activa, alineado con backend.
      const isOperational = statusCode === 'activa';
      if (!isOperational) return;
      deduped.set(subscriptionId, plan);
    });
    return Array.from(deduped.values());
  }, [membershipStateData]);

  const activeMembershipPlan = useMemo(
    () => membershipActivePlans.find((plan) => String(plan?.id_sucursal_contratada || '').trim() === selectedBranchId) || null,
    [membershipActivePlans, selectedBranchId]
  );
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
    () => {
      if (effectiveActiveBlockIndex !== 0) return [];
      const includedSet = new Set(activeSelectionSummary.includedServiceIdsFromPackage || []);
      return [...membershipLockedServiceIdsForTitular, ...rewardLockedServiceIdsForTitular]
        .filter((serviceId) => !includedSet.has(String(serviceId || '').trim()));
    },
    [activeSelectionSummary.includedServiceIdsFromPackage, effectiveActiveBlockIndex, membershipLockedServiceIdsForTitular, rewardLockedServiceIdsForTitular]
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

  const servicesById = useMemo(
    () => resolveItemsById(services, 'id_servicio'),
    [services]
  );

  const packagesById = useMemo(
    () => resolveItemsById(packages, 'id_paquete'),
    [packages]
  );

  const promotionsById = useMemo(
    () => resolveItemsById(promotions, 'id_promocion'),
    [promotions]
  );

  const selectedPromotionState = useMemo(
    () => resolveSelectedPromotions({ activeBlock, promotionsById }),
    [activeBlock, promotionsById]
  );
  const {
    selectedPromotionIds,
    selectedPromotionId,
    selectedPromotion,
    selectedPromotions,
  } = selectedPromotionState;

  const effectiveSelectionType = useMemo(() => {
    if (selectedPackage && selectedServices.length > 0) return 'mixed';
    if (selectedPackage) return 'package';
    return 'services';
  }, [selectedPackage, selectedServices.length]);

  const selectionCacheKey = useMemo(
    () => `type:${effectiveSelectionType}|package:${selectedPackageId || ''}|services:${effectiveSelectedServiceIdsForAgenda.join(',')}`,
    [effectiveSelectionType, selectedPackageId, effectiveSelectedServiceIdsForAgenda]
  );

  const bookingAvailabilityFingerprint = useMemo(
    () => JSON.stringify(
      bookingBlocks.map((block, index) => {
        const normalized = normalizeBookingBlock(block, index);
        return {
          id: normalized.id,
          idBarbero: normalized.idBarbero,
          selectionType: normalized.selectionType,
          packageId: normalized.packageId,
          serviceIds: normalized.serviceIds,
          selectedDate: normalized.selectedDate,
          selectedTime: normalized.selectedTime,
          selectedDateTime: normalized.selectedDateTime,
        };
      })
    ),
    [bookingBlocks]
  );

  const bookingHoldFingerprint = useMemo(
    () => JSON.stringify({
      selectedBranchId,
      canUseClienteHold,
      titularAutenticado: canUseClienteHold
        ? {
            email: normalizeEmail(titularState.profile.email),
            missingFields: [...titularState.missingFields].sort(),
            nombres: titularState.profile.nombres,
            apellidos: titularState.profile.apellidos,
            telefono: normalizePhone(titularState.profile.telefono_principal),
          }
        : null,
      rewardContextToken: String(
        rewardBookingContext?.canje_context_token
        || rewardBookingContext?.id_points_tx_canje
        || ''
      ).trim(),
      blocks: bookingBlocks.map((block, index) => {
        const normalized = normalizeBookingBlock(block, index);
        return {
          id: normalized.id,
          idBarbero: normalized.idBarbero,
          selectionType: normalized.selectionType,
          packageId: normalized.packageId,
          serviceIds: [...normalized.serviceIds].sort(),
          promotionIds: normalizePromotionIds(normalized.promotionIds, normalized.promotionId).sort(),
          selectedDate: normalized.selectedDate,
          selectedTime: normalized.selectedTime,
          selectedDateTime: normalized.selectedDateTime,
          contactFirstName: normalized.contactFirstName,
          contactLastName: normalized.contactLastName,
          contactEmail: normalizeEmail(normalized.contactEmail),
          contactPhone: normalizePhone(normalized.contactPhone),
        };
      }),
    }),
    [
      bookingBlocks,
      canUseClienteHold,
      rewardBookingContext,
      selectedBranchId,
      titularState.missingFields,
      titularState.profile.apellidos,
      titularState.profile.email,
      titularState.profile.nombres,
      titularState.profile.telefono_principal,
    ]
  );

  useEffect(() => {
    if (
      invalidHoldSelectionFingerprintRef.current
      && invalidHoldSelectionFingerprintRef.current !== bookingHoldFingerprint
    ) {
      invalidHoldSelectionFingerprintRef.current = '';
    }
  }, [bookingHoldFingerprint]);

  const monthRange = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const from = toDateKey(new Date(year, month, 1));
    const to = toDateKey(new Date(year, month + 1, 0));
    return { from, to };
  }, [currentMonth]);

  const {
    hold: holdResult,
    setHold: setHoldResult,
    creatingHold: holdSubmitting,
    createHold,
    releaseHold,
    confirmHoldWithoutPayment: confirmHoldWithoutPaymentRequest,
    clearHoldLocalState,
    markHoldObsolete,
  } = useBookingHold({
    mode: bookingMode,
    isAuthenticatedBooking: canUseClienteHold,
    selectionFingerprint: bookingHoldFingerprint,
  });

  const {
    paymentIntent,
    paymentResult,
    bookingSuccessResult,
    creatingPaymentIntent,
    checkingPaymentStatus,
    setPaymentResult,
    setBookingSuccessResult,
    clearPaymentState,
    restorePaymentContext,
    createPaymentIntentOnce,
    fetchPaymentStatusOnce,
    completeMockPaymentOnce,
    completeSimulatorPaymentOnce,
    isCurrentPaymentGroup,
  } = useBookingPayment({
    currentGroupId: holdResult?.id_grupo_cita || '',
  });

  const {
    availabilityLoading,
    availabilityMap,
    slotsLoading,
    slots,
    slotsCurated,
    slotMetrics,
    slotSuggestions,
    slotSuggestionsLoading,
    fetchAvailability,
    fetchSlots,
    loadSlotSuggestions,
    invalidateAgendaCaches,
    resetAvailabilityViewState: resetAvailabilityHookViewState,
    resetAvailabilityData,
    abortAvailabilityRequests,
    clearSlotSuggestions,
    fetchSlotsForBarber,
  } = useBookingAvailability({
    selectedBranchId,
    activeBlockBarberId,
    effectiveSelectionType,
    effectiveSelectedServiceIdsForAgenda,
    selectedPackageId,
    selectedDate,
    selectedTime,
    monthRange,
    selectionCacheKey,
    bookingBlocksFingerprint: bookingAvailabilityFingerprint,
    minBookingDateKey,
    holdResult,
    effectiveActiveBlockIndex,
    barbers,
    updateBlockAtIndex,
    availabilityError,
    setAvailabilityError,
    notifyError,
  });

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
  const isValidOptionalEmail = useCallback((value) => {
    const normalized = normalizeEmail(value);
    return !normalized || isValidEmail(normalized);
  }, []);

  const isValidOptionalPhone = useCallback((value) => {
    const raw = String(value || '').trim();
    if (!raw) return true;
    if (hasLetters(raw)) return false;
    return countPhoneDigits(raw) >= 8;
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
        errors.contactEmail = 'No pudimos validar el correo de tu cuenta. Vuelve a iniciar sesiÃ³n.';
      }
      if (needsPhone && !phoneRaw) {
        errors.contactPhone = 'Ingresa un telÃ©fono vÃ¡lido del titular. Debe tener al menos 8 dÃ­gitos.';
      } else if (needsPhone && !isValidOptionalPhone(phoneRaw)) {
        errors.contactPhone = hasLetters(phoneRaw)
          ? 'El telÃ©fono no admite letras.'
          : 'Ingresa un telÃ©fono vÃ¡lido del titular. Debe tener al menos 8 dÃ­gitos.';
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
      if (!firstName) {
        errors.contactFirstName = 'El nombre del titular es obligatorio.';
      }
      if (!lastName) {
        errors.contactLastName = 'El apellido del titular es obligatorio.';
      }
      if (!isValidEmail(email)) {
        errors.contactEmail = 'Ingresa un correo vÃ¡lido del titular.';
      }
      if (!phoneRaw || !isValidOptionalPhone(phoneRaw)) {
        errors.contactPhone = phoneRaw && hasLetters(phoneRaw)
          ? 'El telÃ©fono no admite letras.'
          : 'Ingresa un telÃ©fono vÃ¡lido del titular. Debe tener al menos 8 dÃ­gitos.';
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
      errors.contactFirstName = 'El nombre del acompaÃ±ante es obligatorio.';
    }
    if (!lastName) {
      errors.contactLastName = 'El apellido del acompaÃ±ante es obligatorio.';
    }
    if (!fullName) {
      errors.contactFirstName = errors.contactFirstName || 'Completa nombre y apellido del acompaÃ±ante.';
    }
    if (!isValidOptionalEmail(email)) {
      errors.contactEmail = 'Si ingresas correo del acompaÃ±ante, debe ser vÃ¡lido.';
    }
    if (!isValidOptionalPhone(phoneRaw)) {
      errors.contactPhone = hasLetters(phoneRaw)
        ? 'El telÃ©fono del acompaÃ±ante no admite letras.'
        : 'Ingresa un telÃ©fono vÃ¡lido del acompaÃ±ante. Debe tener al menos 8 dÃ­gitos.';
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
          const packageIncludedSet = new Set(
            (Array.isArray(summary.includedServiceIdsFromPackage) ? summary.includedServiceIdsFromPackage : [])
              .map((serviceId) => String(serviceId || '').trim())
              .filter(Boolean)
          );
          const mergedCoveredIds = new Set([
            ...membershipCoveredSet,
            ...rewardCoveredSet,
          ].filter((serviceId) => !packageIncludedSet.has(String(serviceId || '').trim())));
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
          alias: contactState.fullName || block.alias || (index === 0 ? BOOKING_HOLDER_ALIAS : `${BOOKING_COMPANION_ALIAS_PREFIX} ${index}`),
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

  const bookingTotals = useMemo(
    () => resolveBookingTotals(bookingBlocksSummary),
    [bookingBlocksSummary]
  );
  const {
    totalToPay,
    totalEstimatedPromotionDiscountHnl,
    totalEstimatedToPay,
  } = bookingTotals;
  const bookingSelectionFingerprint = useMemo(
    () => buildBookingSelectionFingerprint(bookingBlocksSummary),
    [bookingBlocksSummary]
  );

  const holdPricing = useMemo(
    () => resolveHoldPricing(holdResult),
    [holdResult]
  );
  const holdTotalToPay = useMemo(
    () => resolveHoldTotalToPay({ holdPricing, holdResult }),
    [holdPricing, holdResult]
  );
  const holdMembership = useMemo(
    () => (holdResult?.membresia && typeof holdResult.membresia === 'object' ? holdResult.membresia : null),
    [holdResult?.membresia]
  );
  const membershipMotivoNoAplica = useMemo(
    () => String(holdMembership?.motivo_no_aplica || '').trim().toUpperCase(),
    [holdMembership?.motivo_no_aplica]
  );
  const membershipAplicaEnCita = holdMembership?.aplica_en_cita === true;
  const membershipBranchMismatch = holdMembership?.branch_mismatch === true || membershipMotivoNoAplica === 'SUCURSAL_DIFERENTE';
  const membershipHasContext = useMemo(() => {
    if (!canUseClienteHold || !holdMembership) return false;
    if (membershipAplicaEnCita) return true;
    if (membershipBranchMismatch) return true;
    if (membershipMotivoNoAplica === 'PLAN_NO_ACTIVO') return true;
    return false;
  }, [canUseClienteHold, holdMembership, membershipAplicaEnCita, membershipBranchMismatch, membershipMotivoNoAplica]);
  const membershipCompanionsCovered = holdMembership?.acompanantes_cubiertos === true;
  const membershipCompanionNotice = useMemo(() => {
    const hasCompanions = Array.isArray(bookingBlocksSummary) && bookingBlocksSummary.length > 1;
    if (!membershipHasContext || !hasCompanions || membershipCompanionsCovered) return '';
    return 'La membresÃ­a aplica solo al titular. Los acompaÃ±antes se cobran como cita normal.';
  }, [bookingBlocksSummary, membershipCompanionsCovered, membershipHasContext]);
  const membershipUxMessage = useMemo(() => {
    if (!membershipHasContext) return '';
    if (membershipAplicaEnCita) {
      return 'Tu membresÃ­a estÃ¡ activa. Los servicios incluidos para el titular se aplicarÃ¡n automÃ¡ticamente.';
    }
    if (membershipBranchMismatch) {
      return 'Tu membresÃ­a estÃ¡ activa en otra sucursal. Para esta cita, el pago se realizarÃ¡ como una cita normal.';
    }
    if (membershipMotivoNoAplica === 'PLAN_NO_ACTIVO') {
      return 'Tu membresÃ­a no estÃ¡ activa actualmente. Esta cita se pagarÃ¡ como una cita normal.';
    }
    return '';
  }, [membershipAplicaEnCita, membershipBranchMismatch, membershipHasContext, membershipMotivoNoAplica]);

  const canConfirmWithoutPayment = resolveConfirmWithoutPaymentState({
    canUseClienteHold,
    holdResult,
    holdTotalToPay,
  });

  const holdCountdownState = useMemo(
    () => resolveHoldCountdownState({ holdResult, paymentIntent, countdownNow }),
    [countdownNow, holdResult, paymentIntent]
  );
  const {
    holdExpiresAtIso,
    holdRemainingMs,
    holdExpired,
  } = holdCountdownState;

  const hasBlockingGroupConflict = useCallback((block) => {
    const blockRange = getBookingBlockOccupiedRange(block);
    if (!block?.idBarbero || !block?.selectedDate || !block?.selectedTime || !blockRange) {
      return false;
    }
    return bookingBlocksSummary.some((candidate) =>
      candidate.id !== block.id
      && candidate.idBarbero === block.idBarbero
      && candidate.selectedDate === block.selectedDate
      && rangesOverlap(
        block.selectedTime,
        blockRange.occupiedDurationMin,
        candidate.selectedTime,
        getBookingBlockOccupiedRange(candidate)?.occupiedDurationMin
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
      && blocksToSubmitSummary.every((block) =>
        block.isComplete
        && Boolean(getBookingBlockOccupiedRange(block))
        && !hasBlockingGroupConflict(block)),
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
        : `acompaÃ±ante ${firstInvalidContact.index}`;
      const feedback = getContactValidationFeedback(firstInvalidContact.contactResolved, firstInvalidContact.index);
      if (feedback?.message) return feedback.message;
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
        : `El acompaÃ±ante ${firstMissingService.index} no tiene servicio seleccionado.`;
    }

    const firstMissingBarber = blocksToSubmitSummary.find((block) => !block?.idBarbero);
    if (firstMissingBarber) {
      return firstMissingBarber.index === 0
        ? 'El titular no tiene barbero seleccionado.'
        : `El acompaÃ±ante ${firstMissingBarber.index} no tiene barbero seleccionado.`;
    }

    const firstMissingDate = blocksToSubmitSummary.find((block) => !block?.selectedDate);
    if (firstMissingDate) {
      return firstMissingDate.index === 0
        ? 'El titular no tiene fecha seleccionada.'
        : `El acompaÃ±ante ${firstMissingDate.index} no tiene fecha seleccionada.`;
    }

    const firstMissingTime = blocksToSubmitSummary.find((block) => !block?.selectedTime);
    if (firstMissingTime) {
      return firstMissingTime.index === 0
        ? 'El titular no tiene horario seleccionado.'
        : `El acompaÃ±ante ${firstMissingTime.index} no tiene horario seleccionado.`;
    }

    const firstMissingDuration = blocksToSubmitSummary.find((block) => !getBookingBlockOccupiedRange(block));
    if (firstMissingDuration) {
      return firstMissingDuration.index === 0
        ? 'El titular no tiene duracion calculada.'
        : `El acompaÃƒÂ±ante ${firstMissingDuration.index} no tiene duracion calculada.`;
    }

    const firstConflict = blocksToSubmitSummary.find((block) => hasBlockingGroupConflict(block));
    if (firstConflict) {
      return firstConflict.index === 0
        ? 'El horario del titular se solapa con otro integrante.'
        : `El horario del acompaÃ±ante ${firstConflict.index} se solapa con otro integrante.`;
    }

    return '';
  }, [blocksToSubmitSummary, hasBlockingGroupConflict]);
  const isPastSlotForToday = useCallback((dateKey, timeKey) => {
    if (!dateKey || !timeKey) return false;
    if (dateKey !== minBookingDateKey) return false;
    return String(timeKey).slice(0, 5) < getCurrentTimeKeyInTimeZone();
  }, [minBookingDateKey]);

  const clearSlotConflict = useCallback(() => {
    setSlotConflict(null);
    clearSlotSuggestions();
  }, [clearSlotSuggestions]);

  const buildFieldErrorKey = useCallback((blockIndex, field) => `${Math.max(Number(blockIndex || 0), 0)}:${String(field || '')}`, []);

  const setFieldError = useCallback((blockIndex, field, message) => {
    const key = buildFieldErrorKey(blockIndex, field);
    setFieldErrors((prev) => ({
      ...prev,
      [key]: String(message || '').trim() || 'Dato invÃ¡lido',
    }));
  }, [buildFieldErrorKey]);

  const focusBookingField = useCallback((blockIndex, field = 'contactEmail') => {
    const parsedIndex = Number(blockIndex);
    const normalizedIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
    const block = bookingBlocks[normalizedIndex] || null;
    setActiveBlockIndex(normalizedIndex);
    if (!block?.id) return;
    setPendingFieldFocus({
      blockId: block.id,
      field,
      requestId: `${block.id}:${field}:${Date.now()}`,
    });
  }, [bookingBlocks, setActiveBlockIndex]);

  const consumePendingFieldFocus = useCallback((requestId) => {
    const normalizedId = String(requestId || '').trim();
    setPendingFieldFocus((current) => {
      if (!current) return null;
      if (!normalizedId || current.requestId === normalizedId) return null;
      return current;
    });
  }, []);

  const resetAvailabilityViewState = useCallback((options = {}) => {
    resetAvailabilityHookViewState(options);
    clearSlotConflict();
  }, [clearSlotConflict, resetAvailabilityHookViewState]);

  const clearRequestState = useCallback(() => {
    abortBranchData();
    resetAvailabilityData();
    clearSlotConflict();
    setFieldErrors({});
    setPendingFieldFocus(null);
  }, [abortBranchData, clearSlotConflict, resetAvailabilityData]);

  const {
    canAddCompanionBlock,
    companionRuleValidation,
    setActiveBlock,
    addCompanionBlock,
    consumePendingCompanionFocus,
    removeCompanionBlock,
    updateActiveBlockBarber,
    updateActiveBlockContact,
    buildIntegrantesPayload,
  } = useBookingCompanions({
    allowCompanions,
    maxCompanions,
    bookingBlocks,
    setBookingBlocks,
    selectedBranchId,
    activeBlockIndex,
    setActiveBlockIndex,
    effectiveActiveBlockIndex,
    titularSelectedDate,
    pendingCompanionFocusId,
    setPendingCompanionFocusId,
    setFieldErrors,
    buildFieldErrorKey,
    clearSlotConflict,
    resetAvailabilityViewState,
    resolveBlockContactState,
    bookingMode,
  });

  const resetFlowForBranchChange = useCallback(() => {
    setBookingBlocks([createBookingBlock({ alias: BOOKING_HOLDER_ALIAS })]);
    setActiveBlockIndex(0);
    setPendingCompanionFocusId('');
    setPendingFieldFocus(null);
    setMembershipBranchNotice('');
    membershipBranchNoticeRef.current = '';
    clearHoldLocalState();
    clearPaymentState();
    setCurrentMonth(new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1));
    clearRequestState();
  }, [clearHoldLocalState, clearPaymentState, clearRequestState, minBookingMonth]);

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

  const findBlockCollision = useCallback((barberId, dateKey, timeKey, durationMinutes, ignoreIndex) => {
    if (!barberId || !dateKey || !timeKey || Number(durationMinutes || 0) <= 0) return null;
    return bookingBlocksSummary.find((block) => {
      const blockRange = getBookingBlockOccupiedRange(block);
      return block.index !== ignoreIndex
        && block.idBarbero === barberId
        && block.selectedDate === dateKey
        && rangesOverlap(timeKey, durationMinutes, block.selectedTime, blockRange?.occupiedDurationMin);
    }) || null;
  }, [bookingBlocksSummary]);

  const refreshPolledAgenda = useCallback(() => {
    abortAvailabilityRequests();
    invalidateAgendaCaches();
    void fetchAvailability();
    if (selectedDate) {
      void fetchSlots();
    }
  }, [abortAvailabilityRequests, fetchAvailability, fetchSlots, invalidateAgendaCaches, selectedDate]);

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
    clearHoldLocalState();
    clearPaymentState();
    clearSelectedTimes({ onlyIndex: normalizedOnlyIndex });
    abortAvailabilityRequests();
    invalidateAgendaCaches();
    notifications.warning(
      String(message || 'El horario ya no estÃ¡ disponible. Selecciona una nueva hora para continuar.'),
      { dedupeKey }
    );
    navigate(BOOKING_ROUTES.agenda, { replace: true });
    void fetchAvailability();
    void fetchSlots();
  }, [
    effectiveActiveBlockIndex,
    abortAvailabilityRequests,
    clearHoldLocalState,
    clearSelectedTimes,
    fetchAvailability,
    fetchSlots,
    invalidateAgendaCaches,
    navigate,
    notifications,
    clearPaymentState,
  ]);

  const rejectInvalidScheduleBlock = useCallback((block) => {
    const normalizedIndex = Number.isInteger(Number(block?.index))
      ? Math.max(0, Number(block.index))
      : (Number.isInteger(effectiveActiveBlockIndex) ? effectiveActiveBlockIndex : 0);
    const label = String(
      block?.alias
      || (normalizedIndex === 0 ? BOOKING_HOLDER_ALIAS : `${BOOKING_COMPANION_ALIAS_PREFIX} ${normalizedIndex}`)
    ).trim();

    invalidHoldSelectionFingerprintRef.current = bookingHoldFingerprint;
    clearSelectedTimes({ onlyIndex: normalizedIndex });
    setSlotConflict(block?.selectedDate && block?.selectedTime && block?.idBarbero
      ? {
          dateKey: block.selectedDate,
          timeKey: block.selectedTime,
          barberId: block.idBarbero,
          conflictingAlias: label,
        }
      : null);
    notifications.warning(`Revisa el horario de ${label}. Selecciona una hora disponible.`, {
      dedupeKey: 'public-booking-submit-invalid-block-schedule',
    });
    setActiveBlockIndex(normalizedIndex);
    navigate(BOOKING_ROUTES.agenda, { replace: true });
    return false;
  }, [
    bookingHoldFingerprint,
    clearSelectedTimes,
    effectiveActiveBlockIndex,
    navigate,
    notifications,
  ]);

  const isBlockSelectedSlotAvailable = useCallback(async (block) => {
    const servicesCsvValue = Array.isArray(block?.selectedServiceIdsEffective)
      ? block.selectedServiceIdsEffective.join(',')
      : '';
    const packageIdValue = String(block?.selectedPackage?.id_paquete || block?.packageId || '').trim();
    const hasSelectionForLookup = Boolean(packageIdValue) || Boolean(servicesCsvValue);
    if (!block?.idBarbero || !block?.selectedDate || !block?.selectedTime || !hasSelectionForLookup) {
      return false;
    }

    try {
      const blockSlots = await fetchSlotsForBarber({
        barberId: block.idBarbero,
        dateKey: block.selectedDate,
        timeKey: block.selectedTime,
        selectionTypeValue: block.selection_type || block.selectionType,
        servicesCsvValue,
        packageIdValue,
      });
      return Array.isArray(blockSlots)
        && blockSlots.some((slot) => slot?.hora === block.selectedTime && slot?.disponible);
    } catch {
      return true;
    }
  }, [fetchSlotsForBarber]);

  usePublicAgendaPolling({
    barberId: activeBlockBarberId,
    dateKey: selectedDate,
    enabled: Boolean(
      location.pathname.startsWith(BOOKING_ROUTES.agenda)
      && selectedBranchId
      && activeBlockBarberId
      && (selectedPackageId || selectedServiceIdsEffective.length > 0)
    ),
    onInvalidate: refreshPolledAgenda,
  });

  useEffect(() => {
    if (canUseClienteHold) return;
    setMembershipBranchNotice('');
    membershipBranchNoticeRef.current = '';
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
  }, [branchList, rewardBranchId, rewardModeActive, selectedBranchId, setSelectedBranchId]);

  useEffect(() => {
    if (!rewardModeActive || !selectedBranchId || !selectedBarberId || !rewardServiceId) return;
    if (selectedBranchId !== rewardBranchId) return;
    setBookingBlocks((prev) => {
      const source = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createBookingBlock({ alias: BOOKING_HOLDER_ALIAS })];
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
    notifications.warning('El servicio de recompensa no estÃ¡ disponible en esta sucursal. Elige la sucursal de tu canje o cancela el uso de recompensa.', {
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
    if (rewardModeActive || !activeMembershipPlan) return;

    if (membershipLockedServiceIdsForTitular.length === 0) return;

    setBookingBlocks((prev) => {
      const source = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createBookingBlock({ alias: BOOKING_HOLDER_ALIAS })];
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
    canUseClienteHold,
    membershipLockedServiceIdsForTitular,
    rewardModeActive,
    selectedBarberId,
    selectedBranchId,
  ]);

  useEffect(() => {
    if (!location.pathname.startsWith(BOOKING_ROUTES.agenda)) return;
    const hasSelectionForAgenda = Boolean(selectedPackageId) || effectiveSelectedServiceIdsForAgenda.length > 0;
    if (!selectedBranchId || !activeBlockBarberId || !hasSelectionForAgenda) return;
    const key = [
      selectedBranchId,
      activeBlockBarberId,
      selectionCacheKey,
      monthRange?.from || '',
      monthRange?.to || '',
      selectedDate || '',
    ].join('|');
    if (agendaAutoLoadKeyRef.current === key) return;
    agendaAutoLoadKeyRef.current = key;
    void fetchAvailability();
    if (selectedDate) {
      void fetchSlots();
    }
  }, [
    activeBlockBarberId,
    effectiveSelectedServiceIdsForAgenda.length,
    fetchAvailability,
    fetchSlots,
    location.pathname,
    monthRange?.from,
    monthRange?.to,
    selectedBranchId,
    selectedDate,
    selectedPackageId,
    selectionCacheKey,
  ]);

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
    setBookingBlocks((prev) => {
      let changed = false;
      const nextBlocks = prev.map((block) => {
        const currentPromotionIds = normalizePromotionIds(block?.promotionIds, block?.promotionId)
          .slice(0, maxPromotionsPerBooking);
        if (!currentPromotionIds.length) {
          if (!block?.promotionId && (!Array.isArray(block?.promotionIds) || block.promotionIds.length === 0)) return block;
          changed = true;
          return {
            ...block,
            promotionId: '',
            promotionIds: [],
            promotionRuleId: '',
            promocion_id: null,
            id_promocion_regla: null,
          };
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
        const nextPromotionRuleId = nextPromotionId
          ? String(promotionsById.get(nextPromotionId)?.id_promocion_regla || '').trim()
          : '';
        return {
          ...block,
          promotionId: nextPromotionId,
          promotionIds: validPromotionIds,
          promotionRuleId: nextPromotionRuleId,
          promocion_id: nextPromotionId || null,
          id_promocion_regla: nextPromotionRuleId || null,
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

  const {
    rootRedirectPath,
    showTopbarBackToBarberos,
    homePath,
    homeLabel,
    showBranchDataErrorBanner,
    goToAgenda,
    goToBarberos,
    goToPayment,
  } = useBookingWizardNavigation({
    location,
    navigate,
    bookingMode,
    selectedBranchId,
    selectedBarberId,
    allBlocksComplete,
    isPendingPaymentResumeRoute,
    paymentConfirmed: paymentResult?.booking_confirmed === true,
    holdResult,
    availabilityError,
    barbersLoading,
  });

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
        notifications.warning('Esta recompensa solo puede usarse en la sucursal donde se preparÃ³ el canje.', {
          dedupeKey: 'public-booking-reward-branch-mismatch',
        });
        return;
      }
      resetFlowForBranchChange();
      setSelectedBranchId(nextBranchId);
      navigate(BOOKING_ROUTES.barbers);
    },
    [navigate, notifications, resetFlowForBranchChange, rewardBranchId, rewardModeActive, selectedBranchId, setSelectedBranchId]
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
    navigate(BOOKING_ROUTES.agenda);
  }, [clearRequestState, navigate, updateBlockAtIndex]);

  const requestCancelBooking = useCallback((source = 'booking') => {
    if (cancelBookingProcessing) return false;
    setCancelBookingModal({
      open: true,
      source: String(source || 'booking').trim() || 'booking',
    });
    return false;
  }, [cancelBookingProcessing]);

  const closeCancelBookingModal = useCallback(() => {
    if (cancelBookingProcessing) return;
    setCancelBookingModal({ open: false, source: '' });
  }, [cancelBookingProcessing]);

  const executeCancelBooking = useCallback(async () => {
    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    if (groupId && paymentIntent?.id_intent && !paymentResult?.booking_confirmed) {
      notifications.info('El pago ya fue iniciado. Verifica el estado del pago antes de cancelar la reserva temporal.', {
        dedupeKey: 'public-booking-cancel-payment-started',
      });
      return false;
    }
    if (groupId) {
      try {
        await releaseHold();
      } catch {
        notifications.warning('No se pudo liberar la reserva temporal en este momento, pero se cancelÃ³ el flujo local.', {
          dedupeKey: 'public-booking-release-hold-warning',
        });
      }
    }

    persistRewardBookingContext(null);
    setRewardBookingContext(null);
    clearHoldLocalState();
    clearPaymentState();
    setContextError('');
    setAvailabilityError('');
    setFieldErrors({});
    setPendingCompanionFocusId('');
    setPendingFieldFocus(null);
    setBookingBlocks([createBookingBlock({ alias: BOOKING_HOLDER_ALIAS })]);
    setActiveBlockIndex(0);
    setCurrentMonth(new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1));
    holderProfileHydratedRef.current = false;
    resetAvailabilityData();
    setSlotConflict(null);
    navigate(BOOKING_ROUTES.home, { replace: true });
    return true;
  }, [
    clearHoldLocalState,
    clearPaymentState,
    holdResult?.id_grupo_cita,
    minBookingMonth,
    navigate,
    notifications,
    paymentIntent?.id_intent,
    paymentResult?.booking_confirmed,
    releaseHold,
    resetAvailabilityData,
    setContextError,
  ]);

  const confirmCancelBooking = useCallback(async () => {
    if (cancelBookingProcessing) return false;
    setCancelBookingProcessing(true);
    try {
      const result = await executeCancelBooking();
      setCancelBookingModal({ open: false, source: '' });
      return result;
    } finally {
      setCancelBookingProcessing(false);
    }
  }, [cancelBookingProcessing, executeCancelBooking]);

  const cancelBookingFlow = useCallback((source = 'booking') => requestCancelBooking(source), [requestCancelBooking]);

  const cancelRewardRedemptionUsage = useCallback(() => {
    if (!rewardModeActive) return;
    setRewardBookingContext(null);
    persistRewardBookingContext(null);
    markHoldObsolete();
    clearPaymentState();
    setBookingBlocks((prev) => {
      const source = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createBookingBlock({ alias: BOOKING_HOLDER_ALIAS })];
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
  }, [clearPaymentState, markHoldObsolete, notifications, rewardModeActive, rewardServiceId]);

  const completeBookingFlow = useCallback(() => {
    persistRewardBookingContext(null);
    setRewardBookingContext(null);
    clearHoldLocalState();
    clearPaymentState();
    resetFlowForBranchChange();
    const target = canUseClienteHold ? '/home/cliente/citas' : BOOKING_ROUTES.home;
    navigate(target, { replace: true });
  }, [canUseClienteHold, clearHoldLocalState, clearPaymentState, navigate, resetFlowForBranchChange]);

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
    const nextTarget = BOOKING_ROUTES.barbers;
    const params = new URLSearchParams();
    params.set('next', nextTarget);
    params.set('intent', 'agendar');
    navigate(`${BOOKING_ROUTES.login}?${params.toString()}`);
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
          : 'Completa nombre y apellido del acompaÃ±ante antes de elegir servicios.',
        { dedupeKey: 'public-booking-contact-name-required' }
      );
      return;
    }
    if (blockedServiceIdSet.has(normalizedServiceId)) {
      if (rewardLockedServiceIdSet.has(normalizedServiceId)) {
        notifications.info('Este servicio estÃ¡ marcado como recompensa cortesÃ­a y no se puede quitar.', {
          dedupeKey: `public-booking-reward-service-locked-${normalizedServiceId}`,
        });
      } else if (membershipLockedServiceIdSet.has(normalizedServiceId)) {
        notifications.info('Este servicio estÃ¡ cubierto por tu plan y no se puede quitar.', {
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
      notifications.info('La recompensa cortesÃ­a se aplica sobre un servicio individual del titular.', {
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
      notifications.info('La recompensa cortesÃ­a no puede combinarse con paquetes en esta fase.', {
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
      notifications.warning('Selecciona una sucursal antes de elegir una promociÃ³n.', {
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
        promotionRuleId: '',
        promotionIds: [],
        promocion_id: null,
        id_promocion_regla: null,
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
        const nextPrimaryPromotionId = nextPromotionIds[0] || '';
        const nextPrimaryPromotion = nextPrimaryPromotionId
          ? promotionsById.get(nextPrimaryPromotionId) || null
          : null;
        const nextPromotionRuleId = nextPrimaryPromotionId
          ? String(nextPrimaryPromotion?.id_promocion_regla || '').trim()
          : '';
        return {
          ...activeCurrentBlock,
          promotionId: nextPrimaryPromotionId,
          promotionIds: nextPromotionIds,
          promotionRuleId: nextPromotionRuleId,
          promocion_id: nextPrimaryPromotionId || null,
          id_promocion_regla: nextPromotionRuleId || null,
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
      notifications.warning(evaluation.disabledReason || 'Esta promociÃ³n no aplica a la selecciÃ³n actual.', {
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
      const limitedPromotionIds = nextPromotionIds.slice(0, maxPromotionsPerBooking);
      const nextPrimaryPromotionId = limitedPromotionIds[0] || '';
      const nextPrimaryPromotion = nextPrimaryPromotionId
        ? promotionsById.get(nextPrimaryPromotionId) || null
        : null;
      const nextPromotionRuleId = nextPrimaryPromotionId
        ? String(nextPrimaryPromotion?.id_promocion_regla || '').trim()
        : '';
      return {
        ...activeCurrentBlock,
        promotionId: nextPrimaryPromotionId,
        promotionIds: limitedPromotionIds,
        promotionRuleId: nextPromotionRuleId,
        promocion_id: nextPrimaryPromotionId || null,
        id_promocion_regla: nextPromotionRuleId || null,
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
      promotionRuleId: '',
      promotionIds: [],
      promocion_id: null,
      id_promocion_regla: null,
    }));
  }, [effectiveActiveBlockIndex, updateBlockAtIndex]);

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
    if (holdSubmitting) return false;
    if (bookingMode === 'loading') {
      notifications.info('Estamos verificando tu sesion antes de continuar.', {
        dedupeKey: 'public-booking-auth-loading-submit',
      });
      return false;
    }
    if (!selectedBranchId || !selectedBarberId) {
      notifications.warning('Debes seleccionar sucursal y barbero.', { dedupeKey: 'public-booking-hold-context' });
      navigate(BOOKING_ROUTES.barbers);
      return false;
    }
    const blocksToSubmit = blocksToSubmitSummary;
    if (invalidHoldSelectionFingerprintRef.current === bookingHoldFingerprint) {
      const fallbackBlock = blocksToSubmit[effectiveActiveBlockIndex] || blocksToSubmit[0] || bookingBlocksSummary[0] || null;
      return rejectInvalidScheduleBlock(fallbackBlock);
    }
    if (blocksToSubmit.length === 0) {
      notifications.warning('Completa servicios, fecha y hora en todos los bloques antes de confirmar.', {
        dedupeKey: 'public-booking-blocks-required',
      });
      navigate(BOOKING_ROUTES.agenda);
      return false;
    }
    const localSelectionConflict = blocksToSubmit.find(
      (block) => Array.isArray(block?.selectionConflicts) && block.selectionConflicts.length > 0
    );
    if (localSelectionConflict) {
      const firstConflictCode = String(localSelectionConflict.selectionConflicts[0]?.code || '').trim().toUpperCase();
      notifications.warning(
        mapPublicBookingErrorMessage(firstConflictCode, 'Revisa la selecciÃ³n de servicios y paquete antes de continuar.'),
        { dedupeKey: `public-booking-local-selection-conflict-${firstConflictCode || 'unknown'}` }
      );
      setActiveBlockIndex(Math.max(0, Number(localSelectionConflict.index || 0)));
      navigate(BOOKING_ROUTES.agenda);
      return false;
    }
    const requestedPromotionIds = resolveRequestedPromotionIds(blocksToSubmit);
    if (rewardModeActive && requestedPromotionIds.size > 0) {
      notifications.warning(
        mapPublicBookingErrorMessage(
          'REDEEM_NOT_APPLICABLE',
          'El canje seleccionado no puede combinarse con promociones para esta reserva.'
        ),
        { dedupeKey: 'public-booking-redeem-and-promotions-not-allowed' }
      );
      navigate(BOOKING_ROUTES.agenda);
      return false;
    }
    if (requestedPromotionIds.size > maxPromotionsPerBooking) {
      notifications.warning(mapPublicBookingErrorMessage('MAX_PROMOTIONS_EXCEEDED'), {
        dedupeKey: 'public-booking-promotions-max-before-submit',
      });
      navigate(BOOKING_ROUTES.agenda);
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
    if (!titularContactState.firstName) {
      titularMissingData.push('nombre');
      nextFieldErrors[buildFieldErrorKey(0, 'contactFirstName')] = 'Ingresa el nombre del titular.';
    }
    if (!titularContactState.lastName) {
      titularMissingData.push('apellido');
      nextFieldErrors[buildFieldErrorKey(0, 'contactLastName')] = 'Ingresa el apellido del titular.';
    }
    if (!titularNombre) {
      titularMissingData.push('nombre completo');
      nextFieldErrors[buildFieldErrorKey(0, 'contactFirstName')] = nextFieldErrors[buildFieldErrorKey(0, 'contactFirstName')]
        || 'Ingresa el nombre del titular.';
    }
    if (!titularEmail) {
      titularMissingData.push('correo');
      nextFieldErrors[buildFieldErrorKey(0, 'contactEmail')] = 'Ingresa el correo del titular.';
    }
    if (!titularTelefono) {
      titularMissingData.push('telefono');
      nextFieldErrors[buildFieldErrorKey(0, 'contactPhone')] = 'Ingresa el telefono del titular.';
    }
    CONTACT_ERROR_FIELD_ORDER.forEach((field) => {
      const message = String(titularContactState?.errors?.[field] || '').trim();
      if (!message) return;
      nextFieldErrors[buildFieldErrorKey(0, field)] = message;
      if (field === 'contactPhone' && !titularMissingData.includes('telefono')) {
        titularMissingData.push('telefono');
      }
    });
    if (titularMissingData.length > 0) {
      const feedback = getContactValidationFeedback(titularContactState, 0);
      notifications.warning(
        feedback?.message
        || (titularState.isAuthenticated
          ? 'Completa los datos faltantes del titular para continuar.'
          : 'Completa nombre, correo y telefono del titular antes de confirmar.'),
        {
          dedupeKey: 'public-booking-holder-data-required',
        }
      );
      setActiveBlockIndex(0);
      navigate(BOOKING_ROUTES.agenda);
      setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
      return false;
    }
    for (const companion of blocksToSubmit.filter((block) => Number(block?.index) > 0)) {
      const companionContact = companion?.contactResolved || resolveBlockContactState(companion, companion.index);
      if (!companionContact.isValid) {
        const feedback = getContactValidationFeedback(companionContact, companion.index);
        if (feedback?.field) {
          nextFieldErrors[buildFieldErrorKey(companion.index, feedback.field)] = feedback.message;
        }
        notifications.warning(feedback?.message || 'Completa los datos del acompaÃƒÂ±ante.', {
          dedupeKey: 'public-booking-companion-data-invalid-submit',
        });
        setActiveBlockIndex(companion.index);
        navigate(BOOKING_ROUTES.agenda);
        setFieldErrors((prev) => ({ ...prev, ...nextFieldErrors }));
        return false;
      }
      if (!companionContact.firstName || !companionContact.lastName || !companionContact.fullName) {
        nextFieldErrors[buildFieldErrorKey(companion.index, 'contactFirstName')] = 'Completa nombre y apellido del acompanante.';
        nextFieldErrors[buildFieldErrorKey(companion.index, 'contactLastName')] = 'Completa nombre y apellido del acompanante.';
        notifications.warning('Cada acompaÃ±ante debe tener nombre y apellido vÃ¡lidos para confirmar.', {
          dedupeKey: 'public-booking-companion-data-required-submit',
        });
        setActiveBlockIndex(companion.index);
        navigate(BOOKING_ROUTES.agenda);
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
          navigate(BOOKING_ROUTES.agenda);
          return false;
        }
      }
    }
    setFieldErrors({});
    const selectedSlotMap = new Map();
    const resolvedBarberByBlockId = new Map();
    let autoAssignedCompanion = false;
    for (const block of blocksToSubmit) {
      const blockRange = getBookingBlockOccupiedRange(block);
      if (!blockRange) {
        return rejectInvalidScheduleBlock(block);
      }
      if (isPastSlotForToday(block.selectedDate, block.selectedTime)) {
        notifications.warning('No puedes confirmar una cita en hora pasada para hoy.', {
          dedupeKey: 'public-booking-submit-past-time',
        });
        setActiveBlockIndex(block.index);
        navigate(BOOKING_ROUTES.agenda);
        return false;
      }
      const selectedSlotAvailable = await isBlockSelectedSlotAvailable(block);
      if (!selectedSlotAvailable) {
        return rejectInvalidScheduleBlock(block);
      }
      if (block.idBarbero) {
        const collisionKey = `${block.idBarbero}|${block.selectedDate}`;
        const previous = (selectedSlotMap.get(collisionKey) || []).find((candidate) =>
          rangesOverlap(
            block.selectedTime,
            blockRange.occupiedDurationMin,
            candidate.selectedTime,
            getBookingBlockOccupiedRange(candidate)?.occupiedDurationMin
          )
        );
        if (previous) {
          setSlotConflict({
            dateKey: block.selectedDate,
            timeKey: block.selectedTime,
            barberId: block.idBarbero,
            conflictingAlias: previous.alias || 'Integrante',
          });
          return rejectInvalidScheduleBlock(block);
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
      notifications.info('Uno o mÃ¡s acompaÃ±antes serÃ¡n asignados automÃ¡ticamente con barbero disponible en ese horario.', {
        dedupeKey: 'public-booking-autoassign-companion-info',
      });
    }

    const integrantesResult = buildIntegrantesPayload({
      blocksToSubmit,
      resolvedBarberByBlockId,
    });
    if (!integrantesResult.ok) {
      if (integrantesResult.errorCode === 'COMPANION_DATE_MISMATCH') {
        notifications.warning('Los acompaÃƒÂ±antes deben usar la misma fecha del titular.', {
          dedupeKey: 'public-booking-companion-date-mismatch',
        });
      } else {
        notifications.error('No se pudo construir la fecha y hora de una de las citas del grupo.', {
          dedupeKey: 'public-booking-datetime-invalid',
        });
      }
      return false;
    }
    const integrantes = integrantesResult.integrantes;

    let guardarNombresApellidos = false;
    let guardarTelefono = false;
    if (canUseClienteHold && titularState.isAuthenticated) {
      const puedeGuardarNombres = (
        (titularState.missingFields.includes('nombres') && normalizedTitularBlock.contactFirstName)
        || (titularState.missingFields.includes('apellidos') && normalizedTitularBlock.contactLastName)
      );
      const puedeGuardarTelefono = titularState.missingFields.includes('telefono_principal')
        && countPhoneDigits(normalizedTitularBlock.contactPhone || '') >= 8;

      if (puedeGuardarNombres) {
        guardarNombresApellidos = await requestProfilePersistDecision('nombres_apellidos');
      }
      if (puedeGuardarTelefono) {
        guardarTelefono = await requestProfilePersistDecision('telefono');
      }
    }

    try {
      const rewardContextToken = rewardModeActive ? rewardBookingContext?.canje_context_token : '';
      const holdPayload = canUseClienteHold
        ? buildAuthenticatedHoldPayload({
          idSucursal: selectedBranchId,
          integrantes,
          titularState,
          normalizedTitularBlock,
          guardarNombresApellidos,
          guardarTelefono,
          rewardContextToken,
        })
        : buildPublicHoldPayload({
          idSucursal: selectedBranchId,
          integrantes,
          titularNombre,
          titularEmail,
          titularTelefono,
          rewardContextToken,
        });
      const createdHold = await createHold(holdPayload);
      if (createdHold) {
        setProfileIncompleteState({ message: '', missingFields: [] });
      }
      return createdHold;
    } catch (err) {
      const apiError = err?.data?.error || err?.error || {};
      const apiErrorDetails = apiError?.details || {};
      const detailField = String(apiError?.details?.field || '').trim();
      const detailIndex = resolveBookingDetailBlockIndex(apiErrorDetails);
      const conflictCode = String(apiError?.code || '').trim().toUpperCase();
      const conflictReason = String(apiError?.reason || '').trim().toUpperCase();
      const safeConflictMessage = mapPublicBookingErrorMessage(conflictCode, extractMessage(err));
      const fallbackConflictIndex = Number.isInteger(effectiveActiveBlockIndex) ? effectiveActiveBlockIndex : 0;
      const affectedIndex = detailIndex != null ? Math.max(0, Math.trunc(detailIndex)) : fallbackConflictIndex;
      const affectedSummaryBlock = bookingBlocksSummary[affectedIndex] || null;
      const affectedLabel = affectedIndex === 0
        ? 'titular'
        : (affectedSummaryBlock?.alias || `${BOOKING_COMPANION_ALIAS_PREFIX} ${affectedIndex}`);

      if (conflictCode === 'CLIENT_PROFILE_INCOMPLETE') {
        // AM: Fallback de contrato backend Fase 1A para perfil incompleto.
        setProfileIncompleteFromBackend(apiError);
        notifications.warning(String(apiError?.message || 'Completa tu perfil antes de agendar una cita.'), {
          dedupeKey: 'public-booking-profile-incomplete-backend',
        });
        setActiveBlockIndex(0);
        navigate(BOOKING_ROUTES.agenda);
        return false;
      }
      if (conflictCode === 'REWARD_REDEEM_REQUIRED') {
        // AM: Bloqueo funcional backend P0.2B para agenda normal cuando hay recompensa disponible.
        const rewardMessage = String(
          apiError?.message
          || 'Tienes una cortesÃ­a disponible. Para continuar, debes canjear tu recompensa antes de agendar una cita normal.'
        );
        notifications.warning(rewardMessage, {
          dedupeKey: 'public-booking-reward-redeem-required',
        });
        // AM: SeÃ±al mÃ­nima para abrir canje obligatorio al volver al dashboard cliente.
        navigate('/home/cliente?accion=canjear');
        return false;
      }

      if (isPublicHoldRateLimitError(err, conflictCode)) {
        notifications.warning(
          'Hemos recibido demasiados intentos de reserva en poco tiempo. Espera unos minutos y vuelve a intentar. Tu tarjeta no ha sido procesada.',
          {
            dedupeKey: 'public-booking-hold-rate-limit',
          }
        );
        navigate(BOOKING_ROUTES.confirm);
        return false;
      }

      if (conflictCode === 'PUBLIC_CITAS_EMAIL_IN_USE' || conflictCode === 'EMAIL_BELONGS_TO_ACTIVE_USER') {
        const emailErrorIndex = resolveEmailConflictBlockIndex(apiErrorDetails);
        if (emailErrorIndex != null) {
          const emailFeedback = buildActiveUserEmailFeedback({
            details: apiErrorDetails,
            blockIndex: emailErrorIndex,
            bookingBlocksSummary,
            fallbackEmail: titularEmail,
          });
          setFieldError(emailErrorIndex, 'contactEmail', emailFeedback.message);
          focusBookingField(emailErrorIndex, 'contactEmail');
          navigate(BOOKING_ROUTES.agenda);
          notifications.warning(emailFeedback.message, { dedupeKey: 'public-booking-email-registered-login-required' });
          if (emailFeedback.isTitular) {
            openAuthRequiredModal(emailFeedback.email);
          }
          return false;
        }

        notifications.warning(safeConflictMessage, { dedupeKey: 'public-booking-email-registered-login-required' });
        navigate(BOOKING_ROUTES.agenda);
        return false;
      }

      if (detailField) {
        const mappedIndex = detailField.startsWith('titular.')
          ? 0
          : (detailIndex != null ? detailIndex : effectiveActiveBlockIndex);
        const mappedField = mapBookingDetailFieldToContactField(detailField);
        if (mappedField) {
          setFieldError(mappedIndex, mappedField, safeConflictMessage);
          focusBookingField(mappedIndex, mappedField);
          navigate(BOOKING_ROUTES.agenda);
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
          ? `El correo del titular, ${emailLabel}, pertenece a un usuario activo. Debes iniciar sesiÃ³n para continuar.`
          : `El correo del acompaÃ±ante ${companionNumber}, ${emailLabel}, pertenece a un usuario activo. Debe iniciar sesiÃ³n o usar otro correo.`;
        setFieldError(emailErrorIndex, 'contactEmail', mapPublicBookingErrorMessage(conflictCode));
        setActiveBlockIndex(emailErrorIndex);
        navigate(BOOKING_ROUTES.agenda);
        notifications.warning(conflictMessage, { dedupeKey: 'public-booking-email-registered-login-required' });
        openAuthRequiredModal(normalizedEmail);
      } else if (conflictCode === 'SERVICE_ALREADY_INCLUDED_IN_PACKAGE') {
        notifications.warning(safeConflictMessage, {
          dedupeKey: 'public-booking-service-included-backend',
        });
        navigate(BOOKING_ROUTES.agenda);
      } else if (conflictCode === 'ONLY_ONE_PACKAGE_ALLOWED') {
        notifications.warning(safeConflictMessage, {
          dedupeKey: 'public-booking-only-one-package-backend',
        });
        navigate(BOOKING_ROUTES.agenda);
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
        navigate(BOOKING_ROUTES.agenda);
      } else if (err?.status === 409) {
        if (conflictCode === 'CLIENT_PENDING_APPOINTMENT_EXISTS') {
          notifications.warning(
            'Tienes una reserva pendiente de pago. Completa o descarta esa reserva antes de agendar una nueva cita.',
            { dedupeKey: 'public-booking-pending-appointment-exists' }
          );
          navigate('/home/cliente/citas', {
            state: { openPendingPaymentModal: true },
          });
          return false;
        }
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
            : `El horario seleccionado para ${affectedLabel} ya no estÃ¡ disponible.`;
          invalidHoldSelectionFingerprintRef.current = bookingHoldFingerprint;
          setActiveBlockIndex(affectedIndex);
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
    }
  }, [
    buildFieldErrorKey,
    buildIntegrantesPayload,
    bookingMode,
    bookingBlocks,
    bookingBlocksSummary,
    bookingHoldFingerprint,
    blocksToSubmitSummary,
    createHold,
    effectiveActiveBlockIndex,
    canUseClienteHold,
    focusBookingField,
    holdSubmitting,
    isPastSlotForToday,
    isBlockSelectedSlotAvailable,
    navigate,
    notifications,
    openAuthRequiredModal,
    maxPromotionsPerBooking,
    requestProfilePersistDecision,
    recoverToAgendaForReselection,
    rejectInvalidScheduleBlock,
    resolveBlockContactState,
    rewardBookingContext,
    rewardModeActive,
    selectedBarberId,
    selectedBranchId,
    setFieldError,
    setProfileIncompleteFromBackend,
    titularState,
    setProfileIncompleteState,
  ]);

  useEffect(() => {
    if (!holdResult) {
      holdSelectionFingerprintRef.current = '';
      return;
    }
    if (!holdSelectionFingerprintRef.current) {
      holdSelectionFingerprintRef.current = bookingSelectionFingerprint;
      return;
    }
    if (holdSelectionFingerprintRef.current !== bookingSelectionFingerprint) {
      markHoldObsolete();
      clearPaymentState();
      holdSelectionFingerprintRef.current = '';
    }
  }, [bookingSelectionFingerprint, clearPaymentState, holdResult, markHoldObsolete]);

  const buildContactValidationPayload = useCallback(() => {
    const contactos = [];
    bookingBlocks.forEach((block, index) => {
      if (index === 0 && canUseClienteHold) return;
      const contactState = resolveBlockContactState(block, index);
      const email = String(contactState?.email || '').trim().toLowerCase();
      if (index > 0 && !email) return;
      const summaryBlock = bookingBlocksSummary[index] || null;
      contactos.push({
        blockIndex: index,
        rol_integrante_codigo: index === 0 ? 'titular' : 'acompanante',
        alias: summaryBlock?.alias || block?.alias || (index === 0 ? BOOKING_HOLDER_ALIAS : `${BOOKING_COMPANION_ALIAS_PREFIX} ${index}`),
        email,
      });
    });
    return contactos;
  }, [bookingBlocks, bookingBlocksSummary, canUseClienteHold, resolveBlockContactState]);

  const handleContactValidationError = useCallback((err) => {
    const apiError = err?.data?.error || err?.error || {};
    const conflictCode = String(apiError?.code || '').trim().toUpperCase();
    const rawConflicts = Array.isArray(apiError?.details?.conflicts)
      ? apiError.details.conflicts
      : [];
    if (
      !['PUBLIC_CITAS_CONTACT_EMAIL_CONFLICT', 'PUBLIC_CITAS_CONTACT_DUPLICATE_CONFLICT'].includes(conflictCode)
      || rawConflicts.length === 0
    ) {
      return false;
    }

    const conflicts = rawConflicts
      .map((conflict) => normalizeContactEmailConflict(conflict))
      .filter(Boolean);
    if (conflicts.length === 0) return false;

    const nextErrors = {};
    conflicts.forEach((conflict) => {
      nextErrors[buildFieldErrorKey(conflict.blockIndex, conflict.field)] = conflict.message;
    });
    const firstConflict = conflicts[0];
    setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
    focusBookingField(firstConflict.blockIndex, firstConflict.field);
    navigate(BOOKING_ROUTES.agenda);
    notifications.warning(firstConflict.message, {
      dedupeKey: 'public-booking-contact-email-conflict',
    });
    if (
      firstConflict.blockIndex === 0
      && firstConflict.code === 'EMAIL_BELONGS_TO_ACTIVE_USER'
      && !canUseClienteHold
    ) {
      openAuthRequiredModal(firstConflict.email);
    }
    return true;
  }, [
    buildFieldErrorKey,
    canUseClienteHold,
    focusBookingField,
    navigate,
    notifications,
    openAuthRequiredModal,
  ]);

  const validateContactsBeforeConfirm = useCallback(async () => {
    const contactos = buildContactValidationPayload();
    if (contactos.length === 0) return true;
    try {
      await validatePublicBookingContacts({ contactos });
      return true;
    } catch (err) {
      if (handleContactValidationError(err)) return false;
      notifications.warning(extractMessage(err), {
        dedupeKey: 'public-booking-validate-contacts-before-confirm',
      });
      return false;
    }
  }, [buildContactValidationPayload, handleContactValidationError, notifications]);

  const goToConfirm = useCallback(async () => {
    if (holdSubmitting) return false;
    if (bookingMode === 'loading') {
      notifications.info('Estamos verificando tu sesion antes de continuar.', {
        dedupeKey: 'public-booking-auth-loading-confirm',
      });
      return false;
    }
    if (!allBlocksComplete) {
      const firstInvalidContact = blocksToSubmitSummary.find((block) => !block?.contactResolved?.isValid);
      const feedback = firstInvalidContact
        ? getContactValidationFeedback(firstInvalidContact.contactResolved, firstInvalidContact.index)
        : null;
      if (feedback?.field) {
        setFieldError(firstInvalidContact.index, feedback.field, feedback.message);
        focusBookingField(firstInvalidContact.index, feedback.field);
      }
      notifications.warning(bookingBlockingReason || 'Completa servicios, fecha y hora antes de continuar a resumen.', {
        dedupeKey: 'public-booking-confirm-requires-complete-blocks',
      });
      return false;
    }
    const contactsValid = await validateContactsBeforeConfirm();
    if (!contactsValid) return false;
    navigate(BOOKING_ROUTES.confirm);
    return true;
  }, [
    allBlocksComplete,
    blocksToSubmitSummary,
    bookingBlockingReason,
    bookingMode,
    focusBookingField,
    holdSubmitting,
    navigate,
    notifications,
    setFieldError,
    validateContactsBeforeConfirm,
  ]);

  const shouldRecoverFromPaymentError = useCallback((rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();
    return code === 'PUBLIC_PAGOS_HOLD_EXPIRED'
      || code === 'PUBLIC_PAGOS_GROUP_STATE_INVALID'
      || code === 'PUBLIC_PAGOS_GROUP_NOT_FOUND'
      || code === 'PUBLIC_PAGOS_INTENT_NOT_FOUND'
      || code === 'PUBLIC_PAGOS_INTENT_GROUP_MISMATCH';
  }, []);

  const shouldRetryPaymentStatus = useCallback((payload) => {
    if (payload?.booking_confirmed) return false;
    const state = String(payload?.estado_intent_codigo || payload?.status || '').trim().toLowerCase();
    return state === 'pendiente_confirmacion'
      || state === 'processing'
      || state === 'procesando'
      || state === 'confirmando';
  }, []);

  const createPaymentIntentForHold = useCallback(async ({ forceNew = false } = {}) => {
    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    const titularContact = resolveBlockContactState(bookingBlocks[0], 0);
    const titularEmail = String(titularContact.email || '').trim().toLowerCase();
    if (!groupId) {
      notifications.warning('Estamos reservando tu horario. Espera un momento e intÃ©ntalo nuevamente.', {
        dedupeKey: 'public-booking-hold-creating-for-payment',
      });
      return null;
    }
    if (Number(holdResult?.total_pagar_hnl ?? holdResult?.total_hnl ?? 0) <= 0) {
      notifications.warning('Esta reserva no requiere pago. ConfÃ­rmala directamente.', {
        dedupeKey: 'public-booking-payment-not-required',
      });
      navigate(BOOKING_ROUTES.confirm);
      return null;
    }
    if (!isValidEmail(titularEmail)) {
      notifications.error('No se pudo iniciar el pago porque faltan datos del titular.', {
        dedupeKey: 'public-booking-payment-context-missing',
      });
      return null;
    }
    try {
      const payload = await createPaymentIntentOnce({
        groupId,
        titularEmail,
        forceNew,
        payload: buildCreatePaymentIntentPayload({
          groupId,
          titularEmail,
          titularContact,
        }),
      });
      if (payload?.expires_at) {
        setHoldResult((current) => (current ? { ...current, expires_at: payload.expires_at } : current));
      }
      return payload;
    } catch (err) {
      const apiError = err?.data?.error || err?.error || {};
      const errorCode = String(apiError?.code || '').trim().toUpperCase();
      if (err?.status === 409 && shouldRecoverFromPaymentError(errorCode)) {
        recoverToAgendaForReselection(
          'El horario seleccionado dejÃ³ de estar disponible durante el pago. Elige una nueva hora para continuar.',
          { dedupeKey: 'public-booking-payment-recover-create-intent' }
        );
        return null;
      }
      if (forceNew) {
        return {
          retry_error_code: errorCode || 'PAYMENT_RETRY_ERROR',
          retry_error_message: extractMessage(err),
        };
      }
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-intent-error' });
      return null;
    }
  }, [
    bookingBlocks,
    createPaymentIntentOnce,
    holdResult?.id_grupo_cita,
    notifications,
    resolveBlockContactState,
    recoverToAgendaForReselection,
    setHoldResult,
    shouldRecoverFromPaymentError,
    navigate,
    holdResult?.total_hnl,
    holdResult?.total_pagar_hnl,
  ]);

  const confirmHoldWithoutPayment = useCallback(async (options = {}) => {
    const explicitGroupId = String(options?.idGrupoCita || '').trim();
    const groupId = explicitGroupId || String(holdResult?.id_grupo_cita || '').trim();
    const allowConfirmedGroupWithBalance = options?.allowConfirmedGroupWithBalance === true;
    const totalToPay = Number(
      options?.totalPagarHnl
      ?? holdResult?.total_pagar_hnl
      ?? holdResult?.total_hnl
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
      notifications.warning('Debes iniciar sesiÃ³n como cliente para confirmar sin pago.', {
        dedupeKey: 'public-booking-confirm-no-payment-auth-required',
      });
      if (timeoutId) clearTimeout(timeoutId);
      return false;
    }
    if (!groupId) {
      notifications.error('No encontramos una reserva vÃ¡lida para confirmar.', {
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
      const confirmPayload = buildConfirmWithoutPaymentPayload({ rewardContextToken });
      const response = await confirmHoldWithoutPaymentRequest(
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
        booking_confirmed: true,
        confirmation: payload,
        codigo_cita: codigoCita,
        citas_confirmadas: Array.isArray(payload?.citas_confirmadas)
          ? payload.citas_confirmadas
          : citasConfirmadas,
        estado_pago: rewardApplied
          ? (rewardMessage || 'Recompensa utilizada')
          : 'cubierto_por_plan',
        total_pagado_hnl: 0,
        cubierto_por_plan_hnl: Number(holdPricing?.cubierto_por_plan_hnl || 0),
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
        navigate(BOOKING_ROUTES.success);
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
        notifications.error('La confirmaciÃ³n tardÃ³ demasiado. Intenta nuevamente.', {
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
  }, [
    canUseClienteHold,
    confirmHoldWithoutPaymentRequest,
    holdPricing?.cubierto_por_plan_hnl,
    holdResult,
    navigate,
    notifications,
    rewardBookingContext,
    setBookingSuccessResult,
    setPaymentResult,
  ]);

  const refreshPaymentStatus = useCallback(async (options = {}) => {
    const canCheckOnRoute = location.pathname.startsWith(BOOKING_ROUTES.payment)
      || location.pathname.startsWith(BOOKING_ROUTES.success);
    if (!canCheckOnRoute) return null;
    const searchParams = new URLSearchParams(location.search || '');
    const groupIdFromUrl = String(searchParams.get('id_grupo_cita') || '').trim();
    const storedContext = restorePaymentContext(groupIdFromUrl || holdResult?.id_grupo_cita || '');
    const groupId = String(
      holdResult?.id_grupo_cita
      || storedContext?.id_grupo_cita
      || groupIdFromUrl
      || ''
    ).trim();
    const intentId = String(paymentIntent?.id_intent || storedContext?.id_intent || '').trim();
    const titularContact = resolveBlockContactState(bookingBlocks[0], 0);
    const titularEmail = String(titularContact.email || storedContext?.titular_email || '').trim().toLowerCase();
    if (!groupId || !intentId || !isValidEmail(titularEmail)) return null;

    try {
      const payload = await fetchPaymentStatusOnce({
        groupId,
        intentId,
        titularEmail,
        retries: options?.retries ?? 0,
        retryDelayMs: options?.retryDelayMs ?? 1200,
        shouldRetry: shouldRetryPaymentStatus,
      });
      if (!payload || !isCurrentPaymentGroup(groupId)) return null;
      let rewardFinalization = null;
      if (payload?.booking_confirmed && rewardModeActive) {
        const rewardContextToken = String(
          rewardBookingContext?.canje_context_token
          || rewardBookingContext?.id_points_tx_canje
          || ''
        ).trim();
        if (rewardContextToken) {
          try {
            const confirmResponse = await confirmHoldWithoutPaymentRequest(
              groupId,
              buildConfirmWithoutPaymentPayload({ rewardContextToken })
            );
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
              notifications.error('No tienes saldo suficiente para aplicar la recompensa en la confirmaciÃ³n final.', {
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
        const totalPagado = Number(
          payload?.monto_hnl
          ?? payload?.total_pagado_hnl
          ?? holdResult?.total_pagar_hnl
          ?? holdResult?.total_hnl
          ?? 0
        );
        const rewardApplied = rewardFinalization?.aplicada === true || rewardFinalization?.ya_aplicada === true;
        const rewardMessage = rewardApplied
          ? String(rewardFinalization?.mensaje || 'Recompensa utilizada. Se descontaron 10 puntos de tu ruta.').trim()
          : '';
        setBookingSuccessResult({
          source: 'payment',
          booking_confirmed: true,
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
      if (!payload?.booking_confirmed && intentState === 'expirado') {
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
          'Tu reserva temporal ya no estÃ¡ disponible. Selecciona un nuevo horario para continuar.',
          { dedupeKey: 'public-booking-payment-recover-status-error' }
        );
        return null;
      }
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-status-error' });
      return null;
    }
  }, [
    bookingBlocks,
    confirmHoldWithoutPaymentRequest,
    fetchPaymentStatusOnce,
    holdResult?.id_grupo_cita,
    holdResult?.total_hnl,
    holdResult?.total_pagar_hnl,
    isCurrentPaymentGroup,
    location.pathname,
    location.search,
    notifications,
    paymentIntent?.id_intent,
    rewardBookingContext,
    rewardModeActive,
    resolveBlockContactState,
    recoverToAgendaForReselection,
    setBookingSuccessResult,
    setPaymentResult,
    restorePaymentContext,
    shouldRecoverFromPaymentError,
    shouldRetryPaymentStatus,
  ]);

  const completeMockPayment = useCallback(async () => {
    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    const intentId = String(paymentIntent?.id_intent || '').trim();
    const titularContact = resolveBlockContactState(bookingBlocks[0], 0);
    const titularEmail = String(titularContact.email || '').trim().toLowerCase();
    if (!groupId || !intentId || !isValidEmail(titularEmail)) return false;
    try {
      await completeMockPaymentOnce({ groupId, intentId, titularEmail });
      const status = await refreshPaymentStatus();
      return Boolean(status?.booking_confirmed);
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-complete-error' });
      return false;
    }
  }, [bookingBlocks, completeMockPaymentOnce, holdResult?.id_grupo_cita, notifications, paymentIntent?.id_intent, refreshPaymentStatus, resolveBlockContactState]);

  const completeSimulatorPayment = useCallback(async () => {
    const groupId = String(holdResult?.id_grupo_cita || '').trim();
    const intentId = String(paymentIntent?.id_intent || '').trim();
    const titularContact = resolveBlockContactState(bookingBlocks[0], 0);
    const titularEmail = String(titularContact.email || '').trim().toLowerCase();
    if (!groupId || !intentId || !isValidEmail(titularEmail)) return false;
    try {
      await completeSimulatorPaymentOnce({ groupId, intentId, titularEmail, status: 'success' });
      const status = await refreshPaymentStatus({ retries: 2, retryDelayMs: 1500 });
      return Boolean(status?.booking_confirmed);
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-payment-simulator-error' });
      return false;
    }
  }, [bookingBlocks, completeSimulatorPaymentOnce, holdResult?.id_grupo_cita, notifications, paymentIntent?.id_intent, refreshPaymentStatus, resolveBlockContactState]);

  const completePaymentSimulation = useCallback(async ({ provider } = {}) => {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider === 'simulator') {
      return completeSimulatorPayment();
    }
    return completeMockPayment();
  }, [completeMockPayment, completeSimulatorPayment]);

  const startCheckout = useCallback(async () => {
    if (paymentResult?.booking_confirmed) return true;
    if (!allBlocksComplete) {
      const firstInvalidContact = blocksToSubmitSummary.find((block) => !block?.contactResolved?.isValid);
      const feedback = firstInvalidContact
        ? getContactValidationFeedback(firstInvalidContact.contactResolved, firstInvalidContact.index)
        : null;
      if (feedback?.field) {
        setFieldError(firstInvalidContact.index, feedback.field, feedback.message);
        setActiveBlockIndex(firstInvalidContact.index);
      }
      notifications.warning(bookingBlockingReason || 'Completa servicios, fecha y hora en todos los bloques antes de continuar al pago.', {
        dedupeKey: 'public-booking-checkout-requires-complete-blocks',
      });
      navigate(BOOKING_ROUTES.agenda);
      return false;
    }
    if (holdResult && Number(holdResult?.total_pagar_hnl ?? holdResult?.total_hnl ?? 0) === 0) {
      notifications.warning('Tu reserva no requiere pago. Confirma la cita desde el resumen.', {
        dedupeKey: 'public-booking-checkout-hold-total-zero',
      });
      navigate(BOOKING_ROUTES.confirm);
      return false;
    }
    navigate(BOOKING_ROUTES.payment);
    return true;
  }, [
    allBlocksComplete,
    blocksToSubmitSummary,
    bookingBlockingReason,
    holdResult,
    navigate,
    notifications,
    paymentResult?.booking_confirmed,
    setActiveBlockIndex,
    setFieldError,
  ]);

  useEffect(() => {
    if (!location.pathname.startsWith(BOOKING_ROUTES.payment)) {
      paymentAutoBootstrapAttemptRef.current = '';
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!location.pathname.startsWith(BOOKING_ROUTES.payment)) return;
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
      if (Number(holdResult?.total_pagar_hnl ?? holdResult?.total_hnl ?? 0) <= 0) {
        navigate(BOOKING_ROUTES.confirm, { replace: true });
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
    holdResult?.total_hnl,
    holdResult?.total_pagar_hnl,
    location.pathname,
    navigate,
    paymentIntent?.id_intent,
    paymentResult?.booking_confirmed,
    submitHold,
  ]);

  useEffect(() => {
    if (!location.pathname.startsWith(BOOKING_ROUTES.payment)) return;
    if (paymentResult?.booking_confirmed) return;
    if (!holdResult || !holdExpired) return;
    if (paymentIntent?.id_intent) {
      notifications.info('La reserva temporal vencio, pero ya hay un pago iniciado. Verifica el estado antes de cambiar de horario.', {
        dedupeKey: 'public-booking-payment-hold-expired-status-check',
      });
      void refreshPaymentStatus({ retries: 2, retryDelayMs: 1500 });
      return;
    }
    recoverToAgendaForReselection(
      'El tiempo de reserva expirÃ³. Selecciona una nueva hora para continuar.',
      { dedupeKey: 'public-booking-payment-recover-hold-expired' }
    );
  }, [
    holdExpired,
    holdResult,
    location.pathname,
    notifications,
    paymentIntent?.id_intent,
    paymentResult?.booking_confirmed,
    recoverToAgendaForReselection,
    refreshPaymentStatus,
  ]);

  useEffect(() => {
    const isPaymentRoute = location.pathname.startsWith(BOOKING_ROUTES.payment);
    const isSuccessRoute = location.pathname.startsWith(BOOKING_ROUTES.success);
    if (!isPaymentRoute && !isSuccessRoute) {
      paymentReturnStatusCheckRef.current = '';
      return;
    }
    if (paymentResult?.booking_confirmed) return;

    const searchParams = new URLSearchParams(location.search || '');
    const groupIdFromUrl = String(searchParams.get('id_grupo_cita') || '').trim();
    const restoredContext = restorePaymentContext(groupIdFromUrl || holdResult?.id_grupo_cita || '');
    const groupId = String(
      holdResult?.id_grupo_cita
      || restoredContext?.id_grupo_cita
      || groupIdFromUrl
      || ''
    ).trim();
    const intentId = String(paymentIntent?.id_intent || restoredContext?.id_intent || '').trim();
    if (!groupId || !intentId) return;

    const checkKey = `${location.pathname}|${location.search}|${groupId}|${intentId}`;
    if (paymentReturnStatusCheckRef.current === checkKey) return;
    paymentReturnStatusCheckRef.current = checkKey;

    const isProviderReturn = isSuccessRoute
      || searchParams.has('provider_intent_id')
      || searchParams.has('id_grupo_cita')
      || searchParams.has('mock_result');
    void refreshPaymentStatus({
      retries: isProviderReturn ? 2 : 0,
      retryDelayMs: 1500,
    });
  }, [
    holdResult?.id_grupo_cita,
    location.pathname,
    location.search,
    paymentIntent?.id_intent,
    paymentResult?.booking_confirmed,
    refreshPaymentStatus,
    restorePaymentContext,
  ]);

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
      bookingMode,
      blockedServiceIds,
      membershipLockedServiceIdsForTitular,
      membershipBranchNotice,
      membershipHasContext,
      membershipUxMessage,
      membershipAplicaEnCita,
      membershipBranchMismatch,
      membershipMotivoNoAplica,
      membershipCompanionsCovered,
      membershipCompanionNotice,
      profileIncompleteState,
      profileFieldLabels: PROFILE_FIELD_LABELS,
      goToClienteProfile,
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
      companionRuleValidation,
      createPaymentIntentForHold,
      creatingPaymentIntent,
      confirmHoldWithoutPayment,
      refreshPaymentStatus,
      checkingPaymentStatus,
      completeMockPayment,
      completePaymentSimulation,
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
      pendingFieldFocus,
      consumePendingFieldFocus,
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
      bookingMode,
      blockedServiceIds,
      membershipLockedServiceIdsForTitular,
      membershipBranchNotice,
      membershipHasContext,
      membershipUxMessage,
      membershipAplicaEnCita,
      membershipBranchMismatch,
      membershipMotivoNoAplica,
      membershipCompanionsCovered,
      membershipCompanionNotice,
      profileIncompleteState,
      goToClienteProfile,
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
      companionRuleValidation,
      createPaymentIntentForHold,
      creatingPaymentIntent,
      confirmHoldWithoutPayment,
      refreshPaymentStatus,
      checkingPaymentStatus,
      completeMockPayment,
      completePaymentSimulation,
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
      pendingFieldFocus,
      consumePendingFieldFocus,
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

  if (rootRedirectPath) {
    return <Navigate to={rootRedirectPath} replace />;
  }

  return (
    <BookingLayout
      homePath={homePath}
      homeLabel={homeLabel}
      loading={contextLoading}
      error={contextError}
      onRetry={fetchContext}
      showBackToBarberos={showTopbarBackToBarberos}
      onBackToBarberos={goToBarberos}
    >
        {!contextLoading && !contextError ? (
          <main className="mf-page citas-page public-booking-main">
            {showBranchDataErrorBanner ? (
              <BookingErrorState message={availabilityError} onRetry={fetchBranchData} />
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
              <DialogTitle>Correo registrado: inicia sesiÃ³n para agendar</DialogTitle>
              <DialogDescription>
                {authRequiredModal.email
                  ? `El correo ${authRequiredModal.email} ya pertenece a una cuenta activa en MasterFade.`
                  : 'Este correo ya pertenece a una cuenta activa en MasterFade.'}{' '}
                Para proteger la identidad del titular y evitar suplantaciÃ³n, debes iniciar sesiÃ³n antes de continuar.
              </DialogDescription>
            </DialogHeader>
            <div className="citas-selected-date">
              QuÃ© hacer ahora:
              <br />
              1. Inicia sesiÃ³n con ese correo.
              <br />
              2. Regresa al flujo de agendamiento.
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeAuthRequiredModal}>
                Revisar datos
              </Button>
              <Button type="button" onClick={goToLoginForBooking}>
                Ir a iniciar sesiÃ³n
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={cancelBookingModal.open}
          onOpenChange={(open) => {
            if (!open) closeCancelBookingModal();
          }}
        >
          <DialogContent className="sm:max-w-md booking-cancel-modal">
            <DialogHeader>
              <DialogTitle>Cancelar agendamiento</DialogTitle>
              <DialogDescription>
                Se perderÃ¡n los datos seleccionados y se liberarÃ¡ la reserva temporal si existe.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeCancelBookingModal}
                disabled={cancelBookingProcessing}
              >
                Continuar agendando
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  void confirmCancelBooking();
                }}
                disabled={cancelBookingProcessing || holdSubmitting}
              >
                {cancelBookingProcessing ? 'Cancelando...' : 'Cancelar agendamiento'}
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
              <DialogTitle>Â¿Deseas guardar estos datos en tu perfil?</DialogTitle>
              <DialogDescription>
                {profilePersistModal.kind === 'telefono'
                  ? 'Para completar tu reserva necesitamos un nÃºmero de contacto. Lo usaremos Ãºnicamente para comunicarnos contigo si ocurre algÃºn imprevisto relacionado con tu cita. Â¿Deseas guardarlo en tu perfil para futuras reservas?'
                  : 'Para completar tu reserva necesitamos que tus datos estÃ©n correctos. Esto nos ayuda a identificar tu cita y comunicarnos contigo correctamente. Â¿Deseas guardar estos datos en tu perfil?'}
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
                SÃ­, guardar en perfil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </BookingLayout>
  );
}

